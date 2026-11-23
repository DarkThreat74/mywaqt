"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCheck, CornerUpLeft, SendHorizonal, X } from "lucide-react";
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
  failed?: boolean;
};

type Friend = { id: string; name: string; avatarUrl: string | null };

const POLL_MS = 8000;

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
  const [loaded, setLoaded] = useState(false);
  const [sendErr, setSendErr] = useState(false);
  const [unseen, setUnseen] = useState(0);
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

  const lastTs = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const since = lastTs.current;
      const res = await fetch(`/api/messages?friend=${friendId}${since ? `&since=${encodeURIComponent(since)}` : ""}`, { cache: "no-store" });
      if (res.status === 403 || res.status === 404) { setNotFound(true); return; }
      if (!res.ok) return;
      const data = await res.json() as { friend: Friend; messages: Msg[]; me: string; unreadIncoming: number };
      setFriend(data.friend);
      setMe(data.me);
      setLoaded(true);
      const newest = data.messages[data.messages.length - 1];
      if (newest) lastTs.current = newest.createdAt;
      setMessages((prev) => {
        const pending = prev.filter((m) => m.optimistic);
        if (!since) {
          // Full refresh — keep still-pending optimistic bubbles at the tail.
          const fresh = data.messages.filter((m) => !prev.some((p) => p.optimistic && p.content === m.content && p.senderId === m.senderId));
          return [...fresh, ...pending];
        }
        // Incremental merge: append new rows, dedupe by id, keep receipts fresh.
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const m of data.messages) byId.set(m.id, m);
        const merged = [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        return [...merged.filter((m) => !m.optimistic), ...pending];
      });
      const newIncoming = data.messages.filter((m) => m.senderId === friendId).length;
      // Since-polls return only the delta — play on any new incoming row.
      if (lastIncoming.current >= 0 ? newIncoming > 0 : false) play("notification");
      lastIncoming.current = Math.max(0, lastIncoming.current) + newIncoming;
      // New messages landing below the fold are silent — surface a
      // jump-to-latest affordance instead of pretending nothing arrived.
      if (newIncoming > 0 && !stickToBottom.current) {
        setUnseen((n) => n + newIncoming);
      }
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
    if (stickToBottom.current) setUnseen(0);
  };

  useEffect(() => {
    if (stickToBottom.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // iOS Safari doesn't shrink the layout viewport when the keyboard opens —
  // a fixed inset-0 shell leaves the composer hidden behind it. Track
  // visualViewport so the shell hugs the visible area instead.
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null);
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const on = () => setVv({ h: v.height, top: v.offsetTop });
    on();
    v.addEventListener("resize", on);
    v.addEventListener("scroll", on);
    return () => { v.removeEventListener("resize", on); v.removeEventListener("scroll", on); };
  }, []);

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    const optimistic: Msg = {
      id: `optimistic-${crypto.randomUUID()}`,
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
      await deliver(optimistic);
      setSendErr(false);
    } catch {
      markFailed(optimistic.id);
    } finally {
      setSending(false);
    }
  }

  async function deliver(msg: Msg) {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId, content: msg.content, replyToId: msg.replyToId }),
    });
    if (!res.ok) throw new Error();
    const { message } = await res.json() as { message: Msg };
    message.replyToContent = msg.replyToContent;
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? message : m)));
  }

  function markFailed(id: string) {
    // Keep the text in a failed bubble with a retry — never silently
    // destroy what the user wrote.
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, failed: true } : m)));
    setSendErr(true);
    play("error");
  }

  async function retry(m: Msg) {
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, failed: false } : x)));
    try {
      await deliver(m);
      setSendErr(false);
    } catch {
      markFailed(m.id);
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-base italic" style={{ color: "var(--color-ink-muted)" }}>
          Messages live between prayer friends.
        </p>
        <button onClick={() => router.back()} className="mt-4 text-sm font-medium" style={{ color: "var(--color-accent)" }}>
          Go back
        </button>
      </div>
    );
  }

  const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  return (
    <div
      className="fixed left-0 right-0 top-0 z-[70] flex flex-col"
      style={{
        backgroundColor: "var(--color-paper)",
        height: vv ? `${vv.h}px` : "100dvh",
        transform: vv && vv.top ? `translateY(${vv.top}px)` : undefined,
      }}
    >
      {/* Masthead — names set like a correspondence card */}
      <header
        className="border-b"
        style={{ borderColor: "var(--color-paper-3)", paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3.5 sm:px-6">
          <button onClick={() => router.push("/messages")} aria-label="Back to messages"
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors enabled:hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-soft)" }}>
            <ArrowLeft className="h-4 w-4" />
          </button>
          {friend?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={friend.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" style={{ outline: "1px solid var(--color-paper-3)" }} />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm italic"
              style={{ backgroundColor: "var(--color-warmth-faint)", color: "var(--color-warmth)", outline: "1px solid var(--color-paper-3)" }}>
              {friend?.name?.[0]?.toUpperCase() ?? "·"}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[17px] leading-tight" style={{ color: "var(--color-ink)" }}>
              {friend?.name ?? "…"}
            </p>
            <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--color-ink-muted)" }}>
              Prayer friend · private
            </p>
          </div>
        </div>
      </header>

      {/* Thread — a correspondence ledger, not a bubble wall */}
      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain"
        role="log" aria-live="polite" aria-label={`Conversation with ${friend?.name ?? "friend"}`}>
        <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
          {!loaded ? (
            <div className="space-y-3 py-6" aria-hidden="true">
              {[40, 65, 30, 55].map((w, i) => (
                <div key={i} className={`h-10 animate-pulse rounded-2xl ${i % 2 ? "ml-auto" : ""}`}
                  style={{ width: `${w}%`, backgroundColor: "var(--color-paper-2)", border: "1px solid var(--color-paper-3)" }} />
              ))}
            </div>
          ) : messages.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-xl italic leading-snug" style={{ color: "var(--color-ink)" }}>
                Say salaam.
              </p>
              <p className="mt-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                Every friendship here begins with a greeting.
              </p>
            </div>
          )}
          {messages.map((m, i) => {
            const day = dayOf(m.createdAt);
            const showSep = i === 0 || day !== dayOf(messages[i - 1].createdAt);
            const own = m.optimistic || m.senderId === me;
            return (
              <div key={m.id}>
                {showSep && (
                  <div className="my-4 flex items-center gap-3" role="separator" aria-label={day}>
                    <span className="h-px flex-1" style={{ backgroundColor: "var(--color-paper-3)" }} />
                    <span className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: "var(--color-ink-muted)" }}>
                      {day}
                    </span>
                    <span className="h-px flex-1" style={{ backgroundColor: "var(--color-paper-3)" }} />
                  </div>
                )}
                <div className={`group mb-2 flex ${own ? "justify-end" : "justify-start"}`}>
                  {!own && (
                    <button onClick={() => setReplyTo(m)} aria-label="Reply"
                      className="mr-1.5 flex h-6 w-6 items-center justify-center self-center opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-40"
                      style={{ color: "var(--color-ink-muted)" }}>
                      <CornerUpLeft className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <div
                    className="max-w-[80%] px-3.5 py-2.5 sm:max-w-[70%]"
                    style={own ? {
                      backgroundColor: "var(--color-accent-faint)",
                      borderRadius: "14px 14px 4px 14px",
                      border: "1px solid color-mix(in oklab, var(--color-accent) 22%, var(--color-paper-3))",
                    } : {
                      backgroundColor: "var(--color-paper-2)",
                      borderRadius: "14px 14px 14px 4px",
                      border: "1px solid var(--color-paper-3)",
                    }}
                  >
                    {m.replyToId && (
                      <p className="mb-1.5 truncate border-l-2 pl-2 text-[11px] italic leading-snug"
                        style={{ borderColor: own ? "var(--color-accent)" : "var(--color-warmth)", color: "var(--color-ink-muted)" }}>
                        {m.replyToContent ?? "Message"}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed" style={{ color: "var(--color-ink)" }}>
                      {m.deleted ? <em className="opacity-60">This message was removed.</em> : m.content}
                    </p>
                    <span className="mt-1 flex items-center gap-1 text-[10px] tabular-nums" style={{ color: "var(--color-ink-muted)", justifyContent: own ? "flex-end" : "flex-start" }}>
                      {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      {own && (m.optimistic
                        ? <span className="opacity-60">…</span>
                        : m.readAt
                          ? <CheckCheck className="h-3 w-3" style={{ color: "var(--color-accent)" }} />
                          : m.deliveredAt
                            ? <CheckCheck className="h-3 w-3" />
                            : <Check className="h-3 w-3" />)}
                    </span>
                  </div>
                  {own && !m.optimistic && (
                    <button onClick={() => setReplyTo(m)} aria-label="Reply"
                      className="ml-1.5 flex h-6 w-6 items-center justify-center self-center opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-40"
                      style={{ color: "var(--color-ink-muted)" }}>
                      <CornerUpLeft className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {m.failed && (
                  <div className="mb-2 flex items-center justify-end gap-2" role="alert">
                    <span className="text-[11px] italic" style={{ color: "var(--color-warmth)" }}>
                      Couldn&rsquo;t send — kept your words.
                    </span>
                    <button onClick={() => void retry(m)}
                      className="rounded-lg border px-2.5 py-1 text-[11px] font-medium"
                      style={{ borderColor: "var(--color-paper-3)", color: "var(--color-accent)" }}>
                      Retry
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {sendErr && (
        <p role="alert" className="sr-only">
          Couldn&rsquo;t send — your message was kept. Use Retry on the failed bubble.
        </p>
      )}

      {/* New messages below the fold — jump to latest instead of silence */}
      {unseen > 0 && (
        <button
          onClick={() => { stickToBottom.current = true; setUnseen(0); bottomRef.current?.scrollIntoView({ block: "end" }); }}
          className="absolute bottom-28 left-1/2 z-10 -translate-x-1/2 rounded-full border px-3.5 py-1.5 text-xs font-medium shadow-sm"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-accent)" }}
        >
          ↓ {unseen} new {unseen === 1 ? "message" : "messages"}
        </button>
      )}

      {/* Composer — a writing desk, not a chat pill */}
      <div className="border-t" style={{ borderColor: "var(--color-paper-3)" }}>
        <div className="mx-auto w-full max-w-3xl px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2.5 sm:px-6">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 rounded-lg px-3 py-1.5"
              style={{ backgroundColor: "var(--color-warmth-faint)" }}>
              <CornerUpLeft className="h-3 w-3 shrink-0" style={{ color: "var(--color-warmth)" }} />
              <p className="min-w-0 flex-1 truncate text-[11px] italic" style={{ color: "var(--color-ink-soft)" }}>
                {replyTo.content}
              </p>
              <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" style={{ color: "var(--color-ink-muted)" }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder="Write to them…"
              rows={1}
              maxLength={2000}
              aria-label={`Message ${friend?.name ?? "friend"}`}
              className="max-h-36 min-h-[44px] flex-1 resize-none border-b bg-transparent px-1 py-2.5 text-[16px] italic leading-snug outline-none transition-colors focus:border-[var(--color-accent)]"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink)", fieldSizing: "content" } as React.CSSProperties}
            />
            <button onClick={() => void send()} disabled={!draft.trim() || sending} aria-label="Send"
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-[transform,opacity] enabled:hover:-translate-y-0.5 disabled:opacity-30"
              style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}>
              <SendHorizonal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
