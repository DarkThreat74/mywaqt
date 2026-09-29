"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type PickerFriend = { id: string; name: string; avatarUrl?: string | null };

function FriendAvatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  const px = { width: size, height: size };
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- data-URL avatar
    <img src={url} alt="" className="shrink-0 rounded-full object-cover" style={px} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: "var(--color-accent)", ...px }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Custom opponent dropdown — matches the paper/ink design language instead of
 * the OS select chrome. Same a11y contract: button opens a listbox, escape or
 * outside-click closes, selection is announced via aria.
 */
export default function FriendPicker({ friends, value, onChange, id }: {
  friends: PickerFriend[];
  value: string;
  onChange: (id: string) => void;
  id: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = friends.find((f) => f.id === value);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative mt-1">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--color-paper-2)]"
        style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)", color: "var(--color-ink)" }}
      >
        {selected ? (
          <>
            <FriendAvatar name={selected.name} url={selected.avatarUrl} size={24} />
            <span className="min-w-0 flex-1 truncate font-medium">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1" style={{ color: "var(--color-ink-muted)" }}>Choose a friend…</span>
        )}
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform" style={{ color: "var(--color-ink-muted)", transform: open ? "rotate(180deg)" : undefined }} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-labelledby={id}
          className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border py-1 shadow-xl"
          style={{ borderColor: "var(--color-paper-3)", backgroundColor: "var(--color-paper)" }}
        >
          {friends.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                role="option"
                aria-selected={f.id === value}
                onClick={() => { onChange(f.id); setOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--color-paper-2)]"
                style={{ color: "var(--color-ink)", backgroundColor: f.id === value ? "var(--color-paper-2)" : undefined }}
              >
                <FriendAvatar name={f.name} url={f.avatarUrl} size={24} />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
