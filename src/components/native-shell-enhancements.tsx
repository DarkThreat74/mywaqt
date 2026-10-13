"use client";

import { useEffect } from "react";
import { isNativeApp, setStatusBarStyle, hideSplashScreen } from "@/lib/native-bridge";

/**
 * Only activates inside the Capacitor native shell.
 * On web, this component does nothing — web users keep full accessibility
 * (zoom, text selection, tap highlights, overscroll).
 */
export default function NativeShellEnhancements() {
  useEffect(() => {
    if (!isNativeApp()) return;

    // Update viewport for native (disable zoom, extend into safe areas)
    // On web, the viewport allows zoom (WCAG 1.4.4). Inside the native shell,
    // zoom is disabled for app-like behavior.
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute(
        "content",
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      );
    }

    // Add native class to <html> for scoped CSS
    document.documentElement.classList.add("native-shell");

    // Inject scoped CSS (only affects .native-shell, web is untouched)
    const style = document.createElement("style");
    style.id = "native-shell-enhancements";
    style.textContent = `
      .native-shell button,
      .native-shell nav,
      .native-shell [role="tab"] {
        -webkit-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
      }
      html.native-shell,
      html.native-shell body {
        overscroll-behavior: none;
        -webkit-overflow-scrolling: touch;
      }
      .native-shell * {
        -webkit-tap-highlight-color: transparent;
      }
    `;
    document.head.appendChild(style);

    // Configure status bar to match the app's dark theme
    void setStatusBarStyle("LIGHT");

    // Hide splash screen once React has hydrated
    void hideSplashScreen();

    return () => {
      document.documentElement.classList.remove("native-shell");
      document.getElementById("native-shell-enhancements")?.remove();
    };
  }, []);

  return null;
}
