"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Set the instant /api/onboarding/complete succeeds — survives any staleness
// in the layout's cached gate (replication lag, an unrevalidated tag), so a
// just-finished user can never be bounced back into the wizard. The value is
// the account's user id: per-account, so a second account on the same device
// can't inherit a "done" it never earned.
export const ONBOARDING_DONE_KEY = "waqt:onboarding-done";

function isDone(serverCompleted: boolean, userId: string): boolean {
  if (serverCompleted) return true;
  try { return localStorage.getItem(ONBOARDING_DONE_KEY) === userId; } catch { return false; }
}

/**
 * Onboarding gate — the app shell renders this for every authenticated page.
 * Anyone without `onboardingCompleted` is sent to /onboarding (resuming at
 * their saved step); finishing it flips the flag server-side so the gate
 * never fires again. Completed users who land on /onboarding are sent on to
 * the app — the wizard is one-way. Lives client-side because layouts can't
 * see the pathname — server-side redirect would loop on /onboarding itself.
 */
export default function OnboardingGuard({
  completed,
  step,
  userId,
}: {
  completed: boolean;
  step: string | null;
  userId: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const onOnboarding = pathname.startsWith("/onboarding");
    if (isDone(completed, userId)) {
      // One-way door: finished users never see the wizard again, even if
      // they (or a stale ?s= link) land on it.
      if (onOnboarding) router.replace("/calendar/day");
      return;
    }
    if (onOnboarding) return;
    const target = step && step !== "done" ? `/onboarding?s=${encodeURIComponent(step)}` : "/onboarding";
    router.replace(target);
  }, [completed, step, userId, pathname, router]);

  return null;
}
