import type { CapacitorConfig } from "@capacitor/cli";
import { SITE_URL, APP_BUNDLE_ID, APP_NAME } from "./src/lib/site-config";

const config: CapacitorConfig = {
  appId: APP_BUNDLE_ID,
  appName: APP_NAME,
  webDir: "out",

  // ── Mode B: Remote URL ──
  // The WebView loads the deployed Next.js app so SSR, API routes,
  // middleware, and cron all work normally. Native plugins add the
  // features that pass Apple's 4.2 review (biometric, push, haptics, share).
  server: {
    url: SITE_URL,
    // Land on the prayer dashboard — reviewers see populated content
    appStartPath: "/prayer",
    // Offline fallback (unreliable on iOS but better than blank screen)
    errorPath: "offline.html",
  },

  ios: {
    // "never" — let CSS env(safe-area-inset-*) handle all padding.
    // "automatic" causes double spacing when combined with CSS safe-area padding.
    contentInset: "never",
    backgroundColor: "#1a1815",
  },
  android: {
    backgroundColor: "#1a1815",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#1a1815",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#1a1815",
      overlaysWebView: false,
    },
    // Enable sound, alert, badge, and haptics for push notifications on iOS/Android.
    // Without presentationOptions, iOS foreground pushes are silently dropped.
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert", "banner", "list"],
    },
    LocalNotifications: {
      // Small icon resource name in res/drawable (Android)
      smallIcon: "icon",
      iconColor: "#1a1815",
      sound: "adhan.caf",
    },
  },
};

export default config;
