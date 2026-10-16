"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, X, Camera, Trash2, ContactRound } from "lucide-react";
import { friendScore, friendTier } from "@/lib/friends-score";

/**
 * Friends — your people, mapped. An orbit view puts you at the center;
 * friends sit on rings by closeness, and friends who share a context
 * cluster into constellations with faint links.
 *
 * Closeness is a transparent score, not an AI: five dimensions
 * (frequency, history, intimacy, openness, bond) → 0–100 → Dunbar-ish
 * rings. See src/lib/friends-score.ts.
 */

interface Friend {
  id: string;
  name: string;
  metTag: string | null;
  metDetail: string | null;
  talkFreq: string | null;
  knownYears: string | null;
  trust: string | null;
  openness: string | null;
  score: number | null;
  notes: string | null;
  hasPhoto: boolean;
}

const MET_TAGS = [
  { id: "childhood", label: "Childhood" },
  { id: "family", label: "Family" },
  { id: "school", label: "School" },
  { id: "masjid", label: "Masjid" },
  { id: "work", label: "Work" },
  { id: "online", label: "Online" },
  { id: "other", label: "Other" },
];

// Follow-up questions per context — the answer is stored in metDetail.
const MET_FOLLOWUP: Record<string, { q: string; options: string[] }> = {
  childhood: { q: "How old were you?", options: ["Under 6", "6–10", "11–14", "15–17"] },
  family: { q: "What are they to you?", options: ["Sibling", "Cousin", "Aunt / uncle", "Family friend"] },
  school: { q: "When in school?", options: ["Elementary", "Middle school", "High school", "College"] },
  work: { q: "How did you work together?", options: ["Coworker", "Manager", "Client", "Same field"] },
  masjid: { q: "Where at the masjid?", options: ["Prayer line", "Youth group", "Class / circle", "Volunteering"] },
  online: { q: "Where online?", options: ["Game", "Social media", "Community", "Mutual friend"] },
};

const FREQS = [
  { id: "daily", label: "Every day" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "rarely", label: "Rarely" },
];
const YEARS = [
  { id: "lt1", label: "Under a year" },
  { id: "y1_3", label: "1–3 years" },
  { id: "y3_7", label: "3–7 years" },
  { id: "y7p", label: "7+ years" },
];
const TRUST = [
  { id: "definitely", label: "No doubt" },
  { id: "probably", label: "Probably" },
  { id: "unsure", label: "Not sure" },
];
const OPENNESS = [
  { id: "always", label: "Completely" },
  { id: "mostly", label: "Mostly" },
  { id: "rarely", label: "I hold back" },
];

const TIERS = [
  { label: "Inner circle", r: 0.3 },
  { label: "Close", r: 0.58 },
  { label: "Outer orbit", r: 0.86 },
];
const metLabel = (t: string | null) => MET_TAGS.find((m) => m.id === t)?.label ?? null;
const freqLabel = (f: string | null) => FREQS.find((x) => x.id === f)?.label ?? null;

const scoreOf = (f: Friend) => f.score ?? friendScore(f);
const tierOf = (f: Friend): 0 | 1 | 2 => friendTier(scoreOf(f));

// Friend avatar pixels: ≤320px JPEG q0.75 → ~15-40KB base64.
async function compressPhoto(file: Blob): Promise<{ data: string; mime: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.75);
  return { data: url.split(",")[1], mime: "image/jpeg" };
}

// Profile avatar: 128px webp data URL — the shape /api/profile expects.
async function compressSelfie(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 128 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.8);
}

// Contacts Picker API (Android Chrome / WebView). Feature-detected.
interface DeviceContact {
  name?: string[];
  icon?: Blob[];
}
const contactsApi = () =>
  (navigator as Navigator & { contacts?: { select: (p: string[], o: { multiple: boolean }) => Promise<DeviceContact[]> } }).contacts;

function Avatar({ f, size }: { f: Friend; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold"
      style={{
        width: size, height: size,
        backgroundColor: "var(--color-accent-faint)",
        color: "var(--color-accent)",
        fontSize: size * 0.42,
      }}
    >
      {f.hasPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/friends/${f.id}/photo`} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        f.name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

export default function FriendsClient() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sheet, setSheet] = useState<null | Friend | "new">(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selfRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ data: string; mime: string; dirty: boolean }>({ data: "", mime: "", dirty: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [contactHint, setContactHint] = useState<string | null>(null);

  const refresh = () =>
    fetch("/api/friends", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.friends) setFriends(d.friends); })
      .catch(() => {})
      .finally(() => setLoaded(true));

  useEffect(() => {
    void refresh();
    fetch("/api/profile", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSelfie(d?.profile?.avatarUrl ?? d?.avatarUrl ?? null))
      .catch(() => {});
  }, []);

  // ── Orbit layout ─────────────────────────────────────────────────
  const byTier: Friend[][] = [[], [], []];
  friends.forEach((f) => byTier[tierOf(f)].push(f));
  const nodes: { f: Friend; x: number; y: number; tier: number }[] = [];
  byTier.forEach((ring, tier) => {
    const sorted = [...ring].sort((a, b) => (a.metTag ?? "").localeCompare(b.metTag ?? ""));
    const r = TIERS[tier].r * 50;
    sorted.forEach((f, i) => {
      const a = (i / sorted.length) * Math.PI * 2 + tier * 0.6 - Math.PI / 2;
      nodes.push({ f, x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a), tier });
    });
  });
  const edges: [number, number][] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (edges.length >= 48) break;
      if (nodes[i].f.metTag && nodes[i].f.metTag === nodes[j].f.metTag) edges.push([i, j]);
    }
  }

  // ── Sheet state ──────────────────────────────────────────────────
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [metTag, setMetTag] = useState<string | null>(null);
  const [metDetail, setMetDetail] = useState("");
  const [freq, setFreq] = useState<string | null>(null);
  const [years, setYears] = useState<string | null>(null);
  const [trust, setTrust] = useState<string | null>(null);
  const [openness, setOpenness] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  function openSheet(f: Friend | "new" | null) {
    setSheet(f);
    setError(null);
    setContactHint(null);
    setPhoto({ data: "", mime: "", dirty: false });
    if (f && f !== "new") {
      const parts = f.name.split(" ");
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" "));
      setMetTag(f.metTag); setMetDetail(f.metDetail ?? "");
      setFreq(f.talkFreq); setYears(f.knownYears); setTrust(f.trust); setOpenness(f.openness);
      setNotes(f.notes ?? "");
    } else {
      setFirstName(""); setLastName("");
      setMetTag(null); setMetDetail(""); setFreq(null);
      setYears(null); setTrust(null); setOpenness(null); setNotes("");
    }
  }

  async function pickFromContacts() {
    const api = contactsApi();
    if (!api) {
      setContactHint("Contact import needs the Android app or Chrome on Android.");
      return;
    }
    try {
      const [c] = await api.select(["name", "icon"], { multiple: false });
      if (!c) return;
      const full = (c.name?.[0] ?? "").trim();
      if (full) {
        const parts = full.split(/\s+/);
        setFirstName(parts[0] ?? "");
        setLastName(parts.slice(1).join(" "));
      }
      const icon = c.icon?.[0];
      if (icon) setPhoto({ ...(await compressPhoto(icon)), dirty: true });
    } catch {
      // User dismissed the picker or denied access — nothing to do.
    }
  }

  async function save() {
    const n = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!n) { setError("Give them a name."); return; }
    setSaving(true);
    setError(null);
    try {
      const editing = sheet !== "new" && sheet !== null;
      const payload: Record<string, unknown> = {
        name: n, metTag, metDetail: metDetail || null, talkFreq: freq,
        knownYears: years, trust, openness, notes: notes || null,
      };
      if (photo.dirty) {
        payload.photo = photo.data || null;
        payload.photoMime = photo.mime || null;
      }
      if (editing) payload.id = (sheet as Friend).id;
      const r = await fetch("/api/friends", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) { setError(d?.error ?? "Couldn't save."); return; }
      openSheet(null);
      void refresh();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (sheet === "new" || !sheet) return;
    setSaving(true);
    await fetch(`/api/friends?id=${sheet.id}`, { method: "DELETE" }).catch(() => {});
    openSheet(null);
    setSaving(false);
    void refresh();
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--color-paper-2)",
    border: "1px solid var(--color-paper-3)",
    color: "var(--color-ink)",
  };
  const chip = (on: boolean): React.CSSProperties => ({
    backgroundColor: on ? "var(--color-ink)" : "var(--color-paper-2)",
    color: on ? "var(--color-paper)" : "var(--color-ink-soft)",
    border: `1px solid ${on ? "var(--color-ink)" : "var(--color-paper-3)"}`,
  });
  const qlabel: React.CSSProperties = {
    color: "var(--color-ink-muted)",
    display: "block",
  };

  const previewScore = friendScore({ talkFreq: freq, knownYears: years, trust, openness, metTag });
  const previewTier = TIERS[friendTier(previewScore)];

  return (
    <div className="min-h-dvh" style={{ backgroundColor: "var(--color-paper)" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-20 border-b backdrop-blur-md"
        style={{
          borderColor: "var(--color-paper-3)",
          backgroundColor: "color-mix(in oklab, var(--color-paper) 82%, transparent)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/calendar/day"
            className="flex items-center justify-center rounded-full transition-colors hover:bg-[var(--color-paper-2)]"
            style={{ color: "var(--color-ink-muted)", minHeight: 40, minWidth: 40 }}
            aria-label="Back to home"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <h1 className="flex-1 text-xl font-bold tracking-tight" style={{ color: "var(--color-ink)" }}>Friends</h1>
          <button
            onClick={() => openSheet("new")}
            className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-opacity hover:opacity-80"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
        {/* ── The map ── */}
        {(friends.length > 0 || loaded) && (
          <div className="relative mx-auto mt-4 aspect-square w-full max-w-md">
            <svg viewBox="0 0 100 100" className="h-full w-full">
              {TIERS.map((t, i) => (
                <circle key={i} cx="50" cy="50" r={t.r * 50} fill="none" stroke="var(--color-paper-3)" strokeWidth="0.3" />
              ))}
              {edges.map(([a, b], k) => (
                <line
                  key={k}
                  x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y}
                  stroke="var(--color-paper-3)" strokeWidth="0.25"
                />
              ))}
              {/* You — tap to set your photo */}
              <g onClick={() => selfRef.current?.click()} style={{ cursor: "pointer" }}>
                <clipPath id="self-clip"><circle cx="50" cy="50" r="4" /></clipPath>
                {selfie ? (
                  <image href={selfie} x="46" y="46" width="8" height="8" clipPath="url(#self-clip)" preserveAspectRatio="xMidYMid slice" />
                ) : (
                  <circle cx="50" cy="50" r="3.4" fill="var(--color-accent)" />
                )}
                <circle cx="50" cy="50" r={selfie ? 4 : 3.4} fill="none" stroke="var(--color-accent)" strokeWidth="0.35" />
                <text x="50" y="56.5" textAnchor="middle" fontSize="3" fill="var(--color-ink-muted)" fontWeight="600">you</text>
              </g>
              {nodes.map((n, i) => (
                <g key={n.f.id} onClick={() => openSheet(n.f)} style={{ cursor: "pointer" }}>
                  <clipPath id={`fc-${i}`}><circle cx={n.x} cy={n.y} r="3" /></clipPath>
                  {n.f.hasPhoto ? (
                    <image href={`/api/friends/${n.f.id}/photo`} x={n.x - 3} y={n.y - 3} width="6" height="6" clipPath={`url(#fc-${i})`} preserveAspectRatio="xMidYMid slice" />
                  ) : (
                    <>
                      <circle
                        cx={n.x} cy={n.y} r="3"
                        fill="var(--color-paper-2)" stroke="var(--color-accent)" strokeWidth="0.4"
                      />
                      <text x={n.x} y={n.y + 1.1} textAnchor="middle" fontSize="2.6" fill="var(--color-accent)" fontWeight="700">
                        {n.f.name.charAt(0).toUpperCase()}
                      </text>
                    </>
                  )}
                  <circle cx={n.x} cy={n.y} r="3" fill="none" stroke="var(--color-accent)" strokeWidth="0.35" />
                  <text x={n.x} y={n.y + 5.4} textAnchor="middle" fontSize="2.2" fill="var(--color-ink-muted)">
                    {n.f.name.split(" ")[0]}
                  </text>
                </g>
              ))}
            </svg>
            <p className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 text-center text-[9px] uppercase tracking-widest" style={{ color: "var(--color-ink-muted)" }}>
              your orbit
            </p>
          </div>
        )}
        <input
          ref={selfRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const dataUrl = await compressSelfie(f);
            const r = await fetch("/api/profile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ avatar: dataUrl }),
            }).catch(() => null);
            if (r?.ok) setSelfie(dataUrl);
          }}
        />

        {/* ── Tier lists ── */}
        {TIERS.map((t, i) => {
          const ring = byTier[i];
          if (ring.length === 0) return null;
          return (
            <section key={t.label} className="mt-7">
              <h2 className="mb-1 flex items-baseline gap-2 text-sm font-bold tracking-tight" style={{ color: "var(--color-ink)" }}>
                {t.label}
                <span className="text-[10px] font-medium" style={{ color: "var(--color-ink-muted)" }}>{ring.length}</span>
              </h2>
              <div>
                {ring.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => openSheet(f)}
                    className="flex w-full items-center gap-3 border-b py-3 text-left last:border-b-0"
                    style={{ borderColor: "var(--color-paper-3)" }}
                  >
                    <Avatar f={f} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>{f.name}</span>
                      <span className="block truncate text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                        {[metLabel(f.metTag), f.metDetail, freqLabel(f.talkFreq) && `talks ${freqLabel(f.talkFreq)?.toLowerCase()}`]
                          .filter(Boolean).join(" · ") || "no details yet"}
                      </span>
                    </span>
                    {f.notes && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: "var(--color-accent)" }} title="has notes" />}
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        {loaded && friends.length === 0 && (
          <div className="flex flex-col items-center pt-6 pb-14 text-center">
            <p className="text-sm font-semibold" style={{ color: "var(--color-ink)" }}>It&rsquo;s just you out here</p>
            <p className="mt-1 max-w-52 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
              Add the people who matter — the closer they are, the tighter their orbit.
            </p>
            <button
              onClick={() => openSheet("new")}
              className="mt-4 rounded-full px-5 py-2 text-xs font-bold"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              Add your first friend
            </button>
          </div>
        )}
      </div>

      {/* ── Add/edit sheet ── */}
      {sheet && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 45%, transparent)" }}
          onClick={() => openSheet(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
            style={{ backgroundColor: "var(--color-paper)", animation: "drawer-app-in 0.22s ease-out" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-bold tracking-tight" style={{ color: "var(--color-ink)" }}>
                {sheet === "new" ? "New friend" : `${firstName} ${lastName}`.trim() || "Friend"}
              </p>
              <div className="flex items-center gap-1">
                {sheet !== "new" && (
                  <button onClick={remove} disabled={saving} className="flex items-center justify-center rounded-full" style={{ color: "var(--color-ink-muted)", minHeight: 36, minWidth: 36 }} aria-label="Remove friend">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => openSheet(null)} className="flex items-center justify-center rounded-full" style={{ color: "var(--color-ink-muted)", minHeight: 36, minWidth: 36 }} aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Avatar + contacts import */}
            <div className="mb-4 flex items-center gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full"
                style={{ backgroundColor: "var(--color-paper-2)", border: "1px solid var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                aria-label="Add photo"
              >
                {photo.dirty && photo.data ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`data:${photo.mime};base64,${photo.data}`} alt="" className="h-full w-full object-cover" />
                ) : sheet !== "new" && (sheet as Friend).hasPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/friends/${(sheet as Friend).id}/photo`} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-5 w-5" />
                )}
              </button>
              <div>
                <p className="text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>Photo</p>
                <button onClick={() => fileRef.current?.click()} className="text-[11px] font-semibold" style={{ color: "var(--color-accent)" }}>
                  {photo.dirty || (sheet !== "new" && (sheet as Friend).hasPhoto) ? "Change" : "Add one"}
                </button>
                <button onClick={pickFromContacts} className="ml-3 inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--color-accent)" }}>
                  <ContactRound className="h-3 w-3" /> From contacts
                </button>
                {(photo.dirty || (sheet !== "new" && (sheet as Friend).hasPhoto)) && (
                  <button onClick={() => setPhoto({ data: "", mime: "", dirty: true })} className="ml-3 text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                    Remove
                  </button>
                )}
                {contactHint && <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>{contactHint}</p>}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const c = await compressPhoto(f);
                  setPhoto({ ...c, dirty: true });
                  e.target.value = "";
                }}
              />
            </div>

            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={qlabel}>Name</label>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value.slice(0, 40))}
                placeholder="First name"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={inputStyle}
              />
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value.slice(0, 40))}
                placeholder="Last name"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={inputStyle}
              />
            </div>

            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={qlabel}>How do you know them?</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {MET_TAGS.map((m) => (
                <button key={m.id} onClick={() => { setMetTag(metTag === m.id ? null : m.id); setMetDetail(""); }} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={chip(metTag === m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
            {metTag && MET_FOLLOWUP[metTag] ? (
              <div className="mb-4">
                <p className="mb-1.5 text-[11px] font-medium" style={{ color: "var(--color-ink-soft)" }}>{MET_FOLLOWUP[metTag].q}</p>
                <div className="flex flex-wrap gap-1.5">
                  {MET_FOLLOWUP[metTag].options.map((o) => (
                    <button key={o} onClick={() => setMetDetail(metDetail === o ? "" : o)} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={chip(metDetail === o)}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <input
                value={metDetail}
                onChange={(e) => setMetDetail(e.target.value.slice(0, 80))}
                placeholder={metTag ? "Any detail — optional" : "Pick a context above — optional detail here"}
                className="mb-4 w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={inputStyle}
              />
            )}

            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={qlabel}>How long have you known them?</label>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {YEARS.map((y) => (
                <button key={y.id} onClick={() => setYears(years === y.id ? null : y.id)} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={chip(years === y.id)}>
                  {y.label}
                </button>
              ))}
            </div>

            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={qlabel}>How often do you talk?</label>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {FREQS.map((fr) => (
                <button key={fr.id} onClick={() => setFreq(freq === fr.id ? null : fr.id)} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={chip(freq === fr.id)}>
                  {fr.label}
                </button>
              ))}
            </div>

            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={qlabel}>If you needed them at 3am, would they show up?</label>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {TRUST.map((tr) => (
                <button key={tr.id} onClick={() => setTrust(trust === tr.id ? null : tr.id)} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={chip(trust === tr.id)}>
                  {tr.label}
                </button>
              ))}
            </div>

            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={qlabel}>Can you be fully yourself around them?</label>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {OPENNESS.map((o) => (
                <button key={o.id} onClick={() => setOpenness(openness === o.id ? null : o.id)} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={chip(openness === o.id)}>
                  {o.label}
                </button>
              ))}
            </div>

            {previewScore > 0 && (
              <p className="mb-4 text-[11px] font-medium" style={{ color: "var(--color-ink-muted)" }}>
                Lands in your <span className="font-bold" style={{ color: "var(--color-accent)" }}>{previewTier.label.toLowerCase()}</span>
                {" "}({previewScore}/100)
              </p>
            )}

            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={qlabel}>About them</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
              placeholder={"Habits, quotes, quirks — “always orders the same thing”"}
              rows={3}
              className="mb-4 w-full resize-none rounded-xl px-3 py-2.5 text-sm leading-relaxed outline-none"
              style={inputStyle}
            />

            {error && <p className="mb-3 text-xs" style={{ color: "var(--color-danger, #c0392b)" }}>{error}</p>}

            <button
              onClick={save}
              disabled={saving}
              className="w-full rounded-xl py-3 text-sm font-bold transition-opacity disabled:opacity-50"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              {saving ? "Saving…" : sheet === "new" ? "Add to your orbit" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
