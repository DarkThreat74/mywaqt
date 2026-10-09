import { redirect } from "next/navigation";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { Calendar, Settings, Flame, NotebookPen } from "lucide-react";
import ServiceWorkerRegister from "@/components/sw-register";
import NotificationScheduler from "@/components/notification-scheduler";
import BiometricGate from "@/components/biometric-gate";
import DeepLinkHandler from "@/components/deep-link-handler";
import PendingInvite from "@/components/pending-invite";
import ToolsMenu from "@/components/tools-menu";
import { NotificationBell, NotificationTray } from "@/components/notification-center";
import ToolsFab from "@/components/tools-fab";
import DuaToast from "@/components/dua-toast";
import FunFactPopup from "@/components/fun-fact-popup";
import BirthdayAlerter from "@/components/birthday-alerter";
import FloatingDock from "@/components/floating-dock";
import { isFeedbackEnabled } from "@/lib/app-settings";
import OfflineBanner from "@/components/offline-banner";
import { AudioPlayerProvider } from "@/components/audio-player-context";
import GlobalAudioPlayer from "@/components/global-audio-player";
import LogoutButton from "@/components/logout-button";
import SyncStatus from "@/components/sync-status";
import UserStamp from "@/components/user-stamp";
import ThemeGuard from "@/components/theme-guard";
import { SoundscapeProvider } from "@/components/soundscape-context";
import StudySession from "@/components/study-session";
import SidebarSalah from "@/components/sidebar-salah";
import OnboardingGuard from "@/components/onboarding-guard";
import ShellMode from "@/components/shell-mode";

// Force dynamic — prevents static prerender + CSP nonce conflicts
export const dynamic = "force-dynamic";

// unstable_cache memoizes the onboarding/settings check per user for 60s
// across requests — the layout re-executes on every client-side navigation,
// so without this every tab click cost two extra Neon round-trips.
interface UserGate {
  needsSettings: boolean;
  onboardingCompleted: boolean;
  onboardingStep: string | null;
}

const getUserGate = (userId: string): Promise<UserGate> =>
  unstable_cache(
    async (): Promise<UserGate> => {
      try {
        const [userRows, settingsRows] = await Promise.all([
          db
            .select({
              displayName: schema.users.displayName,
              onboardingCompleted: schema.users.onboardingCompleted,
              onboardingStep: schema.users.onboardingStep,
              createdAt: schema.users.createdAt,
            })
            .from(schema.users)
            .where(eq(schema.users.id, userId))
            .limit(1),
          db
            .select({
              latitude: schema.prayerSettings.latitude,
              longitude: schema.prayerSettings.longitude,
              calculationMethod: schema.prayerSettings.calculationMethod,
              madhab: schema.prayerSettings.madhab,
            })
            .from(schema.prayerSettings)
            .where(eq(schema.prayerSettings.userId, userId))
            .limit(1),
        ]);

        const [user] = userRows;
        const [settings] = settingsRows;
        // Legacy accounts (joined before onboarding existed — same >24h rule
        // the wizard uses for its "we know you" banner) are grandfathered in:
        // mark them completed on first load so they never see the wizard or
        // the quiz. New accounts still onboard normally. An account WITHOUT
        // prayer settings isn't legacy at all — it's someone who abandoned
        // the wizard; auto-completing them would brick their prayer setup.
        if (user && !user.onboardingCompleted && settings &&
            user.createdAt && Date.now() - new Date(user.createdAt).getTime() > 24 * 60 * 60 * 1000) {
          await db
            .update(schema.users)
            .set({ onboardingCompleted: true, onboardingStep: "done" })
            .where(eq(schema.users.id, userId))
            .catch(() => { /* flag flips next load — still treated as done below */ });
          user.onboardingCompleted = true;
        }
        const needsSettings =
          !user?.displayName ||
          !settings ||
          !settings.latitude ||
          !settings.longitude ||
          !settings.calculationMethod ||
          !settings.madhab;
        return {
          needsSettings,
          onboardingCompleted: user?.onboardingCompleted ?? false,
          onboardingStep: user?.onboardingStep ?? null,
        };
      } catch {
        return { needsSettings: false, onboardingCompleted: true, onboardingStep: null };
      }
    },
    ['needs-settings', userId],
    // Tagged so /api/onboarding/* writes can revalidateTag it instantly —
    // otherwise a just-completed user bounces back to /onboarding for up to
    // 60s (the "endless onboarding" bug).
    { revalidate: 60, tags: [`user-gate-${userId}`] }
  )();

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Kick both cached lookups in parallel instead of serializing round-trips.
  const gateP = getUserGate(session.userId);
  const feedbackEnabledP = isFeedbackEnabled();
  const gate = await gateP;
  const needsSettings = gate.needsSettings;

  const navItems = [
    { label: "Calendar", href: "/calendar/day", icon: Calendar, alert: false },
    { label: "Prayer", href: "/prayer", icon: Flame, alert: false },
    { label: "Planner", href: "/goals", icon: NotebookPen, alert: false },
    { label: "Settings", href: "/settings", icon: Settings, alert: needsSettings },
  ];

  return (
    <AudioPlayerProvider>
    <SoundscapeProvider>
    <OnboardingGuard completed={gate.onboardingCompleted} step={gate.onboardingStep} userId={session.userId} />
    <ShellMode />
    <div className="flex min-h-dvh w-full overflow-x-hidden" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* ── Skip link for keyboard users (WCAG 2.4.1) ── */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* ── Desktop sidebar ── */}
      <aside
        className="app-chrome fixed left-0 top-0 bottom-0 hidden w-56 flex-col border-r lg:flex"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
        aria-label="Primary navigation"
      >
        <div className="flex items-center px-6 py-6">
          <Link href="/calendar/day" className="text-lg font-semibold tracking-tight transition-opacity hover:opacity-70" style={{ color: "var(--color-ink)" }}>
            Waqt
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main">
          {navItems.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </nav>

        {/* Tools + Logout — pinned to bottom; salah status rides on top */}
        <div className="px-3 pb-6">
          <SidebarSalah />
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1"><ToolsMenu variant="sidebar" /></div>
            <NotificationBell />
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* ── Main content area ── */}
      <div className="app-main flex min-w-0 flex-1 flex-col lg:pl-56">
        {/* Mobile top bar */}
        <header
          className="app-chrome sticky top-0 z-40 flex items-center justify-between border-b px-4 py-3 lg:hidden backdrop-blur-md"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "color-mix(in oklab, var(--color-paper) 90%, transparent)",
            paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
          }}
        >
          <Link href="/calendar/day" className="text-base font-semibold tracking-tight transition-opacity hover:opacity-70" style={{ color: "var(--color-ink)" }}>
            Waqt
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <ToolsMenu />
          </div>
        </header>

        {/* Page content */}
        {/* Bottom padding lives in globals.css (main#main-content) — it adds
            nav + safe-area + player-bar height; a Tailwind pb-* here loses to
            that ID selector anyway. */}
        <main id="main-content" className="min-w-0 flex-1 overflow-x-hidden">
          <OfflineBanner />
          <BiometricGate>{children}</BiometricGate>
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav
        className="app-chrome fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t lg:hidden backdrop-blur-md"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "color-mix(in oklab, var(--color-paper) 90%, transparent)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        aria-label="Mobile navigation"
      >
        {navItems.slice(0, 2).map((item) => (
          <MobileNavItem key={item.href} {...item} />
        ))}
        <ToolsFab />
        {navItems.slice(2).map((item) => (
          <MobileNavItem key={item.href} {...item} />
        ))}
      </nav>

      {/* Service worker + notification scheduler + deep links + fun fact popup */}
      <ServiceWorkerRegister />
      <UserStamp userId={session.userId} />
      <ThemeGuard />
      <SyncStatus />
      <NotificationScheduler />
      <DeepLinkHandler />
      {/* Floating UI — hidden on bare-shell routes (onboarding, guide) */}
      <div className="app-chrome contents">
        <PendingInvite />
        <NotificationTray />
        <DuaToast />
        <FunFactPopup />
        <BirthdayAlerter />
        {/* Unified floating dock — study timer, sounds, talks, feedback segments */}
        <FloatingDock feedbackEnabled={await feedbackEnabledP} />

        {/* Global audio player — survives route changes for background playback */}
        <GlobalAudioPlayer />

        {/* Vox study session — overlay + floating bubble, survives navigation */}
        <StudySession />
      </div>
    </div>
    </SoundscapeProvider>
    </AudioPlayerProvider>
  );
}

function NavItem({ label, href, icon: Icon, alert }: { label: string; href: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; alert?: boolean }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
      style={{ color: "var(--color-ink-soft)" }}
    >
      <span className="relative">
        <Icon className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
        {alert && (
          <span
            className="absolute -right-1 -top-1 h-2 w-2 rounded-full"
            style={{ backgroundColor: "#dc2626" }}
            aria-label="Action needed"
          />
        )}
      </span>
      {label}
    </Link>
  );
}

function MobileNavItem({ label, href, icon: Icon, alert }: { label: string; href: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; alert?: boolean }) {
  return (
    <Link
      href={href}
      className="flex min-w-0 flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium"
      style={{ color: "var(--color-ink-muted)", minHeight: 44 }}
    >
      <span className="relative">
        <Icon className="h-5 w-5" />
        {alert && (
          <span
            className="absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full"
            style={{ backgroundColor: "#dc2626" }}
            aria-label="Action needed"
          />
        )}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
