"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

// Routes that render chrome-free: no sidebar, header, or bottom nav.
const BARE_ROUTES = ["/onboarding", "/guide"];

export default function ShellMode() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    const bare = BARE_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    document.documentElement.dataset.shell = bare ? "bare" : "";
    return () => {
      document.documentElement.dataset.shell = "";
    };
  }, [pathname]);
  return null;
}
