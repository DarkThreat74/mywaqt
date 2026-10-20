"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, Upload, Trash2, AlertCircle, CheckCircle2,
  Loader2, FileAudio, Play, Pause, Globe, GlobeLock, Pencil,
} from "lucide-react";

interface AdminClip {
  id: string;
  title: string;
  reciter: string | null;
  passage: string | null;
  style: string | null;
  fileSize: number | null;
  duration: number | null;
  processingStatus: string;
  processingError: string | null;
  addedAt: string;
  publishedAt: string | null;
  canRetryProcessing: boolean;
  analysis: { words?: unknown[]; madds?: unknown[]; passage?: { surah: number; ayah: number; ayahEnd: number } } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = {
  pending: { label: "Pending", color: "var(--color-ink-muted)", icon: FileAudio },
  processing: { label: "Processing", color: "var(--color-accent)", icon: Loader2 },
  ready: { label: "Ready", color: "var(--color-success)", icon: CheckCircle2 },
  published: { label: "Live in app", color: "var(--color-success)", icon: Globe },
  failed: { label: "Failed", color: "var(--color-error)", icon: AlertCircle },
};

const INPUT = "w-full rounded-lg border px-2.5 py-2 text-xs outline-none";
const INPUT_STYLE = { borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)", minHeight: 36 } as const;

export function AdminRecite() {
  const [clips, setClips] = useState<AdminClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({ title: "", reciter: "", passage: "", style: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (): Promise<AdminClip[] | null> => {
    try {
      const res = await fetch("/api/admin/recite-clips");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load clips.");
      const list = Array.isArray(data.clips) ? (data.clips as AdminClip[]) : [];
      setClips(list);
      setError(null);
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clips.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { Promise.resolve().then(() => void load()); }, [load]);

  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    audioRef.current?.pause();
  }, []);

  function pollUntilDone(clipId: string, tries = 0) {
    if (tries >= 60) return;
    pollRef.current = setTimeout(async () => {
      const list = await load();
      const c = list?.find((x) => x.id === clipId);
      if (!c || ["ready", "failed", "published"].includes(c.processingStatus)) return;
      pollUntilDone(clipId, tries + 1);
    }, 4000);
  }

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/recite-clips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  async function cleanupUpload(storageKey: string) {
    await post({ action: "delete-upload", storageKey }).catch(() => null);
  }

  function pickFile(f: File) {
    setFile(f);
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) { setError("Choose an audio file first."); return; }
    if (!/\.(mp3|m4a|aac|wav|ogg|opus|flac|wma)$/i.test(file.name)) {
      setError("Choose an audio file (mp3, m4a, aac, wav, ogg, opus, flac).");
      return;
    }
    if (file.size > 40 * 1024 * 1024) { setError("Clips must be 40 MB or smaller."); return; }

    setUploading(true);
    let uploadedKey: string | null = null;
    try {
      setProgress("Getting upload URL…");
      const { uploadUrl, storageKey, contentType } = (await post({
        action: "get-upload-url",
        filename: file.name,
        fileSize: file.size,
        reciter: caption || undefined,
      })) as { uploadUrl: string; storageKey: string; contentType: string };

      setProgress(`Uploading ${file.name}…`);
      setUploadPct(0);
      // XHR (not fetch) so upload progress events fire.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status}).`)));
        xhr.onerror = () => reject(new Error("Upload failed — the browser couldn't reach storage (check connection/ad-blocker)."));
        xhr.send(file);
      });
      setUploadPct(null);
      uploadedKey = storageKey;

      setProgress("Saving clip…");
      const clip = await post({
        action: "create-clip",
        reciter: caption || undefined, storageKey, fileSize: file.size,
      });

      setProgress("Filtering + encoding…");
      await fetch("/api/admin/recite-clips/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipId: clip.id }),
      }).catch(() => null);

      setCaption(""); setFile(null);
      uploadedKey = null; // clip row owns the key now
      await load();
      pollUntilDone(clip.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      if (uploadedKey) await cleanupUpload(uploadedKey);
    } finally {
      setUploading(false);
      setProgress("");
      setUploadPct(null);
    }
  }

  async function publish(clipId: string) {
    setError(null);
    try { await post({ action: "publish-clip", clipId }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Publish failed."); }
  }

  async function unpublish(clipId: string) {
    setError(null);
    try { await post({ action: "unpublish-clip", clipId }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unpublish failed."); }
  }

  function startEdit(c: AdminClip) {
    setEditingId(c.id);
    setEditFields({
      title: c.title,
      reciter: c.reciter ?? "",
      passage: c.passage ?? "",
      style: c.style ?? "",
    });
  }

  async function saveEdit(clipId: string) {
    setError(null);
    setSavingEdit(true);
    try {
      await post({
        action: "update-clip", clipId,
        title: editFields.title, reciter: editFields.reciter,
        passage: editFields.passage, style: editFields.style,
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function remove(clipId: string) {
    setError(null);
    try { await post({ action: "delete-clip", clipId }); setConfirmDelete(null); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Delete failed."); }
  }

  async function reprocess(clip: AdminClip) {
    setError(null);
    try {
      if (clip.processingStatus === "processing") await post({ action: "force-reprocess", clipId: clip.id });
      if (clip.processingStatus === "failed") await post({ action: "retry-processing", clipId: clip.id });
      await fetch("/api/admin/recite-clips/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipId: clip.id }),
      });
      await load();
      pollUntilDone(clip.id);
    } catch (err) { setError(err instanceof Error ? err.message : "Reprocess failed."); }
  }

  function togglePlay(clipId: string) {
    if (playingId === clipId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    const el = audioRef.current ?? (audioRef.current = new Audio());
    el.src = `/api/recite-clips?stream=${clipId}`;
    el.onended = () => setPlayingId(null);
    void el.play().catch(() => setPlayingId(null));
    setPlayingId(clipId);
  }

  function fmtDur(s: number | null) {
    if (!s) return "—";
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  return (
    <div className="space-y-4">
      {/* Upload form */}
      <form
        onSubmit={(e) => void upload(e)}
        className="rounded-2xl border p-4"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="mb-3 flex items-center gap-2">
          <Upload className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>New reference clip</h2>
        </div>
        <input
          placeholder="Caption (e.g. by Ibby Idrees · most rhyming verse in the Quran)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className={INPUT}
          style={INPUT_STYLE}
        />
        <label
          className="mt-2 flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors hover:border-[var(--color-accent)]"
          style={{
            borderColor: dragOver ? "var(--color-accent)" : "var(--color-paper-3)",
            borderStyle: dragOver ? "solid" : "dashed",
            color: "var(--color-ink-soft)",
            minHeight: 40,
            backgroundColor: dragOver ? "var(--color-paper-2)" : undefined,
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) pickFile(f);
          }}
        >
          <FileAudio className="h-4 w-4 shrink-0" style={{ color: "var(--color-ink-muted)" }} />
          {file ? <span style={{ color: "var(--color-ink)" }}>{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</span> : <span>Drop an audio file or click to choose — mp3, m4a, wav, opus… (≤40 MB)</span>}
          <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }} disabled={uploading} />
        </label>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={uploading || !file}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-transform active:scale-95 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)", minHeight: 44 }}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "Working…" : "Upload + process"}
          </button>
          {progress && <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>{progress}</span>}
        </div>
        {uploadPct !== null && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${uploadPct}%`, backgroundColor: "var(--color-accent)" }} />
          </div>
        )}
        <p className="mt-2 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
          Filtered + encoded like talks. The surah, passage and style are detected automatically and become the title — everything stays editable afterwards. Needs a publish tap to appear in the app.
        </p>
      </form>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs" style={{ borderColor: "var(--color-error)", color: "var(--color-error)" }}>
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Clips ({clips.length})</h2>
        <button onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>Loading…</p>
      ) : clips.length === 0 ? (
        <p className="rounded-2xl border p-8 text-center text-xs" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
          No clips yet — upload a recitation above and it will show up in the Recite Coach library once published.
        </p>
      ) : (
        <div className="space-y-2">
          {clips.map((c) => {
            const st = STATUS_CONFIG[c.processingStatus] ?? STATUS_CONFIG.pending;
            const Icon = st.icon;
            return (
              <div key={c.id} className="rounded-xl border p-3" style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium" style={{ color: "var(--color-ink)" }}>{c.title}</p>
                      <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ color: st.color, backgroundColor: "var(--color-paper-2)" }}>
                        <Icon className={`h-3 w-3 ${c.processingStatus === "processing" ? "animate-spin" : ""}`} />
                        {st.label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                      {[c.reciter, c.passage, c.style, fmtDur(c.duration)].filter(Boolean).join(" · ")}
                      {c.analysis?.words && (
                        <span style={{ color: "var(--color-success)" }}> · {c.analysis.words.length} words analyzed</span>
                      )}
                    </p>
                    {c.processingError && (
                      <p className="mt-1 text-[11px]" style={{ color: "var(--color-error)" }}>{c.processingError}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => (editingId === c.id ? setEditingId(null) : startEdit(c))} className="flex h-8 w-8 items-center justify-center rounded-lg border" style={{ borderColor: "var(--color-paper-3)", color: editingId === c.id ? "var(--color-accent)" : "var(--color-ink-muted)" }} aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {(c.processingStatus === "ready" || c.processingStatus === "published") && (
                      <button onClick={() => togglePlay(c.id)} className="flex h-8 w-8 items-center justify-center rounded-lg border" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-accent)" }} aria-label="Preview">
                        {playingId === c.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {c.processingStatus === "ready" && (
                      <button onClick={() => void publish(c.id)} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium" style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}>
                        <Globe className="h-3 w-3" /> Publish
                      </button>
                    )}
                    {c.processingStatus === "published" && (
                      <button onClick={() => void unpublish(c.id)} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px]" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
                        <GlobeLock className="h-3 w-3" /> Unpublish
                      </button>
                    )}
                    {(c.processingStatus === "failed" || c.canRetryProcessing) && (
                      <button onClick={() => void reprocess(c)} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px]" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
                        <RefreshCw className="h-3 w-3" /> {c.processingStatus === "processing" ? "Restart" : "Retry"}
                      </button>
                    )}
                    {confirmDelete === c.id ? (
                      <>
                        <button onClick={() => void remove(c.id)} className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium" style={{ backgroundColor: "var(--color-error)", color: "var(--color-paper)" }}>Confirm</button>
                        <button onClick={() => setConfirmDelete(null)} className="rounded-lg border px-2.5 py-1.5 text-[11px]" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>Keep</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDelete(c.id)} className="flex h-8 w-8 items-center justify-center rounded-lg border" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-error)" }} aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {editingId === c.id && (
                  <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: "var(--color-paper-3)" }}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input placeholder="Title (auto-named from the detected passage)" value={editFields.title} onChange={(e) => setEditFields((f) => ({ ...f, title: e.target.value }))} className={INPUT} style={INPUT_STYLE} />
                      <input placeholder="Caption" value={editFields.reciter} onChange={(e) => setEditFields((f) => ({ ...f, reciter: e.target.value }))} className={INPUT} style={INPUT_STYLE} />
                      <input placeholder="Passage (e.g. 33:35)" value={editFields.passage} onChange={(e) => setEditFields((f) => ({ ...f, passage: e.target.value }))} className={INPUT} style={INPUT_STYLE} />
                      <input placeholder="Style (murattal / mujawwad / muʿallim)" value={editFields.style} onChange={(e) => setEditFields((f) => ({ ...f, style: e.target.value }))} className={INPUT} style={INPUT_STYLE} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void saveEdit(c.id)}
                        disabled={savingEdit || !editFields.title.trim()}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium disabled:opacity-50"
                        style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
                      >
                        {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="rounded-lg border px-3 py-1.5 text-[11px]" style={{ borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
