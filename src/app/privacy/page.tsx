import type { Metadata } from "next";
import { SUPPORT_EMAIL, SITE_URL } from "@/lib/site-config";
import LegalLayout from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Privacy Policy — Waqt",
  description: "How Waqt handles your data",
  robots: { index: true, follow: true },
  alternates: { canonical: `${SITE_URL}/privacy` },
};

export const dynamic = "force-static";

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" updatedAt="September 2025">
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
        <h2 className="mb-2 text-lg font-semibold">4. Data Retention & Deletion</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          You can delete your account at any time from Settings. This anonymizes all
          personally identifiable information (email, name, phone) and revokes your
          session. Anonymized prayer logs may be retained for aggregate analytics.
          You can request complete data export by contacting {SUPPORT_EMAIL}. See
          our{" "}
          <a href="/data-deletion" className="font-medium underline" style={{ color: "var(--color-accent)" }}>
            Data Deletion guide
          </a>{" "}
          for step-by-step instructions.
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
        <h2 className="mb-2 text-lg font-semibold">7. Cookies & Local Storage</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Waqt uses a single session cookie to keep you logged in. We also use
          browser local storage and IndexedDB to cache your data for offline use.
          See our{" "}
          <a href="/cookies" className="font-medium underline" style={{ color: "var(--color-accent)" }}>
            Cookie Policy
          </a>{" "}
          for details.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">8. Your Rights (GDPR & CCPA)</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          If you are in the EU, UK, or California, you have the right to access,
          correct, export, or delete your personal data. To exercise any of these
          rights, email {SUPPORT_EMAIL}. We respond within 30 days.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">9. Children&apos;s Privacy</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Waqt is not directed to children under 13. We do not knowingly collect
          data from children under 13. If you believe a child has provided us
          personal data, contact {SUPPORT_EMAIL} and we will delete it.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">10. Changes to This Policy</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          We may update this policy as the app evolves. Material changes will be
          announced in-app at least 7 days before they take effect.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">11. Contact</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Questions about privacy? Email {SUPPORT_EMAIL}.
        </p>
      </section>
    </LegalLayout>
  );
}
