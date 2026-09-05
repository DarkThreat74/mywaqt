import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Terms of Service — Waqt",
  description: "Terms governing your use of Waqt",
  robots: { index: true, follow: true },
};

export const dynamic = "force-static";

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-12" style={{ color: "var(--color-ink)" }}>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mb-4 text-sm" style={{ color: "var(--color-ink-muted)" }}>
        Last updated: {new Date().getFullYear()}
      </p>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">1. What Waqt Is</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Waqt is a prayer-centered life tracker. The five daily prayers are fixed
          anchors; the app helps you schedule your life around them and maintain
          accountability for your prayer practice.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">2. Prayer Accountability Is Free</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          The check-in system, qadaa tracker, and prayer timeline are free forever.
          We never gate prayer accountability behind a paywall. Subscriptions pay
          for depth and convenience features only.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">3. Sadaqah Tracking</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Waqt never processes payments. The Akhirah Card tracks your charitable
          giving as a personal record only. Waqt is a witness, not a collector.
          Any donations are made outside the app.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">4. Religious Content</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          All religious content (dhikr sequences, talks) is human-curated from
          vetted sources. Waqt does not generate religious content using AI.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">5. Assumed Prayed Policy</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Unmarked prayers auto-resolve as assumed-prayed at day&apos;s end. We never
          assume the worst on missing data. No silent penalty, no ledger charge. A
          week-long absence surfaces as one batch catch-up screen, never a flood of
          backdated reminders.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">6. Your Data</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          You own your data. You can export or delete it at any time. See our
          Privacy Policy for details.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">7. No Warranty</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Waqt is provided as-is without warranty. Prayer time calculations are
          based on the AlAdhan API and may vary from your local mosque times.
          Always verify with your local mosque for exact prayer times.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">8. Contact</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Questions? Email {SUPPORT_EMAIL}.
        </p>
      </section>
    </article>
  );
}
