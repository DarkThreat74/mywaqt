import type { Metadata } from "next";
import { SUPPORT_EMAIL, SITE_URL } from "@/lib/site-config";
import LegalLayout from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Cookie Policy — Waqt",
  description: "How Waqt uses cookies and local storage",
  robots: { index: true, follow: true },
  alternates: { canonical: `${SITE_URL}/cookies` },
};

export const dynamic = "force-static";

export default function CookiePolicyPage() {
  return (
    <LegalLayout title="Cookie Policy" updatedAt="September 2025">
      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">1. What Are Cookies</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Cookies are small text files stored in your browser. Waqt uses cookies
          and browser storage (local storage, IndexedDB) to keep you logged in
          and to cache your data for offline use.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">2. The Cookies We Use</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-paper-3)" }}>
                <th className="py-2 pr-4 text-left font-semibold" style={{ color: "var(--color-ink)" }}>Name</th>
                <th className="py-2 pr-4 text-left font-semibold" style={{ color: "var(--color-ink)" }}>Purpose</th>
                <th className="py-2 text-left font-semibold" style={{ color: "var(--color-ink)" }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid var(--color-paper-3)" }}>
                <td className="py-2 pr-4" style={{ color: "var(--color-ink-soft)" }}>waqt-session</td>
                <td className="py-2 pr-4" style={{ color: "var(--color-ink-soft)" }}>Keeps you logged in (JWT session token)</td>
                <td className="py-2" style={{ color: "var(--color-ink-soft)" }}>30 days</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--color-paper-3)" }}>
                <td className="py-2 pr-4" style={{ color: "var(--color-ink-soft)" }}>waqt:theme</td>
                <td className="py-2 pr-4" style={{ color: "var(--color-ink-soft)" }}>Remembers your light/dark theme choice</td>
                <td className="py-2" style={{ color: "var(--color-ink-soft)" }}>Until cleared</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--color-paper-3)" }}>
                <td className="py-2 pr-4" style={{ color: "var(--color-ink-soft)" }}>waqt:sound</td>
                <td className="py-2 pr-4" style={{ color: "var(--color-ink-soft)" }}>Remembers your UI sound preference</td>
                <td className="py-2" style={{ color: "var(--color-ink-soft)" }}>Until cleared</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--color-paper-3)" }}>
                <td className="py-2 pr-4" style={{ color: "var(--color-ink-soft)" }}>waqt:push-endpoint</td>
                <td className="py-2 pr-4" style={{ color: "var(--color-ink-soft)" }}>Avoids re-registering push notifications on every load</td>
                <td className="py-2" style={{ color: "var(--color-ink-soft)" }}>Until cleared</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          The <code className="rounded px-1" style={{ backgroundColor: "var(--color-paper-2)" }}>waqt-session</code> cookie is
          marked <code className="rounded px-1" style={{ backgroundColor: "var(--color-paper-2)" }}>HttpOnly</code> and
          <code className="rounded px-1" style={{ backgroundColor: "var(--color-paper-2)" }}>Secure</code> so JavaScript
          cannot read it and it is only sent over HTTPS.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">3. Local Storage & IndexedDB</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Waqt stores your cached calendar events, prayer logs, prayer times, and
          homework in your browser&apos;s local storage and IndexedDB. This enables
          offline use — you can view and edit your data without an internet
          connection. Changes sync automatically when you reconnect. This data
          is cleared when you delete your account or clear your browser data.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">4. No Tracking Cookies</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Waqt does not use Google Analytics, Meta Pixel, or any third-party
          tracking or advertising cookies. We do not sell your data or share it
          with advertisers.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">5. Managing Cookies</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          You can clear cookies and local storage from your browser settings at
          any time. Clearing the session cookie will log you out. Clearing
          IndexedDB will remove your offline cache — your data remains safe on
          our servers and will re-download when you log back in.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">6. Contact</h2>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          Questions about cookies? Email {SUPPORT_EMAIL}.
        </p>
      </section>
    </LegalLayout>
  );
}
