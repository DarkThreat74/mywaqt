import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { Calendar, Settings, Flame, Sun, LogOut } from "lucide-react";
import ServiceWorkerRegister from "@/components/sw-register";
import NotificationScheduler from "@/components/notification-scheduler";
import BiometricGate from "@/components/biometric-gate";
import DeepLinkHandler from "@/components/deep-link-handler";
import ToolsMenu from "@/components/tools-menu";
import FunFactPopup from "@/components/fun-fact-popup";
import OfflineBanner from "@/components/offline-banner";
import { AudioPlayerProvider } from "@/components/audio-player-context";
import GlobalAudioPlayer from "@/components/global-audio-player";

// Force dynamic — prevents static prerender + CSP nonce conflicts
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Check if the user has completed all required settings:
  //   1. Display name
  //   2. Location (latitude/longitude)
  //   3. Calculation method
  //   4. Madhab
  // If any are missing, show a red dot on Settings.
  // Wrap in try-catch so a DB failure doesn't crash the entire layout.
  let needsSettings = false;
  try {
    // Parallelize user + prayer settings queries (no dependency between them)
    const [userRows, settingsRows] = await Promise.all([
      db
        .select({ displayName: schema.users.displayName })
        .from(schema.users)
        .where(eq(schema.users.id, session.userId))
        .limit(1),
      db
        .select({
          latitude: schema.prayerSettings.latitude,
          longitude: schema.prayerSettings.longitude,
          calculationMethod: schema.prayerSettings.calculationMethod,
          madhab: schema.prayerSettings.madhab,
        })
        .from(schema.prayerSettings)
        .where(eq(schema.prayerSettings.userId, session.userId))
        .limit(1),
    ]);

    const [user] = userRows;
    needsSettings = !user?.displayName;

    if (!needsSettings) {
      const [settings] = settingsRows;
      // Show dot if no settings row, no location, no calculation method, or no madhab
      if (!settings) needsSettings = true;
      else if (!settings.latitude || !settings.longitude) needsSettings = true;
      else if (!settings.calculationMethod) needsSettings = true;
      else if (!settings.madhab) needsSettings = true;
    }
  } catch {
    // If the query fails, don't show the dot — better to render the app than crash
    needsSettings = false;
  }

  const navItems = [
    { label: "Calendar", href: "/calendar/day", icon: Calendar, alert: false },
    { label: "Prayer", href: "/prayer", icon: Flame, alert: false },
    { label: "Today", href: "/goals", icon: Sun, alert: false },
    { label: "Settings", href: "/settings", icon: Settings, alert: needsSettings },
  ];

  return (
    <AudioPlayerProvider>
    <div className="flex min-h-dvh w-full overflow-x-hidden" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* ── Skip link for keyboard users (WCAG 2.4.1) ── */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* ── Desktop sidebar ── */}
      <aside
        className="fixed left-0 top-0 bottom-0 hidden w-56 flex-col border-r lg:flex"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
        aria-label="Primary navigation"
      >
        <div className="flex items-center px-6 py-6">
          <span className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
            Waqt
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Main">
          {navItems.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </nav>

        {/* Tools + Logout — pinned to bottom */}
        <div className="px-3 pb-6">
          <ToolsMenu variant="sidebar" />
          <LogoutButton />
        </div>
      </aside>

      {/* ── Main content area ── */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-56">
        {/* Mobile top bar */}
        <header
          className="sticky top-0 z-40 flex items-center justify-between border-b px-4 py-3 lg:hidden backdrop-blur-md"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "color-mix(in oklab, var(--color-paper) 90%, transparent)",
            paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
          }}
        >
          <span className="text-base font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
            Waqt
          </span>
          <div className="flex items-center gap-1">
            <ToolsMenu />
          </div>
        </header>

        {/* Page content */}
        <main id="main-content" className="min-w-0 flex-1 overflow-x-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
          <OfflineBanner />
          <BiometricGate>{children}</BiometricGate>
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t lg:hidden backdrop-blur-md"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "color-mix(in oklab, var(--color-paper) 90%, transparent)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        aria-label="Mobile navigation"
      >
        {navItems.map((item) => (
          <MobileNavItem key={item.href} {...item} />
        ))}
      </nav>

      {/* Service worker + notification scheduler + deep links + fun fact popup */}
      <ServiceWorkerRegister />
      <NotificationScheduler />
      <DeepLinkHandler />
      <FunFactPopup />

      {/* Global audio player — survives route changes for background playback */}
      <GlobalAudioPlayer />
    </div>
    </AudioPlayerProvider>
  );
}

function NavItem({ label, href, icon: Icon, alert }: { label: string; href: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; alert?: boolean }) {
  return (
    <Link
      href={href}
      prefetch
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
      prefetch
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

function LogoutButton() {
  "use client";
  const handleLogout = async () => {
    try {
      // Unsubscribe push before logout
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg?.pushManager) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }
    } catch { /* non-critical */ }
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch { /* non-critical */ }
    // Full page reload on logout clears all client state — intentional
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  };
  return (
    <button
      onClick={handleLogout}
      className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
      style={{ color: "var(--color-ink-soft)" }}
    >
      <LogOut className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
      Log out
    </button>
  );
}
