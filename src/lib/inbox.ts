"use client";

import { useEffect, useSyncExternalStore } from "react";

export type InboxNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
};
export type InboxFriendRequest = {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
  expiresAt: string;
};
export type InboxGameInvite = {
  id: string;
  from: string;
  game: string;
  difficulty: string;
  rounds: number;
  expiresAt: string;
};
export type Inbox = {
  notifications: InboxNotification[];
  friendRequests: InboxFriendRequest[];
  gameInvites: InboxGameInvite[];
  activeMatch: { id: string; game: string; opponentName: string } | null;
};

const EMPTY: Inbox = { notifications: [], friendRequests: [], gameInvites: [], activeMatch: null };
const POLL_MS = 12_000;

let snapshot: Inbox = EMPTY;
const listeners = new Set<() => void>();
let pollers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let fetching = false;

async function fetchInbox() {
  if (fetching || typeof fetch === "undefined") return;
  fetching = true;
  try {
    const r = await fetch("/api/notifications/inbox", { cache: "no-store" });
    if (r.ok) {
      const data = (await r.json()) as Inbox;
      snapshot = data;
      listeners.forEach((fn) => fn());
    }
  } catch {
    // offline — keep the last snapshot
  } finally {
    fetching = false;
  }
}

export function refreshInbox() {
  void fetchInbox();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Shared poll — every subscriber shares the one interval + fetch. Instant
 * refresh via refreshInbox() after any action so toasts clear immediately.
 */
export function useInbox(): Inbox {
  const inbox = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);

  useEffect(() => {
    pollers += 1;
    if (pollers === 1) {
      void fetchInbox();
      timer = setInterval(() => void fetchInbox(), POLL_MS);
      window.addEventListener("focus", fetchInbox);
    }
    return () => {
      pollers -= 1;
      if (pollers === 0 && timer) {
        clearInterval(timer);
        timer = null;
        window.removeEventListener("focus", fetchInbox);
      }
    };
  }, []);

  return inbox;
}
