import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Privacy Policy — Waqt",
  description: "How Waqt handles your data",
  robots: { index: true, follow: true },
};

export const dynamic = "force-static";

export default function PrivacyPolicyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-12" style={{ color: "var(--color-ink)" }}>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mb-4 text-sm" style={{ color: "var(--color-ink-muted)" }}>
        Last updated: {new Date().getFullYear()}
      </p>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">1. What We Collect</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Waqt collects your email address, display name, and prayer location
          (latitude/longitude) to provide prayer time calculations and accountability
          features. We also store your prayer check-ins, calendar events, and qadaa
          ledger entries. If you enable push notifications, we store a device token.
          If you add a phone number for SMS notifications, we store and verify it.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">2. How We Use Your Data</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Your data is used solely to provide Waqt&apos;s features: prayer time
          calculation, check-in tracking, calendar scheduling, accountability with
          friends you explicitly add, and notifications you opt into. We never sell
          your data. We never share your data with third parties except as required
          to deliver the service (e.g., AlAdhan for prayer times, Firebase for push
          delivery, Twilio for SMS you explicitly opt into).
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">3. Prayer Accountability</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Prayer check-in data is visible only to you and friends you explicitly add
          via prayer code. Unmarked prayers auto-resolve as assumed-prayed at
          day&apos;s end — no penalty, no public record. Your qadaa ledger is
          private to you.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">4. Data Retention &amp; Deletion</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          You can delete your account at any time from Settings. This anonymizes all
          personally identifiable information (email, name, phone) and revokes your
          session. Anonymized prayer logs may be retained for aggregate analytics.
          You can request complete data export by contacting {SUPPORT_EMAIL}.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">5. Notifications</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Push notifications are opt-in. SMS notifications require explicit opt-in
          and phone verification. Other-reminder notifications are push-only — no SMS
          option exists. You can disable any notification channel at any time in
          Settings.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">6. Religious Content</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          All religious content (dhikr sequences, talks) is
          human-curated from vetted sources. Waqt does not generate religious
          content using AI.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">7. Contact</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Questions about privacy? Email {SUPPORT_EMAIL}.
        </p>
      </section>
    </article>
  );
}
