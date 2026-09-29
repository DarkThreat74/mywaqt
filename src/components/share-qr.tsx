"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, QrCode, Share2, X } from "lucide-react";
import QRCode from "qrcode";
import { SITE_URL, SITE_DOMAIN } from "@/lib/site-config";

/**
 * Share-Waqt button + QR dialog. Renders a trigger (text link or icon
 * button); opening it shows a QR code pointing at SITE_URL that anyone can
 * scan to land on the app. QR is generated client-side — works offline.
 */
export function ShareQrButton({ variant = "link" }: { variant?: "link" | "icon" }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Mount guard for portal (document.body doesn't exist during SSR)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open || svg) return;
    // White card + dark modules regardless of theme — scanners need contrast.
    QRCode.toString(SITE_URL, {
      type: "svg",
      margin: 0,
      width: 480,
      color: { dark: "#1a1815", light: "#ffffff" },
    }).then(setSvg).catch(() => setSvg(null));
  }, [open, svg]);

  function dismiss() {
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); }, 220);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(SITE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable — the URL is displayed right there
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: "Waqt", text: "Prayer-centered life tracker", url: SITE_URL });
    } catch {
      // dismissed or unsupported
    }
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center rounded-full border transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 44, minWidth: 44 }}
          aria-label="Share Waqt — show QR code"
          title="Share Waqt"
        >
          <Share2 className="h-4 w-4" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-70"
          style={{ color: "var(--color-ink-muted)" }}
        >
          <Share2 className="h-3.5 w-3.5" />
          Share
        </button>
      )}

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-ink) 55%, transparent)",
            animation: closing ? "shareqr-fade-out 0.22s ease-out forwards" : "shareqr-fade-in 0.2s ease-out",
          }}
          onClick={dismiss}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Share Waqt"
            className="w-full max-w-xs rounded-2xl border p-6 text-center"
            style={{
              backgroundColor: "var(--color-paper)",
              borderColor: "var(--color-paper-3)",
              animation: closing
                ? "shareqr-slide-down 0.22s ease-in forwards"
                : "shareqr-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <p
                className="text-xl leading-none"
                style={{ fontFamily: "var(--font-arabic)", color: "var(--color-accent)" }}
                aria-hidden="true"
              >
                وقت
              </p>
              <button
                onClick={dismiss}
                className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink-muted)", minHeight: 44, minWidth: 44, marginTop: -8, marginRight: -8 }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* QR — always dark-on-white so any scanner reads it in any theme */}
            <div
              className="mx-auto mt-1 w-fit rounded-xl p-3"
              style={{ backgroundColor: "#ffffff", boxShadow: "0 1px 2px rgb(0 0 0 / 0.08)" }}
            >
              {svg ? (
                <div
                  className="[&>svg]:block [&>svg]:h-48 [&>svg]:w-48"
                  dangerouslySetInnerHTML={{ __html: svg }}
                  aria-label={`QR code linking to ${SITE_URL}`}
                />
              ) : (
                <div className="flex h-48 w-48 items-center justify-center">
                  <QrCode className="h-8 w-8 animate-pulse" style={{ color: "#1a1815", opacity: 0.3 }} />
                </div>
              )}
            </div>

            <p className="mt-4 text-sm font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
              {SITE_DOMAIN}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              Scan with a phone camera — it opens straight to Waqt.
            </p>

            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={copyLink}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 40 }}
              >
                {copied ? <Check className="h-3.5 w-3.5" style={{ color: "var(--color-accent)" }} /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy link"}
              </button>
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button
                  onClick={nativeShare}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 40 }}
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Share
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes shareqr-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes shareqr-fade-out { from { opacity: 1; } to { opacity: 0; } }
        @keyframes shareqr-pop {
          from { transform: scale(0.92) translateY(8px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes shareqr-slide-down {
          from { transform: scale(1) translateY(0); opacity: 1; }
          to { transform: scale(0.95) translateY(10px); opacity: 0; }
        }
      `}</style>
    </>
  );
}
