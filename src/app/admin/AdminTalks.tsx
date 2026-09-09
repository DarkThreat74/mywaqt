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
  Play,
  ImageIcon,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useAudioPlayer } from "@/components/audio-player-context";
import type { PlayerTrack } from "@/components/advanced-audio-player";

interface AdminFolder {
  id: string;
  name: string;
  description: string | null;
  speaker: string | null;
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
  const [activeForm, setActiveForm] = useState<"folder" | "upload" | "batch" | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderDesc, setFolderDesc] = useState("");
  const [folderSpeaker, setFolderSpeaker] = useState("");
  const [folderStartDate, setFolderStartDate] = useState("");
  const [folderEndDate, setFolderEndDate] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [editingFolder, setEditingFolder] = useState<AdminFolder | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [editFolderDesc, setEditFolderDesc] = useState("");
  const [editFolderSpeaker, setEditFolderSpeaker] = useState("");
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

  // Batch upload state
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchName, setBatchName] = useState("");
  const [batchStartNumber, setBatchStartNumber] = useState(1);
  const [batchSpeaker, setBatchSpeaker] = useState("");
  const [batchFolderId, setBatchFolderId] = useState<string | null>(null);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;       // file currently being processed (1-indexed)
    total: number;         // total files
    phase: string;         // human-readable phase
    processing: number;     // how many in current batch are processing
    batchNumber: number;   // current batch number (1-indexed)
    totalBatches: number;  // total number of batches
    uploadedInBatch: number; // files uploaded in current batch
    processedInBatch: number; // files processed in current batch
  } | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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
        speaker: folderSpeaker || undefined,
        startDate: folderStartDate || undefined,
        endDate: folderEndDate || undefined,
      }),
    });
    if (res.ok) {
      setFolderName("");
      setFolderDesc("");
      setFolderSpeaker("");
      setFolderStartDate("");
      setFolderEndDate("");
      setActiveForm(null);
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
    setEditFolderName(folder.name || "");
    setEditFolderDesc(folder.description || "");
    setEditFolderSpeaker(folder.speaker || "");
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
          name: editFolderName,
          description: editFolderDesc || undefined,
          speaker: editFolderSpeaker || undefined,
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
      message: `Delete "${talkTitle}"? The audio file will also be removed from storage. This cannot be undone.`,
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
      body: JSON.stringify({ talkId }),
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
      setError("Title and audio file are required.");
      return;
    }
    if (!/\.(mp3|m4a|aac|wav|ogg|opus|flac|wma)$/i.test(talkFile.name)) {
      setError("Choose an audio file (mp3, m4a, aac, wav, ogg, opus, flac).");
      return;
    }
    if (talkFile.size > 150 * 1024 * 1024) {
      setError("Audio files must be 150 MB or smaller.");
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
      const descWithFile = talkDesc
        ? `${talkDesc}\n\nSource file: ${talkFile.name}`
        : `Source file: ${talkFile.name}`;
      const createRes = await fetch("/api/admin/talks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-talk",
          title: talkTitle,
          speaker: talkSpeaker || undefined,
          description: descWithFile,
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
        setActiveForm(null);
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

  // ─── Batch upload + processing queue (10 at a time) ───
  // For large folders (300+ files, ~5GB), we process in batches of 10:
  //   1. Upload 10 files to R2 and create talk records
  //   2. Start compression for those 10
  //   3. Poll until all 10 are done (ready/failed)
  //   4. Move to next 10
  // This avoids uploading 5GB at once and overloading the server.
  async function startBatchUpload() {
    if (batchFiles.length === 0 || !batchName.trim()) return;
    setBatchUploading(true);
    setError(null);

    const total = batchFiles.length;
    const BATCH_SIZE = 10;
    const totalBatches = Math.ceil(total / BATCH_SIZE);

    try {
      for (let batchStart = 0; batchStart < total; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, total);
        const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
        const batchFilesSlice = batchFiles.slice(batchStart, batchEnd);

        setBatchProgress({
          current: batchStart,
          total,
          phase: `Batch ${batchNum}/${totalBatches} — Uploading…`,
          processing: 0,
          batchNumber: batchNum,
          totalBatches,
          uploadedInBatch: 0,
          processedInBatch: 0,
        });

        // Phase 1: Upload this batch's files to R2 and create talk records
        const createdIds: { id: string; fileName: string }[] = [];
        for (let i = 0; i < batchFilesSlice.length; i++) {
          const file = batchFilesSlice[i];
          const globalIndex = batchStart + i;
          setBatchProgress({
            current: globalIndex,
            total,
            phase: `Batch ${batchNum}/${totalBatches} — Uploading ${file.name}…`,
            processing: 0,
            batchNumber: batchNum,
            totalBatches,
            uploadedInBatch: i,
            processedInBatch: 0,
          });

          // Get presigned URL
          const presignRes = await fetch("/api/admin/talks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "get-upload-url",
              folderId: batchFolderId,
              filename: file.name,
              fileSize: file.size,
            }),
          });
          if (!presignRes.ok) {
            const d = await presignRes.json().catch(() => ({}));
            setError(`Failed to upload ${file.name}: ${d.error || "presign failed"}`);
            continue;
          }
          const { uploadUrl, storageKey, fileSize } = await presignRes.json();

          // Upload to R2
          const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type || "audio/mpeg" },
            body: file,
          });
          if (!uploadRes.ok) {
            setError(`Failed to upload ${file.name} to storage.`);
            continue;
          }

          // Create talk record with numbered title
          const title = `${batchName.trim()} ${batchStartNumber + globalIndex}`;
          const createRes = await fetch("/api/admin/talks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create-talk",
              title,
              description: `Source file: ${file.name}`,
              speaker: batchSpeaker || undefined,
              folderId: batchFolderId || undefined,
              storageKey,
              fileSize: fileSize || file.size,
            }),
          });
          if (createRes.ok) {
            const created = await createRes.json();
            createdIds.push({ id: created.id, fileName: file.name });
          } else {
            setError(`Failed to create record for ${file.name}.`);
          }
        }

        if (createdIds.length === 0) {
          continue; // skip processing if nothing was created
        }

        await load(); // refresh talk list

        // Phase 2: Start compression for all files in this batch
        setBatchProgress({
          current: batchStart,
          total,
          phase: `Batch ${batchNum}/${totalBatches} — Starting compression for ${createdIds.length} files…`,
          processing: createdIds.length,
          batchNumber: batchNum,
          totalBatches,
          uploadedInBatch: createdIds.length,
          processedInBatch: 0,
        });

        // Kick off processing for all files in the batch
        await Promise.all(createdIds.map(async ({ id }) => {
          await fetch("/api/admin/talks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "force-reprocess", talkId: id }),
          }).catch(() => {});
          await fetch("/api/admin/talks/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ talkId: id }),
          });
        }));

        // Phase 3: Poll until all files in this batch are done
        const completed = new Set<string>();
        const failed = new Set<string>();
        const batchIds = new Set(createdIds.map((c) => c.id));

        for (let poll = 0; poll < 300 && completed.size + failed.size < createdIds.length; poll++) {
          await new Promise((r) => setTimeout(r, 5000));
          const res = await fetch("/api/admin/talks");
          if (!res.ok) continue;
          const data = await res.json().catch(() => ({}));
          const talks = (data.talks as AdminTalk[]) || [];
          for (const talk of talks) {
            if (!batchIds.has(talk.id)) continue;
            if (talk.processingStatus === "ready" || talk.processingStatus === "published") {
              completed.add(talk.id);
            } else if (talk.processingStatus === "failed") {
              failed.add(talk.id);
            }
          }
          setBatchProgress({
            current: batchStart + completed.size + failed.size,
            total,
            phase: `Batch ${batchNum}/${totalBatches} — Processing ${completed.size + failed.size}/${createdIds.length}`,
            processing: createdIds.length - completed.size - failed.size,
            batchNumber: batchNum,
            totalBatches,
            uploadedInBatch: createdIds.length,
            processedInBatch: completed.size + failed.size,
          });
        }

        await load(); // refresh UI after batch completes
      }

      setBatchProgress({
        current: total,
        total,
        phase: "All done!",
        processing: 0,
        batchNumber: totalBatches,
        totalBatches,
        uploadedInBatch: 0,
        processedInBatch: 0,
      });
      await load();
      setTimeout(() => {
        setActiveForm(null);
        setBatchFiles([]);
        setBatchName("");
        setBatchStartNumber(1);
        setBatchSpeaker("");
        setBatchProgress(null);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? `Batch upload failed: ${err.message}` : "Batch upload failed.");
    } finally {
      setBatchUploading(false);
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

      {/* Action buttons — segmented control, only one form open at a time */}
      <div className="flex gap-1 rounded-xl border p-1" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
        <button
          onClick={() => setActiveForm(activeForm === "folder" ? null : "folder")}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all"
          style={{
            backgroundColor: activeForm === "folder" ? "var(--color-ink)" : "transparent",
            color: activeForm === "folder" ? "var(--color-paper)" : "var(--color-ink-soft)",
            minHeight: 40,
          }}
        >
          <FolderPlus className="h-4 w-4" /> New Folder
        </button>
        <button
          onClick={() => setActiveForm(activeForm === "upload" ? null : "upload")}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all"
          style={{
            backgroundColor: activeForm === "upload" ? "var(--color-ink)" : "transparent",
            color: activeForm === "upload" ? "var(--color-paper)" : "var(--color-ink-soft)",
            minHeight: 40,
          }}
        >
          <Upload className="h-4 w-4" /> Upload Talk
        </button>
        <button
          onClick={() => setActiveForm(activeForm === "batch" ? null : "batch")}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all"
          style={{
            backgroundColor: activeForm === "batch" ? "var(--color-ink)" : "transparent",
            color: activeForm === "batch" ? "var(--color-paper)" : "var(--color-ink-soft)",
            minHeight: 40,
          }}
        >
          <FolderPlus className="h-4 w-4" /> Batch Folder
        </button>
      </div>

      {/* Folder form */}
      {activeForm === "folder" && (
        <form
          onSubmit={(e) => { e.preventDefault(); createFolder(e); }}
          className="flex flex-col gap-5 rounded-2xl border p-6"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", boxShadow: "0 4px 24px -8px color-mix(in oklab, var(--color-ink) 12%, transparent)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)" }}>
                <FolderPlus className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
              </div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Create Folder</h2>
            </div>
            <button type="button" onClick={() => setActiveForm(null)} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)" }} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <Field label="Folder name" value={folderName} onChange={setFolderName} placeholder="e.g. Friday Khutbahs" />
          <Field
            label="Description (optional)"
            value={folderDesc}
            onChange={setFolderDesc}
            placeholder="What series is this?"
            textarea
          />
          <Field label="Default speaker (optional)" value={folderSpeaker} onChange={setFolderSpeaker} placeholder="e.g. Sh. Hamza Yusuf" />
          <p className="-mt-2 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
            Talks uploaded to this folder with no speaker will inherit this name.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField label="Start date (optional)" value={folderStartDate} onChange={setFolderStartDate} />
            <DateField label="End date (optional)" value={folderEndDate} onChange={setFolderEndDate} />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-transform active:scale-95"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44, boxShadow: "0 2px 8px color-mix(in oklab, var(--color-ink) 20%, transparent)" }}
            >
              <FolderPlus className="h-4 w-4" /> Create Folder
            </button>
            <button
              type="button"
              onClick={() => setActiveForm(null)}
              className="rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", minHeight: 44 }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Upload form */}
      {activeForm === "upload" && (
        <form
          onSubmit={(e) => { e.preventDefault(); uploadTalk(e); }}
          className="flex flex-col gap-5 rounded-2xl border p-6"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", boxShadow: "0 4px 24px -8px color-mix(in oklab, var(--color-ink) 12%, transparent)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)" }}>
                <Upload className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
              </div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Upload Talk</h2>
            </div>
            <button type="button" onClick={() => !uploading && setActiveForm(null)} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)" }} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>
              Folder
            </label>
            <select
              value={selectedFolderId || ""}
              onChange={(e) => setSelectedFolderId(e.target.value || null)}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)", minHeight: 44 }}
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
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>
              Audio File
            </label>
            <input
              type="file"
              accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus"
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
            <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs" style={{ borderColor: "color-mix(in oklab, var(--color-accent) 30%, transparent)", backgroundColor: "color-mix(in oklab, var(--color-accent) 6%, transparent)", color: "var(--color-accent)" }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {uploadProgress}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={uploading}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-transform active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44, boxShadow: "0 2px 8px color-mix(in oklab, var(--color-ink) 20%, transparent)" }}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading…" : "Upload & Process"}
            </button>
            <button
              type="button"
              onClick={() => setActiveForm(null)}
              disabled={uploading}
              className="rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", minHeight: 44 }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ─── Batch upload form ─── */}
      {activeForm === "batch" && (
        <div className="flex flex-col gap-5 rounded-2xl border p-6" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", boxShadow: "0 4px 24px -8px color-mix(in oklab, var(--color-ink) 12%, transparent)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)" }}>
                <FolderPlus className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
              </div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Batch Upload Folder</h2>
            </div>
            <button type="button" onClick={() => !batchUploading && setActiveForm(null)} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--color-paper-2)]" style={{ color: "var(--color-ink-muted)" }} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="-mt-2 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
            Select a folder of audio files. Files are sorted by name (natural sort — handles
            &ldquo;Episode 2&rdquo; before &ldquo;Episode 10&rdquo;). Each file becomes a talk, numbered automatically.
            Files are processed in batches of 10 to handle large folders without overloading the server.
          </p>

          {/* Step 1: Folder picker */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
              Step 1 — Select audio folder
            </label>
            {batchFiles.length === 0 ? (
              <label
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-10 transition-colors hover:border-[var(--color-accent)]"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}
              >
                <FolderPlus className="h-7 w-7" style={{ color: "var(--color-ink-muted)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--color-ink-soft)" }}>Choose folder</span>
                <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>All audio files inside will be listed</span>
                <input
                  type="file"
                  multiple
                  accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    const audioFiles = files.filter((f) =>
                      f.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(f.name)
                    );
                    audioFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
                    setBatchFiles(audioFiles);
                  }}
                  className="hidden"
                  disabled={batchUploading}
                  {...{ webkitdirectory: "", directory: "" }}
                />
              </label>
            ) : (
              <div className="rounded-xl border" style={{ borderColor: "var(--color-paper-3)" }}>
                {/* Summary bar */}
                <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: "var(--color-paper-3)" }}>
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold" style={{ backgroundColor: "var(--color-success)", color: "var(--color-paper)" }}>
                      {batchFiles.length}
                    </span>
                    <span className="text-xs font-medium" style={{ color: "var(--color-ink)" }}>
                      {batchFiles.length} file{batchFiles.length !== 1 ? "s" : ""} · {(batchFiles.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setBatchFiles([])}
                      disabled={batchUploading}
                      className="text-[11px] font-medium transition-colors hover:underline disabled:opacity-30"
                      style={{ color: "var(--color-error)" }}
                    >
                      Clear all
                    </button>
                  </div>
                </div>
                {/* File list */}
                <div className="max-h-56 overflow-y-auto">
                  {batchFiles.map((file, i) => (
                    <div
                      key={`${file.name}-${i}`}
                      draggable={!batchUploading}
                      onDragStart={() => setDragIndex(i)}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIndex(i); }}
                      onDragLeave={() => setDragOverIndex(null)}
                      onDrop={() => {
                        if (dragIndex !== null && dragIndex !== i) {
                          const next = [...batchFiles];
                          const [moved] = next.splice(dragIndex, 1);
                          next.splice(i, 0, moved);
                          setBatchFiles(next);
                        }
                        setDragIndex(null);
                        setDragOverIndex(null);
                      }}
                      onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                      className="flex items-center gap-2.5 border-b px-3 py-2 text-xs transition-colors last:border-b-0"
                      style={{
                        borderColor: "var(--color-paper-3)",
                        backgroundColor: dragOverIndex === i ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "transparent",
                        opacity: dragIndex === i ? 0.4 : 1,
                        cursor: batchUploading ? "default" : "grab",
                      }}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}>
                        {batchStartNumber + i}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium" style={{ color: "var(--color-ink)" }}>
                        {file.name}
                      </span>
                      <span className="shrink-0 tabular-nums" style={{ color: "var(--color-ink-muted)" }}>
                        {(file.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                      <button
                        onClick={() => setBatchFiles(batchFiles.filter((_, idx) => idx !== i))}
                        disabled={batchUploading}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)] disabled:opacity-30"
                        style={{ color: "var(--color-ink-muted)" }}
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                {/* Hint */}
                <div className="border-t px-3 py-1.5 text-[10px]" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
                  Drag to reorder · Click ✕ to remove
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Naming pattern + start number */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
              Step 2 — Naming pattern
            </label>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div>
                <input
                  type="text"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="e.g. Seerah of the Prophet Episode"
                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
                  disabled={batchUploading}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[11px] font-medium whitespace-nowrap" style={{ color: "var(--color-ink-muted)" }}>Start from</label>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={batchStartNumber}
                  onChange={(e) => setBatchStartNumber(Math.max(0, parseInt(e.target.value) || 1))}
                  className="w-16 rounded-xl border px-2 py-2.5 text-center text-sm font-semibold tabular-nums outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
                  disabled={batchUploading}
                />
              </div>
            </div>
            <div className="mt-2 rounded-lg px-3 py-2 text-[11px]" style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-muted)" }}>
              {batchFiles.length > 0 ? (
                <>Files will be named: <strong style={{ color: "var(--color-ink)" }}>{batchName.trim() || "Pattern"} {batchStartNumber}</strong>, <strong style={{ color: "var(--color-ink)" }}>{batchName.trim() || "Pattern"} {batchStartNumber + 1}</strong>, <strong style={{ color: "var(--color-ink)" }}>{batchName.trim() || "Pattern"} {batchStartNumber + 2}</strong>… <span style={{ color: "var(--color-ink-muted)" }}>({batchFiles.length} total, ending at #{batchStartNumber + batchFiles.length - 1})</span></>
              ) : (
                <>Files will be named: <strong style={{ color: "var(--color-ink)" }}>{batchName.trim() || "Pattern"} {batchStartNumber}</strong>, <strong style={{ color: "var(--color-ink)" }}>{batchName.trim() || "Pattern"} {batchStartNumber + 1}</strong>, <strong style={{ color: "var(--color-ink)" }}>{batchName.trim() || "Pattern"} {batchStartNumber + 2}</strong>…</>
              )}
            </div>
          </div>

          {/* Step 3: Speaker + folder */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
              Step 3 — Details (optional)
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>
                Speaker (optional)
              </label>
              <input
                type="text"
                value={batchSpeaker}
                onChange={(e) => setBatchSpeaker(e.target.value)}
                placeholder="e.g. Sh. Hamza Yusuf"
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
                disabled={batchUploading}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>
                Folder (optional)
              </label>
              <select
                value={batchFolderId || ""}
                onChange={(e) => setBatchFolderId(e.target.value || null)}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)", color: "var(--color-ink)" }}
                disabled={batchUploading}
              >
                <option value="">No folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>
          </div>

          {/* Progress */}
          {batchProgress && (
            <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
              {/* Batch indicator */}
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 items-center rounded-full px-2.5 text-[11px] font-bold" style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}>
                    Batch {batchProgress.batchNumber}/{batchProgress.totalBatches}
                  </span>
                  <span className="text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>
                    {batchProgress.phase}
                  </span>
                </div>
                <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--color-ink)" }}>
                  {batchProgress.current}/{batchProgress.total}
                </span>
              </div>
              {/* Overall progress bar */}
              <div className="h-2 w-full rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: `${batchProgress.total > 0 ? (batchProgress.current / batchProgress.total) * 100 : 0}%`,
                  backgroundColor: "var(--color-accent)",
                }} />
              </div>
              {/* Batch detail */}
              {batchProgress.processing > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>{batchProgress.processing} file{batchProgress.processing !== 1 ? "s" : ""} compressing…</span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={startBatchUpload}
              disabled={batchUploading || batchFiles.length === 0 || !batchName.trim()}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
            >
              {batchUploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {batchUploading ? "Working…" : `Process ${batchFiles.length || ""} File${batchFiles.length !== 1 ? "s" : ""}${batchFiles.length > 10 ? ` (10 at a time)` : ""}`}
            </button>
            <button
              type="button"
              onClick={() => { setActiveForm(null); setBatchFiles([]); setBatchName(""); setBatchStartNumber(1); setBatchProgress(null); }}
              disabled={batchUploading}
              className="rounded-xl border px-4 py-2.5 text-sm disabled:opacity-50"
              style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)", minHeight: 44 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Folder edit form */}
      {editingFolder && (
        <form
          onSubmit={saveFolderEdit}
          className="flex flex-col gap-5 rounded-2xl border p-6"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", boxShadow: "0 4px 24px -8px color-mix(in oklab, var(--color-ink) 12%, transparent)" }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: "color-mix(in oklab, var(--color-accent) 10%, transparent)" }}>
                <Pencil className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
              </div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Edit Folder</h2>
            </div>
            <button
              type="button"
              onClick={() => setEditingFolder(null)}
              className="rounded-lg p-1.5 transition-colors hover:bg-[var(--color-paper-2)]"
              style={{ color: "var(--color-ink-muted)" }}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Name */}
          <Field label="Folder name" value={editFolderName} onChange={setEditFolderName} placeholder="Folder name" />

          {/* Description */}
          <Field
            label="Description"
            value={editFolderDesc}
            onChange={setEditFolderDesc}
            placeholder="What series is this?"
            textarea
          />

          {/* Optional section */}
          <div className="flex flex-col gap-3 rounded-xl border p-4" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper-2)" }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-ink-muted)" }}>Optional</span>

            {/* Speaker */}
            <Field label="Default speaker" value={editFolderSpeaker} onChange={setEditFolderSpeaker} placeholder="e.g. Sh. Hamza Yusuf" />
            <p className="-mt-1 text-[11px] leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              Talks uploaded to this folder with no speaker will inherit this name.
            </p>

            {/* Dates — compact, side by side */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--color-ink-soft)" }}>Start</label>
                <input
                  type="date"
                  value={editFolderStart}
                  onChange={(e) => setEditFolderStart(e.target.value)}
                  className="w-full rounded-lg border px-2.5 py-2 text-xs outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", minHeight: 36 }}
                  disabled={savingFolder}
                />
              </div>
              <span className="pb-2.5 text-xs" style={{ color: "var(--color-ink-muted)" }}>→</span>
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-medium" style={{ color: "var(--color-ink-soft)" }}>End</label>
                <input
                  type="date"
                  value={editFolderEnd}
                  onChange={(e) => setEditFolderEnd(e.target.value)}
                  className="w-full rounded-lg border px-2.5 py-2 text-xs outline-none"
                  style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", minHeight: 36 }}
                  disabled={savingFolder}
                />
              </div>
            </div>

            {/* Image upload — clickable button */}
            <div>
              <label className="mb-1.5 block text-[11px] font-medium" style={{ color: "var(--color-ink-soft)" }}>Folder image</label>
              <label
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors hover:border-[var(--color-accent)]"
                style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-soft)", minHeight: 40 }}
              >
                <ImageIcon className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
                {editFolderImage ? (
                  <span style={{ color: "var(--color-ink)" }}>{editFolderImage.name} ({(editFolderImage.size / 1024).toFixed(0)} KB)</span>
                ) : editFolderImageKey ? (
                  <span style={{ color: "var(--color-success)" }}>Image set — click to replace</span>
                ) : (
                  <span>Click to upload an image</span>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => setEditFolderImage(e.target.files?.[0] || null)}
                  className="hidden"
                  disabled={savingFolder}
                />
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={savingFolder || !editFolderName.trim()}
              className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-transform active:scale-95 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44, boxShadow: "0 2px 8px color-mix(in oklab, var(--color-ink) 20%, transparent)" }}
            >
              {savingFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {savingFolder ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditingFolder(null)}
              disabled={savingFolder}
              className="rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
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
          {folders.map((folder) => {
            const isCollapsed = collapsedFolders.has(folder.id);
            const folderTalks = talksInFolder(folder.id);
            return (
            <div
              key={folder.id}
              className="overflow-hidden rounded-2xl border"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
            >
              <div
                className="flex items-center justify-between border-b px-5 py-3.5"
                style={{ borderColor: isCollapsed ? "transparent" : "var(--color-paper-3)" }}
              >
                <button
                  onClick={() => setCollapsedFolders((prev) => {
                    const next = new Set(prev);
                    if (next.has(folder.id)) next.delete(folder.id);
                    else next.add(folder.id);
                    return next;
                  })}
                  className="flex min-w-0 items-center gap-2 transition-colors hover:opacity-80"
                  aria-label={isCollapsed ? "Expand folder" : "Collapse folder"}
                  aria-expanded={!isCollapsed}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
                  )}
                  <Folder className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
                  <span className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                    {folder.name}
                  </span>
                  <span className="shrink-0 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    {folderTalks.length} talk{folderTalks.length !== 1 ? "s" : ""}
                  </span>
                </button>
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
              {!isCollapsed && (
                <>
                  {folder.description && (
                    <p className="px-5 py-2 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                      {folder.description}
                    </p>
                  )}
                  <div className="divide-y" style={{ borderColor: "var(--color-paper-3)" }}>
                    {folderTalks.map((talk) => (
                      <TalkRow
                        key={talk.id}
                        talk={talk}
                        onDelete={deleteTalk}
                        onPublish={publishTalk}
                        onRetry={retryProcessing}
                        onProcess={processTalk}
                      />
                    ))}
                    {folderTalks.length === 0 && (
                      <p className="px-5 py-3 text-xs" style={{ color: "var(--color-ink-muted)" }}>
                        No talks in this folder yet.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
            );
          })}

          {talksInFolder(null).length > 0 && (() => {
            const isCollapsed = collapsedFolders.has("__uncategorized");
            const uncategorizedTalks = talksInFolder(null);
            return (
            <div
              className="overflow-hidden rounded-2xl border"
              style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
            >
              <div
                className="border-b px-5 py-3.5"
                style={{ borderColor: isCollapsed ? "transparent" : "var(--color-paper-3)" }}
              >
                <button
                  onClick={() => setCollapsedFolders((prev) => {
                    const next = new Set(prev);
                    if (next.has("__uncategorized")) next.delete("__uncategorized");
                    else next.add("__uncategorized");
                    return next;
                  })}
                  className="flex min-w-0 items-center gap-2 transition-colors hover:opacity-80"
                  aria-label={isCollapsed ? "Expand uncategorized" : "Collapse uncategorized"}
                  aria-expanded={!isCollapsed}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
                  )}
                  <span className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                    Uncategorized
                  </span>
                  <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                    {uncategorizedTalks.length} talk{uncategorizedTalks.length !== 1 ? "s" : ""}
                  </span>
                </button>
              </div>
              {!isCollapsed && (
                <div className="divide-y" style={{ borderColor: "var(--color-paper-3)" }}>
                  {uncategorizedTalks.map((talk) => (
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
              )}
            </div>
            );
          })()}
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
  const { play } = useAudioPlayer();
  const status = talk.processingStatus;
  const statusCfg = STATUS_CONFIG[status] || {
    label: status,
    color: "var(--color-ink-muted)",
    icon: AlertCircle,
  };
  const StatusIcon = statusCfg.icon;

  const canPlay = (status === "ready" || status === "published") &&
    (talk.processedStorageKey || talk.storageKey || talk.externalUrl);

  const handlePlay = () => {
    const track: PlayerTrack = {
      id: talk.id,
      title: talk.title,
      speaker: talk.speaker,
      description: talk.description,
      streamUrl: talk.processedStorageKey || talk.storageKey ? `/api/talks?stream=${talk.id}` : null,
      externalUrl: talk.externalUrl,
      fileSize: talk.fileSize,
      duration: talk.duration,
      folderId: talk.folderId,
    };
    play(track);
  };
  const isProcessing = status === "processing";
  const isPending = status === "pending";

  // Estimate compression time from audio duration and file size.
  //
  // Our filter chain is 10 stages: highpass, lowpass, silenceremove, afftdn,
  // deesser, 2× equalizer, acompressor, dynaudnorm, alimiter → Opus encode
  // at compression_level 5. On Vercel serverless (shared vCPU, no GPU):
  //
  //   - Simple transcode (no filters): ~20-30x realtime
  //   - afftdn (FFT denoise): adds ~30-50% processing time
  //   - dynaudnorm (frame-by-frame gain): adds ~20-30%
  //   - acompressor + deesser + alimiter: adds ~10-15%
  //   - compression_level 5 (vs 0): adds ~15-20%
  //   - Shared vCPU contention: multiply by ~1.5-2x
  //
  // Net: ~5-8x realtime on Vercel. We use 6x as a conservative estimate.
  // Files >100MB skip compression (Hobby plan 300s limit).
  function estimateProcessingTime(): string {
    const mb = (talk.fileSize ?? 0) / (1024 * 1024);
    if (mb > 100) return "no compression (too large)";

    // If we have the actual audio duration (from probe), use it directly
    if (talk.duration && talk.duration > 0) {
      const processingSeconds = Math.ceil(talk.duration / 6); // 6x realtime
      if (processingSeconds < 60) return `~${processingSeconds}s`;
      const mins = Math.floor(processingSeconds / 60);
      const secs = processingSeconds % 60;
      return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
    }

    // No duration available — estimate from file size
    // MP3 at 128kbps (common) = ~1 MB/min, at 192kbps = ~1.5 MB/min
    // Use 1.2 MB/min as a middle estimate for typical sermon recordings
    if (!talk.fileSize) return "~1-3 min";
    const audioMinutes = mb / 1.2;
    const processingSeconds = Math.ceil((audioMinutes * 60) / 6);
    if (processingSeconds < 60) return `~${processingSeconds}s`;
    const mins = Math.floor(processingSeconds / 60);
    const secs = processingSeconds % 60;
    return secs > 0 ? `~${mins}m ${secs}s` : `~${mins}m`;
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
          {talk.externalUrl ? " · external link" : " · audio"}
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
        {canPlay && (
          <button
            onClick={handlePlay}
            className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-accent)", minHeight: 36, minWidth: 36 }}
            aria-label={`Play ${talk.title}`}
          >
            <Play className="h-3.5 w-3.5 translate-x-0.5" />
          </button>
        )}
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
