"use client";

import dynamic from "next/dynamic";

// Lazy-load UISFXProvider — the uisfx audio library (~30KB) is not needed
// on the marketing page or during initial render. It loads after hydration,
// moving it out of the critical path. useUISFX() has a no-op fallback when
// the context isn't ready yet, so this is safe.
const UISFXProvider = dynamic(
  () => import("@/components/uisfx-provider").then((m) => m.UISFXProvider),
  { ssr: false },
);

export default function LazyUISFXProvider({ children }: { children: React.ReactNode }) {
  return <UISFXProvider>{children}</UISFXProvider>;
}
