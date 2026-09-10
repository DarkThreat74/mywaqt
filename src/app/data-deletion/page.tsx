import type { Metadata } from "next";
import { SUPPORT_EMAIL, SITE_URL } from "@/lib/site-config";
import LegalLayout from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Data Deletion — Waqt",
  description: "How to delete your account and data from Waqt",
  robots: { index: true, follow: true },
  alternates: { canonical: `${SITE_URL}/data-deletion` },
};

export const dynamic = "force-static";

export default function DataDeletionPage() {
  return (
    <LegalLayout title="Data Deletion" updatedAt="September 2025">
      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Delete Your Account In-App</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          The fastest way to delete your data is from within the app:
        </p>
        <ol className="ml-5 mt-3 list-decimal space-y-2 text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          <li>Open Waqt and go to <strong>Settings</strong>.</li>
          <li>Scroll to <strong>Account</strong>.</li>
          <li>Tap <strong>Delete Account</strong>.</li>
          <li>Confirm by typing your email when prompted.</li>
        </ol>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">What Gets Deleted</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          When you delete your account, the following is immediately anonymized or removed:
        </p>
        <ul className="ml-5 mt-3 list-disc space-y-1.5 text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          <li>Your email address is replaced with <code className="rounded px-1" style={{ backgroundColor: "var(--color-paper-2)" }}>[deleted]</code></li>
          <li>Your display name and first name are cleared</li>
          <li>Your phone number is removed</li>
          <li>Your password hash is cleared</li>
          <li>Your session cookies are revoked</li>
          <li>Your trusted devices are removed</li>
          <li>Your push notification subscriptions are removed</li>
          <li>Your calendar share token and prayer code are revoked</li>
          <li>Your prayer friend connections are severed</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">What Is Retained (Anonymized)</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          The following may be retained in anonymized form for aggregate analytics
          and to preserve data integrity for friends who had prayer accountability
          partnerships with you:
        </p>
        <ul className="ml-5 mt-3 list-disc space-y-1.5 text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          <li>Anonymized prayer log entries (no name, email, or identifier attached)</li>
          <li>Anonymized event records (no title or personal content — only timestamps for aggregate usage stats)</li>
        </ul>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          This anonymized data cannot be linked back to you.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Clear Your Browser Data</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          After deleting your account, clear the local cache from your browser:
        </p>
        <ul className="ml-5 mt-3 list-disc space-y-1.5 text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          <li><strong>iOS Safari:</strong> Settings &rarr; Safari &rarr; Clear History and Website Data</li>
          <li><strong>Android Chrome:</strong> Settings &rarr; Apps &rarr; Waqt &rarr; Storage &rarr; Clear Data</li>
          <li><strong>Desktop:</strong> Browser settings &rarr; Clear browsing data &rarr; Cookies and site data</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Request Full Deletion by Email</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          If you cannot access the app (e.g., lost device, forgot password), you
          can request account deletion by emailing {SUPPORT_EMAIL} from the
          address associated with your account. Include the subject line
          <em> Account Deletion Request</em>. We will verify your identity and
          delete your account within 30 days.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Data Export</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Before deleting, you can request a full export of your data (prayer
          logs, calendar events, goals, homework) by emailing {SUPPORT_EMAIL}.
          We will send you a JSON file within 30 days.
        </p>
      </section>
    </LegalLayout>
  );
}
