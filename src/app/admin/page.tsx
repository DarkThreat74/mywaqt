"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { LogOut, RefreshCw, ShieldCheck, Mic, LayoutGrid, Users, ChevronRight, ArrowLeft, FolderPlus, Upload, Trash2, Folder, Settings as SettingsIcon, Sun, Moon, Monitor, Volume2, Save, Pencil, X } from "lucide-react";

type Tab = "overview" | "users" | "talks" | "settings";

const NAV_ITEMS: Array<{ key: Tab; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "users", label: "Users", icon: Users },
  { key: "talks", label: "Talks", icon: Mic },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

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
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
        if (data) {
          setStats(data);
          setAuthChecked(true);
        }
      })
      .catch(() => router.push("/admin/login"));
  }, [router]);

  if (!authChecked) {
    return (
      <div className="flex min-h-dvh items-center justify-center" style={{ backgroundColor: "var(--color-paper-2)" }}>
        <RefreshCw className="h-5 w-5 animate-spin" style={{ color: "var(--color-ink-muted)" }} />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh overflow-x-clip" style={{ backgroundColor: "var(--color-paper-2)" }}>
      {/* ── Sidebar (desktop) ── */}
      <aside
        className="fixed left-0 top-0 bottom-0 hidden w-60 flex-col border-r lg:flex"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md"
            style={{ backgroundColor: "var(--color-ink)" }}
          >
            <ShieldCheck className="h-4 w-4" style={{ color: "var(--color-paper)" }} />
          </div>
          <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
            Waqt <span style={{ color: "var(--color-ink-muted)" }}>Admin</span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.key}
              active={tab === item.key}
              onClick={() => { setTab(item.key); setSelectedUser(null); }}
              icon={item.icon}
            >
              {item.label}
            </NavButton>
          ))}
        </nav>

        <div className="border-t px-3 py-4" style={{ borderColor: "var(--color-paper-3)" }}>
          <button
            onClick={() => router.push("/admin/login")}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-muted)" }}
          >
            <LogOut className="h-4 w-4" />
            Exit
          </button>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <header
        className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b px-5 py-3 lg:hidden backdrop-blur-md"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "color-mix(in oklab, var(--color-paper) 92%, transparent)",
          paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ backgroundColor: "var(--color-ink)" }}
          >
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: "var(--color-paper)" }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Admin</span>
        </div>
        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-md border px-3 py-1.5 text-xs font-medium"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
        >
          Menu
        </button>
      </header>

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 40%, transparent)" }}
          onClick={() => setSidebarOpen(false)}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-64 flex flex-col border-r"
            style={{
              borderColor: "var(--color-paper-3)",
              backgroundColor: "var(--color-paper)",
              paddingTop: "env(safe-area-inset-top)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Sections</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-sm"
                style={{ color: "var(--color-ink-muted)" }}
              >
                Close
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-0.5 px-3">
              {NAV_ITEMS.map((item) => (
                <NavButton
                  key={item.key}
                  active={tab === item.key}
                  onClick={() => { setTab(item.key); setSidebarOpen(false); setSelectedUser(null); }}
                  icon={item.icon}
                >
                  {item.label}
                </NavButton>
              ))}
            </nav>
            <div className="border-t px-3 py-4" style={{ borderColor: "var(--color-paper-3)" }}>
              <button
                onClick={() => router.push("/admin/login")}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm"
                style={{ color: "var(--color-ink-muted)" }}
              >
                <LogOut className="h-4 w-4" />
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex flex-1 flex-col lg:pl-60">
        <main className="flex-1 px-5 pb-10 pt-16 sm:px-8 lg:px-10 lg:pt-10">
          {/* Section header */}
          <div className="mb-8 max-w-4xl">
            <h1
              className="text-xl font-semibold tracking-tight sm:text-2xl"
              style={{ color: "var(--color-ink)" }}
            >
              {selectedUser ? "User Details" : NAV_ITEMS.find((n) => n.key === tab)?.label}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--color-ink-muted)" }}>
              {selectedUser
                ? `${selectedUser.firstName || selectedUser.displayName || selectedUser.email}`
                : tab === "overview" && "Platform summary."
              }
              {tab === "users" && !selectedUser && "All registered accounts. Click any user for details."}
              {tab === "talks" && "Upload MP3 talks, organize into folders, and manage the talks library."}
              {tab === "settings" && "Platform-wide settings: appearance, features, and configuration."}
            </p>
          </div>

          <div className="max-w-4xl">
            {tab === "overview" && <Overview stats={stats} onUsersClick={() => setTab("users")} />}
            {tab === "users" && (selectedUser
              ? <UserDetail user={selectedUser} onBack={() => setSelectedUser(null)} />
              : <UsersList onSelect={setSelectedUser} />
            )}
            {tab === "talks" && <TalksManager />}
            {tab === "settings" && <AdminSettings />}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Nav button ───

function NavButton({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors"
      style={{
        color: active ? "var(--color-ink)" : "var(--color-ink-muted)",
        backgroundColor: active ? "var(--color-accent-faint)" : "transparent",
      }}
    >
      <Icon className="h-4 w-4" style={{ color: active ? "var(--color-accent)" : "var(--color-ink-muted)" }} />
      {children}
    </button>
  );
}

// ─── Overview ───

function Overview({ stats, onUsersClick }: { stats: AdminStats | null; onUsersClick: () => void }) {
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
      {/* Users — clickable */}
      <button
        onClick={onUsersClick}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[var(--color-paper-2)]"
      >
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>Users</p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>Total registered accounts — click to view all</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>
            {stats?.users ?? 0}
          </p>
          <ChevronRight className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
        </div>
      </button>

      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderTop: "1px solid var(--color-paper-3)" }}
      >
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>Talks</p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>External link entries</p>
        </div>
        <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>
          {stats?.talks ?? 0}
        </p>
      </div>
    </div>
  );
}

// ─── Users List ───

function UsersList({ onSelect }: { onSelect: (user: AdminUser) => void }) {
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
    return <p className="text-sm" style={{ color: "var(--color-warmth)" }}>{error}</p>;
  }

  if (users.length === 0) {
    return <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>No users registered yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
      {users.map((user, i) => (
        <button
          key={user.id}
          onClick={() => onSelect(user)}
          className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ borderTop: i === 0 ? "none" : "1px solid var(--color-paper-3)" }}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
              {user.firstName || user.displayName || "No name set"}
            </p>
            <p className="mt-0.5 truncate text-xs" style={{ color: "var(--color-ink-muted)" }}>
              {user.email}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="text-right">
              <p className="text-xs font-medium tabular-nums" style={{ color: "var(--color-ink-soft)" }}>
                {user.prayedCount} prayed
              </p>
              <p className="text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                {user.eventCount} events · {user.friendCount} friends
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── User Detail ───

function UserDetail({ user, onBack }: { user: AdminUser; onBack: () => void }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Email", value: user.email },
    { label: "Display Name", value: user.displayName || "Not set" },
    { label: "First Name", value: user.firstName || "Not set" },
    { label: "User ID", value: user.id },
    { label: "Joined", value: new Date(user.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) },
    { label: "Last Prayer Check-in", value: user.lastCheckin ? new Date(user.lastCheckin).toLocaleString("en-US") : "Never" },
  ];

  const stats: Array<{ label: string; value: number }> = [
    { label: "Total Prayer Logs", value: user.prayerLogCount },
    { label: "Prayers Marked as Prayed", value: user.prayedCount },
    { label: "Calendar Events", value: user.eventCount },
    { label: "Friends Added", value: user.friendCount },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
        style={{ color: "var(--color-ink-muted)" }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to users
      </button>

      {/* User info */}
      <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
        {rows.map((row, i) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 px-5 py-3.5"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--color-paper-3)" }}
          >
            <span className="shrink-0 text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
              {row.label}
            </span>
            <span className="truncate text-sm text-right" style={{ color: "var(--color-ink)" }}>
              {row.value}
            </span>
          </div>
        ))}
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
              className="rounded-lg border p-4"
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

// ─── Talks Manager (folders + MP3 upload) ───

interface AdminFolder { id: string; name: string; description: string | null; imageKey: string | null; startDate: string | null; endDate: string | null; sortOrder: number; }
interface AdminTalk {
  id: string; title: string; speaker: string | null; description: string | null; topics: string | null;
  folderId: string | null; storageKey: string | null; processedStorageKey: string | null; fileSize: number | null;
  duration: number | null; externalUrl: string | null; processingStatus: string; processingError: string | null;
  addedAt: string; publishedAt: string | null; canRetryProcessing: boolean;
}

function TalksManager() {
  const [folders, setFolders] = useState<AdminFolder[]>([]);
  const [talks, setTalks] = useState<AdminTalk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderDesc, setFolderDesc] = useState("");
  const [folderStartDate, setFolderStartDate] = useState("");
  const [folderEndDate, setFolderEndDate] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<AdminFolder | null>(null);
  const [editFolderDesc, setEditFolderDesc] = useState("");
  const [editFolderStart, setEditFolderStart] = useState("");
  const [editFolderEnd, setEditFolderEnd] = useState("");
  const [editFolderImage, setEditFolderImage] = useState<File | null>(null);
  const [editFolderImageKey, setEditFolderImageKey] = useState<string | null>(null);
  const [savingFolder, setSavingFolder] = useState(false);
  const [talkTitle, setTalkTitle] = useState("");
  const [talkSpeaker, setTalkSpeaker] = useState("");
  const [talkDesc, setTalkDesc] = useState("");
  const [talkTopics, setTalkTopics] = useState("");
  const [talkFile, setTalkFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  const load = useCallback(async (): Promise<AdminTalk[] | null> => {
    try {
      const res = await fetch("/api/admin/talks");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load talks.");
      const loadedTalks = Array.isArray(data.talks) ? data.talks as AdminTalk[] : [];
      setFolders(Array.isArray(data.folders) ? data.folders : []);
      setTalks(loadedTalks);
      setError(null);
      return loadedTalks;
    } catch {
      setError("Failed to load talks.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/talks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create-folder",
        name: folderName,
        description: folderDesc,
        startDate: folderStartDate || undefined,
        endDate: folderEndDate || undefined,
      }),
    });
    if (res.ok) {
      setFolderName(""); setFolderDesc(""); setFolderStartDate(""); setFolderEndDate("");
      setShowFolderForm(false);
      await load();
    } else {
      setError("Failed to create folder.");
    }
  }

  async function deleteFolder(folderId: string) {
    if (!confirm("Delete this folder? Talks inside will remain but become uncategorized.")) return;
    const res = await fetch("/api/admin/talks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-folder", folderId }),
    });
    if (res.ok) await load();
    else setError("Failed to delete folder.");
  }

  function openEditFolder(folder: AdminFolder) {
    setEditingFolder(folder);
    setEditFolderDesc(folder.description || "");
    setEditFolderStart(folder.startDate || "");
    setEditFolderEnd(folder.endDate || "");
    setEditFolderImage(null);
    setEditFolderImageKey(folder.imageKey);
  }

  async function cleanupFolderImage(imageKey: string) {
    await fetch("/api/admin/talks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-folder-image-upload", imageKey }),
    }).catch(() => null);
  }

  async function saveFolderEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingFolder) return;
    setSavingFolder(true);
    setError(null);
    let uploadedImageKey: string | null = null;
    try {
      let imageKey = editFolderImageKey;
      // If a new image was selected, upload it to R2
      if (editFolderImage) {
        if (editFolderImage.size > 5 * 1024 * 1024) {
          setError("Folder images must be 5 MB or smaller.");
          return;
        }
        const presignRes = await fetch("/api/admin/talks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "get-folder-image-url",
            folderId: editingFolder.id,
            filename: editFolderImage.name,
            fileSize: editFolderImage.size,
          }),
        });
        if (!presignRes.ok) {
          setError("Failed to get image upload URL.");
          setSavingFolder(false);
          return;
        }
        const { uploadUrl, imageKey: newKey, contentType } = await presignRes.json();
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: editFolderImage,
        });
        if (!uploadRes.ok) {
          setError("Failed to upload image.");
          setSavingFolder(false);
          return;
        }
        imageKey = newKey;
        uploadedImageKey = newKey;
      }

      const res = await fetch("/api/admin/talks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-folder",
          folderId: editingFolder.id,
          description: editFolderDesc || undefined,
          imageKey: imageKey || undefined,
          startDate: editFolderStart || undefined,
          endDate: editFolderEnd || undefined,
        }),
      });
      if (res.ok) {
        uploadedImageKey = null;
        setEditingFolder(null);
        await load();
      } else {
        if (uploadedImageKey) await cleanupFolderImage(uploadedImageKey);
        uploadedImageKey = null;
        setError("Failed to update folder.");
      }
    } catch {
      if (uploadedImageKey) await cleanupFolderImage(uploadedImageKey);
      setError("Folder update failed.");
    } finally {
      setSavingFolder(false);
    }
  }

  async function deleteTalk(talkId: string) {
    if (!confirm("Delete this talk? The MP3 file will also be removed from storage.")) return;
    const res = await fetch("/api/admin/talks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-talk", talkId }),
    });
    if (res.ok) await load();
    else setError("Failed to delete talk.");
  }

  async function publishTalk(talkId: string) {
    const res = await fetch("/api/admin/talks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish-talk", talkId }),
    });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to publish talk.");
    }
  }

  async function retryProcessing(talkId: string) {
    const res = await fetch("/api/admin/talks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry-processing", talkId }),
    });
    if (res.ok) await processTalk(talkId);
    else setError("Failed to retry processing.");
  }

  const pollTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  async function processTalk(talkId: string) {
    let options: unknown;
    try {
      const saved = localStorage.getItem("waqt:admin:audio");
      options = saved ? JSON.parse(saved) : undefined;
    } catch { /* use server defaults */ }
    const res = await fetch("/api/admin/talks/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ talkId, options }),
    });
    if (res.ok) {
      await load();
      let pollCount = 0;
      const poll = async () => {
        pollCount++;
        const latestTalks = await load();
        const talk = latestTalks?.find((item) => item.id === talkId);
        if (!talk || ["ready", "failed", "published"].includes(talk.processingStatus) || pollCount >= 60) return;
        const timeout = setTimeout(() => {
          pollTimeoutsRef.current.delete(timeout);
          void poll();
        }, 5000);
        pollTimeoutsRef.current.add(timeout);
      };
      const timeout = setTimeout(() => {
        pollTimeoutsRef.current.delete(timeout);
        void poll();
      }, 5000);
      pollTimeoutsRef.current.add(timeout);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to start processing.");
    }
  }

  useEffect(() => {
    const timeouts = pollTimeoutsRef.current;
    return () => {
      timeouts.forEach((timeout) => clearTimeout(timeout));
      timeouts.clear();
    };
  }, []);

  async function cleanupUpload(storageKey: string) {
    await fetch("/api/admin/talks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-upload", storageKey }),
    }).catch(() => null);
  }

  async function uploadTalk(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!talkTitle.trim() || !talkFile) {
      setError("Title and MP3 file are required.");
      return;
    }
    if (!talkFile.name.toLowerCase().endsWith(".mp3")) {
      setError("Choose an MP3 file.");
      return;
    }
    if (talkFile.size > 150 * 1024 * 1024) {
      setError("MP3 files must be 150 MB or smaller.");
      return;
    }

    setUploading(true);
    setUploadProgress("Preparing upload…");
    let uploadedStorageKey: string | null = null;

    try {
      // Step 1: Get presigned upload URL
      setUploadProgress("Getting upload URL…");
      const presignRes = await fetch("/api/admin/talks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get-upload-url",
          folderId: selectedFolderId,
          filename: talkFile.name,
          fileSize: talkFile.size,
        }),
      });
      if (!presignRes.ok) {
        setError("Failed to get upload URL.");
        return;
      }
      const { uploadUrl, storageKey, fileSize } = await presignRes.json();

      // Step 2: Upload file directly to R2
      setUploadProgress(`Uploading ${talkFile.name}… (${(talkFile.size / 1024 / 1024).toFixed(1)} MB)`);
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "audio/mpeg" },
        body: talkFile,
      });
      if (!uploadRes.ok) {
        setError("Failed to upload file to storage.");
        return;
      }
      uploadedStorageKey = storageKey;

      // Step 3: Create the talk record in DB (starts as 'pending' processing status)
      setUploadProgress("Saving talk record…");
      const createRes = await fetch("/api/admin/talks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-talk",
          title: talkTitle,
          speaker: talkSpeaker || undefined,
          description: talkDesc || undefined,
          topics: talkTopics || undefined,
          folderId: selectedFolderId || undefined,
          storageKey,
          fileSize: fileSize || talkFile.size,
        }),
      });
      if (createRes.ok) {
        const created = await createRes.json();
        uploadedStorageKey = null;
        setTalkTitle(""); setTalkSpeaker(""); setTalkDesc(""); setTalkTopics(""); setTalkFile(null);
        setShowUploadForm(false);
        setUploadProgress("Starting audio processing…");
        await processTalk(created.id);
      } else {
        const data = await createRes.json().catch(() => ({}));
        await cleanupUpload(storageKey);
        uploadedStorageKey = null;
        setError(data.error || "Failed to create talk record.");
      }
    } catch {
      if (uploadedStorageKey) await cleanupUpload(uploadedStorageKey);
      setError("Upload failed.");
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  }

  const talksInFolder = (folderId: string | null) =>
    talks.filter((t) => t.folderId === folderId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 animate-spin" style={{ color: "var(--color-ink-muted)" }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "color-mix(in oklab, var(--color-error) 30%, transparent)", backgroundColor: "color-mix(in oklab, var(--color-error) 8%, transparent)", color: "var(--color-error)" }}>
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowFolderForm(!showFolderForm)}
          className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors"
          style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", backgroundColor: "var(--color-paper)" }}
        >
          <FolderPlus className="h-4 w-4" /> New Folder
        </button>
        <button
          onClick={() => setShowUploadForm(!showUploadForm)}
          className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors"
          style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
        >
          <Upload className="h-4 w-4" /> Upload Talk
        </button>
      </div>

      {/* Folder form */}
      {showFolderForm && (
        <form onSubmit={createFolder} className="flex flex-col gap-3 rounded-lg border p-5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Create Folder</h2>
          <Field label="Folder name" value={folderName} onChange={setFolderName} placeholder="e.g. Friday Khutbahs" />
          <Field label="Description (optional)" value={folderDesc} onChange={setFolderDesc} placeholder="What series is this?" textarea />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>Start date (optional)</span>
              <input
                type="date"
                value={folderStartDate}
                onChange={(e) => setFolderStartDate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>End date (optional)</span>
              <input
                type="date"
                value={folderEndDate}
                onChange={(e) => setFolderEndDate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="rounded-md px-4 py-2 text-sm font-medium" style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>Create</button>
            <button type="button" onClick={() => setShowFolderForm(false)} className="rounded-md border px-4 py-2 text-sm" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>Cancel</button>
          </div>
        </form>
      )}

      {/* Upload form */}
      {showUploadForm && (
        <form onSubmit={uploadTalk} className="flex flex-col gap-3 rounded-lg border p-5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Upload MP3 Talk</h2>
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>Folder</label>
            <select
              value={selectedFolderId || ""}
              onChange={(e) => setSelectedFolderId(e.target.value || null)}
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
            >
              <option value="">No folder (uncategorized)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <Field label="Title" value={talkTitle} onChange={setTalkTitle} placeholder="e.g. Patience in Prayer" />
          <Field label="Speaker" value={talkSpeaker} onChange={setTalkSpeaker} placeholder="e.g. Imam Malik" />
          <Field label="Description (optional)" value={talkDesc} onChange={setTalkDesc} placeholder="What is this talk about?" textarea />
          <Field label="Topics (optional)" value={talkTopics} onChange={setTalkTopics} placeholder="e.g. patience, salah, ramadan" />
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>MP3 File</label>
            <input
              type="file"
              accept="audio/mpeg,audio/mp3,.mp3"
              onChange={(e) => setTalkFile(e.target.files?.[0] || null)}
              required
              className="w-full text-sm"
              style={{ color: "var(--color-ink-soft)" }}
            />
            {talkFile && (
              <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                {talkFile.name} ({(talkFile.size / 1024 / 1024).toFixed(1)} MB)
              </p>
            )}
          </div>
          {uploadProgress && (
            <p className="text-xs" style={{ color: "var(--color-accent)" }} aria-live="polite">{uploadProgress}</p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={uploading} className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50" style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <button type="button" onClick={() => setShowUploadForm(false)} disabled={uploading} className="rounded-md border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>Cancel</button>
          </div>
        </form>
      )}

      {/* Folder edit form */}
      {editingFolder && (
        <form onSubmit={saveFolderEdit} className="flex flex-col gap-3 rounded-lg border p-5" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Edit Folder — {editingFolder.name}</h2>
            <button type="button" onClick={() => setEditingFolder(null)} className="rounded-md p-1" style={{ color: "var(--color-ink-muted)" }} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <Field label="Description" value={editFolderDesc} onChange={setEditFolderDesc} placeholder="What series is this?" textarea />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>Start date (optional)</span>
              <input
                type="date"
                value={editFolderStart}
                onChange={(e) => setEditFolderStart(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>End date (optional)</span>
              <input
                type="date"
                value={editFolderEnd}
                onChange={(e) => setEditFolderEnd(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
              />
            </label>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>Folder image (optional)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={(e) => setEditFolderImage(e.target.files?.[0] || null)}
              className="w-full text-sm"
              style={{ color: "var(--color-ink-soft)" }}
            />
            {editFolderImage && (
              <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                {editFolderImage.name} ({(editFolderImage.size / 1024).toFixed(0)} KB) — will replace current image
              </p>
            )}
            {editFolderImageKey && !editFolderImage && (
              <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>Image set. Upload a new file to replace.</p>
            )}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={savingFolder} className="flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50" style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}>
              <Save className="h-3.5 w-3.5" /> {savingFolder ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditingFolder(null)} disabled={savingFolder} className="rounded-md border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>Cancel</button>
          </div>
        </form>
      )}

      {/* Folders + talks */}
      {folders.length === 0 && talks.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>No folders or talks yet. Create a folder and upload your first talk.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Folders with talks */}
          {folders.map((folder) => (
            <div key={folder.id} className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
              <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--color-paper-3)" }}>
                <div className="flex min-w-0 items-center gap-2">
                  <Folder className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
                  <span className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{folder.name}</span>
                  <span className="shrink-0 text-xs" style={{ color: "var(--color-ink-muted)" }}>{talksInFolder(folder.id).length} talks</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEditFolder(folder)} className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)" }} aria-label="Edit folder">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteFolder(folder.id)} className="rounded-md p-1.5 transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)" }} aria-label="Delete folder">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {folder.description && <p className="px-5 py-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>{folder.description}</p>}
              <div className="divide-y" style={{ borderColor: "var(--color-paper-3)" }}>
                {talksInFolder(folder.id).map((talk) => (
                  <TalkRow key={talk.id} talk={talk} onDelete={deleteTalk} onPublish={publishTalk} onRetry={retryProcessing} onProcess={processTalk} />
                ))}
                {talksInFolder(folder.id).length === 0 && (
                  <p className="px-5 py-3 text-xs" style={{ color: "var(--color-ink-muted)" }}>No talks in this folder yet.</p>
                )}
              </div>
            </div>
          ))}

          {/* Uncategorized talks */}
          {talksInFolder(null).length > 0 && (
            <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
              <div className="border-b px-5 py-3.5" style={{ borderColor: "var(--color-paper-3)" }}>
                <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Uncategorized</span>
                <span className="ml-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>{talksInFolder(null).length} talks</span>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--color-paper-3)" }}>
                {talksInFolder(null).map((talk) => (
                  <TalkRow key={talk.id} talk={talk} onDelete={deleteTalk} onPublish={publishTalk} onRetry={retryProcessing} onProcess={processTalk} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TalkRow({ talk, onDelete, onPublish, onRetry, onProcess }: { talk: AdminTalk; onDelete: (id: string) => void; onPublish: (id: string) => void; onRetry: (id: string) => void; onProcess: (id: string) => void }) {
  const status = talk.processingStatus;
  const statusColors: Record<string, string> = {
    pending: "var(--color-ink-muted)",
    processing: "var(--color-accent)",
    ready: "var(--color-success)",
    published: "var(--color-success)",
    failed: "var(--color-error)",
  };
  const statusLabels: Record<string, string> = {
    pending: "Pending",
    processing: "Processing",
    ready: "Ready",
    published: "Published",
    failed: "Failed",
  };
  return (
    <div className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>{talk.title}</p>
        <p className="mt-0.5 truncate text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {talk.speaker ? `${talk.speaker}` : "Unknown speaker"}
          {talk.fileSize ? ` · ${(talk.fileSize / 1024 / 1024).toFixed(1)} MB` : ""}
          {talk.externalUrl ? " · external link" : " · MP3"}
        </p>
        {talk.topics && (
          <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--color-ink-muted)" }}>Topics: {talk.topics}</p>
        )}
        {talk.processingError && (
          <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--color-error)" }}>Error: {talk.processingError}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Processing status badge */}
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor: `color-mix(in oklab, ${statusColors[status] || "var(--color-ink-muted)"} 10%, transparent)`,
            color: statusColors[status] || "var(--color-ink-muted)",
          }}
        >
          {statusLabels[status] || status}
        </span>
        {/* Publish button (only when ready and not published) */}
        {status === "ready" && (
          <button
            onClick={() => onPublish(talk.id)}
            className="rounded-md px-3 py-2 text-xs font-medium transition-colors"
            style={{ backgroundColor: "var(--color-success)", color: "var(--color-paper)" }}
            aria-label="Publish talk"
          >
            Publish
          </button>
        )}
        {/* Retry button (only when failed) */}
        {status === "failed" && (
          <button
            onClick={() => onRetry(talk.id)}
            className="rounded-md border px-3 py-2 text-xs font-medium transition-colors"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
            aria-label="Retry processing"
          >
            Retry
          </button>
        )}
        {status === "processing" && talk.canRetryProcessing && (
          <button
            onClick={() => onProcess(talk.id)}
            className="rounded-md border px-3 py-2 text-xs font-medium transition-colors"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)" }}
            aria-label="Restart stalled processing"
          >
            Restart
          </button>
        )}
        {/* Process button (only when pending and has a storage key) */}
        {status === "pending" && talk.storageKey && (
          <button
            onClick={() => onProcess(talk.id)}
            className="rounded-md px-3 py-2 text-xs font-medium transition-colors"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
            aria-label="Process audio"
          >
            Process
          </button>
        )}
        <button onClick={() => onDelete(talk.id)} className="flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)" }} aria-label="Delete talk">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Shared UI ───

function Field({ label, value, onChange, placeholder, type = "text", textarea }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; textarea?: boolean }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
        />
      )}
    </label>
  );
}

// ─── Admin Settings ───

type ThemeMode = "light" | "dark" | "system";

interface AdminFeatures {
  enableTalks: boolean;
  enableDhikr: boolean;
  enableSadaqah: boolean;
  enableQibla: boolean;
  enableNames: boolean;
  enableFriends: boolean;
  enablePushNotifications: boolean;
  enableOfflineMode: boolean;
}

interface AdminAudioSettings {
  targetLufs: number;
  truePeak: number;
  silenceThreshold: number;
  silenceDuration: number;
  silencePadding: number;
  enableNoiseReduction: boolean;
  enableLoudnessNormalization: boolean;
  enableDeEssing: boolean;
  enableSpeechEQ: boolean;
  enableLimiter: boolean;
  noiseReductionStrength: number;
  mp3Bitrate: string;
}

const DEFAULT_FEATURES: AdminFeatures = {
  enableTalks: true, enableDhikr: true, enableSadaqah: true, enableQibla: true,
  enableNames: true, enableFriends: true, enablePushNotifications: true, enableOfflineMode: true,
};

const DEFAULT_AUDIO_SETTINGS: AdminAudioSettings = {
  targetLufs: -16, truePeak: -1.0,
  silenceThreshold: -45, silenceDuration: 0.7, silencePadding: 0.15,
  enableNoiseReduction: true, enableLoudnessNormalization: true,
  enableDeEssing: true, enableSpeechEQ: true, enableLimiter: true,
  noiseReductionStrength: 12, mp3Bitrate: '160k',
};

function AdminSettings() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    try { return (localStorage.getItem("waqt:admin:theme") as ThemeMode) || "system"; } catch { return "system"; }
  });
  const [savedTheme, setSavedTheme] = useState<ThemeMode | null>(null);
  const [features, setFeatures] = useState<AdminFeatures>(() => {
    if (typeof window === "undefined") return DEFAULT_FEATURES;
    try {
      const f = localStorage.getItem("waqt:admin:features");
      return f ? { ...DEFAULT_FEATURES, ...JSON.parse(f) } as AdminFeatures : DEFAULT_FEATURES;
    } catch { return DEFAULT_FEATURES; }
  });
  const [audioSettings, setAudioSettings] = useState<AdminAudioSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_AUDIO_SETTINGS;
    try {
      const a = localStorage.getItem("waqt:admin:audio");
      return a ? { ...DEFAULT_AUDIO_SETTINGS, ...JSON.parse(a) } as AdminAudioSettings : DEFAULT_AUDIO_SETTINGS;
    } catch { return DEFAULT_AUDIO_SETTINGS; }
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      localStorage.setItem("waqt:admin:theme", theme);
      localStorage.setItem("waqt:admin:features", JSON.stringify(features));
      localStorage.setItem("waqt:admin:audio", JSON.stringify(audioSettings));
      setSavedTheme(theme);
      setTimeout(() => setSavedTheme(null), 2000);
    } catch { /* non-critical */ }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* Appearance */}
      <SettingsSection title="Appearance" icon={Sun}>
        <div className="space-y-3">
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Choose how the admin portal looks. This affects this portal only — users control their own theme in Settings.
          </p>
          <div className="flex gap-2">
            {([
              { value: "light", label: "Light", icon: Sun },
              { value: "dark", label: "Dark", icon: Moon },
              { value: "system", label: "System", icon: Monitor },
            ] as const).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  borderColor: theme === value ? "var(--color-accent)" : "var(--color-paper-3)",
                  color: theme === value ? "var(--color-accent)" : "var(--color-ink-soft)",
                  backgroundColor: theme === value ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "transparent",
                }}
                aria-pressed={theme === value}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </SettingsSection>

      {/* Feature Toggles */}
      <SettingsSection title="Feature Toggles" icon={LayoutGrid}>
        <div className="space-y-2">
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Enable or disable features across the app. Disabled features are hidden from the tools menu and navigation.
          </p>
          {([
            { key: "enableTalks", label: "Talks Library", desc: "Audio lectures and khutbahs" },
            { key: "enableDhikr", label: "Dhikr Counter", desc: "Tasbih counter with curated sequences" },
            { key: "enableSadaqah", label: "Akhirah Card", desc: "Sadaqah tracking and history" },
            { key: "enableQibla", label: "Qibla Compass", desc: "Direction to the Kaaba" },
            { key: "enableNames", label: "99 Names", desc: "Names of Allah reference" },
            { key: "enableFriends", label: "Prayer Friends", desc: "Accountability partners" },
            { key: "enablePushNotifications", label: "Push Notifications", desc: "Prayer reminders and check-ins" },
            { key: "enableOfflineMode", label: "Offline Mode", desc: "Allow offline access and editing" },
          ] as const).map(({ key, label, desc }) => (
            <ToggleRow
              key={key}
              label={label}
              description={desc}
              checked={features[key]}
              onChange={(v) => setFeatures((f) => ({ ...f, [key]: v }))}
            />
          ))}
        </div>
      </SettingsSection>

      {/* Audio Processing Settings */}
      <SettingsSection title="Audio Processing" icon={Volume2}>
        <div className="space-y-4">
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Default settings for talk audio processing. Applied when talks are uploaded and processed.
            Uses two-pass EBU R128 loudness normalization for broadcast-quality results.
          </p>

          {/* Loudness section */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Loudness</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberInput
                label="Target Loudness (LUFS)"
                description="-16 for web/podcasts, -23 for broadcast TV"
                value={audioSettings.targetLufs}
                onChange={(v) => setAudioSettings((a) => ({ ...a, targetLufs: v }))}
                min={-30}
                max={0}
                step={1}
              />
              <NumberInput
                label="True Peak (dBTP)"
                description="Max peak to prevent clipping. -1.0 is standard"
                value={audioSettings.truePeak}
                onChange={(v) => setAudioSettings((a) => ({ ...a, truePeak: v }))}
                min={-3}
                max={0}
                step={0.5}
              />
            </div>
          </div>

          {/* Silence removal section */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Silence Removal</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberInput
                label="Silence Threshold (dB)"
                description="Below this = silence"
                value={audioSettings.silenceThreshold}
                onChange={(v) => setAudioSettings((a) => ({ ...a, silenceThreshold: v }))}
                min={-80}
                max={0}
                step={1}
              />
              <NumberInput
                label="Min Silence (s)"
                description="Duration to count as silence"
                value={audioSettings.silenceDuration}
                onChange={(v) => setAudioSettings((a) => ({ ...a, silenceDuration: v }))}
                min={0.1}
                max={5}
                step={0.1}
              />
              <NumberInput
                label="Padding (s)"
                description="Keep around speech"
                value={audioSettings.silencePadding}
                onChange={(v) => setAudioSettings((a) => ({ ...a, silencePadding: v }))}
                min={0}
                max={1}
                step={0.05}
              />
            </div>
          </div>

          {/* Noise reduction */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Noise Reduction</p>
            <ToggleRow
              label="Noise Reduction"
              description="Adaptive FFT denoising (afftdn) — removes background hiss/hum"
              checked={audioSettings.enableNoiseReduction}
              onChange={(v) => setAudioSettings((a) => ({ ...a, enableNoiseReduction: v }))}
            />
            {audioSettings.enableNoiseReduction && (
              <div className="mt-2">
                <NumberInput
                  label="Strength (0-30)"
                  description="Higher = more aggressive. 12 is conservative, 20+ for noisy recordings"
                  value={audioSettings.noiseReductionStrength}
                  onChange={(v) => setAudioSettings((a) => ({ ...a, noiseReductionStrength: Math.min(30, Math.max(0, v)) }))}
                  min={0}
                  max={30}
                  step={1}
                />
              </div>
            )}
          </div>

          {/* Enhancement toggles */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Enhancement</p>
            <ToggleRow
              label="Two-Pass Loudness Normalization"
              description="True EBU R128 compliance — measures then normalizes for consistent loudness"
              checked={audioSettings.enableLoudnessNormalization}
              onChange={(v) => setAudioSettings((a) => ({ ...a, enableLoudnessNormalization: v }))}
            />
            <ToggleRow
              label="De-Essing"
              description="Reduce harsh sibilance (s, sh, ch sounds) around 6kHz"
              checked={audioSettings.enableDeEssing}
              onChange={(v) => setAudioSettings((a) => ({ ...a, enableDeEssing: v }))}
            />
            <ToggleRow
              label="Speech EQ"
              description="Gentle presence boost at 3kHz + warmth at 200Hz for clearer speech"
              checked={audioSettings.enableSpeechEQ}
              onChange={(v) => setAudioSettings((a) => ({ ...a, enableSpeechEQ: v }))}
            />
            <ToggleRow
              label="Soft Limiter"
              description="Prevents digital clipping after normalization"
              checked={audioSettings.enableLimiter}
              onChange={(v) => setAudioSettings((a) => ({ ...a, enableLimiter: v }))}
            />
          </div>

          {/* Output quality */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>Output</p>
            <label className="block">
              <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>MP3 Bitrate</span>
              <select
                value={audioSettings.mp3Bitrate}
                onChange={(e) => setAudioSettings((a) => ({ ...a, mp3Bitrate: e.target.value }))}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
              >
                <option value="96k">96 kbps (small file, speech-only)</option>
                <option value="128k">128 kbps (standard)</option>
                <option value="160k">160 kbps (recommended)</option>
                <option value="192k">192 kbps (high quality)</option>
                <option value="256k">256 kbps (very high quality)</option>
              </select>
              <span className="mt-0.5 block text-xs" style={{ color: "var(--color-ink-muted)" }}>Higher = better quality but larger file size</span>
            </label>
          </div>
        </div>
      </SettingsSection>

      {/* Save button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {savedTheme !== null && (
          <span className="text-xs font-medium" style={{ color: "var(--color-success)" }}>
            Settings saved
          </span>
        )}
      </div>
    </div>
  );
}

function SettingsSection({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; children: React.ReactNode }) {
  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
    >
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
        <h3 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3" style={{ borderColor: "var(--color-paper-3)" }}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{label}</p>
        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
        style={{ backgroundColor: checked ? "var(--color-accent)" : "var(--color-paper-3)" }}
        role="switch"
        aria-checked={checked}
        aria-label={label}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform"
          style={{ left: "2px", transform: checked ? "translateX(20px)" : "translateX(0)" }}
        />
      </button>
    </div>
  );
}

function NumberInput({ label, description, value, onChange, min, max, step }: { label: string; description: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number }) {
  return (
    <label className="block">
      <span className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
      />
      <span className="mt-0.5 block text-xs" style={{ color: "var(--color-ink-muted)" }}>{description}</span>
    </label>
  );
}

