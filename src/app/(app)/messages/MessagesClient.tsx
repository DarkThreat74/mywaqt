"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

type Convo = {
  friendId: string;
  name: string;
  avatarUrl: string | null;
  lastMessage: string | null;
  lastAt: string | null;
  lastFromMe: boolean;
  unread: number;
};

export default function MessagesClient() {
  const [convos, setConvos] = useState<Convo[] | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/messages", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { conversations: [] }))
        .then((d: { conversations: Convo[] }) => setConvos(d.conversations))
        .catch(() => {});
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 8000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); window.removeEventListener("pageshow", onFocus); };
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <h1 className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>Messages</h1>
      <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>Private chats with your prayer friends.</p>

      <div className="mt-4 divide-y rounded-2xl border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
        {convos === null ? (
          <p className="px-4 py-10 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>
        ) : convos.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <MessageCircle className="mx-auto h-6 w-6" style={{ color: "var(--color-ink-muted)" }} />
            <p className="mt-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>No friends yet — add prayer friends from the Prayer tab.</p>
          </div>
        ) : (
          convos.map((c) => (
            <Link
              key={c.friendId}
              href={`/messages/${c.friendId}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-paper-2)]"
            >
              {c.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                  style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 14%, var(--color-paper))", color: "var(--color-accent)" }}>
                  {c.name[0]?.toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{c.name}</p>
                <p className="truncate text-xs" style={{ color: c.unread > 0 ? "var(--color-ink)" : "var(--color-ink-muted)", fontWeight: c.unread > 0 ? 600 : 400 }}>
                  {c.lastMessage ? (c.lastFromMe ? `You: ${c.lastMessage}` : c.lastMessage) : "Say salaam"}
                </p>
              </div>
              {c.lastAt && (
                <span className="shrink-0 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                  {new Date(c.lastAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              )}
              {c.unread > 0 && (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
                  style={{ backgroundColor: "var(--color-accent)" }}>
                  {c.unread}
                </span>
              )}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
