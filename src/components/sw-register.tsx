"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native-bridge";

/**
 * Registers the service worker and handles:
 * 1. Auto-reload on update (clears old caches, hard reloads)
 * 2. Offline event sync notifications (shows toast when events sync)
 * 3. Push notification subscription
 *
 * NOTE: Service worker is disabled inside the Capacitor native shell.
 * The SW caches stale assets inside the WebView and breaks app updates.
 * Native apps use native push (APNs/FCM) instead of web push.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Skip SW registration inside native app — it caches stale assets in the WebView
    if (isNativeApp()) return;
    if (!("serviceWorker" in navigator)) return;

    // Register the service worker
    // updateViaCache: 'none' ensures the browser always fetches a fresh sw.js
    // from the network, never from the HTTP cache — critical for SW updates.
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        // Listen for new SW updates
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        // Subscribe to push notifications if permission granted
        if ("PushManager" in window) {
          subscribeToPush(registration);
        }
      })
      .catch((err) => {
        console.warn("SW registration failed:", err);
      });

    // ── Handle controller change (new SW took control) ──
    // Only reload on actual updates, not first install.
    // On first install, skipWaiting + clients.claim fires controllerchange,
    // but the page was never controlled by an old SW, so no reload needed.
    let wasControlled = !!navigator.serviceWorker.controller;
    const handleControllerChange = () => {
      if (wasControlled) {
        window.location.reload();
      }
      wasControlled = true;
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    // ── Handle messages from SW ──
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;

      switch (data.type) {
        case "SW_UPDATED":
          // SW_UPDATED is sent from activate — only reload if we had a previous SW
          if (navigator.serviceWorker.controller && wasControlled) {
            handleControllerChange();
          }
          break;
        case "EVENT_QUEUED_OFFLINE":
          showOfflineToast("Saved offline — will sync when you're back online.");
          // Dispatch a window event so components can react (e.g. mark event as pending)
          window.dispatchEvent(new CustomEvent("waqt:offline-queued", { detail: data }));
          break;
        case "EVENT_SYNCED":
          showOfflineToast(`${data.count || 1} item${(data.count || 1) > 1 ? "s" : ""} synced to server.`);
          // Dispatch a window event so components can refetch fresh data
          window.dispatchEvent(new CustomEvent("waqt:events-synced", { detail: data }));
          break;
        case "EVENT_SYNC_FAILED":
          showOfflineToast("Some offline changes could not be synced.");
          window.dispatchEvent(new CustomEvent("waqt:sync-failed", { detail: data }));
          break;
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);

    // ── Check for updates every 6 hours (was 5 min — too aggressive at 100k scale) ──
    // The browser also checks for SW updates on navigation by default.
    const interval = setInterval(() => {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.update();
      });
    }, 6 * 60 * 60_000);

    // ── On 'online' event, tell SW to sync outbox (don't warm cache — SW does it on activate) ──
    const handleOnline = () => {
      navigator.serviceWorker.controller?.postMessage({ type: "SYNC_OUTBOX" });
    };
    window.addEventListener("online", handleOnline);

    // ── iOS Safari fallback: Background Sync API is not supported ──
    // When the app becomes visible again, trigger a sync only (not warm cache).
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        navigator.serviceWorker.controller?.postMessage({ type: "SYNC_OUTBOX" });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // ── Also sync on initial load if online (catches cases where ──
    // the app was reopened while online but SW didn't fire sync)
    if (navigator.onLine) {
      navigator.serviceWorker.controller?.postMessage({ type: "SYNC_OUTBOX" });
    }

    return () => {
      clearInterval(interval);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      navigator.serviceWorker.removeEventListener("message", handleMessage);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}

// ── Subscribe to push notifications ──
// Only subscribes if permission is ALREADY granted.
// Permission is requested from the Settings page (user gesture required).
async function subscribeToPush(registration: ServiceWorkerRegistration) {
  try {
    // Don't request permission here — that must come from a user gesture (Settings button)
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    // Check if already subscribed
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      // Only re-send to server if the subscription changed since last time.
      // Storing the last-sent endpoint in localStorage avoids a POST on every load.
      const lastSent = localStorage.getItem("waqt:push-endpoint");
      if (lastSent === existing.endpoint) return; // Already registered — skip
      await sendSubscriptionToServer(existing);
      localStorage.setItem("waqt:push-endpoint", existing.endpoint);
      return;
    }

    // Get VAPID public key from server
    const res = await fetch("/api/notifications/vapid-public-key");
    if (!res.ok) return;
    const { publicKey } = await res.json().catch(() => ({ publicKey: null }));
    if (!publicKey) return;

    // Subscribe
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });

    await sendSubscriptionToServer(subscription);
    localStorage.setItem("waqt:push-endpoint", subscription.endpoint);
  } catch (err) {
    console.warn("Push subscription failed:", err);
  }
}

async function sendSubscriptionToServer(subscription: PushSubscription) {
  try {
    await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
  } catch {
    // Will retry on next load
  }
}

// Convert VAPID key from base64url to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ── Show a small toast for offline/sync events ──
function showOfflineToast(message: string) {
  if (typeof document === "undefined") return;

  const existing = document.getElementById("waqt-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "waqt-toast";
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-ink, #1a1815);
    color: var(--color-paper, #f5f0e8);
    padding: 12px 20px;
    border-radius: 999px;
    font-size: 13px;
    font-family: inherit;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    opacity: 0;
    transition: opacity 0.3s ease;
    max-width: 90vw;
    text-align: center;
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
