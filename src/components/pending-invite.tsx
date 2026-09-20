"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Completes a prayer-friend invite that was stashed before login/signup.
// The /add-friend page stores the token in localStorage when it gets a 401;
// once the user lands inside the app this fires the accept once.
export default function PendingInvite() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("pendingPrayerInvite");
    if (!token) return;
    localStorage.removeItem("pendingPrayerInvite");
    fetch("/api/prayer-friends/invite", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then((res) => {
      if (res.ok) router.refresh();
    }).catch(() => {
      // Best-effort — the link stays valid for 7 days, user can re-open it
    });
  }, [router]);

  return null;
}
