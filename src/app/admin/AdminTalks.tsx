"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw,
  FolderPlus,
  Upload,
  Trash2,
  Folder,
  Save,
  Pencil,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileAudio,
} from "lucide-react";

interface AdminFolder {
  id: string;
  name: string;
  description: string | null;
  imageKey: string | null;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
}
interface AdminTalk {
  id: string;
  title: string;
  speaker: string | null;
  description: string | null;
  topics: string | null;
  folderId: string | null;
  storageKey: string | null;
  processedStorageKey: string | null;
  fileSize: number | null;
  duration: number | null;
  externalUrl: string | null;
  processingStatus: string;
  processingError: string | null;
  addedAt: string;
  publishedAt: string | null;
  canRetryProcessing: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = {
  pending: { label: "Pending", color: "var(--color-ink-muted)", icon: FileAudio },
  processing: { label: "Processing", color: "var(--color-accent)", icon: Loader2 },
  ready: { label: "Ready", color: "var(--color-success)", icon: CheckCircle2 },
  published: { label: "Published", color: "var(--color-success)", icon: CheckCircle2 },
  failed: { label: "Failed", color: "var(--color-error)", icon: AlertCircle },
};

export function AdminTalks() {
  const [folders, setFolders] = useState<AdminFolder[]>([]);
  const [talks, setTalks] = useState<AdminTalk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
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
      const loadedTalks = Array.isArray(data.talks) ? (data.talks as AdminTalk[]) : [];
      setFolders(Array.isArray(data.folders) ? data.folders : []);
      setTalks(loadedTalks);
      setError(null);
      return loadedTalks;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load talks.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => void load());
  }, [load]);

  // ── Folder actions ──

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
      setFolderName("");
      setFolderDesc("");
      setFolderStartDate("");
      setFolderEndDate("");
      setShowFolderForm(false);
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create folder.");
    }
  }

  async function deleteFolder(folderId: string, folderName: string) {
    setConfirmState({
      title: "Delete folder",
      message: `Delete "${folderName}"? Talks inside will remain but become uncategorized.`,
      confirmLabel: "Delete folder",
      onConfirm: () => doDeleteFolder(folderId),
    });
  }

  async function doDeleteFolder(folderId: string) {
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/talks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-folder", folderId }),
      });
      if (res.ok) {
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete folder.");
      }
    } catch {
      setError("Network error while deleting folder.");
    } finally {
      setDeleting(false);
      setConfirmState(null);
    }
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
      if (editFolderImage) {
        if (editFolderImage.size > 5 * 1024 * 1024) {
          setError("Folder images must be 5 MB or smaller.");
          setSavingFolder(false);
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
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to update folder.");
      }
    } catch (err) {
      if (uploadedImageKey) await cleanupFolderImage(uploadedImageKey);
      setError(err instanceof Error ? err.message : "Folder update failed.");
    } finally {
      setSavingFolder(false);
    }
  }

  // ── Talk actions ──

  async function deleteTalk(talkId: string, talkTitle: string) {
    setConfirmState({
      title: "Delete talk",
      message: `Delete "${talkTitle}"? The MP3 file will also be removed from storage. This cannot be undone.`,
      confirmLabel: "Delete talk",
      onConfirm: () => doDeleteTalk(talkId),
    });
  }

  async function doDeleteTalk(talkId: string) {
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/talks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-talk", talkId }),
      });
      if (res.ok) {
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete talk.");
      }
    } catch {
      setError("Network error while deleting talk.");
    } finally {
      setDeleting(false);
      setConfirmState(null);
    }
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
    } catch {
      /* use server defaults */
    }

    // If the talk is stuck in "processing", force-reset it to "pending" first
    // so the process route doesn't reject it with 409 "already being processed".
    const stuckTalk = talks.find((t) => t.id === talkId);
    if (stuckTalk?.processingStatus === "processing") {
      await fetch("/api/admin/talks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "force-reprocess", talkId }),
      });
    }

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
        if (!talk || ["ready", "failed", "published"].includes(talk.processingStatus) || pollCount >= 60)
          return;
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
      setError("Choose an MP3 file (.mp3 extension required).");
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
        const data = await presignRes.json().catch(() => ({}));
        setError(data.error || "Failed to get upload URL.");
        return;
      }
      const { uploadUrl, storageKey, fileSize } = await presignRes.json();

      // Step 2: Upload to R2
      setUploadProgress(`Uploading ${talkFile.name}… (${(talkFile.size / 1024 / 1024).toFixed(1)} MB)`);
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "audio/mpeg" },
        body: talkFile,
      });
      if (!uploadRes.ok) {
        setError(`Upload failed (HTTP ${uploadRes.status}). The file may be too large or the connection dropped.`);
        return;
      }
      uploadedStorageKey = storageKey;

      // Step 3: Create talk record
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
        setTalkTitle("");
        setTalkSpeaker("");
        setTalkDesc("");
        setTalkTopics("");
        setTalkFile(null);
        setShowUploadForm(false);
        setUploadProgress("Starting audio processing…");
        await processTalk(created.id);
      } else {
        const data = await createRes.json().catch(() => ({}));
        await cleanupUpload(storageKey);
        uploadedStorageKey = null;
        setError(data.error || "Failed to create talk record.");
      }
    } catch (err) {
      if (uploadedStorageKey) await cleanupUpload(uploadedStorageKey);
      setError(err instanceof Error ? `Upload failed: ${err.message}` : "Upload failed due to a network error.");
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  }

  const talksInFolder = (folderId: string | null) => talks.filter((t) => t.folderId === folderId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-5 w-5 animate-spin" style={{ color: "var(--color-ink-muted)" }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Error banner — always visible, always actionable */}
      {error && (
        <div
          className="flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: "color-mix(in oklab, var(--color-error) 30%, transparent)",
            backgroundColor: "color-mix(in oklab, var(--color-error) 8%, transparent)",
            color: "var(--color-error)",
          }}
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Error</p>
            <p className="mt-0.5 text-xs leading-relaxed">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="shrink-0 rounded-md p-1 transition-colors hover:bg-[color-mix(in_oklab,var(--color-error)_10%,transparent)]"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Upload progress banner */}
      {uploadProgress && (
        <div
          className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: "color-mix(in oklab, var(--color-accent) 30%, transparent)",
            backgroundColor: "color-mix(in oklab, var(--color-accent) 8%, transparent)",
            color: "var(--color-accent)",
          }}
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <p className="text-xs font-medium">{uploadProgress}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowFolderForm(!showFolderForm)}
          className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
          style={{
            borderColor: "var(--color-paper-3)",
            color: "var(--color-ink-soft)",
            backgroundColor: "var(--color-paper)",
            minHeight: 44,
          }}
        >
          <FolderPlus className="h-4 w-4" /> New Folder
        </button>
        <button
          onClick={() => setShowUploadForm(!showUploadForm)}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--color-ink)",
            color: "var(--color-paper)",
            minHeight: 44,
            boxShadow: "0 2px 8px color-mix(in oklab, var(--color-ink) 20%, transparent)",
          }}
        >
          <Upload className="h-4 w-4" /> Upload Talk
        </button>
      </div>

      {/* Folder form */}
      {showFolderForm && (
        <form
          onSubmit={createFolder}
          className="flex flex-col gap-4 rounded-2xl border p-5"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
            Create Folder
          </h2>
          <Field label="Folder name" value={folderName} onChange={setFolderName} placeholder="e.g. Friday Khutbahs" />
          <Field
            label="Description (optional)"
            value={folderDesc}
            onChange={setFolderDesc}
            placeholder="What series is this?"
            textarea
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField label="Start date (optional)" value={folderStartDate} onChange={setFolderStartDate} />
            <DateField label="End date (optional)" value={folderEndDate} onChange={setFolderEndDate} />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-xl px-4 py-2.5 text-sm font-medium"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowFolderForm(false)}
              className="rounded-xl border px-4 py-2.5 text-sm"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", minHeight: 44 }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Upload form */}
      {showUploadForm && (
        <form
          onSubmit={uploadTalk}
          className="flex flex-col gap-4 rounded-2xl border p-5"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
            Upload MP3 Talk
          </h2>
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
              Folder
            </label>
            <select
              value={selectedFolderId || ""}
              onChange={(e) => setSelectedFolderId(e.target.value || null)}
              className="w-full rounded-xl border px-3 py-2.5 text-sm"
              style={{
                borderColor: "var(--color-paper-3)",
                backgroundColor: "var(--color-paper-2)",
                color: "var(--color-ink)",
                minHeight: 44,
              }}
            >
              <option value="">No folder (uncategorized)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <Field label="Title" value={talkTitle} onChange={setTalkTitle} placeholder="e.g. Patience in Prayer" />
          <Field label="Speaker" value={talkSpeaker} onChange={setTalkSpeaker} placeholder="e.g. Imam Malik" />
          <Field
            label="Description (optional)"
            value={talkDesc}
            onChange={setTalkDesc}
            placeholder="What is this talk about?"
            textarea
          />
          <Field
            label="Topics (optional)"
            value={talkTopics}
            onChange={setTalkTopics}
            placeholder="e.g. patience, salah, ramadan"
          />
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
              MP3 File
            </label>
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
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={uploading}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <button
              type="button"
              onClick={() => setShowUploadForm(false)}
              disabled={uploading}
              className="rounded-xl border px-4 py-2.5 text-sm disabled:opacity-50"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", minHeight: 44 }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Folder edit form */}
      {editingFolder && (
        <form
          onSubmit={saveFolderEdit}
          className="flex flex-col gap-4 rounded-2xl border p-5"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
              Edit Folder — {editingFolder.name}
            </h2>
            <button
              type="button"
              onClick={() => setEditingFolder(null)}
              className="rounded-lg p-1.5"
              style={{ color: "var(--color-ink-muted)" }}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Field
            label="Description"
            value={editFolderDesc}
            onChange={setEditFolderDesc}
            placeholder="What series is this?"
            textarea
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField label="Start date (optional)" value={editFolderStart} onChange={setEditFolderStart} />
            <DateField label="End date (optional)" value={editFolderEnd} onChange={setEditFolderEnd} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
              Folder image (optional)
            </label>
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
              <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                Image set. Upload a new file to replace.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={savingFolder}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
            >
              {savingFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {savingFolder ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditingFolder(null)}
              disabled={savingFolder}
              className="rounded-xl border px-4 py-2.5 text-sm disabled:opacity-50"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", minHeight: 44 }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Folders + talks */}
      {folders.length === 0 && talks.length === 0 ? (
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
        >
          <FileAudio className="mx-auto mb-3 h-8 w-8" style={{ color: "var(--color-ink-muted)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>
            No folders or talks yet
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Create a folder and upload your first talk to get started.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="overflow-hidden rounded-2xl border"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
            >
              <div
                className="flex items-center justify-between border-b px-5 py-3.5"
                style={{ borderColor: "var(--color-paper-3)" }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Folder className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
                  <span className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                    {folder.name}
                  </span>
                  <span className="shrink-0 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    {talksInFolder(folder.id).length} talks
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditFolder(folder)}
                    className="rounded-lg p-2 transition-colors hover:bg-[var(--color-paper-2)]"
                    style={{ color: "var(--color-ink-muted)", minHeight: 36, minWidth: 36 }}
                    aria-label="Edit folder"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteFolder(folder.id, folder.name)}
                    className="rounded-lg p-2 transition-colors hover:bg-[var(--color-paper-2)]"
                    style={{ color: "var(--color-ink-muted)", minHeight: 36, minWidth: 36 }}
                    aria-label="Delete folder"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {folder.description && (
                <p className="px-5 py-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  {folder.description}
                </p>
              )}
              <div className="divide-y" style={{ borderColor: "var(--color-paper-3)" }}>
                {talksInFolder(folder.id).map((talk) => (
                  <TalkRow
                    key={talk.id}
                    talk={talk}
                    onDelete={deleteTalk}
                    onPublish={publishTalk}
                    onRetry={retryProcessing}
                    onProcess={processTalk}
                  />
                ))}
                {talksInFolder(folder.id).length === 0 && (
                  <p className="px-5 py-3 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    No talks in this folder yet.
                  </p>
                )}
              </div>
            </div>
          ))}

          {talksInFolder(null).length > 0 && (
            <div
              className="overflow-hidden rounded-2xl border"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
            >
              <div className="border-b px-5 py-3.5" style={{ borderColor: "var(--color-paper-3)" }}>
                <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                  Uncategorized
                </span>
                <span className="ml-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                  {talksInFolder(null).length} talks
                </span>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--color-paper-3)" }}>
                {talksInFolder(null).map((talk) => (
                  <TalkRow
                    key={talk.id}
                    talk={talk}
                    onDelete={deleteTalk}
                    onPublish={publishTalk}
                    onRetry={retryProcessing}
                    onProcess={processTalk}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Delete confirmation dialog ── */}
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          loading={deleting}
          onConfirm={confirmState.onConfirm}
          onCancel={() => { if (!deleting) setConfirmState(null); }}
        />
      )}
    </div>
  );
}

// ─── Confirm dialog ───

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  loading,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 50%, transparent)" }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-2xl border p-5 shadow-xl"
        style={{
          backgroundColor: "var(--color-paper)",
          borderColor: "var(--color-paper-3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundColor: "color-mix(in oklab, var(--color-error) 10%, transparent)",
            }}
          >
            <Trash2 className="h-5 w-5" style={{ color: "var(--color-error)" }} />
          </div>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-ink)" }}>
            {title}
          </h2>
        </div>
        <p className="mb-5 text-sm leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          {message}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="min-h-11 flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            style={{ backgroundColor: "var(--color-error)", color: "var(--color-paper)" }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {loading ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Talk row ───

function TalkRow({
  talk,
  onDelete,
  onPublish,
  onRetry,
  onProcess,
}: {
  talk: AdminTalk;
  onDelete: (id: string, title: string) => void;
  onPublish: (id: string) => void;
  onRetry: (id: string) => void;
  onProcess: (id: string) => void;
}) {
  const status = talk.processingStatus;
  const statusCfg = STATUS_CONFIG[status] || {
    label: status,
    color: "var(--color-ink-muted)",
    icon: AlertCircle,
  };
  const StatusIcon = statusCfg.icon;
  const isProcessing = status === "processing";
  const isPending = status === "pending";

  // Estimate processing time from file size.
  // MP3 at ~160kbps = ~1.2 MB/min of audio.
  // Vercel Hobby plan: 300s max duration.
  // Three tiers:
  //   <25 MB:   Full processing (all filters, two-pass) ~6x realtime
  //   25-50 MB: Fast mode (skip expensive filters) ~8x realtime
  //   50-100 MB: Ultra-fast (just transcode, no filters) ~25x realtime
  //   >100 MB:  Skip processing — uses original file directly
  function estimateProcessingTime(): string {
    const mb = (talk.fileSize ?? 0) / (1024 * 1024);
    if (mb > 100) return "no compression (too large for Hobby plan)";

    const isHuge = mb > 50;
    const isLarge = mb > 25;
    const multiplier = isHuge ? 25 : isLarge ? 8 : 6;

    if (talk.duration && talk.duration > 0) {
      const seconds = Math.ceil(talk.duration / multiplier);
      if (seconds < 60) return `~${seconds}s`;
      return `~${Math.ceil(seconds / 60)} min`;
    }
    if (!talk.fileSize) return "~1-3 min";
    const audioMinutes = mb / 1.2; // 1.2 MB per minute at 160kbps
    const processingSeconds = Math.ceil((audioMinutes * 60) / multiplier);
    if (processingSeconds < 60) return `~${processingSeconds}s`;
    return `~${Math.ceil(processingSeconds / 60)} min`;
  }

  return (
    <div className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>
          {talk.title}
        </p>
        <p className="mt-0.5 truncate text-xs" style={{ color: "var(--color-ink-muted)" }}>
          {talk.speaker ? talk.speaker : "Unknown speaker"}
          {talk.fileSize ? ` · ${(talk.fileSize / 1024 / 1024).toFixed(1)} MB` : ""}
          {talk.externalUrl ? " · external link" : " · MP3"}
        </p>
        {talk.topics && (
          <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            Topics: {talk.topics}
          </p>
        )}
        {talk.processingError && (
          <p
            className="mt-1 text-[11px] leading-relaxed"
            style={{ color: "var(--color-error)" }}
          >
            Error: {talk.processingError}
          </p>
        )}
        {(isProcessing || isPending) && talk.storageKey && (
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            Est. processing time: {estimateProcessingTime()}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {/* Status badge */}
        <span
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium"
          style={{
            backgroundColor: `color-mix(in oklab, ${statusCfg.color} 10%, transparent)`,
            color: statusCfg.color,
          }}
        >
          <StatusIcon
            className={`h-3 w-3 ${isProcessing ? "animate-spin" : ""}`}
            style={{ color: statusCfg.color }}
          />
          {statusCfg.label}
        </span>

        {/* Action buttons */}
        {status === "ready" && (
          <button
            onClick={() => onPublish(talk.id)}
            className="rounded-lg px-3 py-2 text-xs font-medium transition-colors"
            style={{ backgroundColor: "var(--color-success)", color: "var(--color-paper)", minHeight: 36 }}
            aria-label="Publish talk"
          >
            Publish
          </button>
        )}
        {status === "failed" && (
          <button
            onClick={() => onRetry(talk.id)}
            className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 36 }}
            aria-label="Retry processing"
          >
            Retry
          </button>
        )}
        {status === "processing" && talk.canRetryProcessing && (
          <button
            onClick={() => onProcess(talk.id)}
            className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
            style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-soft)", minHeight: 36 }}
            aria-label="Restart stalled processing"
          >
            Restart
          </button>
        )}
        {status === "pending" && talk.storageKey && (
          <button
            onClick={() => onProcess(talk.id)}
            className="rounded-lg px-3 py-2 text-xs font-medium transition-colors"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)", minHeight: 36 }}
            aria-label="Process audio"
          >
            Process
          </button>
        )}
        <button
          onClick={() => onDelete(talk.id, talk.title)}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-muted)", minHeight: 36, minWidth: 36 }}
          aria-label="Delete talk"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Shared form fields ───

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  textarea?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="rounded-xl border px-3 py-2.5 text-sm"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper-2)",
            color: "var(--color-ink)",
          }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="rounded-xl border px-3 py-2.5 text-sm"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper-2)",
            color: "var(--color-ink)",
            minHeight: 44,
          }}
        />
      )}
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border px-3 py-2.5 text-sm"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "var(--color-paper-2)",
          color: "var(--color-ink)",
          minHeight: 44,
        }}
      />
    </label>
  );
}
