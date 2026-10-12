"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronRight, Loader2, MoonStar } from "lucide-react";
import {
  getShieldStatus,
  openShieldSetting,
  type ShieldPermissionKey,
  type ShieldStatus,
} from "@/lib/salah-shield-native";
import { onAppStateChange } from "@/lib/native-bridge";

/**
 * Guided Salah Shield setup — the Android permission walkthrough shown in
 * onboarding (and reusable from Settings later).
 *
 * Each permission lives in a different Android settings screen and none can
 * be granted programmatically, so the flow is: explain → deep-link → when the
 * app regains focus, re-check status live and tick the row. This is the same
 * pattern pourquoi.app and Falah use; ours just verifies instead of trusting.
 */

interface Row {
  key: ShieldPermissionKey;
  title: string;
  why: string;
  required?: boolean;
  hint: string; // what the user does in the settings screen
}

const ROWS: Row[] = [
  {
    key: "accessibility",
    title: "Accessibility service",
    why: "Lets Waqt see which app you opened so the shield can cover it during salah. Detection stays on your device — nothing is sent anywhere.",
    required: true,
    hint: "In the next screen: find \"Waqt\" under Downloaded services → turn it on → allow.",
  },
  {
    key: "battery",
    title: "Unrestricted battery",
    why: "Stops Android from sleeping Waqt between prayer windows — without it the shield may wake up late.",
    hint: "Tap \"Allow\" on the dialog that appears.",
  },
  {
    key: "usageAccess",
    title: "Usage access",
    why: "Reads per-app screen time so the shield can show how much scrolling it saved you.",
    hint: "In the next screen: find \"Waqt\" → enable \"Permit usage access\".",
  },
  {
    key: "notifications",
    title: "Notifications",
    why: "Prayer-window alerts — you're likely already using these.",
    hint: "Toggle notifications on for Waqt.",
  },
];

const LS_KEY = "waqt:salah-shield";

export default function SalahShieldSetup({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [status, setStatus] = useState<ShieldStatus | null>(null);
  const [opening, setOpening] = useState<ShieldPermissionKey | null>(null);

  const refresh = useCallback(async () => {
    const s = await getShieldStatus();
    if (s) setStatus(s);
  }, []);

  useEffect(() => {
    let off = () => {};
    const t = setTimeout(refresh, 0);
    void onAppStateChange((active) => { if (active) void refresh(); }).then((f) => { off = f; });
    const onVis = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearTimeout(t); off(); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh]);

  async function grant(key: ShieldPermissionKey) {
    setOpening(key);
    await openShieldSetting(key);
    // Status is re-verified on the resume listener — but if the user comes
    // back instantly, give the system a beat then check once more.
    setTimeout(() => { void refresh(); setOpening(null); }, 1200);
  }

  const granted = (key: ShieldPermissionKey) => status?.[key] === true;
  const ready = granted("accessibility");

  function finish() {
    try { localStorage.setItem(LS_KEY, "1"); } catch { /* ignore */ }
    onDone();
  }

  return (
    <div className="flex w-full flex-col items-center text-center">
      <MoonStar className="h-9 w-9" style={{ color: "var(--color-accent)" }} />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--color-ink)" }}>
        Guard the prayer times
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
        Salah Shield covers distracting apps while a prayer window is open and
        unmarked — marking it prayed is the only key. It needs a few system
        switches, one at a time.
      </p>

      <div className="mt-7 w-full max-w-sm space-y-2.5 text-left">
        {ROWS.map((row) => {
          const done = granted(row.key);
          return (
            <div
              key={row.key}
              className="rounded-2xl border px-4 py-3.5"
              style={{ borderColor: done ? "var(--color-accent)" : "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor: done ? "var(--color-accent)" : "var(--color-paper-3)",
                    backgroundColor: done ? "var(--color-accent)" : "transparent",
                    color: done ? "var(--color-paper)" : "transparent",
                  }}
                  aria-hidden
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
                    {row.title}
                    {row.required && (
                      <span className="ml-2 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-accent)" }}>
                        required
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
                    {row.why}
                  </p>
                </div>
                {!done && (
                  <button
                    onClick={() => void grant(row.key)}
                    className="flex shrink-0 items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                    style={{ backgroundColor: "var(--color-paper-3)", color: "var(--color-ink)" }}
                  >
                    {opening === row.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <>Open<ChevronRight className="h-3.5 w-3.5" /></>}
                  </button>
                )}
              </div>
              {!done && opening === row.key && (
                <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
                  {row.hint}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 w-full max-w-sm">
        <button
          onClick={finish}
          disabled={!ready}
          className="w-full rounded-full px-8 py-3.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
        >
          {ready ? "Shield is on — continue" : "Grant accessibility to continue"}
        </button>
        <button
          onClick={onSkip}
          className="mt-3 w-full text-sm font-medium transition-opacity hover:opacity-60"
          style={{ color: "var(--color-ink-muted)" }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
