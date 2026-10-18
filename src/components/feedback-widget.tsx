"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import { MessageSquarePlus, X, Send, Check } from "lucide-react";

// Feedback entry — lives as a row inside the notifications panel so no
// floating pill ever overlaps page content. Captures full page context
// (path + query, theme, viewport) so a report like "this button looks bad
// in dark mode on the October 1st day view" is self-describing.
export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = pathname || "/";
  const query = searchParams?.toString();
  const pageDetail = query ? `${page}?${query}` : page;

  // DOM snapshot at submit — records which dialog/sheet is open, which
  // sections are expanded, the active tab, the page heading, and scroll
  // depth. This is what turns "this button looks bad" into "the Delete
  // Account confirm dialog on /settings, dark mode, 374px".
  function collectUiContext() {
    const label = (el: Element) =>
      (
        el.getAttribute("aria-label") ||
        el.querySelector("h1,h2,h3,[role='heading']")?.textContent ||
        el.textContent ||
        ""
      ).trim().replace(/\s+/g, " ").slice(0, 90);

    // Open dialogs, sheets, modals, popovers (exclude our own feedback panel)
    const dialogs = Array.from(
      document.querySelectorAll(
        "[role='dialog'], dialog[open], [data-state='open'], [role='alertdialog']",
      ),
    )
      .filter((el) => !el.closest(".feedback-panel"))
      .map(label)
      .filter(Boolean)
      .slice(0, 4);

    // Expanded collapsibles / accordions / open menus
    const expanded = Array.from(document.querySelectorAll("[aria-expanded='true'], details[open] > summary"))
      .map(label)
      .filter(Boolean)
      .slice(0, 6);

    // Active nav item / selected tab
    const activeNav = Array.from(
      document.querySelectorAll("[aria-current='page'], [aria-selected='true']"),
    )
      .map(label)
      .filter(Boolean)
      .slice(0, 3);

    const heading = (document.querySelector("main h1, h1")?.textContent || "").trim().slice(0, 90);
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const scrollPct = Math.round((window.scrollY / maxScroll) * 100);
    const focused = document.activeElement && document.activeElement !== document.body
      ? label(document.activeElement)
      : undefined;

    return {
      title: document.title.slice(0, 120),
      hash: window.location.hash.slice(0, 120) || undefined,
      heading: heading || undefined,
      dialogs: dialogs.length ? dialogs : undefined,
      expanded: expanded.length ? expanded : undefined,
      activeNav: activeNav.length ? activeNav : undefined,
      focused: focused || undefined,
      scrollPct,
    };
  }

  async function submit() {
    const msg = message.trim();
    if (!msg || state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          page,
          pageDetail,
          theme: document.documentElement.getAttribute("data-theme") || "light",
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          context: collectUiContext(),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("sent");
      setMessage("");
      setTimeout(() => {
        setOpen(false);
        setState("idle");
      }, 1600);
    } catch {
      setState("error");
    }
  }

  return (
    <>
      {/* Trigger — a row inside the notifications dropdown */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Send feedback"
        className="flex w-full items-center gap-3 border-t px-4 py-3 text-left transition-colors hover:bg-[var(--color-paper-2)]"
        style={{ borderColor: "var(--color-paper-3)" }}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--color-paper-2)" }}
        >
          <MessageSquarePlus className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>Send feedback</p>
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Report a bug or share an idea</p>
        </div>
      </button>

      {/* Panel — portaled to body so the bell dropdown's transform can't
          trap this fixed element inside itself */}
      {open && createPortal(
        <div
          className="feedback-panel fixed z-[95] w-[min(20rem,calc(100vw-2rem))] rounded-2xl border p-4 shadow-2xl"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
            animation: "feedback-pop 0.18s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                Report an issue
              </p>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                We&apos;ll attach the page you&apos;re on automatically.
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close feedback"
              className="rounded-full p-1 transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ color: "var(--color-ink-muted)" }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {state === "sent" ? (
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-6 text-sm"
              style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-ink)" }}
            >
              <Check className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
              Sent — thank you.
            </div>
          ) : (
            <>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What went wrong? e.g. this button looks off in dark mode…"
                rows={4}
                maxLength={2000}
                autoFocus
                className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors"
                style={{
                  borderColor: "var(--color-paper-3)",
                  backgroundColor: "var(--color-paper-2)",
                  color: "var(--color-ink)",
                }}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span
                  className="truncate text-[10px]"
                  style={{ color: "var(--color-ink-muted)" }}
                  title={pageDetail}
                >
                  {pageDetail}
                </span>
                <button
                  onClick={submit}
                  disabled={!message.trim() || state === "sending"}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-opacity disabled:opacity-40"
                  style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
                >
                  <Send className="h-3 w-3" />
                  {state === "sending" ? "Sending…" : "Send"}
                </button>
              </div>
              {state === "error" && (
                <p className="mt-1.5 text-[11px]" style={{ color: "var(--color-error)" }}>
                  Couldn&apos;t send — try again.
                </p>
              )}
            </>
          )}
        </div>,
        document.body,
      )}

      <style>{`
        @keyframes feedback-pop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
        /* Mobile: drops from under the top bar, centered via auto margins
           (a translateX would fight the pop animation's transform) */
        .feedback-panel{left:0;right:0;margin-inline:auto;top:calc(env(safe-area-inset-top) + 3.5rem);max-height:calc(100dvh - 120px);overflow-y:auto}
        /* Desktop: bell sits in the bottom-left rail — open just above it */
        @media(min-width:1024px){
          .feedback-panel{left:16px;transform:none;top:auto;bottom:calc(4.5rem + env(safe-area-inset-bottom))}
        }
      `}</style>
    </>
  );
}
