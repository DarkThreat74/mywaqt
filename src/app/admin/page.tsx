"use client";

import { useState } from "react";
import { AdminShell } from "./AdminShell";
import { AdminOverview } from "./AdminOverview";
import { AdminUsers, AdminUserDetail } from "./AdminUsers";
import { AdminTalks } from "./AdminTalks";
import { AdminRecite } from "./AdminRecite";
import { AdminSettings } from "./AdminSettings";
import { AdminFeedback } from "./AdminFeedback";

interface AdminUser {
  id: string;
  email: string;
  firstName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  role: string;
  prayerLogCount: number;
  prayedCount: number;
  lastCheckin: string | null;
  eventCount: number;
  friendCount: number;
}

export default function AdminPortal() {
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Stats come from AdminShell's single auth+stats fetch — this page used to
  // fire an identical request in parallel (doubled again under StrictMode).
  return (
    <AdminShell>
      {({ tab, setTab, stats }) => {
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
        if (tab === "recite") {
          return <AdminRecite />;
        }
        if (tab === "feedback") {
          return <AdminFeedback />;
        }
        if (tab === "settings") {
          return <AdminSettings />;
        }
        return null;
      }}
    </AdminShell>
  );
}
