"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, Check, CheckCircle2, Circle, RefreshCw } from "lucide-react";

interface UiContext {
  title?: string;
  hash?: string;
  heading?: string;
  dialogs?: string[];
  expanded?: string[];
  activeNav?: string[];
  focused?: string;
  scrollPct?: number;
}

interface FeedbackRow {
  id: string;
  page: string;
  pageDetail: string | null;
  message: string;
  theme: string | null;
  viewport: string | null;
  userAgent: string | null;
  resolved: boolean;
  uiContext: UiContext | null;
  createdAt: string;
  userEmail: string;
  userName: string | null;
  userFirstName: string | null;
}

// Formats a report as a self-contained prompt — paste straight into an
// agent session and it has everything needed to reproduce the bug.
function buildPrompt(r: FeedbackRow): string {
  const who = r.userName || r.userFirstName || r.userEmail;
  const when = new Date(r.createdAt).toLocaleString();
  const ui = r.uiContext;
  const lines = [
    `Bug report from Waqt — Next.js 16 + React + TypeScript + Drizzle/Neon PWA.`,
    `Reported ${when} by ${who} <${r.userEmail}>`,
    `Page: ${r.pageDetail || r.page}${ui?.hash || ""}`,
    `Theme: ${r.theme || "unknown"} · Viewport: ${r.viewport || "unknown"}`,
    `UA: ${r.userAgent || "unknown"}`,
  ];
  if (ui) {
    const state: string[] = [];
    if (ui.heading) state.push(`screen heading "${ui.heading}"`);
    if (ui.activeNav?.length) state.push(`active nav/tab: ${ui.activeNav.join(", ")}`);
    if (ui.dialogs?.length) state.push(`open dialog/sheet: ${ui.dialogs.join(", ")}`);
    if (ui.expanded?.length) state.push(`expanded sections: ${ui.expanded.join(", ")}`);
    if (ui.focused) state.push(`focused element: "${ui.focused}"`);
    if (typeof ui.scrollPct === "number") state.push(`scrolled ${ui.scrollPct}%`);
    if (state.length) lines.push(`UI state: ${state.join(" · ")}`);
  }
  lines.push(
    "",
    r.message,
    "",
    "---",
    "Audit the affected code path end to end and do deep research on the root",
    "cause: use agent-reach (web/GitHub search) and context7 (library docs),",
    "and check how mature open-source projects solve the same problem.",
    "Verify the fix across platforms — Android, iOS/iPadOS Safari, installed",
    "PWA, desktop (Windows/macOS/Linux). Fix the root cause, not the symptom,",
    "then run: pnpm exec tsc --noEmit && pnpm exec eslint --max-warnings=0",
  );
  return lines.join("\n");
}

export function AdminFeedback() {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/feedback")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  useEffect(load, [load]);

  async function toggleResolved(r: FeedbackRow) {
    setRows((prev) =>
      prev?.map((x) => (x.id === r.id ? { ...x, resolved: !x.resolved } : x)) ?? prev,
    );
    await fetch("/api/admin/feedback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, resolved: !r.resolved }),
    }).catch(() => load());
  }

  function copyPrompt(r: FeedbackRow) {
    navigator.clipboard.writeText(buildPrompt(r)).then(() => {
      setCopied(r.id);
      setTimeout(() => setCopied((c) => (c === r.id ? null : c)), 1500);
    });
  }

  const visible = rows?.filter((r) => showResolved || !r.resolved) ?? null;
  const openCount = rows?.filter((r) => !r.resolved).length ?? 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
          {openCount} open {openCount === 1 ? "report" : "reports"}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowResolved((s) => !s)}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
          >
            {showResolved ? "Hide resolved" : "Show resolved"}
          </button>
          <button
            onClick={load}
            aria-label="Refresh"
            className="rounded-lg border p-2"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {visible === null ? (
        <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>
      ) : visible.length === 0 ? (
        <div
          className="rounded-xl border border-dashed px-4 py-10 text-center text-sm"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
        >
          No feedback yet.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border p-4"
              style={{
                borderColor: "var(--color-paper-3)",
                backgroundColor: "var(--color-paper)",
                opacity: r.resolved ? 0.55 : 1,
              }}
            >
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                <span className="font-medium" style={{ color: "var(--color-ink-soft)" }}>
                  {r.userName || r.userFirstName || r.userEmail}
                </span>
                <span>{new Date(r.createdAt).toLocaleString()}</span>
                <span className="rounded-md px-1.5 py-0.5 font-mono" style={{ backgroundColor: "var(--color-paper-2)" }}>
                  {r.pageDetail || r.page}
                </span>
                {r.theme && <span>{r.theme} mode</span>}
                {r.viewport && <span>{r.viewport}</span>}
              </div>

              {/* UI state captured at submit — open dialog, expanded sections, active tab */}
              {r.uiContext && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {r.uiContext.dialogs?.map((d) => (
                    <span key={d} className="rounded-md px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}>
                      dialog: {d}
                    </span>
                  ))}
                  {r.uiContext.expanded?.map((d) => (
                    <span key={d} className="rounded-md px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}>
                      open: {d}
                    </span>
                  ))}
                  {r.uiContext.activeNav?.map((d) => (
                    <span key={d} className="rounded-md px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}>
                      tab: {d}
                    </span>
                  ))}
                </div>
              )}

              <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--color-ink)" }}>
                {r.message}
              </p>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => copyPrompt(r)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                  style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}
                >
                  {copied === r.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === r.id ? "Copied" : "Copy as prompt"}
                </button>
                <button
                  onClick={() => toggleResolved(r)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                  style={{ color: "var(--color-ink-muted)" }}
                >
                  {r.resolved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                  {r.resolved ? "Resolved" : "Mark resolved"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
