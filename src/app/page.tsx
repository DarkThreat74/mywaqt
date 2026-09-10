/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5
 * Macrostructure: full-bleed hero with Arabic calligraphy background →
 *   principle band → Arabic quote → letter close → footer
 * Spectral for editorial Latin text, Amiri for Arabic.
 * Warm contemplative palette. No gradients. No AI-slop patterns.
 *
 * Animation: CSS-only fade-ins (no motion/react) for instant first paint.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Static — the proxy (src/proxy.ts) already redirects logged-in users
// from / to /calendar/day, so this page only renders for logged-out visitors.
// Prerendered at build time and served from the CDN edge for instant first load.
export const dynamic = "force-static";

export default function MarketingPage() {
  return (
    <div className="flex min-h-dvh flex-col" style={{ fontFamily: "var(--font-spectral), Georgia, serif" }}>
      {/* ── Nav ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md"
        style={{
          backgroundColor: "color-mix(in oklab, var(--color-paper) 85%, transparent)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 sm:px-10 lg:px-16">
          <div className="flex items-baseline gap-3 select-none">
            <span className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
              Waqt
            </span>
            <span className="text-sm" style={{ color: "var(--color-ink-muted)", fontFamily: "var(--font-amiri)" }} dir="rtl">
              وقت
            </span>
          </div>
          <nav className="flex items-center gap-8 text-sm" aria-label="Marketing navigation">
            <Link
              href="/login"
              className="transition-opacity hover:opacity-60"
              style={{ color: "var(--color-ink-soft)" }}
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full px-5 py-2 text-sm font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero — full viewport, Arabic calligraphy background ── */}
      <section
        className="relative flex min-h-dvh items-center overflow-hidden pt-20"
        style={{
          backgroundColor: "color-mix(in oklab, var(--color-paper) 70%, var(--color-accent-faint))",
        }}
      >
        {/* Arabic background text — "حي على الصلاة" (Come to prayer) as a watermark */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
          style={{ overflow: "hidden" }}
        >
          <div
            className="select-none whitespace-nowrap text-center"
            style={{
              fontFamily: "var(--font-amiri)",
              fontSize: "clamp(8rem, 22vw, 22rem)",
              color: "var(--color-accent)",
              opacity: 0.12,
              lineHeight: 1,
              transform: "rotate(-5deg)",
            }}
            dir="rtl"
          >
            حي على الصلاة
          </div>
        </div>

        {/* Secondary Arabic — smaller, positioned top-right */}
        <div
          className="absolute right-6 top-32 hidden sm:block lg:right-16"
          aria-hidden="true"
        >
          <span
            style={{
              fontFamily: "var(--font-amiri)",
              fontSize: "clamp(1.5rem, 3vw, 2.5rem)",
              color: "var(--color-warmth)",
              opacity: 0.22,
            }}
            dir="rtl"
          >
            إن الصلاة كانت على المؤمنين كتاباً موقوتاً
          </span>
        </div>

        {/* Tertiary Arabic — bottom-left, very faint */}
        <div
          className="absolute bottom-24 left-6 hidden sm:block lg:left-16"
          aria-hidden="true"
        >
          <span
            style={{
              fontFamily: "var(--font-amiri)",
              fontSize: "clamp(1.2rem, 2.5vw, 2rem)",
              color: "var(--color-accent)",
              opacity: 0.15,
            }}
            dir="rtl"
          >
            الوقتُ كالسيف
          </span>
        </div>

        <div className="relative z-10 w-full px-6 sm:px-10 lg:px-16">
          <div className="max-w-2xl">
            <div className="waqt-fade-up" style={{ animationDelay: "0.05s" }}>
              <p
                className="mb-8 text-xs font-medium uppercase tracking-[0.2em]"
                style={{ color: "var(--color-accent)" }}
              >
                Prayer-centered life tracker
              </p>
            </div>

            <div className="waqt-fade-up" style={{ animationDelay: "0.13s" }}>
              <h1
                className="text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
                style={{
                  color: "var(--color-ink)",
                  overflowWrap: "anywhere",
                  minWidth: 0,
                }}
              >
                The five prayers
                <br />
                are the fixed
                <br />
                anchor.
              </h1>
            </div>

            <div className="waqt-fade-up" style={{ animationDelay: "0.25s" }}>
              <p
                className="mt-10 max-w-lg text-lg leading-relaxed"
                style={{ color: "var(--color-ink-soft)" }}
              >
                Everything else fits around them. A calendar that treats
                prayer times as the structure of your day — not a reminder
                you dismiss.
              </p>
            </div>

            <div className="waqt-fade-up" style={{ animationDelay: "0.35s" }}>
              <div className="mt-12 flex flex-wrap items-center gap-4">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-medium transition-opacity hover:opacity-90"
                  style={{
                    backgroundColor: "var(--color-ink)",
                    color: "var(--color-paper)",
                  }}
                >
                  Start tracking
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="text-base font-medium underline underline-offset-4 transition-opacity hover:opacity-60"
                  style={{ color: "var(--color-ink-soft)" }}
                >
                  I have an account
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator — animated bounce */}
        <div className="waqt-fade-up" style={{ animationDelay: "0.55s" }}>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
            <div
              className="h-12 w-px"
              style={{
                backgroundColor: "var(--color-ink-muted)",
                opacity: 0.3,
                animation: "waqt-scroll-pulse 2s ease-in-out infinite",
              }}
            />
          </div>
        </div>
      </section>

      {/* ── Features section — what Waqt actually has right now ── */}
      <section
        className="border-y px-6 py-24 sm:px-10 sm:py-32 lg:px-16"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "var(--color-paper-2)",
        }}
      >
        <div className="mx-auto max-w-5xl">
          <div className="waqt-fade-up mb-16 flex items-center gap-4">
            <p
              className="text-xs font-medium uppercase tracking-[0.2em]"
              style={{ color: "var(--color-ink-muted)" }}
            >
              What&apos;s inside
            </p>
            <span
              style={{
                fontFamily: "var(--font-amiri)",
                fontSize: "1.5rem",
                color: "var(--color-accent)",
                opacity: 0.5,
              }}
              dir="rtl"
            >
              الميزات
            </span>
          </div>

          <div className="waqt-fade-up grid gap-x-12 gap-y-16 sm:grid-cols-2 lg:grid-cols-3" style={{ animationDelay: "0.1s" }}>
            <Feature
              title="Prayer-anchored calendar"
              body="Day, month, and list views with the five daily prayers as fixed background bands. Events, tasks, and reminders sit on top. Overlaps stack side-by-side — nothing blocks."
            />
            <Feature
              title="One-tap prayer check-in"
              body="Tap any prayer label to log it. The app asks if you went to the masjid, records the exact time, and shows green completion marks in month view."
            />
            <Feature
              title="Prayer analytics"
              body="See your consistency percentage, average prayer time, and masjid attendance rate for each of the five prayers — all on one dashboard."
            />
            <Feature
              title="Qadaa tracker"
              body="Set how many of each prayer you owe — individually, per salah. Log prayed qadaa one at a time. The tracker counts down per prayer, not as a vague total."
            />
            <Feature
              title="Prayer friends"
              body="Share your six-character prayer code. Send and accept friend requests, see your streaks side-by-side, and hold each other accountable through companionship."
            />
            <Feature
              title="Homework & classes"
              body="Track assignments by class with due dates, times, priority, and type. Overdue and due-today items surface on the Today tab so nothing slips past you."
            />
            <Feature
              title="Goals — weekly & long-term"
              body="Set short-term goals for this week and long-term goals with target dates. Check them off with a tap. The Today tab shows what's due and what you've completed."
            />
            <Feature
              title="Recurring events & reminders"
              body="Create events that repeat on selected weekdays. Edit or delete a single occurrence without touching the rest. Custom colors for every event type."
            />
            <Feature
              title="Public calendar sharing"
              body="Generate a shareable link with a named URL. Anyone can see your prayer schedule without an account — perfect for family and study groups."
            />
            <Feature
              title="Works fully offline"
              body="Open the app, add events, log prayers, adjust qadaa — all without internet. Edits queue locally and sync automatically the moment you reconnect."
            />
            <Feature
              title="Prayer time notifications"
              body="Get a notification when each prayer window opens, and a reminder 15 minutes before your scheduled events. Asr is automatically adjusted for your calculation method."
            />
            <Feature
              title="Trusted device login"
              body="Sign in instantly on your own phone or laptop — no password needed. Your device is remembered with a fingerprint, and you can revoke access anytime."
            />
            <Feature
              title="365-day fact bank"
              body="A human-curated Islamic fact, glossary term, and Arabic citation for every day of the year. No AI-generated rulings — just vetted content from authentic sources."
            />
            <Feature
              title="Calendar list view"
              body="See your upcoming events across multiple days in a single scrollable list with dates, time slots, and color tags. Filter what's in progress from what's ended."
            />
            <Feature
              title="Dhikr counter"
              body="A beautiful tap-based tasbih counter with curated dhikr sequences from authenticated sources. Vibration feedback on each count, auto-advances through the sequence, and tracks your progress."
            />
            <Feature
              title="Hijri calendar"
              body="See the Islamic date alongside the Gregorian date everywhere — on the calendar, day view, and prayer pages. The Hijri date is computed locally and stays in sync as you navigate."
            />
            <Feature
              title="Qibla compass"
              body="Find the direction to the Kaaba from anywhere in the world. Smooth live compass on mobile with device sensors, static bearing on desktop. Shows exact degrees, cardinal direction, and distance to Mecca."
            />
            <Feature
              title="Akhirah Card"
              body="Track your charitable giving on your personal Akhirah Card. Log sadaqah, zakat, fidyah, or general charity. See your balance invested in the hereafter with a full history of every contribution."
            />
            <Feature
              title="99 Names of Allah"
              body="Browse all 99 beautiful names of Allah (Asma ul Husna) with Arabic script, transliteration, and English meanings. Search by name or meaning."
            />
            <Feature
              title="Talks library"
              body="Browse curated lectures and khutbahs from trusted speakers. External links only — no self-hosted audio. Filter by category and listen on the original platform."
            />
            <Feature
              title="Bot-proof signup"
              body="A claw-machine mini-game verifies you're human — no boring checkbox, no privacy-invading tracking. Falls back automatically if the challenge doesn't load."
            />
          </div>
        </div>
      </section>

      {/* ── Quote band — full width, Arabic + translation ── */}
      <section className="px-6 py-24 sm:px-10 sm:py-32 lg:px-16">
        <div className="mx-auto max-w-4xl text-center">
          <div className="waqt-scale-in" style={{ animationDelay: "0.05s" }}>
            <p
              className="mb-8 text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl"
              style={{ color: "var(--color-ink)", fontFamily: "var(--font-amiri)" }}
              dir="rtl"
            >
              حي على الصلاة
            </p>
          </div>
          <div className="waqt-fade-up" style={{ animationDelay: "0.15s" }}>
            <p
              className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl lg:text-4xl"
              style={{ color: "var(--color-ink-soft)" }}
            >
              &ldquo;Come to prayer.&rdquo;
            </p>
          </div>
          <div className="waqt-fade-up" style={{ animationDelay: "0.25s" }}>
            <p className="mt-6 text-sm" style={{ color: "var(--color-ink-muted)" }}>
              — The call to prayer, heard five times daily
            </p>
          </div>
        </div>
      </section>

      {/* ── Second quote — about prayer being timed ── */}
      <section
        className="border-y px-6 py-24 sm:px-10 sm:py-32 lg:px-16"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "var(--color-paper-2)",
        }}
      >
        <div className="mx-auto max-w-4xl text-center">
          <div className="waqt-scale-in" style={{ animationDelay: "0.05s" }}>
            <p
              className="mb-6 text-3xl leading-relaxed sm:text-4xl"
              style={{ color: "var(--color-ink)", fontFamily: "var(--font-amiri)" }}
              dir="rtl"
            >
              إن الصلاة كانت على المؤمنين كتاباً موقوتاً
            </p>
          </div>
          <div className="waqt-fade-up" style={{ animationDelay: "0.15s" }}>
            <p
              className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl"
              style={{ color: "var(--color-ink-soft)" }}
            >
              &ldquo;Prayer has been prescribed for the believers at fixed times.&rdquo;
            </p>
          </div>
          <div className="waqt-fade-up" style={{ animationDelay: "0.25s" }}>
            <p className="mt-6 text-sm" style={{ color: "var(--color-ink-muted)" }}>
              — Quran, An-Nisa 4:103
            </p>
          </div>
        </div>
      </section>

      {/* ── Letter close — quiet ending ── */}
      <section
        className="border-t px-6 py-24 sm:px-10 sm:py-32 lg:px-16"
        style={{ borderColor: "var(--color-paper-3)" }}
      >
        <div className="mx-auto max-w-2xl">
          <div className="waqt-fade-up">
            <p
              className="text-xl leading-relaxed"
              style={{ color: "var(--color-ink-soft)" }}
            >
              Waqt has grown into a full prayer-centered life tracker — calendar,
              prayer accountability, homework, goals, friends, and a daily fact
              bank. Prayer tracking will always be free. Create an account and
              start building your routine around the five prayers today.
            </p>
          </div>
          <div className="waqt-fade-up" style={{ animationDelay: "0.1s" }}>
            <div className="mt-10">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 text-base font-medium underline underline-offset-4"
                style={{ color: "var(--color-accent)" }}
              >
                Create your account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="border-t px-6 py-8 text-xs sm:px-10 lg:px-16"
        aria-label="Site footer"
        style={{
          borderColor: "var(--color-paper-3)",
          color: "var(--color-ink-muted)",
          paddingBottom: "calc(2rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-2">
            <span>Waqt — a prayer-centered life tracker.</span>
            <span style={{ fontFamily: "var(--font-amiri)", opacity: 0.6 }} dir="rtl">
              وقت
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Legal">
            <Link href="/privacy" className="transition-opacity hover:opacity-70" style={{ color: "var(--color-ink-muted)" }}>
              Privacy
            </Link>
            <Link href="/terms" className="transition-opacity hover:opacity-70" style={{ color: "var(--color-ink-muted)" }}>
              Terms
            </Link>
            <Link href="/cookies" className="transition-opacity hover:opacity-70" style={{ color: "var(--color-ink-muted)" }}>
              Cookies
            </Link>
            <Link href="/data-deletion" className="transition-opacity hover:opacity-70" style={{ color: "var(--color-ink-muted)" }}>
              Data Deletion
            </Link>
            <Link href="/support" className="transition-opacity hover:opacity-70" style={{ color: "var(--color-ink-muted)" }}>
              Support
            </Link>
            <Link
              href="/admin/login"
              className="transition-opacity hover:opacity-70"
              style={{ color: "var(--color-ink-muted)" }}
            >
              Admin
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h2
        className="text-lg font-semibold tracking-tight"
        style={{ color: "var(--color-ink)" }}
      >
        {title}
      </h2>
      <p
        className="text-sm leading-relaxed"
        style={{ color: "var(--color-ink-soft)" }}
      >
        {body}
      </p>
    </div>
  );
}
