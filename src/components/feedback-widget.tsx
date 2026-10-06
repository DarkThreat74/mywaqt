"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { MessageSquarePlus, X, Send, Check } from "lucide-react";

// Floating feedback button — mounted in the (app) layout so it exists on
// every authenticated screen. Captures full page context (path + query,
// theme, viewport) so a report like "this button looks bad in dark mode
// on the October 1st day view" is self-describing.
export default function FeedbackWidget({ docked = false }: { docked?: boolean }) {
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
      {/* Trigger — small pill above the mobile bottom nav.
          Docked mode renders an inline segment button for the FloatingDock. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Send feedback"
        title="Send feedback"
        className={docked
          ? "flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
          : "feedback-fab fixed z-40 flex items-center justify-center rounded-full border shadow-lg transition-colors"}
        style={docked
          ? { width: 32, height: 32, color: "var(--color-ink-muted)" }
          : {
              width: 36,
              height: 36,
              borderColor: "var(--color-paper-3)",
              backgroundColor: "color-mix(in oklab, var(--color-paper) 92%, transparent)",
              color: "var(--color-ink-muted)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
      >
        <MessageSquarePlus className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
      </button>

      {/* Panel */}
      {open && (
        <div
          className="feedback-panel fixed z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border p-4 shadow-2xl"
          style={docked ? {
            right: "1rem",
            left: "auto",
            bottom: "calc(4rem + env(safe-area-inset-bottom) + 4rem)",
            maxHeight: "calc(100dvh - 160px)",
            overflowY: "auto",
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
            animation: "feedback-pop 0.18s cubic-bezier(0.16,1,0.3,1)",
          } : {
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
                <p className="mt-1.5 text-[11px]" style={{ color: "#dc2626" }}>
                  Couldn&apos;t send — try again.
                </p>
              )}
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes feedback-pop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
        /* Mobile: bottom-left, above the bottom nav + gesture bar —
           stays clear of the calendar's "+" FAB on the right */
        .feedback-fab{left:16px;bottom:calc(76px + env(safe-area-inset-bottom))}
        .feedback-panel{left:16px;bottom:calc(120px + env(safe-area-inset-bottom));max-height:calc(100dvh - 160px);overflow-y:auto}
        /* Desktop: no bottom nav — stack above the calendar's "+" FAB
           (48px circle at right-5 bottom-6) instead of covering it */
        @media(min-width:1024px){
          .feedback-fab{left:auto;right:24px;bottom:84px}
          .feedback-panel{left:auto;right:24px;bottom:132px}
        }
      `}</style>
    </>
  );
}
