import webpush, { type RequestOptions } from "web-push";
import { env } from "@/lib/env";
import { sendNativePush, type NativePushPayload } from "@/lib/notifications/native-push";

/**
 * Configure web-push VAPID details once at module load.
 * Calling setVapidDetails multiple times is harmless but wasteful —
 * doing it at module scope avoids repeating it in every request handler.
 *
 * If VAPID keys are not configured (e.g. local dev without push), this is a no-op
 * and sendNotification will throw a clear error when actually called.
 */
let configured = false;

export function ensureVapidConfigured() {
  if (configured) return;
  if (!env.vapidPublicKey || !env.vapidPrivateKey) return;
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
  configured = true;
}

/**
 * Standard push options for time-sensitive prayer notifications.
 * - TTL: 24h so the message survives device offline windows
 * - urgency: 'high' so the device wakes to deliver
 * - topic: groups notifications so a newer one supersedes an older one
 */
export const PRAYER_PUSH_OPTIONS: RequestOptions = {
  TTL: 24 * 60 * 60, // 24 hours in seconds
  urgency: "high",
  // topic is set per-call by the caller via headers
};

/**
 * Unified push subscription — covers web (endpoint/p256dh/auth) and
 * native (platform/token) rows from the push_subscriptions table.
 */
export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  platform: string; // 'web' | 'ios' | 'android'
  token: string | null;
}

/**
 * Send a push notification to a single subscription, routing to the correct
 * transport (Web Push, APNs, or FCM) based on the platform field.
 * Cleans up expired subscriptions (404/410) by returning a flag.
 */
export async function sendPrayerPush(
  subscription: PushSubscriptionRow,
  payload: string,
  options?: { topic?: string },
): Promise<{ delivered: boolean; expired: boolean }> {
  // ── Native push (iOS / Android) ──
  if (subscription.platform === 'ios' || subscription.platform === 'android') {
    if (!subscription.token) return { delivered: false, expired: false };

    const webPayload = JSON.parse(payload) as { title?: string; body?: string; data?: Record<string, unknown>; tag?: string };
    const nativePayload: NativePushPayload = {
      title: webPayload.title ?? 'Waqt',
      body: webPayload.body ?? '',
      data: webPayload.data,
      tag: webPayload.tag ?? options?.topic,
    };

    try {
      return await sendNativePush(subscription.platform, subscription.token, nativePayload);
    } catch {
      return { delivered: false, expired: false };
    }
  }

  // ── Web Push (default) ──
  ensureVapidConfigured();

  const pushOptions: RequestOptions = {
    TTL: PRAYER_PUSH_OPTIONS.TTL,
    urgency: PRAYER_PUSH_OPTIONS.urgency,
  };
  if (options?.topic) {
    pushOptions.headers = { Topic: options.topic };
  }

  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      payload,
      pushOptions,
    );
    return { delivered: true, expired: false };
  } catch (err) {
    const e = err as { statusCode?: number };
    if (e.statusCode === 404 || e.statusCode === 410) {
      return { delivered: false, expired: true };
    }
    throw err;
  }
}
