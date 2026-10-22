"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Feather } from "lucide-react";

type Convo = {
  friendId: string;
  name: string;
  avatarUrl: string | null;
  lastMessage: string | null;
  lastAt: string | null;
  lastFromMe: boolean;
  unread: number;
};

const SEED_KEY = "messages:convos";

export default function MessagesClient() {
  // Seed synchronously from the last good list — offline the fetch 503s and
  // convos===null used to pin "Loading…" forever.
  const [convos, setConvos] = useState<Convo[] | null>(() => {
    try {
      const raw = localStorage.getItem(SEED_KEY);
      return raw ? (JSON.parse(raw) as Convo[]) : null;
    } catch { return null; }
  });
  const [netErr, setNetErr] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch("/api/messages", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d: { conversations: Convo[] }) => {
          setConvos(d.conversations);
          setNetErr(false);
          try { localStorage.setItem(SEED_KEY, JSON.stringify(d.conversations)); } catch {}
        })
        .catch(() => setNetErr(true));
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 8000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); window.removeEventListener("pageshow", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--color-accent)" }}>
          Correspondence
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
          Messages
        </h1>
        <p className="mt-1 text-sm italic" style={{ color: "var(--color-ink-muted)" }}>
          Private words between prayer friends.
        </p>
      </header>

      {netErr && convos !== null && convos.length > 0 && (
        <p className="mb-4 text-center text-xs italic" style={{ color: "var(--color-ink-muted)" }}>
          You&rsquo;re offline — showing your last conversations.
        </p>
      )}
      {convos === null ? (
        netErr ? (
          <div className="py-16 text-center">
            <Feather className="mx-auto h-6 w-6" style={{ color: "var(--color-warmth)" }} />
            <p className="mt-3 text-xl italic" style={{ color: "var(--color-ink)" }}>You&rsquo;re offline.</p>
            <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              Messages need a connection the first time.
            </p>
          </div>
        ) : (
          <p className="py-16 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>
        )
      ) : convos.length === 0 ? (
        <div className="py-16 text-center">
          <Feather className="mx-auto h-6 w-6" style={{ color: "var(--color-warmth)" }} />
          <p className="mt-3 text-xl italic" style={{ color: "var(--color-ink)" }}>No one to write to yet.</p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Add prayer friends from the Prayer tab — then their letters land here.
          </p>
        </div>
      ) : (
        <ul role="list" className="divide-y" style={{ borderColor: "var(--color-paper-3)" }}>
          {convos.map((c) => (
            <li key={c.friendId}>
              <Link
                href={`/messages/${c.friendId}`}
                className="group flex items-center gap-3.5 py-3.5 transition-colors"
              >
                {c.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" style={{ outline: "1px solid var(--color-paper-3)" }} />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base italic"
                    style={{ backgroundColor: "var(--color-warmth-faint)", color: "var(--color-warmth)", outline: "1px solid var(--color-paper-3)" }}>
                    {c.name[0]?.toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold leading-snug" style={{ color: "var(--color-ink)" }}>
                    {c.name}
                  </p>
                  <p
                    className="truncate text-[13px] italic leading-snug"
                    style={{ color: c.unread > 0 ? "var(--color-ink-soft)" : "var(--color-ink-muted)", fontWeight: c.unread > 0 ? 600 : 400 }}
                  >
                    {c.lastMessage ? (c.lastFromMe ? `You — ${c.lastMessage}` : c.lastMessage) : "Begin with salaam"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {c.lastAt && (
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>
                      {new Date(c.lastAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  )}
                  {c.unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
                      style={{ backgroundColor: "var(--color-warmth)", color: "var(--color-paper)" }}>
                      {c.unread}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
