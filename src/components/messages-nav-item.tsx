"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useInbox } from "@/lib/inbox";
import { useHiddenTabs } from "@/lib/nav-prefs";

/* Messages nav link with a live unread badge (shared inbox poll). */
export default function MessagesNavItem({ mobile = false }: { mobile?: boolean }) {
  const inbox = useInbox();
  const hiddenTabs = useHiddenTabs();
  const unread = inbox.unreadMessages ?? 0;
  const badge = unread > 0 && (
    <span
      className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
      style={{ backgroundColor: "var(--color-accent)" }}
      aria-label={`${unread} unread messages`}
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );

  if (hiddenTabs.has("messages")) return null;

  if (mobile) {
    return (
      <Link href="/messages" className="flex min-w-0 flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium"
        style={{ color: "var(--color-ink-muted)", minHeight: 44 }}>
        <span className="relative"><MessageCircle className="h-5 w-5" />{badge}</span>
        <span className="truncate">Messages</span>
      </Link>
    );
  }
  return (
    <Link href="/messages"
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
      style={{ color: "var(--color-ink-soft)" }}>
      <span className="relative"><MessageCircle className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />{badge}</span>
      Messages
    </Link>
  );
}
