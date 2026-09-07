"use client";

import { useState, useEffect } from "react";
import { RefreshCw, ChevronRight, ArrowLeft, Mail, Calendar, UserCircle, Activity } from "lucide-react";

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

// Manual date formatter — avoids toLocaleDateString hydration mismatch
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function formatJoined(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Unknown";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function formatLastCheckin(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Unknown";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return formatJoined(iso);
}

export function AdminUsers({ onSelect }: { onSelect: (user: AdminUser) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        if (data.users) setUsers(data.users);
        else if (data.error) setError(data.error);
      })
      .catch(() => setError("Failed to load users."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 animate-spin" style={{ color: "var(--color-ink-muted)" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl border px-4 py-3 text-sm"
        style={{
          borderColor: "color-mix(in oklab, var(--color-error) 30%, transparent)",
          backgroundColor: "color-mix(in oklab, var(--color-error) 8%, transparent)",
          color: "var(--color-error)",
        }}
      >
        {error}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div
        className="rounded-2xl border p-8 text-center"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
      >
        <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
          No users registered yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {users.map((user) => (
        <button
          key={user.id}
          onClick={() => onSelect(user)}
          className="group flex items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-[var(--color-paper-2)]"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
          }}
        >
          {/* Avatar */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            style={{
              backgroundColor: "color-mix(in oklab, var(--color-accent) 12%, transparent)",
              color: "var(--color-accent)",
            }}
          >
            {(user.firstName || user.displayName || user.email || "?")[0].toUpperCase()}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
              {user.firstName || user.displayName || "No name set"}
            </p>
            <p className="mt-0.5 truncate text-xs" style={{ color: "var(--color-ink-muted)" }}>
              {user.email}
            </p>
          </div>

          {/* Stats */}
          <div className="hidden shrink-0 text-right sm:block">
            <p className="text-xs font-medium tabular-nums" style={{ color: "var(--color-ink-soft)" }}>
              {user.prayedCount} prayed
            </p>
            <p className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
              {user.eventCount} events · {user.friendCount} friends
            </p>
          </div>

          <ChevronRight
            className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
            style={{ color: "var(--color-ink-muted)" }}
          />
        </button>
      ))}
    </div>
  );
}

export function AdminUserDetail({ user, onBack }: { user: AdminUser; onBack: () => void }) {
  const stats: Array<{ label: string; value: number }> = [
    { label: "Prayer Logs", value: user.prayerLogCount },
    { label: "Prayers Marked", value: user.prayedCount },
    { label: "Calendar Events", value: user.eventCount },
    { label: "Friends", value: user.friendCount },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Back */}
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
        style={{ color: "var(--color-ink-muted)" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to users
      </button>

      {/* Profile card */}
      <div
        className="flex items-center gap-4 rounded-2xl border p-5"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
      >
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-accent) 12%, transparent)",
            color: "var(--color-accent)",
          }}
        >
          {(user.firstName || user.displayName || user.email || "?")[0].toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>
            {user.firstName || user.displayName || "No name set"}
          </p>
          <p className="mt-0.5 truncate text-sm" style={{ color: "var(--color-ink-muted)" }}>
            {user.email}
          </p>
        </div>
      </div>

      {/* Info rows */}
      <div
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
      >
        <InfoRow icon={Mail} label="Email" value={user.email} />
        <InfoRow icon={UserCircle} label="Display Name" value={user.displayName || "Not set"} />
        <InfoRow icon={UserCircle} label="First Name" value={user.firstName || "Not set"} />
        <InfoRow icon={Calendar} label="Joined" value={formatJoined(user.createdAt)} />
        <InfoRow icon={Activity} label="Last Prayer Check-in" value={formatLastCheckin(user.lastCheckin)} last />
      </div>

      {/* Activity stats */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
          Activity
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border p-4"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
            >
              <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-ink)" }}>
                {stat.value}
              </p>
              <p className="mt-1 text-[11px] leading-tight" style={{ color: "var(--color-ink-muted)" }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  last,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 px-5 py-3.5"
      style={{ borderBottom: last ? "none" : "1px solid var(--color-paper-3)" }}
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
      <span className="shrink-0 text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </span>
      <span className="ml-auto truncate text-sm text-right" style={{ color: "var(--color-ink)" }}>
        {value}
      </span>
    </div>
  );
}
