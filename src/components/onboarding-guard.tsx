"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Onboarding gate — the app shell renders this for every authenticated page.
 * Anyone without `onboardingCompleted` is sent to /onboarding (resuming at
 * their saved step); finishing it flips the flag server-side so the gate
 * never fires again. Lives client-side because layouts can't see the
 * pathname — server-side redirect would loop on /onboarding itself.
 */
export default function OnboardingGuard({
  completed,
  step,
}: {
  completed: boolean;
  step: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (completed || pathname.startsWith("/onboarding")) return;
    router.replace(step ? `/onboarding?s=${encodeURIComponent(step)}` : "/onboarding");
  }, [completed, step, pathname, router]);

  return null;
}
