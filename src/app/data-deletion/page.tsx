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
          <li>Open the <strong>Advanced</strong> section.</li>
          <li>Tap <strong>Delete my account</strong>, acknowledge the warning, then type <strong>DELETE</strong> to confirm.</li>
          <li>Deletion is scheduled with a <strong>5-hour grace period</strong>. A countdown appears in Settings — tap <strong>Cancel deletion</strong> any time before it ends to keep your account.</li>
        </ol>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">What Gets Deleted</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Once the grace period ends, your account row is removed and every
          piece of data attached to it is deleted with it — nothing personal is retained:
        </p>
        <ul className="ml-5 mt-3 list-disc space-y-1.5 text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          <li>Your account (email, names, password, phone)</li>
          <li>All prayer logs, streaks, and qadaa records</li>
          <li>All calendar events, goals, homework, notes, and settings</li>
          <li>Prayer friend connections, groups, reminders, and cheers</li>
          <li>Location, prayer settings, and share tokens</li>
          <li>Trusted devices, push subscriptions, and listening progress</li>
        </ul>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          The only exception: iqamah times you submitted to the community masjid
          database remain (they belong to the masjid, not to you) with all
          attribution to you removed.
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
