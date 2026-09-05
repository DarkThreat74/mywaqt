import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Support — Waqt",
  description: "Get help with Waqt, report issues, and find answers to common questions.",
  robots: { index: true, follow: true },
};

export const dynamic = "force-static";

export default function SupportPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-12" style={{ color: "var(--color-ink)" }}>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Support</h1>
      <p className="mb-4 text-sm" style={{ color: "var(--color-ink-muted)" }}>
        Last updated: {new Date().getFullYear()}
      </p>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Contact</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          For support, bug reports, or feature requests, email us at{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium underline"
            style={{ color: "var(--color-accent)" }}
          >
            {SUPPORT_EMAIL}
          </a>
          . We typically respond within 48 hours.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Account Issues</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          If you can&apos;t log in, try resetting your password from the login page.
          If you&apos;re locked out of your account, email us from the address
          associated with your account and we&apos;ll help you regain access.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Prayer Times</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Prayer times are calculated using the AlAdhan API based on the location
          you set during onboarding. If your prayer times look wrong, go to
          Settings &rarr; Prayer Settings and update your location or calculation
          method.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Notifications</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          If you&apos;re not receiving notifications, check that notifications are
          enabled for Waqt in your device settings. On iOS, go to Settings &rarr;
          Waqt &rarr; Notifications. On Android, go to Settings &rarr; Apps &rarr;
          Waqt &rarr; Notifications.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Offline Mode</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Waqt caches your data so you can view your prayer log, calendar, and
          goals while offline. Any changes you make offline (check-ins, new events,
          new goals) are saved locally and synced automatically when you reconnect.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Delete Your Account</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          You can delete your account at any time from Settings &rarr; Account
          &rarr; Delete Account. This anonymizes your personal information (email
          and name are replaced with [deleted]) and revokes your session. Your
          prayer logs and analytics data are retained in anonymized form.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Privacy</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          See our{" "}
          <a href="/privacy" className="font-medium underline" style={{ color: "var(--color-accent)" }}>
            Privacy Policy
          </a>{" "}
          for details on how we handle your data.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Terms</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          See our{" "}
          <a href="/terms" className="font-medium underline" style={{ color: "var(--color-accent)" }}>
            Terms of Service
          </a>{" "}
          for the terms governing your use of Waqt.
        </p>
      </section>
    </article>
  );
}
