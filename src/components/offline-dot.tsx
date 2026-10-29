"use client";

import { useEffect, useState } from "react";

/**
 * The ONLY offline affordance — an orange dot + "Offline" label next to the
 * logo. Everything else (pages, data, writes) works identically online and
 * off, so nothing else in the UI changes.
 */
export default function OfflineDot() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (!offline) return null;
  return (
    <span className="ml-1.5 inline-flex items-center gap-1.5 align-middle">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: "#f97316" }}
        aria-hidden="true"
      />
      <span className="text-[11px] font-medium" style={{ color: "#f97316" }}>
        Offline
      </span>
    </span>
  );
}
