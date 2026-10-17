"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, LayoutGrid, Check } from "lucide-react";
import { useHiddenTabs, refreshNavPrefs } from "@/lib/nav-prefs";
import { useInbox } from "@/lib/inbox";
import { APP_BY_KEY, StoreArt } from "@/lib/app-registry";
import { loadLayout, saveLayout, type LayoutItem } from "@/lib/app-layout";

/**
 * My apps — a homescreen drawer. Full-screen slide-up, icon grid with a
 * pinned Store tile. Long-press any icon → edit mode: icons jiggle, ×
 * hides an app (back to the store), drag reorders, dropping an app on an
 * app or folder creates/merges a folder. Folder names editable.
 */

// Tell the SW to drop a hidden app's cached pages so it frees space.
function evictRoute(href: string) {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "EVICT_ROUTES", urls: [href] });
  } catch { /* ignore */ }
}

const GRID = "grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-6";

export default function ToolsMenu({ variant = "icon" }: { variant?: "icon" | "sidebar" }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [folderOpen, setFolderOpen] = useState<string | null>(null); // folder id
  const hiddenTabs = useHiddenTabs();
  const inbox = useInbox();
  const router = useRouter();

  const installedKeys = [...APP_BY_KEY.keys()].filter((k) => !hiddenTabs.has(k));
  const [items, setItems] = useState<LayoutItem[]>([]);
  const itemsRef = useRef(items);

  // Rebuild the grid when installs change; sanitize through loadLayout.
  const [prevSig, setPrevSig] = useState<string | null>(null);
  const sig = installedKeys.join(",");
  if (prevSig !== sig) {
    setPrevSig(sig);
    setItems(loadLayout(installedKeys)); // ref syncs via the [items] effect
  }

  // ── Homescreen drag engine refs/state ──────────────────────────────
  // Pointer-based so touch works. Long-press (450ms) enters edit mode;
  // in edit mode a drag >10px starts moving the tile. Dwell 350ms over
  // another tile = merge target (folder). Everything else = reorder.
  const gridRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    item: LayoutItem;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
    mergeItem: LayoutItem | null;
    mergeTimer: ReturnType<typeof setTimeout> | null;
    dropIdx: number; // last hovered items[] slot — reorder target on drop
  } | null>(null);
  const [mergeId, setMergeId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragItem, setDragItem] = useState<LayoutItem | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pressId, setPressId] = useState<string | null>(null); // tile held down — lifted look
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const editingRef = useRef(editing);

  const itemId = (it: LayoutItem) => it.type === "app" ? `a:${it.key}` : `f:${it.id}`;

  function pointerTargetIdx(x: number, y: number): number {
    const kids = gridRef.current ? [...gridRef.current.children] : [];
    // DOM index 0 is the pinned Store link — items[] starts at DOM 1.
    // Inside a tile's rect → that tile (deterministic: no oscillation
    // between neighbors while dwelling). In a gap → nearest center.
    let best = -1, bestD = Infinity;
    for (let i = 1; i < kids.length; i++) {
      const r = kids[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i - 1;
      const d = (r.left + r.width / 2 - x) ** 2 + (r.top + r.height / 2 - y) ** 2;
      if (d < bestD) { bestD = d; best = i - 1; }
    }
    return best;
  }

  function setMerge(d: NonNullable<typeof drag.current>, item: LayoutItem | null) {
    if (d.mergeTimer) clearTimeout(d.mergeTimer);
    if (!item) { d.mergeItem = null; setMergeId(null); return; }
    d.mergeItem = item;
    d.mergeTimer = setTimeout(() => setMergeId(itemId(item)), 250);
  }

  function dismiss() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
    drag.current = null;
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); setEditing(false); setFolderOpen(null); }, 220);
  }

  function onTilePointerDown(e: React.PointerEvent, item: LayoutItem) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pressTimer.current = setTimeout(() => {
      suppressClick.current = true;
      setEditing(true);
      setPressId(itemId(item)); // the held icon lifts as jiggle begins
      navigator.vibrate?.(10);
    }, 450);
    // Already jiggling? The icon lifts under the finger immediately.
    if (editingRef.current) setPressId(itemId(item));
    drag.current = { item, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false, mergeItem: null, mergeTimer: null, dropIdx: -1 };
  }

  function commit(next: LayoutItem[]) {
    // A folder holding one app dissolves back into a tile.
    const norm = next.flatMap((i): LayoutItem[] =>
      i.type === "folder" && i.keys.length === 1 ? [{ type: "app", key: i.keys[0] }] : [i]
    ).filter((i) => i.type !== "folder" || i.keys.length > 0);
    itemsRef.current = norm;
    setItems(norm);
    saveLayout(norm);
  }

  async function hideApp(key: string) {
    const app = APP_BY_KEY.get(key);
    if (!app) return;
    const next = new Set(hiddenTabs);
    next.add(key);
    await fetch("/api/settings/tabs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hiddenTabs: [...next] }),
    }).then((r) => { if (r.ok) refreshNavPrefs(); }).catch(() => {});
    evictRoute(app.href);
  }

  function tileClick(item: LayoutItem) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    // Folders open in edit mode too — that's where the rename input lives.
    if (item.type === "folder") { setFolderOpen(item.id); return; }
    if (editing) return;
    const app = APP_BY_KEY.get(item.key);
    if (app) { setOpen(false); router.push(app.href); }
  }

  function iconTile(appKey: string | "store", size: number) {
    const isStore = appKey === "store";
    const Art = isStore ? StoreArt : APP_BY_KEY.get(appKey)?.art;
    if (!Art) return null;
    return (
      <span
        className="relative block shrink-0 rounded-2xl"
        style={{
          width: size, height: size, padding: Math.round(size * 0.18),
          backgroundColor: "var(--color-paper-2)",
          border: "1px solid var(--color-paper-3)",
          color: isStore ? "var(--color-accent)" : "var(--color-ink-soft)",
        }}
      >
        <Art />
        {appKey === "messages" && (inbox.unreadMessages ?? 0) > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[8px] font-bold"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-paper)" }}
          >
            {(inbox.unreadMessages ?? 0) > 99 ? "99+" : inbox.unreadMessages}
          </span>
        )}
      </span>
    );
  }

  // ── Effects (declared last: they reference the helpers above) ──────

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { editingRef.current = editing; }, [editing]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
     
  }, [open]);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-tools-menu", handler);
    return () => window.removeEventListener("open-tools-menu", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [open]);

  // Leaving edit mode mid-gesture must end any drag too — ref in the
  // effect, state via the render-adjust pattern (no sync setState).
  useEffect(() => {
    if (!editing) drag.current = null;
  }, [editing]);
  const [wasEditing, setWasEditing] = useState(editing);
  if (wasEditing !== editing) {
    setWasEditing(editing);
    if (!editing) {
      setDragPos(null);
      setDragItem(null);
      setHoverId(null);
      setMergeId(null);
      setPressId(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      if (dist > 10 && pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
      if (!editingRef.current) return; // not in edit mode yet — just cancelling the long-press
      if (!d.active && dist > 8) { d.active = true; setDragItem(d.item); }
      if (!d.active) return;
      setDragPos({ x: e.clientX, y: e.clientY });
      const tgt = pointerTargetIdx(e.clientX, e.clientY);
      const tgtItem = tgt >= 0 ? itemsRef.current[tgt] : null;
      setHoverId(tgtItem && tgtItem !== d.item ? itemId(tgtItem) : null);
      if (!tgtItem || tgtItem === d.item) { setMerge(d, null); d.dropIdx = -1; return; }

      d.dropIdx = tgt;
      // Dwell over a tile → merge candidate (folder create/add). Apps only.
      // No live reorder here — moving the dragged tile into the hovered
      // slot makes the next hit-test return the dragged item itself,
      // which instantly cancels the merge. Commit happens on drop.
      if (d.item.type === "app" && d.mergeItem !== tgtItem) setMerge(d, tgtItem);
      else if (d.item.type === "folder") setMerge(d, null);
    };
    const up = (e: PointerEvent) => {
      if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
      const d = drag.current;
      drag.current = null;
      if (!d || e.pointerId !== d.pointerId) return;
      if (d.mergeTimer) clearTimeout(d.mergeTimer);
      const merge = d.mergeItem;
      const dropIdx = d.dropIdx;
      setMergeId(null);
      setHoverId(null);
      setDragPos(null);
      setDragItem(null);
      setPressId(null);
      if (d.active && merge && merge !== d.item) {
        // Drop onto another item → folder.
        const prev = itemsRef.current;
        const from = prev.indexOf(d.item);
        const to = prev.indexOf(merge);
        if (from !== -1 && to !== -1) {
          const next = [...prev];
          const src = next[from];
          const dst = next[to];
          if (src.type === "app") {
            let changed = true;
            if (dst.type === "app") {
              next[to] = { type: "folder", id: `f${Date.now()}`, name: "Folder", keys: [dst.key, src.key] };
            } else if (!dst.keys.includes(src.key)) {
              next[to] = { ...dst, keys: [...dst.keys, src.key] };
            } else {
              changed = false;
            }
            if (changed) {
              next.splice(from, 1);
              itemsRef.current = next;
              setItems(next);
              saveLayout(next);
            }
          }
        }
      } else if (d.active && dropIdx >= 0) {
        // Reorder on drop — the ref is authoritative; saving before the
        // last setItems flush would silently lose the move.
        const prev = itemsRef.current;
        const from = prev.indexOf(d.item);
        if (from !== -1 && from !== dropIdx) {
          const next = [...prev];
          const [moved] = next.splice(from, 1);
          next.splice(dropIdx, 0, moved);
          itemsRef.current = next;
          setItems(next);
          saveLayout(next);
        }
      }
      // No unconditional save here — saving on a plain tap can persist a
      // transiently filtered/empty grid and wipe folders.
      setTimeout(() => { suppressClick.current = false; }, 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openFolder = items.find((i): i is Extract<LayoutItem, { type: "folder" }> => i.type === "folder" && i.id === folderOpen);

  let animIdx = 0;

  return (
    <>
      {/* Trigger button — variant controls appearance */}
      {variant === "sidebar" ? (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-soft)" }}
        >
          <LayoutGrid className="h-4 w-4" style={{ color: "var(--color-ink-muted)" }} />
          Apps
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-paper-2)]"
          style={{ color: "var(--color-ink-soft)", minHeight: 44, minWidth: 44 }}
          aria-label="Open apps"
        >
          <LayoutGrid className="h-[18px] w-[18px]" style={{ color: "var(--color-ink-soft)" }} />
        </button>
      )}

      {/* App drawer — portal to escape backdrop-filter containing blocks */}
      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100]"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-ink) 45%, transparent)",
            animation: closing ? "drawer-fade-out 0.22s ease-out forwards" : "drawer-fade-in 0.2s ease-out",
          }}
          onClick={dismiss}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="My apps"
            className="absolute inset-0 flex flex-col overflow-hidden"
            style={{
              backgroundColor: "var(--color-paper)",
              willChange: "transform",
              transform: "translateZ(0)",
              animation: closing
                ? "drawer-slide-down 0.24s ease-in forwards"
                : "drawer-slide-up 0.38s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5 sm:hidden">
              <div className="h-1 w-9 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} />
            </div>

            {/* Header */}
            <div
              className="flex items-center justify-between border-b px-4 pb-3 sm:px-6"
              style={{ borderColor: "var(--color-paper-3)", paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
            >
              <h2 className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
                My apps
              </h2>
              <div className="flex items-center gap-1">
                {editing && (
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold"
                    style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
                  >
                    <Check className="h-3.5 w-3.5" /> Done
                  </button>
                )}
                <button
                  onClick={dismiss}
                  className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
                  style={{ color: "var(--color-ink-muted)", minHeight: 44, minWidth: 44 }}
                  aria-label="Close apps"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Grid — pinned Store tile first, then the user's layout */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6">
              <div ref={gridRef} className={`${GRID} pt-6`} style={{ touchAction: dragItem ? "none" : "pan-y" }}>
                {/* Store — always pinned, first tile */}
                <Link
                  href="/store"
                  onClick={() => setOpen(false)}
                  className="group flex flex-col items-center gap-1.5"
                  style={{ animation: `drawer-app-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${0.12 + 0.025 * animIdx++}s both` }}
                >
                  <span className="transition-transform group-hover:-translate-y-0.5">{iconTile("store", 56)}</span>
                  <span className="max-w-full truncate text-[11px] font-medium" style={{ color: "var(--color-ink-soft)" }}>Store</span>
                </Link>

                {items.map((item) => {
                  const delay = `${0.12 + 0.025 * animIdx++}s`;
                  const hovered = hoverId === itemId(item);   // pointer is on it
                  const merging = mergeId === itemId(item);   // dwell elapsed — will merge
                  const lifted = dragItem === item;           // being dragged — ghost the slot
                  const pressed = pressId === itemId(item) && !lifted; // held — icon grows
                  if (item.type === "folder") {
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onPointerDown={(e) => onTilePointerDown(e, item)}
                        onClick={() => tileClick(item)}
                        className={`flex flex-col items-center gap-1.5 transition-transform duration-150 ${editing && !lifted && !pressed ? "drawer-jiggle" : ""} ${lifted ? "opacity-30" : ""}`}
                        style={{
                          animation: editing ? undefined : `drawer-app-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${delay} both`,
                          outline: hovered ? "2px solid var(--color-accent)" : "none",
                          outlineOffset: 2,
                          transform: merging ? "scale(1.12)" : pressed ? "scale(1.1)" : hovered ? "scale(1.05)" : undefined,
                          filter: pressed ? "drop-shadow(0 6px 10px color-mix(in oklab, var(--color-ink) 25%, transparent))" : undefined,
                          borderRadius: 16,
                        }}
                        aria-label={`${item.name} folder`}
                      >
                        <span
                          className="relative grid h-14 w-14 shrink-0 grid-cols-2 place-items-center gap-0.5 rounded-2xl p-2"
                          style={{ backgroundColor: "var(--color-paper-2)", border: "1px solid var(--color-paper-3)" }}
                        >
                          {item.keys.slice(0, 4).map((k) => {
                            const A = APP_BY_KEY.get(k)?.art;
                            return A ? <span key={k} className="h-4 w-4" style={{ color: "var(--color-ink-soft)" }}><A /></span> : null;
                          })}
                          {editing && (
                            <span
                              role="button"
                              aria-label={`Delete folder ${item.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                // Dissolve: apps return to the grid end.
                                commit([...items.filter((i) => i !== item), ...item.keys.map((k) => ({ type: "app" as const, key: k }))]);
                              }}
                              className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border"
                              style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                            >
                              <X className="h-3 w-3" />
                            </span>
                          )}
                        </span>
                        <span className="max-w-full truncate text-[11px] font-medium" style={{ color: "var(--color-ink-soft)" }}>
                          {item.name}
                        </span>
                      </button>
                    );
                  }
                  const app = APP_BY_KEY.get(item.key);
                  if (!app) return null;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onPointerDown={(e) => onTilePointerDown(e, item)}
                      onClick={() => tileClick(item)}
                      className={`flex flex-col items-center gap-1.5 transition-transform duration-150 ${editing && !lifted && !pressed ? "drawer-jiggle" : ""} ${lifted ? "opacity-30" : ""}`}
                      style={{
                        animation: editing ? undefined : `drawer-app-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${delay} both`,
                        outline: hovered ? "2px solid var(--color-accent)" : "none",
                        outlineOffset: 2,
                        transform: merging ? "scale(1.12)" : pressed ? "scale(1.1)" : hovered ? "scale(1.05)" : undefined,
                        filter: pressed ? "drop-shadow(0 6px 10px color-mix(in oklab, var(--color-ink) 25%, transparent))" : undefined,
                        borderRadius: 16,
                      }}
                      aria-label={app.label}
                    >
                      <span className="relative">
                        {iconTile(item.key, 56)}
                        {editing && (
                          <span
                            role="button"
                            aria-label={`Hide ${app.label}`}
                            onClick={(e) => { e.stopPropagation(); void hideApp(item.key); }}
                            className="absolute -left-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full border"
                            style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                          >
                            <X className="h-3 w-3" />
                          </span>
                        )}
                      </span>
                      <span className="max-w-full truncate text-[11px] font-medium" style={{ color: "var(--color-ink-soft)" }}>
                        {app.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {items.length === 0 && (
                <div className="flex flex-col items-center py-16 text-center">
                  <LayoutGrid className="mb-3 h-8 w-8" style={{ color: "var(--color-ink-muted)", opacity: 0.4 }} />
                  <p className="text-sm" style={{ color: "var(--color-ink-muted)" }}>No apps yet.</p>
                  <Link
                    href="/store"
                    onClick={() => setOpen(false)}
                    className="mt-3 rounded-full px-4 py-2 text-xs font-semibold"
                    style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
                  >
                    Open the store
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Lifted tile — follows the pointer while dragging */}
          {dragPos && dragItem && (
            <div
              className="pointer-events-none fixed z-[120]"
              style={{
                left: dragPos.x - 28,
                top: dragPos.y - 28,
                transform: "scale(1.08)",
                filter: "drop-shadow(0 8px 16px color-mix(in oklab, var(--color-ink) 30%, transparent))",
              }}
            >
              {dragItem.type === "app" ? (
                iconTile(dragItem.key, 56)
              ) : (
                <span
                  className="grid h-14 w-14 grid-cols-2 place-items-center gap-0.5 rounded-2xl p-2"
                  style={{ backgroundColor: "var(--color-paper-2)", border: "1px solid var(--color-paper-3)" }}
                >
                  {dragItem.keys.slice(0, 4).map((k) => {
                    const A = APP_BY_KEY.get(k)?.art;
                    return A ? <span key={k} className="h-4 w-4" style={{ color: "var(--color-ink-soft)" }}><A /></span> : null;
                  })}
                </span>
              )}
            </div>
          )}

          {/* Expanded folder — iOS-style panel above the grid */}
          {openFolder && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center p-6"
              style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 30%, transparent)" }}
              onClick={() => setFolderOpen(null)}
            >
              <div
                className="w-full max-w-xs rounded-3xl p-4"
                style={{ backgroundColor: "var(--color-paper-2)", border: "1px solid var(--color-paper-3)", animation: "drawer-app-in 0.2s ease-out" }}
                onClick={(e) => e.stopPropagation()}
              >
                {editing ? (
                  <input
                    value={openFolder.name}
                    onChange={(e) => commit(items.map((i) => i.type === "folder" && i.id === openFolder.id ? { ...i, name: e.target.value.slice(0, 24) || "Folder" } : i))}
                    className="mb-3 w-full rounded-lg bg-transparent px-2 py-1 text-center text-sm font-semibold outline-none"
                    style={{ color: "var(--color-ink)" }}
                    aria-label="Folder name"
                  />
                ) : (
                  <p className="mb-3 text-center text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{openFolder.name}</p>
                )}
                <div className="grid grid-cols-3 gap-3">
                  {openFolder.keys.map((k) => {
                    const app = APP_BY_KEY.get(k);
                    if (!app) return null;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          if (editing) {
                            // ×-style pull-out: remove from folder → grid end.
                            commit(items.map((i) => i.type === "folder" && i.id === openFolder.id ? { ...i, keys: i.keys.filter((x: string) => x !== k) } : i).concat({ type: "app", key: k }));
                          } else {
                            setFolderOpen(null);
                            setOpen(false);
                            router.push(app.href);
                          }
                        }}
                        className="relative flex flex-col items-center gap-1"
                        aria-label={editing ? `Remove ${app.label} from ${openFolder.name}` : app.label}
                      >
                        {iconTile(k, 48)}
                        <span className="max-w-full truncate text-[10px]" style={{ color: "var(--color-ink-soft)" }}>{app.label}</span>
                        {editing && (
                          <span className="absolute -left-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full border" style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-paper-3)", color: "var(--color-ink-muted)" }}>
                            <X className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}

      <style>{`
        @keyframes drawer-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes drawer-fade-out { from { opacity: 1; } to { opacity: 0; } }
        @keyframes drawer-slide-up {
          from { transform: translate3d(0, 100%, 0); }
          to { transform: translate3d(0, 0, 0); }
        }
        @keyframes drawer-slide-down {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(0, 100%, 0); }
        }
        @keyframes drawer-app-in {
          from { opacity: 0; transform: translateY(8px) scale(0.94); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes drawer-jiggle-kf {
          0%, 100% { transform: rotate(-1.2deg); }
          50% { transform: rotate(1.2deg); }
        }
        .drawer-jiggle {
          animation: drawer-jiggle-kf 0.18s ease-in-out infinite alternate !important;
        }
        .drawer-jiggle:nth-child(2n) { animation-direction: alternate-reverse !important; }
        /* Long-press must not summon iOS's callout / text selection. */
        [aria-label="My apps"] button, [aria-label="My apps"] button * {
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          user-select: none;
        }
      `}</style>
    </>
  );
}
