import type { CapacitorConfig } from "@capacitor/cli";
import { SITE_DOMAIN, APP_BUNDLE_ID, APP_NAME } from "./src/lib/site-config";

const config: CapacitorConfig = {
  appId: APP_BUNDLE_ID,
  appName: APP_NAME,
  // Remote-URL mode: webDir only supplies the errorPath fallback page —
  // offline.html is fully self-contained (inline CSS, no assets). Pointing
  // at public/ mirrored 7.6MB of site assets (quran.json, toy PNGs, icons)
  // into the APK that the remote site already serves — pure dead weight.
  webDir: "capacitor-web",

  // ── Mode B: Remote URL ──
  // The WebView loads the deployed Next.js app so SSR, API routes,
  // middleware, and cron all work normally. Native plugins add the
  // features that pass Apple's 4.2 review (biometric, push, haptics, share).
  server: {
    // MUST be the canonical host. The site 308s apex → www; starting on the
    // apex made that redirect cross hosts, so the bridge treated it as an
    // external navigation and bounced to the browser/PWA instead of
    // staying inside the WebView.
    url: `https://www.${SITE_DOMAIN.replace(/^www\./, "")}`,
    // Keep any host drift inside the WebView — apex, www, and any
    // subdomain of the site are the app, never a browser intent.
    allowNavigation: [
      SITE_DOMAIN.replace(/^www\./, ""),
      `*.${SITE_DOMAIN.replace(/^www\./, "")}`,
    ],
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
