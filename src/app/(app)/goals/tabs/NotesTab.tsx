"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Plus, Trash2, Pin, BookText, X } from "lucide-react";
import type { Note } from "@/lib/db/schema";
import { invalidateApiCache } from "@/lib/sw-helpers";
import { upsertNoteToCache, deleteNoteFromCache } from "@/lib/offline/cache-writers";

function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NotesTab({
  notes,
  setNotes,
}: {
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
}) {
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNewNote, setShowNewNote] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [content, activeNoteId, showNewNote]);

  const startNewNote = () => {
    setShowNewNote(true);
    setActiveNoteId(null);
    setTitle("");
    setContent("");
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const handleSaveNew = async () => {
    if (!content.trim() && !title.trim()) {
      setShowNewNote(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || undefined, content: content.trim() }),
      });
      if (res.ok) {
        const newNote = await res.json();
        setNotes((prev) => [newNote, ...prev]);
        upsertNoteToCache(newNote);
        invalidateApiCache("/api/notes");
        setTitle("");
        setContent("");
        setShowNewNote(false);
      }
    } catch {
      // keep state
    } finally {
      setSaving(false);
    }
  };

  // Debounced auto-save for editing existing notes
  const handleAutoSave = useCallback(async (noteId: string, newTitle: string, newContent: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/notes/${noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle.trim() || undefined, content: newContent }),
        });
        if (res.ok) {
          const updated = await res.json();
          setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
          upsertNoteToCache(updated);
          invalidateApiCache("/api/notes");
        }
      } catch {
        // keep state
      }
    }, 800);
  }, [setNotes]);

  const openNote = (note: Note) => {
    setActiveNoteId(note.id);
    setTitle(note.title || "");
    setContent(note.content);
    setShowNewNote(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const closeNote = () => {
    // Save if editing an existing note
    if (activeNoteId) {
      handleAutoSave(activeNoteId, title, content);
    }
    setActiveNoteId(null);
    setTitle("");
    setContent("");
  };

  const handleTogglePin = async (note: Note) => {
    const updated = { ...note, pinned: !note.pinned, updatedAt: new Date() };
    setNotes((prev) => prev.map((n) => (n.id === note.id ? updated : n)));
    upsertNoteToCache(updated);
    try {
      await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !note.pinned }),
      });
      invalidateApiCache("/api/notes");
    } catch {
      // keep state
    }
  };

  const handleDelete = async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    deleteNoteFromCache(id);
    if (activeNoteId === id) {
      setActiveNoteId(null);
      setTitle("");
      setContent("");
    }
    try {
      await fetch(`/api/notes/${id}`, { method: "DELETE" });
      invalidateApiCache("/api/notes");
    } catch {
      // keep state
    }
  };

  const sortedNotes = [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const isWriting = showNewNote || activeNoteId !== null;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>Notes</h1>
          <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>
            {notes.length} note{notes.length !== 1 ? "s" : ""}
          </p>
        </div>
        {!isWriting && (
          <button
            onClick={startNewNote}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        )}
      </div>

      {/* ── Notepad (new note or editing existing) ── */}
      {isWriting && (
        <div
          className="flex flex-col gap-3 rounded-2xl border p-5 shadow-sm"
          style={{
            borderColor: "var(--color-paper-3)",
            backgroundColor: "var(--color-paper)",
            minHeight: "300px",
          }}
        >
          {/* Title input — larger, notepad-like */}
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (activeNoteId) handleAutoSave(activeNoteId, e.target.value, content);
            }}
            placeholder="Title..."
            className="border-none bg-transparent text-lg font-semibold outline-none"
            style={{ color: "var(--color-ink)" }}
          />

          {/* Divider line */}
          <div className="h-px" style={{ backgroundColor: "var(--color-paper-3)" }} />

          {/* Content textarea — auto-growing, notepad-like */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              if (activeNoteId) handleAutoSave(activeNoteId, title, e.target.value);
            }}
            placeholder="Start writing..."
            className="border-none bg-transparent text-sm leading-relaxed outline-none resize-none min-h-[200px]"
            style={{ color: "var(--color-ink-soft)" }}
          />

          {/* Action bar */}
          <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--color-paper-3)" }}>
            <span className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
              {activeNoteId ? "Auto-saving..." : saving ? "Saving..." : "New note"}
            </span>
            <div className="flex gap-2">
              {showNewNote && (
                <button
                  onClick={handleSaveNew}
                  disabled={saving || (!content.trim() && !title.trim())}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
                >
                  Save
                </button>
              )}
              <button
                onClick={closeNote}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{ color: "var(--color-ink-muted)" }}
              >
                <X className="h-3 w-3" />
                {showNewNote ? "Cancel" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Notes list (hidden when writing) ── */}
      {!isWriting && (
        sortedNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BookText className="h-10 w-10 mb-3" style={{ color: "var(--color-ink-muted)", opacity: 0.3 }} />
            <p className="text-sm font-medium" style={{ color: "var(--color-ink)" }}>Your notepad is empty</p>
            <p className="text-xs mt-1" style={{ color: "var(--color-ink-muted)" }}>
              Tap &ldquo;New&rdquo; to jot down a thought, idea, or reminder.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sortedNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => openNote(note)}
                className="group flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors hover:bg-[var(--color-paper-2)]"
                style={{
                  borderColor: note.pinned ? "var(--color-accent)" : "var(--color-paper-3)",
                  backgroundColor: note.pinned ? "color-mix(in oklab, var(--color-accent) 5%, var(--color-paper))" : "var(--color-paper)",
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {note.title && (
                      <p className="text-sm font-medium truncate" style={{ color: "var(--color-ink)" }}>{note.title}</p>
                    )}
                    {note.content && (
                      <p className="text-xs whitespace-pre-wrap line-clamp-3 mt-0.5" style={{ color: "var(--color-ink-soft)" }}>
                        {note.content}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); handleTogglePin(note); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleTogglePin(note); } }}
                      className="rounded p-1 transition-colors hover:bg-[var(--color-paper-3)] cursor-pointer"
                      style={{ color: note.pinned ? "var(--color-accent)" : "var(--color-ink-muted)" }}
                      title={note.pinned ? "Unpin" : "Pin"}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); handleDelete(note.id); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleDelete(note.id); } }}
                      className="rounded p-1 transition-colors hover:bg-[var(--color-paper-3)] cursor-pointer"
                      style={{ color: "var(--color-ink-muted)" }}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {note.pinned && <Pin className="h-3 w-3" style={{ color: "var(--color-accent)" }} />}
                  <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>{timeAgo(note.updatedAt)}</p>
                </div>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
