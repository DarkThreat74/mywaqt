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
export type InboxOutgoingInvite = {
  id: string;
  to: string;
  game: string;
  difficulty: string;
  rounds: number;
  expiresAt: string;
};
export type Inbox = {
  notifications: InboxNotification[];
  /** Last 24h of notifications, acked or not — the bell's history list. */
  recent: (InboxNotification & { acked: boolean })[];
  friendRequests: InboxFriendRequest[];
  gameInvites: InboxGameInvite[];
  /** Challenges I sent that are still awaiting an answer. */
  outgoingInvites: InboxOutgoingInvite[];
  /** Sunday-after-Fajr weekly review of missed prayers — null unless due. */
  qadaaReview: {
    count: number;
    byPrayer: Record<string, number>;
    rows: { date: string; prayerName: string }[];
  } | null;
  unreadMessages: number;
  activeMatch: { id: string; game: string; opponentName: string } | null;
};

const EMPTY: Inbox = { notifications: [], recent: [], friendRequests: [], gameInvites: [], outgoingInvites: [], qadaaReview: null, unreadMessages: 0, activeMatch: null };
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

  const tick = () => { if (!document.hidden) void fetchInbox(); };
  useEffect(() => {
    pollers += 1;
    if (pollers === 1) {
      void fetchInbox();
      timer = setInterval(tick, POLL_MS);
      // iOS suspends intervals in background and restores via bfcache
      // (pageshow, no visibilitychange/focus) — refetch on every resume
      // path so toasts/pill can never show a stale, already-dead invite.
      window.addEventListener("focus", fetchInbox);
      window.addEventListener("pageshow", fetchInbox);
      document.addEventListener("visibilitychange", tick);
    }
    return () => {
      pollers -= 1;
      if (pollers === 0 && timer) {
        clearInterval(timer);
        timer = null;
        window.removeEventListener("focus", fetchInbox);
        window.removeEventListener("pageshow", fetchInbox);
        document.removeEventListener("visibilitychange", tick);
      }
    };
  }, []);

  return inbox;
}
