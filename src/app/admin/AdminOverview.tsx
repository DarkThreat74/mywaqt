"use client";

import { Users, Mic, ChevronRight, TrendingUp } from "lucide-react";

interface AdminStats {
  users: number;
  talks: number;
}

export function AdminOverview({
  stats,
  onUsersClick,
}: {
  stats: AdminStats | null;
  onUsersClick: () => void;
}) {
  const userCount = stats?.users ?? 0;
  const talkCount = stats?.talks ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <button
          onClick={onUsersClick}
          className="group flex flex-col gap-3 rounded-2xl border p-5 text-left transition-colors"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
          }}
        >
          <div className="flex items-center justify-between">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{
                backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)",
              }}
            >
              <Users className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
            </div>
            <ChevronRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              style={{ color: "var(--color-ink-muted)" }}
            />
          </div>
          <div>
            <p
              className="text-3xl font-bold tabular-nums"
              style={{ color: "var(--color-ink)" }}
            >
              {userCount}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              Registered users
            </p>
          </div>
        </button>

        <div
          className="flex flex-col gap-3 rounded-2xl border p-5"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
          }}
        >
          <div className="flex items-center justify-between">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{
                backgroundColor: "color-mix(in oklab, var(--color-warmth) 10%, transparent)",
              }}
            >
              <Mic className="h-5 w-5" style={{ color: "var(--color-warmth)" }} />
            </div>
          </div>
          <div>
            <p
              className="text-3xl font-bold tabular-nums"
              style={{ color: "var(--color-ink)" }}
            >
              {talkCount}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              Talks in library
            </p>
          </div>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div
        className="rounded-2xl border p-5"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
            Quick actions
          </h2>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
          Use the sidebar to manage users, upload talks, or configure platform settings.
          The Talks tab handles MP3 upload, audio processing, and publishing.
        </p>
      </div>
    </div>
  );
}
