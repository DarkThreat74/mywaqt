"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Download, Mic, Search } from "lucide-react";
import { ENGINE_ASSETS, downloadEngine, engineInstalled, uninstallEngine } from "./engine";

/**
 * Quran Tester — recite anywhere in the Quran; the app follows you on the
 * mushaf and flags mistakes for confirmation. Fully on-device: the recognition
 * engine downloads once (~72MB) and audio never leaves the phone.
 *
 * Self-contained under src/features/quran-tester/ — extractable later.
 */

type Surah = { s: number; verses: [number, string, string][] };
type Quran = Surah[];

export default function QuranTesterClient() {
  const [quran, setQuran] = useState<Quran | null>(null);
  const [surahIdx, setSurahIdx] = useState(0);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [dl, setDl] = useState<{ done: number; total: number } | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/data/quran.json").then((r) => r.json()).then(setQuran).catch(() => {});
    engineInstalled().then(setInstalled).catch(() => setInstalled(false));
  }, []);

  const surah = quran?.[surahIdx];
  const pct = dl ? Math.round((dl.done / dl.total) * 100) : 0;

  function onSearch(v: string) {
    setSearch(v);
    if (!quran) return;
    const q = v.trim();
    const m = q.match(/^(\d{1,3})(?::(\d{1,3}))?$/); // "2" or "2:255" → jump
    if (m) {
      const s = Math.min(114, Math.max(1, parseInt(m[1], 10)));
      setSurahIdx(s - 1);
      const ayah = m[2];
      if (ayah) {
        requestAnimationFrame(() =>
          document.getElementById(`ayah-${s}-${ayah}`)?.scrollIntoView({ block: "center" }),
        );
      }
    }
  }

  async function install() {
    setDlError(null);
    setDl({ done: 0, total: ENGINE_ASSETS.reduce((s, a) => s + a.bytes, 0) });
    try {
      await downloadEngine((done, total) => setDl({ done, total }));
      setInstalled(true);
    } catch {
      setDlError("Download failed — check your connection and try again.");
    } finally {
      setDl(null);
    }
  }

  async function remove() {
    await uninstallEngine();
    setInstalled(false);
  }

  return (
    <div className="min-h-dvh" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-20 border-b backdrop-blur-md"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "color-mix(in oklab, var(--color-paper) 82%, transparent)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/calendar/day"
            className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-muted)", minHeight: 40, minWidth: 40 }}
            aria-label="Back"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <h1 className="flex-1 text-xl font-bold tracking-tight" style={{ color: "var(--color-ink)" }}>
            Quran Tester
          </h1>
          {installed && (
            <span
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide"
              style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}
            >
              <Mic className="h-3 w-3" /> Engine ready
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
        {/* Engine install card */}
        {installed === false && (
          <div
            className="mt-5 rounded-3xl border p-5"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
              One-time setup
            </p>
            <p className="mt-1 text-base font-bold tracking-tight" style={{ color: "var(--color-ink)" }}>
              Download the recitation engine
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              ~72MB, downloaded once. Your voice is processed entirely on this
              device — audio never leaves your phone, works fully offline.
            </p>
            {dl ? (
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-200"
                    style={{ width: `${pct}%`, backgroundColor: "var(--color-accent)" }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] font-medium tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                  {(dl.done / 1e6).toFixed(1)} / {(dl.total / 1e6).toFixed(0)} MB — {pct}%
                </p>
              </div>
            ) : (
              <button
                onClick={() => void install()}
                className="mt-4 flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-80"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
              >
                <Download className="h-4 w-4" /> Download engine
              </button>
            )}
            {dlError && (
              <p className="mt-3 text-xs font-medium" style={{ color: "#b34a3a" }}>{dlError}</p>
            )}
            <p className="mt-4 text-[10px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              Automatic recitation feedback can be wrong — it never replaces a
              qualified teacher. Confirmed mistakes only are saved, and only on
              this device.
            </p>
          </div>
        )}

        {installed && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
              Recite anywhere — the app finds your place and flags mistakes for you to confirm.
            </p>
            <button
              onClick={() => void remove()}
              className="shrink-0 text-[10px] font-medium transition-opacity hover:opacity-70"
              style={{ color: "var(--color-ink-muted)" }}
            >
              Remove engine
            </button>
          </div>
        )}

        {/* Nav: jump + search */}
        <div className="mt-5 flex items-center gap-2">
          <div
            className="flex flex-1 items-center gap-2 rounded-full border px-3.5 py-2"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Jump: 2:255 or search a translation…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-ink-muted)]"
              style={{ color: "var(--color-ink)" }}
            />
          </div>
          <select
            value={surahIdx}
            onChange={(e) => setSurahIdx(Number(e.target.value))}
            className="rounded-full border px-3 py-2 text-sm font-semibold outline-none"
            style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
            aria-label="Surah"
          >
            {(quran ?? []).map((s, i) => (
              <option key={s.s} value={i}>سورة {s.s}</option>
            ))}
          </select>
        </div>

        {/* Mushaf */}
        {!quran ? (
          <p className="mt-10 text-center text-sm" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>
        ) : (
          <div className="mt-5">
            <div className="mb-4 flex items-center gap-3">
              <BookOpen className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-ink-muted)" }}>
                Surah {surah!.s} · {surah!.verses.length} ayahs
              </p>
            </div>
            <div dir="rtl" className="space-y-5 text-right" style={{ fontFamily: "var(--font-arabic, serif)" }}>
              {surah!.verses.map(([n, ar, en]) => (
                <div key={n} id={`ayah-${surah!.s}-${n}`} className="group">
                  <p className="text-[22px] leading-[2.1]" style={{ color: "var(--color-ink)" }}>
                    {ar.split(" ").map((w, wi) => (
                      <span key={wi} data-word={wi} className="inline-block rounded px-0.5">{w}</span>
                    ))}
                    <span
                      className="mx-2 inline-flex h-7 w-7 items-center justify-center rounded-full border align-middle text-[11px] font-semibold"
                      style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", fontFamily: "inherit" }}
                    >
                      {n}
                    </span>
                  </p>
                  <p dir="ltr" className="mt-1 text-left text-xs leading-relaxed opacity-70" style={{ color: "var(--color-ink-muted)", fontFamily: "inherit" }}>
                    {en}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
