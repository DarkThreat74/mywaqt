// ── Platform detection (synchronous, safe during SSR) ──
// Avoid importing @capacitor/core at the top level — it adds ~10KB to the
// initial bundle on every page including the marketing page. The Capacitor
// global is injected by the native shell; on web it's undefined.
// Plugin imports (haptics, share, etc.) still pull @capacitor/core lazily.

// Minimal type for the Capacitor global we read from window
interface CapacitorGlobal {
  isNativePlatform(): boolean;
  getPlatform(): string;
}

function getCapacitor(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function isNativeApp(): boolean {
  const cap = getCapacitor();
  return !!cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform();
}

export function getPlatform(): "ios" | "android" | "web" {
  const cap = getCapacitor();
  if (!cap || typeof cap.getPlatform !== "function") return "web";
  return cap.getPlatform() as "ios" | "android" | "web";
}

// ── Haptics ──

export async function hapticImpact(
  style: "light" | "medium" | "heavy" = "light",
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    const styleMap = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    };
    await Haptics.impact({ style: styleMap[style] });
  } catch {
    /* no-op */
  }
}

export async function hapticNotification(
  type: "success" | "warning" | "error",
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    const typeMap = {
      success: NotificationType.Success,
      warning: NotificationType.Warning,
      error: NotificationType.Error,
    };
    await Haptics.notification({ type: typeMap[type] });
  } catch {
    /* no-op */
  }
}

// ── Share ──

export async function shareNative(opts: {
  title: string;
  text: string;
  url?: string;
}): Promise<boolean> {
  if (isNativeApp()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
        dialogTitle: opts.title,
      });
      return true;
    } catch {
      return false;
    }
  }
  // Web fallback
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(opts);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// ── Biometric Auth ──

export async function checkBiometricAvailability(): Promise<{
  available: boolean;
  reason: string;
}> {
  if (!isNativeApp()) return { available: false, reason: "Not a native app" };
  try {
    const { BiometricAuth } = await import(
      "@aparajita/capacitor-biometric-auth"
    );
    const result = await BiometricAuth.checkBiometry();
    return {
      available: result.isAvailable ?? false,
      reason: result.biometryType ? "Available" : "Not available",
    };
  } catch {
    return { available: false, reason: "Plugin not available" };
  }
}

export async function biometricVerify(
  reason: string,
): Promise<{ verified: boolean; reason: string }> {
  if (!isNativeApp()) return { verified: true, reason: "Web mode" };
  try {
    const { BiometricAuth } = await import(
      "@aparajita/capacitor-biometric-auth"
    );
    await BiometricAuth.authenticate({
      reason,
      iosFallbackTitle: "Use Passcode",
      allowDeviceCredential: true,
    });
    return { verified: true, reason: "Success" };
  } catch {
    return { verified: false, reason: "Failed or cancelled" };
  }
}

// ── Push Notifications ──

export async function requestPushPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { PushNotifications } = await import(
      "@capacitor/push-notifications"
    );
    let granted = false;
    await PushNotifications.requestPermissions().then((result) => {
      granted = result.receive === "granted";
    });
    if (granted) await PushNotifications.register();
    return granted;
  } catch {
    return false;
  }
}

export async function getPushToken(): Promise<string | null> {
  if (!isNativeApp()) return null;
  try {
    const { PushNotifications } = await import(
      "@capacitor/push-notifications"
    );
    // Get the token that was already received during registration,
    // or listen for it if it hasn't arrived yet.
    return new Promise((resolve) => {
      let resolved = false;
      const done = (token: string | null) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        void listener.then((l) => l.remove()).catch(() => {});
        resolve(token);
      };

      const listener = PushNotifications.addListener(
        "registration",
        (token: { value: string }) => done(token.value),
      );

      const timeout = setTimeout(() => done(null), 5000);
    });
  } catch {
    return null;
  }
}

export async function onPushNotificationReceived(
  callback: (notification: { title?: string; body?: string; data?: Record<string, unknown> }) => void,
): Promise<(() => void) | null> {
  if (!isNativeApp()) return null;
  try {
    const { PushNotifications } = await import(
      "@capacitor/push-notifications"
    );
    const listener = await PushNotifications.addListener(
      "pushNotificationReceived",
      (notification) => {
        callback({
          title: notification.title,
          body: notification.body,
          data: notification.data,
        });
      },
    );
    return () => { void listener.remove(); };
  } catch {
    return null;
  }
}

// ── App State (foreground/background) ──

export async function onAppStateChange(
  callback: (isActive: boolean) => void,
): Promise<() => void> {
  if (!isNativeApp()) return () => {};
  try {
    const { App } = await import("@capacitor/app");
    const listener = await App.addListener("appStateChange", (event: { isActive: boolean }) =>
      callback(event.isActive),
    );
    return () => { void listener.remove(); };
  } catch {
    return () => {};
  }
}

// ── Deep Links ──

export async function onDeepLink(
  callback: (url: string) => void,
): Promise<() => void> {
  if (!isNativeApp()) return () => {};
  try {
    const { App } = await import("@capacitor/app");
    const listener = await App.addListener("appUrlOpen", (event: { url: string }) =>
      callback(event.url),
    );
    return () => { void listener.remove(); };
  } catch {
    return () => {};
  }
}

// ── Status Bar ──

export async function setStatusBarStyle(
  style: "DARK" | "LIGHT" = "DARK",
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    const styleMap = { DARK: Style.Dark, LIGHT: Style.Light };
    await StatusBar.setStyle({ style: styleMap[style] });
  } catch {
    /* no-op */
  }
}

// ── Splash Screen ──

export async function hideSplashScreen(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* no-op */
  }
}
