import type { CapacitorConfig } from "@capacitor/cli";
import { SITE_DOMAIN, APP_BUNDLE_ID, APP_NAME } from "./src/lib/site-config";

const config: CapacitorConfig = {
  appId: APP_BUNDLE_ID,
  appName: APP_NAME,
  // Local-first entry shell. It boots immediately from the APK, then hands
  // off to the deployed app only after a reachability probe succeeds.
  webDir: "capacitor-web",

  // The bundled shell owns the first paint. The remote app remains the
  // online source of truth until the full local route bundle is migrated.
  server: {
    allowNavigation: [
      SITE_DOMAIN.replace(/^www\./, ""),
      `*.${SITE_DOMAIN.replace(/^www\./, "")}`,
    ],
    // Capacitor resolves this against the local https://localhost asset
    // server. The file is at the root of webDir, so use the bare filename.
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
      // Light icons — the bar itself is dark (#1a1815) via EdgeToEdge below.
      style: "LIGHT",
      overlaysWebView: false,
    },
    // Android 15+ enforces edge-to-edge: the WebView draws behind a
    // transparent status bar and StatusBar.backgroundColor is ignored.
    // This plugin draws a real bar background + applies cutout insets.
    EdgeToEdge: {
      backgroundColor: "#1a1815",
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
    },
  },
};

export default config;
