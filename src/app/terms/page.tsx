import type { Metadata } from "next";
import { SUPPORT_EMAIL, SITE_URL } from "@/lib/site-config";
import LegalLayout from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Terms of Service — Waqt",
  description: "Terms governing your use of Waqt",
  robots: { index: true, follow: true },
  alternates: { canonical: `${SITE_URL}/terms` },
};

export const dynamic = "force-static";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updatedAt="September 2025">
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
          <a href="/privacy" className="font-medium underline" style={{ color: "var(--color-accent)" }}> Privacy Policy </a>
          for details.
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
        <h2 className="mb-2 text-lg font-semibold">8. Acceptable Use</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          You agree not to misuse the service, attempt to access another user&apos;s
          data without permission, abuse the prayer-friends system to harass
          others, or attempt to disrupt the service. Accounts that violate these
          rules may be terminated without notice.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">9. Account Termination</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          You can delete your account at any time from Settings. We may terminate
          accounts that violate these terms or that remain inactive for over 24
          months. See our{" "}
          <a href="/data-deletion" className="font-medium underline" style={{ color: "var(--color-accent)" }}>
            Data Deletion guide
          </a>{" "}
          for what happens when you delete your account.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">10. Limitation of Liability</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Waqt is a personal productivity tool, not a religious authority. Prayer
          times, qadaa calculations, and Hijri dates are computed using
          third-party APIs and may contain errors. You are responsible for
          verifying important religious obligations with qualified scholars.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">11. Changes to These Terms</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          We may update these terms as the app evolves. Material changes will be
          announced in-app at least 7 days before they take effect. Continued use
          after the effective date constitutes acceptance of the updated terms.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">12. Contact</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Questions? Email {SUPPORT_EMAIL}.
        </p>
      </section>
    </LegalLayout>
  );
}
