"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCheck, Reply, Send, X } from "lucide-react";
import { useUISFX } from "@/components/uisfx-provider";

type Msg = {
  id: string;
  senderId: string;
  content: string;
  deleted: boolean;
  replyToId: string | null;
  replyToContent: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
  optimistic?: boolean;
};

type Friend = { id: string; name: string; avatarUrl: string | null };

const POLL_MS = 4000;

export default function ChatClient({ friendId }: { friendId: string }) {
  const router = useRouter();
  const { play } = useUISFX();
  const [friend, setFriend] = useState<Friend | null>(null);
  const [me, setMe] = useState<string>("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastIncoming = useRef(-1);

  const markRead = useCallback(() => {
    void fetch("/api/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId }),
    }).catch(() => {});
  }, [friendId]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages?friend=${friendId}`, { cache: "no-store" });
      if (res.status === 403 || res.status === 404) { setNotFound(true); return; }
      if (!res.ok) return;
      const data = await res.json() as { friend: Friend; messages: Msg[]; me: string; unreadIncoming: number };
      setFriend(data.friend);
      setMe(data.me);
      setMessages((prev) => {
        // Keep still-pending optimistic bubbles at the tail.
        const pending = prev.filter((m) => m.optimistic);
        const fresh = data.messages.filter((m) => !prev.some((p) => p.optimistic && p.content === m.content && p.senderId === m.senderId));
        return [...fresh, ...pending];
      });
      const incoming = data.messages.filter((m) => m.senderId === friendId).length;
      if (lastIncoming.current >= 0 && incoming > lastIncoming.current) play("notification");
      lastIncoming.current = incoming;
      if (data.unreadIncoming > 0 && document.visibilityState === "visible") markRead();
    } catch {
      // poll failure — next tick retries
    }
  }, [friendId, markRead, play]);

  useEffect(() => {
    const kickoff = setTimeout(() => void load(), 0);
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => { if (!document.hidden) void load(); }, POLL_MS);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const resume = () => { void load(); start(); };
    start();
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearTimeout(kickoff);
      stop();
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [load]);

  // Read receipts when the tab becomes visible mid-thread
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") markRead(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [markRead]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    if (stickToBottom.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    const optimistic: Msg = {
      id: `optimistic-${Date.now()}`,
      senderId: me,
      content,
      deleted: false,
      replyToId: replyTo?.id ?? null,
      replyToContent: replyTo?.content ?? null,
      deliveredAt: null,
      readAt: null,
      createdAt: new Date().toISOString(),
      optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setReplyTo(null);
    stickToBottom.current = true;
    play("send");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendId, content, replyToId: optimistic.replyToId }),
      });
      if (!res.ok) throw new Error();
      const { message } = await res.json() as { message: Msg };
      message.replyToContent = optimistic.replyToContent;
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? message : m)));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      play("error");
    } finally {
      setSending(false);
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>You can only message accepted prayer friends.</p>
        <button onClick={() => router.back()} className="mt-4 text-sm font-medium" style={{ color: "var(--color-accent)" }}>Go back</button>
      </div>
    );
  }

  const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* Header */}
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 border-b px-3 py-3 sm:px-4"
        style={{ borderColor: "var(--color-paper-3)", paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}>
        <button onClick={() => router.back()} aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-lg border transition-colors enabled:hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        {friend?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={friend.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
            style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 14%, var(--color-paper))", color: "var(--color-accent)" }}>
            {friend?.name?.[0]?.toUpperCase() ?? "·"}
          </span>
        )}
        <p className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{friend?.name ?? "…"}</p>
      </div>

      {/* Thread */}
      <div ref={listRef} onScroll={onScroll} className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
        {messages.length === 0 && (
          <p className="py-16 text-center text-xs" style={{ color: "var(--color-ink-muted)" }}>
            No messages yet — say salaam.
          </p>
        )}
        {messages.map((m, i) => {
          const day = dayOf(m.createdAt);
          const showSep = i === 0 || day !== dayOf(messages[i - 1].createdAt);
          const own = m.optimistic || m.senderId === me;
          return (
            <div key={m.id}>
              {showSep && (
                <p className="my-3 text-center text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                  {day}
                </p>
              )}
              <div className={`group mb-1.5 flex ${own ? "justify-end" : "justify-start"}`}>
                {!own && (
                  <button onClick={() => setReplyTo(m)} aria-label="Reply"
                    className="mr-1 self-center opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-40"
                    style={{ color: "var(--color-ink-muted)" }}>
                    <Reply className="h-3.5 w-3.5" />
                  </button>
                )}
                <div
                  className="max-w-[78%] rounded-2xl px-3.5 py-2"
                  style={{
                    backgroundColor: own ? "var(--color-accent)" : "var(--color-paper-2)",
                    color: own ? "var(--color-paper)" : "var(--color-ink)",
                    borderBottomRightRadius: own ? 6 : undefined,
                    borderBottomLeftRadius: own ? undefined : 6,
                  }}
                >
                  {m.replyToId && (
                    <p className="mb-1 truncate rounded-md border-l-2 px-2 py-1 text-[11px] opacity-80"
                      style={{ borderColor: "currentColor", backgroundColor: "color-mix(in oklab, currentColor 8%, transparent)" }}>
                      {m.replyToContent ?? "Message"}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-[14px] leading-snug">
                    {m.deleted ? <em className="opacity-60">Message deleted</em> : m.content}
                  </p>
                  <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-70">
                    {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    {own && (m.optimistic
                      ? <span className="opacity-60">…</span>
                      : m.readAt
                        ? <CheckCheck className="h-3 w-3" style={{ color: "var(--color-info, #6db3f2)" }} />
                        : m.deliveredAt
                          ? <CheckCheck className="h-3 w-3" />
                          : <Check className="h-3 w-3" />)}
                  </span>
                </div>
                {own && !m.optimistic && (
                  <button onClick={() => setReplyTo(m)} aria-label="Reply"
                    className="ml-1 self-center opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-40"
                    style={{ color: "var(--color-ink-muted)" }}>
                    <Reply className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-paper-3)" }}>
          <Reply className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-accent)" }} />
          <p className="min-w-0 flex-1 truncate text-xs" style={{ color: "var(--color-ink-muted)" }}>{replyTo.content}</p>
          <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" style={{ color: "var(--color-ink-muted)" }}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-1 sm:px-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder="Message…"
          rows={1}
          maxLength={2000}
          className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border px-4 py-3 text-[14px] outline-none"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", fieldSizing: "content" } as React.CSSProperties}
        />
        <button onClick={() => void send()} disabled={!draft.trim() || sending} aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-opacity enabled:hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: "var(--color-accent)" }}>
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
