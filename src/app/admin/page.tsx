"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "./AdminShell";
import { AdminOverview } from "./AdminOverview";
import { AdminUsers, AdminUserDetail } from "./AdminUsers";
import { AdminTalks } from "./AdminTalks";
import { AdminSettings } from "./AdminSettings";

interface AdminStats {
  users: number;
  talks: number;
}

interface AdminUser {
  id: string;
  email: string;
  firstName: string | null;
  displayName: string | null;
  createdAt: string;
  role: string;
  prayerLogCount: number;
  prayedCount: number;
  lastCheckin: string | null;
  eventCount: number;
  friendCount: number;
}

export default function AdminPortal() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          router.push("/admin/login");
          return null;
        }
        return r.json().catch(() => null);
      })
      .then((data) => {
        if (data) setStats(data);
      })
      .catch(() => router.push("/admin/login"));
  }, [router]);

  return (
    <AdminShell>
      {({ tab, setTab }) => {
        // When a user is selected, show detail view regardless of tab
        if (selectedUser) {
          return (
            <AdminUserDetail user={selectedUser} onBack={() => setSelectedUser(null)} />
          );
        }

        if (tab === "overview") {
          return <AdminOverview stats={stats} onUsersClick={() => setTab("users")} />;
        }
        if (tab === "users") {
          return <AdminUsers onSelect={setSelectedUser} />;
        }
        if (tab === "talks") {
          return <AdminTalks />;
        }
        if (tab === "settings") {
          return <AdminSettings />;
        }
        return null;
      }}
    </AdminShell>
  );
}
