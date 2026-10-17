"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, X, Camera, Trash2, ContactRound, Pencil, Phone, EyeOff } from "lucide-react";
import { friendScore, friendTier } from "@/lib/friends-score";
import PhotoLightbox from "@/components/photo-lightbox";

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
  miss: string | null;
  tell: string | null;
  phase: string | null;
  vibe: string | null;
  sacrifice: string | null;
  loyalty: string | null;
  gap: string | null;
  plans: string | null;
  hangout: string | null;
  shortlist: string | null;
  volition: string | null;
  attune: string | null;
  groupLabel: string | null;
  score: number | null;
  phone: string | null;
  updatedAt?: string | null;
  notes: string | null;
  hasPhoto: boolean;
}

const MET_TAGS = [
  { id: "childhood", label: "Childhood" },
  { id: "family", label: "Family" },
  { id: "school", label: "School" },
  { id: "masjid", label: "Masjid" },
  { id: "work", label: "Work" },
  { id: "neighbor", label: "Neighbor" },
  { id: "mutual", label: "Through a friend" },
  { id: "sports", label: "Sports / gym" },
  { id: "travel", label: "Travel" },
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
  neighbor: { q: "Where?", options: ["Same street", "Building", "Neighborhood"] },
  mutual: { q: "Through who?", options: ["Best friend", "Family", "Friend group"] },
  sports: { q: "What do you play?", options: ["Football", "Basketball", "Gym", "Other sport"] },
  travel: { q: "Where did you meet?", options: ["On a trip", "Abroad", "Airport / transit"] },
  online: { q: "Where online?", options: ["Game", "Social media", "Community", "Mutual friend"] },
};

const FREQS = [
  { id: "daily", label: "Basically daily" },
  { id: "weekly", label: "A few times a week" },
  { id: "monthly", label: "A few times a month" },
  { id: "rarely", label: "Every few months or less" },
];
const YEARS = [
  { id: "lt1", label: "Under a year" },
  { id: "y1_3", label: "1–3 years" },
  { id: "y3_7", label: "3–7 years" },
  { id: "y7p", label: "7+ years" },
];
const HANGOUT = [
  { id: "doing", label: "Doing something — gym, games, food" },
  { id: "mix", label: "A mix of both" },
  { id: "talking", label: "Actually sitting and talking" },
  { id: "texting", label: "Mostly just texts" },
];
const PLANS = [
  { id: "both", label: "We both hit each other up" },
  { id: "easy", label: "Whoever — it's easy, no keeping score" },
  { id: "them", label: "Usually them" },
  { id: "me", label: "Usually me" },
];
const TRUST = [
  { id: "definitely", label: "They're my first call" },
  { id: "topfew", label: "In my top few" },
  { id: "depends", label: "Depends on the situation" },
  { id: "unsure", label: "I wouldn't" },
];
const SACRIFICE = [
  { id: "noask", label: "They don't even have to ask" },
  { id: "asked", label: "I'd show up if they asked" },
  { id: "cost", label: "Depends what it costs me" },
  { id: "excuse", label: "I'd find a reason not to" },
];
const OPENNESS = [
  { id: "everything", label: "Everything — even what nobody else knows" },
  { id: "most", label: "Most of it" },
  { id: "light", label: "We keep it light" },
  { id: "notmuch", label: "Honestly not much" },
];
const LOYALTY = [
  { id: "absolutely", label: "Absolutely" },
  { id: "probably", label: "Probably" },
  { id: "unsure", label: "I honestly don't know" },
  { id: "no", label: "No" },
];
const GAP = [
  { id: "notime", label: "Like no time passed" },
  { id: "backup", label: "We'd pick back up fine" },
  { id: "awkward", label: "A little awkward at first" },
  { id: "strangers", label: "Basically strangers" },
];
const SHORTLIST = [
  { id: "definitely", label: "Definitely" },
  { id: "probably", label: "Probably" },
  { id: "unsure", label: "Not sure" },
  { id: "no", label: "No" },
];
const VOLITION = [
  { id: "choose", label: "We choose to — we'd link anyway" },
  { id: "mix", label: "A bit of both" },
  { id: "context", label: "Same place mostly — class, work, whatever" },
];
const ATTUNE = [
  { id: "notice", label: "They'd notice before I said anything" },
  { id: "eventually", label: "They'd pick up on it eventually" },
  { id: "told", label: "Only if I told them" },
  { id: "wouldnt", label: "They wouldn't" },
];
const PHASE = [
  { id: "steady", label: "As tight as ever" },
  { id: "wascloser", label: "We were closer once" },
  { id: "distant", label: "Friendly but distant" },
];
const TELL = [
  { id: "first", label: "They'd hear it from me" },
  { id: "eventually", label: "They'd find out eventually" },
  { id: "rarely", label: "I wouldn't go out of my way" },
];

const OPENNESS_LEGACY_LABELS: Record<string, string> = { always: "Completely", mostly: "Mostly", rarely: "I hold back" };
const openLabel = (v: string | null) =>
  (v && (OPENNESS.find((x) => x.id === v)?.label ?? OPENNESS_LEGACY_LABELS[v])) ?? null;
const VIBE = [
  { id: "person", label: "One of my people" },
  { id: "goodtime", label: "A good time — always down" },
  { id: "easygoing", label: "Easy company — always around" },
  { id: "new", label: "Still figuring it out" },
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
  tel?: string[];
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
        <img src={`/api/friends/${f.id}/photo?v=${Date.parse(f.updatedAt ?? "") || 0}`} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        f.name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

export default function FriendsClient() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sheet, setSheet] = useState<null | Friend | "new" | "self">(null);
  const [editing, setEditing] = useState(false); // view card → edit form
  const [me, setMe] = useState<{ name: string; avatarUrl: string | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selfRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ data: string; mime: string; dirty: boolean }>({ data: "", mime: "", dirty: false });
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [contactHint, setContactHint] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [crews, setCrews] = useState<{ id: string; name: string; hiddenFromAll: boolean }[]>([]);
  const [newCrew, setNewCrew] = useState<{ open: boolean; name: string; hidden: boolean; saving: boolean }>({ open: false, name: "", hidden: false, saving: false });
  const [crewSheet, setCrewSheet] = useState<{ id: string; name: string; hiddenFromAll: boolean } | null>(null);
  const [crewDraft, setCrewDraft] = useState("");
  const [crewBusy, setCrewBusy] = useState(false);
  const [importReport, setImportReport] = useState<{ name: string; linked: boolean }[] | null>(null);
  const [importing, setImporting] = useState(false);

  const refresh = () =>
    fetch("/api/friends", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.friends) setFriends(d.friends); })
      .catch(() => {})
      .finally(() => setLoaded(true));

  useEffect(() => {
    void refresh();
    fetch("/api/crews", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.crews) setCrews(d.crews); })
      .catch(() => {});
    fetch("/api/profile", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setSelfie(d?.avatarUrl ?? null);
        setMe({ name: d?.name ?? "You", avatarUrl: d?.avatarUrl ?? null });
      })
      .catch(() => {});
  }, []);

  // ── Groups + orbit layout ────────────────────────────────────────
  // Crews are user-named groups; the constellation key falls back to
  // met context so ungrouped friends still cluster sensibly.
  const crewNames = crews.map((c) => c.name);
  const groups = [...new Set([...crewNames, ...friends.map((f) => f.groupLabel)].filter((g): g is string => !!g))].sort();
  const hiddenCrews = new Set(crews.filter((c) => c.hiddenFromAll).map((c) => c.name));
  // All view hides members of hidden crews; selecting the crew shows them.
  const shown = groupFilter
    ? friends.filter((f) => f.groupLabel === groupFilter)
    : friends.filter((f) => !f.groupLabel || !hiddenCrews.has(f.groupLabel));
  const clusterOf = (f: Friend) => f.groupLabel ?? f.metTag ?? "";
  const photoSrc = (f: Friend) => `/api/friends/${f.id}/photo?v=${Date.parse(f.updatedAt ?? "") || 0}`;
  const openCrewSheet = (c: { id: string; name: string; hiddenFromAll: boolean }) => {
    setCrewSheet(c);
    setCrewDraft(c.name);
  };

  const byTier: Friend[][] = [[], [], []];
  shown.forEach((f) => byTier[tierOf(f)].push(f));
  byTier.forEach((ring) => ring.sort((a, b) => scoreOf(b) - scoreOf(a)));
  const nodes: { f: Friend; x: number; y: number; tier: number }[] = [];
  byTier.forEach((ring, tier) => {
    const sorted = [...ring].sort((a, b) => clusterOf(a).localeCompare(clusterOf(b)));
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
      if (clusterOf(nodes[i].f) && clusterOf(nodes[i].f) === clusterOf(nodes[j].f)) edges.push([i, j]);
    }
  }

  // ── Sheet state ──────────────────────────────────────────────────
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [metTag, setMetTag] = useState<string | null>(null);
  const [metDetail, setMetDetail] = useState("");
  const [phone, setPhone] = useState("");
  const [freq, setFreq] = useState<string | null>(null);
  const [years, setYears] = useState<string | null>(null);
  const [trust, setTrust] = useState<string | null>(null);
  const [openness, setOpenness] = useState<string | null>(null);
  const [miss, setMiss] = useState<string | null>(null);
  const [tell, setTell] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [vibe, setVibe] = useState<string | null>(null);
  const [sacrifice, setSacrifice] = useState<string | null>(null);
  const [loyalty, setLoyalty] = useState<string | null>(null);
  const [gap, setGap] = useState<string | null>(null);
  const [plans, setPlans] = useState<string | null>(null);
  const [hangout, setHangout] = useState<string | null>(null);
  const [shortlist, setShortlist] = useState<string | null>(null);
  const [volition, setVolition] = useState<string | null>(null);
  const [attune, setAttune] = useState<string | null>(null);
  const [groupLabel, setGroupLabel] = useState("");
  const [step, setStep] = useState(0);
  const [notes, setNotes] = useState("");

  function openSheet(f: Friend | "new" | "self" | null) {
    setSheet(f);
    setEditing(f === "new"); // existing friends open in view mode
    setStep(0);
    setError(null);
    setContactHint(null);
    setPhoto({ data: "", mime: "", dirty: false });
    if (f && f !== "new" && f !== "self") {
      const parts = f.name.split(" ");
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" "));
      setMetTag(f.metTag); setMetDetail(f.metDetail ?? "");
      setFreq(f.talkFreq); setYears(f.knownYears); setTrust(f.trust); setOpenness(f.openness);
      setMiss(f.miss); setTell(f.tell); setPhase(f.phase); setVibe(f.vibe);
      setSacrifice(f.sacrifice); setLoyalty(f.loyalty); setGap(f.gap);
      setPlans(f.plans); setHangout(f.hangout); setShortlist(f.shortlist);
      setVolition(f.volition); setAttune(f.attune);
      setGroupLabel(f.groupLabel ?? "");
      setPhone(f.phone ?? "");
      setNotes(f.notes ?? "");
    } else {
      setFirstName(""); setLastName("");
      setMetTag(null); setMetDetail(""); setFreq(null);
      setYears(null); setTrust(null); setOpenness(null); setMiss(null); setTell(null); setPhase(null); setVibe(null); setGroupLabel("");
      setSacrifice(null); setLoyalty(null); setGap(null); setPlans(null); setHangout(null); setShortlist(null);
      setVolition(null); setAttune(null);
      setPhone(""); setNotes("");
    }
  }

  async function pickFromContacts() {
    const api = contactsApi();
    if (!api) {
      setContactHint("Contact import needs the Android app or Chrome on Android.");
      return;
    }
    try {
      const [c] = await api.select(["name", "icon", "tel"], { multiple: false });
      if (!c) return;
      const full = (c.name?.[0] ?? "").trim();
      if (full) {
        const parts = full.split(/\s+/);
        setFirstName(parts[0] ?? "");
        setLastName(parts.slice(1).join(" "));
      }
      const tel = c.tel?.[0]?.trim();
      if (tel) setPhone(tel.slice(0, 40));
      const icon = c.icon?.[0];
      if (icon) setPhoto({ ...(await compressPhoto(icon)), dirty: true });
    } catch {
      // User dismissed the picker or denied access — nothing to do.
    }
  }

  // Multi-import (new-friend flow): pick several contacts; each becomes a
  // friend unless its number already belongs to one. The OS picker can't
  // enumerate or annotate the address book, so "already linked" is reported
  // after the pick, matched on normalized digits.
  async function importFromContacts() {
    const api = contactsApi();
    if (!api) {
      setContactHint("Contact import needs the Android app or Chrome on Android.");
      return;
    }
    setImporting(true);
    try {
      const picked = await api.select(["name", "icon", "tel"], { multiple: true });
      if (!picked?.length) return;
      const norm = (p?: string) => (p ?? "").replace(/\D/g, "").slice(-10);
      const existing = new Set(friends.map((f) => norm(f.phone ?? "")).filter(Boolean));
      const existingNames = new Set(friends.map((f) => f.name.trim().toLowerCase()));
      const report: { name: string; linked: boolean }[] = [];
      for (const c of picked.slice(0, 25)) {
        const name = (c.name?.[0] ?? "").trim().slice(0, 80);
        if (!name) continue;
        const tel = c.tel?.[0]?.trim().slice(0, 40) ?? null;
        // Phone match when available, name fallback for number-less contacts.
        if ((tel && existing.has(norm(tel))) || existingNames.has(name.toLowerCase())) {
          report.push({ name, linked: true });
          continue;
        }
        const icon = c.icon?.[0];
        const photo = icon ? await compressPhoto(icon) : null;
        const r = await fetch("/api/friends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name, phone: tel,
            ...(photo ? { photo: photo.data, photoMime: photo.mime } : {}),
          }),
        }).catch(() => null);
        if (r?.ok) {
          report.push({ name, linked: false });
          if (tel) existing.add(norm(tel));
        }
      }
      if (report.length) {
        setImportReport(report);
        void refresh();
      }
    } catch {
      // User dismissed the picker or denied access — nothing to do.
    } finally {
      setImporting(false);
    }
  }

  async function save() {
    const n = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!n) { setError("Give them a name."); return; }
    setSaving(true);
    setError(null);
    try {
      const editing = sheet !== "new" && sheet !== "self" && sheet !== null;
      const payload: Record<string, unknown> = {
        name: n, metTag, metDetail: metDetail || null, talkFreq: freq,
        knownYears: metTag === "childhood" ? "y7p" : years,
        trust, openness, miss, tell, phase, vibe,
        sacrifice, loyalty, gap, plans, hangout, shortlist, volition, attune,
        groupLabel: groupLabel.trim() || null, phone: phone || null, notes: notes || null,
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
    if (sheet === "new" || sheet === "self" || !sheet) return;
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

  const previewScore = friendScore({ talkFreq: freq, knownYears: years, trust, openness, miss, tell, phase, vibe, metTag, sacrifice, loyalty, gap, plans, hangout, shortlist, volition, attune });
  const previewTier = TIERS[friendTier(previewScore)];

  // ── Stepped questionnaire — one question at a time ───────────────
  const steps = [
    { id: "met", q: "How do you know them?", answered: !!metTag },
    { id: "vibe", q: "What are they to you, really?", answered: !!vibe },
    ...(metTag === "childhood" ? [] : [{ id: "years", q: "How long have you known them?", answered: !!years }]),
    { id: "freq", q: "How often do you actually see or talk?", answered: !!freq },
    { id: "hangout", q: "When you hang out, what's it usually?", answered: !!hangout },
    { id: "plans", q: "Who usually makes the plans?", answered: !!plans },
    { id: "volition", q: "If you stopped sharing the same place — class, work, the block — would you still see them?", answered: !!volition },
    { id: "trust", q: "It's 3am and you actually need help — do they get the call?", answered: !!trust },
    { id: "sacrifice", q: "They need something real — moving day, a ride, help with money.", answered: !!sacrifice },
    { id: "open", q: "How much of your real life do they know — problems, family, what you're actually dealing with?", answered: !!openness },
    { id: "tell", q: "When something big happens in your life, do they hear it from you?", answered: !!tell },
    { id: "loyalty", q: "Would they back you in a room you're not in?", answered: !!loyalty },
    { id: "attune", q: "If you were having a rough week and didn't say anything — would they notice?", answered: !!attune },
    { id: "gap", q: "If you didn't speak for two months, then saw them — what would it be?", answered: !!gap },
    { id: "shortlist", q: "The short list — the people who actually matter. Do they make it?", answered: !!shortlist },
    { id: "phase", q: "Where does this friendship stand right now?", answered: !!phase },
  ];
  const cur = Math.min(step, steps.length - 1);
  const nextStep = () => setTimeout(() => setStep(Math.min(cur + 1, steps.length - 1)), 240);
  const pick = (set: (v: string | null) => void, curVal: string | null, v: string) => () => {
    set(curVal === v ? null : v);
    if (curVal !== v) nextStep();
  };
  const chipsRow = (options: { id: string; label: string }[], curVal: string | null, set: (v: string | null) => void) => (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.id} onClick={pick(set, curVal, o.id)} className="rounded-full px-3.5 py-2 text-xs font-semibold" style={chip(curVal === o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );

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
            onClick={importFromContacts}
            disabled={importing}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ color: "var(--color-ink-muted)", border: "1px solid var(--color-paper-3)" }}
          >
            <ContactRound className="h-3.5 w-3.5" /> {importing ? "Importing…" : "Import"}
          </button>
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
        {contactHint && !sheet && (
          <p className="mt-3 text-xs" style={{ color: "var(--color-ink-muted)" }}>{contactHint}</p>
        )}
        {/* ── Group filter ── */}
        {groups.length > 0 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {["__all__", ...groups].map((g) => {
              const on = (g === "__all__") === !groupFilter;
              const crew = g !== "__all__" ? crews.find((c) => c.name === g) : null;
              return (
                <button
                  key={g}
                  onClick={() => {
                    if (g === "__all__") { setGroupFilter(null); return; }
                    // Tap a selected crew again to open its editor.
                    if (crew && groupFilter === g) openCrewSheet(crew);
                    else setGroupFilter(g);
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: on ? "var(--color-ink)" : "var(--color-paper-2)",
                    color: on ? "var(--color-paper)" : "var(--color-ink-soft)",
                    border: `1px solid ${on ? "var(--color-ink)" : "var(--color-paper-3)"}`,
                  }}
                >
                  {g === "__all__" ? "All" : g}
                  {crew?.hiddenFromAll && <EyeOff className="h-3 w-3 opacity-70" />}
                  {crew && on && <Pencil className="h-3 w-3 opacity-60" />}
                </button>
              );
            })}
          </div>
        )}

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
              {/* You — tap opens your card */}
              <g onClick={() => openSheet("self")} style={{ cursor: "pointer" }}>
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
                    <image href={photoSrc(n.f)} x={n.x - 3} y={n.y - 3} width="6" height="6" clipPath={`url(#fc-${i})`} preserveAspectRatio="xMidYMid slice" />
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
            setSelfie(dataUrl); // optimistic — show it now, persist in background
            const r = await fetch("/api/profile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ avatar: dataUrl }),
            }).catch(() => null);
            const d = r?.ok ? await r.json().catch(() => null) : null;
            if (d?.avatarUrl) setSelfie(d.avatarUrl);
            if (!r?.ok) setContactHint("Couldn't save your photo — check your connection.");
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
                        {[f.groupLabel, metLabel(f.metTag), f.metDetail, freqLabel(f.talkFreq) && `talks ${freqLabel(f.talkFreq)?.toLowerCase()}`]
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

      {/* ── Crew sheet ── */}
      {crewSheet && (() => {
        const members = friends.filter((f) => f.groupLabel === crewSheet.name);
        const saveCrew = async (patch: Record<string, unknown>) => {
          setCrewBusy(true);
          const r = await fetch("/api/crews", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: crewSheet.id, ...patch }),
          }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
          setCrewBusy(false);
          if (!r?.crew) return;
          setCrews((cs) => cs.map((c) => (c.id === r.crew.id ? r.crew : c)).sort((a, b) => a.name.localeCompare(b.name)));
          setCrewSheet(r.crew);
          setCrewDraft(r.crew.name);
          if (r.crew.name !== crewSheet.name) {
            // Rename propagated server-side — refresh friend labels + filter.
            setFriends((fs) => fs.map((f) => (f.groupLabel === crewSheet.name ? { ...f, groupLabel: r.crew.name } : f)));
            if (groupFilter === crewSheet.name) setGroupFilter(r.crew.name);
          }
        };
        return (
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
            style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 45%, transparent)" }}
            onClick={() => setCrewSheet(null)}
          >
            <div
              className="w-full max-w-md rounded-t-3xl px-5 pb-8 pt-4 sm:rounded-3xl"
              style={{ backgroundColor: "var(--color-paper)", animation: "drawer-app-in 0.22s ease-out" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 h-1 w-9 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} />
              <div className="mb-4 flex items-center gap-2">
                <input
                  value={crewDraft}
                  onChange={(e) => setCrewDraft(e.target.value.slice(0, 60))}
                  onBlur={() => { const n = crewDraft.trim(); if (n && n !== crewSheet.name) void saveCrew({ name: n }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="min-w-0 flex-1 rounded-xl px-3 py-2 text-base font-bold tracking-tight outline-none"
                  style={inputStyle}
                />
                <button onClick={() => setCrewSheet(null)} className="flex items-center justify-center rounded-full" style={{ color: "var(--color-ink-muted)", minHeight: 36, minWidth: 36 }} aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>
                {members.length === 1 ? "1 person" : `${members.length} people`}
              </p>
              {members.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {members.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => openSheet(f)}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold"
                      style={{ backgroundColor: "var(--color-paper-2)", border: "1px solid var(--color-paper-3)", color: "var(--color-ink)" }}
                    >
                      {f.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => void saveCrew({ hiddenFromAll: !crewSheet.hiddenFromAll })}
                disabled={crewBusy}
                className="mb-3 flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left disabled:opacity-50"
                style={{ backgroundColor: "var(--color-paper-2)" }}
                role="switch"
                aria-checked={crewSheet.hiddenFromAll}
              >
                <span>
                  <span className="block text-sm font-semibold" style={{ color: "var(--color-ink)" }}>Hide from All</span>
                  <span className="block text-[11px]" style={{ color: "var(--color-ink-muted)" }}>
                    Members only show when this crew is selected
                  </span>
                </span>
                <span
                  className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                  style={{ backgroundColor: crewSheet.hiddenFromAll ? "var(--color-accent)" : "var(--color-paper-3)" }}
                >
                  <span
                    className="absolute top-0.5 h-5 w-5 rounded-full transition-all"
                    style={{ left: crewSheet.hiddenFromAll ? 22 : 2, backgroundColor: "var(--color-paper)" }}
                  />
                </span>
              </button>

              <button
                onClick={async () => {
                  if (!window.confirm(`Delete “${crewSheet.name}”? The people stay — just the crew is removed.`)) return;
                  setCrewBusy(true);
                  await fetch(`/api/crews?id=${crewSheet.id}`, { method: "DELETE" }).catch(() => null);
                  setCrews((cs) => cs.filter((c) => c.id !== crewSheet.id));
                  setFriends((fs) => fs.map((f) => (f.groupLabel === crewSheet.name ? { ...f, groupLabel: null } : f)));
                  if (groupFilter === crewSheet.name) setGroupFilter(null);
                  setCrewBusy(false);
                  setCrewSheet(null);
                }}
                disabled={crewBusy}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold disabled:opacity-50"
                style={{ color: "var(--color-red, #b91c1c)", border: "1px solid var(--color-paper-3)" }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete crew
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Contact import report ── */}
      {importReport && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-ink) 45%, transparent)" }}
          onClick={() => setImportReport(null)}
        >
          <div
            className="max-h-[70dvh] w-full max-w-md overflow-y-auto rounded-t-3xl px-5 pb-8 pt-4 sm:rounded-3xl"
            style={{ backgroundColor: "var(--color-paper)", animation: "drawer-app-in 0.22s ease-out" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-9 rounded-full" style={{ backgroundColor: "var(--color-paper-3)" }} />
            <h2 className="mb-1 text-base font-bold tracking-tight" style={{ color: "var(--color-ink)" }}>Imported from contacts</h2>
            <p className="mb-4 text-xs" style={{ color: "var(--color-ink-muted)" }}>
              {importReport.filter((r) => !r.linked).length} added · {importReport.filter((r) => r.linked).length} already on your map
            </p>
            {importReport.map((r, i) => (
              <div key={i} className="flex items-center gap-2.5 border-b py-2.5 last:border-b-0" style={{ borderColor: "var(--color-paper-3)" }}>
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: r.linked ? "var(--color-paper-3)" : "var(--color-accent)" }}
                />
                <span className="flex-1 truncate text-sm font-medium" style={{ color: r.linked ? "var(--color-ink-muted)" : "var(--color-ink)" }}>
                  {r.name}
                </span>
                {r.linked && <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>linked</span>}
              </div>
            ))}
            <button
              onClick={() => setImportReport(null)}
              className="mt-4 w-full rounded-xl py-2.5 text-sm font-bold"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
            >
              Done
            </button>
          </div>
        </div>
      )}

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
                {sheet === "new" ? "New friend" : sheet === "self" ? "You" : `${firstName} ${lastName}`.trim() || "Friend"}
              </p>
              <div className="flex items-center gap-1">
                {sheet !== "new" && sheet !== "self" && editing && (
                  <button onClick={remove} disabled={saving} className="flex items-center justify-center rounded-full" style={{ color: "var(--color-ink-muted)", minHeight: 36, minWidth: 36 }} aria-label="Remove friend">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => openSheet(null)} className="flex items-center justify-center rounded-full" style={{ color: "var(--color-ink-muted)", minHeight: 36, minWidth: 36 }} aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* ── Self card ── */}
            {sheet === "self" && (
              <div className="flex flex-col items-center pb-2 pt-1 text-center">
                <button
                  onClick={() => (selfie ? setLightbox({ src: selfie, alt: me?.name ?? "You" }) : selfRef.current?.click())}
                  className="relative mb-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full"
                  style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)", border: "1px solid var(--color-paper-3)" }}
                  aria-label={selfie ? "View your photo" : "Change your photo"}
                >
                  {selfie ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selfie} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Camera className="h-6 w-6" />
                  )}
                </button>
                <p className="text-lg font-bold tracking-tight" style={{ color: "var(--color-ink)" }}>{me?.name ?? "You"}</p>
                <p className="mt-1 max-w-56 text-xs leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
                  This is you — everyone on the map orbits around you.
                </p>
                <button
                  onClick={() => selfRef.current?.click()}
                  className="mt-3 rounded-full px-4 py-1.5 text-xs font-semibold"
                  style={{ backgroundColor: "var(--color-paper-2)", border: "1px solid var(--color-paper-3)", color: "var(--color-ink-soft)" }}
                >
                  {selfie ? "Change photo" : "Add your photo"}
                </button>
                <p className="mt-4 text-[10px] uppercase tracking-widest" style={{ color: "var(--color-ink-muted)" }}>
                  Private — only you can see this map
                </p>
              </div>
            )}

            {/* ── Friend profile card (view mode) ── */}
            {sheet !== "new" && sheet !== "self" && !editing && (() => {
              const f = sheet as Friend;
              const t = TIERS[tierOf(f)];
              const rows: [string, string][] = [
                f.groupLabel ? ["Crew", f.groupLabel] : null,
                f.metTag ? ["Met", [metLabel(f.metTag), f.metDetail].filter(Boolean).join(" · ")] : null,
                f.vibe ? ["They're", VIBE.find((x) => x.id === f.vibe)?.label ?? f.vibe] : null,
                f.knownYears ? ["Known", YEARS.find((y) => y.id === f.knownYears)?.label ?? f.knownYears] : null,
                f.talkFreq ? ["Talk", freqLabel(f.talkFreq) ?? f.talkFreq] : null,
                f.trust ? ["3am call", TRUST.find((x) => x.id === f.trust)?.label ?? f.trust] : null,
                f.sacrifice ? ["If they needed real help", SACRIFICE.find((x) => x.id === f.sacrifice)?.label ?? f.sacrifice] : null,
                f.hangout ? ["Hanging out is", HANGOUT.find((x) => x.id === f.hangout)?.label ?? f.hangout] : null,
                f.plans ? ["Plans", PLANS.find((x) => x.id === f.plans)?.label ?? f.plans] : null,
                f.volition ? ["If the context ended", VOLITION.find((x) => x.id === f.volition)?.label ?? f.volition] : null,
                f.openness ? ["They know", openLabel(f.openness) ?? f.openness] : null,
                f.tell ? ["Big news", TELL.find((x) => x.id === f.tell)?.label ?? f.tell] : null,
                f.loyalty ? ["Backs you up", LOYALTY.find((x) => x.id === f.loyalty)?.label ?? f.loyalty] : null,
                f.attune ? ["If you're off", ATTUNE.find((x) => x.id === f.attune)?.label ?? f.attune] : null,
                f.gap ? ["After 2 months apart", GAP.find((x) => x.id === f.gap)?.label ?? f.gap] : null,
                f.shortlist ? ["The short list", SHORTLIST.find((x) => x.id === f.shortlist)?.label ?? f.shortlist] : null,
                f.phase ? ["Right now", PHASE.find((x) => x.id === f.phase)?.label ?? f.phase] : null,
                f.miss ? ["If they moved away", f.miss] : null,
              ].filter((r): r is [string, string] => !!r);
              return (
                <div>
                  <div className="mb-4 flex flex-col items-center text-center">
                    <button
                      className="mb-2 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-2xl font-bold"
                      style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}
                      onClick={() => f.hasPhoto && setLightbox({ src: photoSrc(f), alt: f.name })}
                      disabled={!f.hasPhoto}
                      aria-label={f.hasPhoto ? `View ${f.name}'s photo` : undefined}
                    >
                      {f.hasPhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/friends/${f.id}/photo?v=${Date.parse(f.updatedAt ?? "") || 0}`} alt="" className="h-full w-full object-cover" />
                      ) : (
                        f.name.charAt(0).toUpperCase()
                      )}
                    </button>
                    <p className="text-lg font-bold tracking-tight" style={{ color: "var(--color-ink)" }}>{f.name}</p>
                    {f.score != null && (
                      <span
                        className="mt-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                        style={{ backgroundColor: "var(--color-accent-faint)", color: "var(--color-accent)" }}
                      >
                        {t.label} · {f.score}
                      </span>
                    )}
                  </div>

                  {rows.length > 0 && (
                    <div className="mb-3 rounded-xl px-3 py-1" style={{ backgroundColor: "var(--color-paper-2)" }}>
                      {rows.map(([k, v]) => (
                        <div key={k} className="flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0" style={{ borderColor: "var(--color-paper-3)" }}>
                          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-muted)" }}>{k}</span>
                          <span className="text-right text-xs font-medium" style={{ color: "var(--color-ink)" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {f.phone && (
                    <a
                      href={`tel:${f.phone}`}
                      className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold"
                      style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-accent)" }}
                    >
                      <Phone className="h-4 w-4" /> {f.phone}
                    </a>
                  )}

                  {f.notes && (
                    <p className="mb-4 whitespace-pre-wrap rounded-xl px-3 py-2.5 text-sm leading-relaxed" style={{ backgroundColor: "var(--color-paper-2)", color: "var(--color-ink-soft)" }}>
                      {f.notes}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditing(true)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold"
                      style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      onClick={remove}
                      disabled={saving}
                      className="flex items-center justify-center rounded-xl px-4"
                      style={{ backgroundColor: "var(--color-paper-2)", border: "1px solid var(--color-paper-3)", color: "var(--color-ink-muted)" }}
                      aria-label="Remove friend"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* ── Edit form ── */}
            {(sheet === "new" || (sheet !== "self" && editing)) && (<>
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
                  <ContactRound className="h-3 w-3" /> {editing ? "Connect to contacts" : "From contacts"}
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

            {/* ── Questions — one at a time, progress pills on top ── */}
            <div className="mb-4 rounded-2xl p-3.5" style={{ backgroundColor: "var(--color-paper-2)", border: "1px solid var(--color-paper-3)" }}>
              <div className="mb-3 flex items-center gap-1" role="tablist" aria-label="Questionnaire progress">
                {steps.map((s, i) => (
                  <button
                    key={s.id}
                    role="tab"
                    aria-selected={i === cur}
                    aria-label={`Question ${i + 1}${s.answered ? " (answered)" : ""}`}
                    onClick={() => setStep(i)}
                    className="h-1.5 flex-1 rounded-full transition-colors"
                    style={{ backgroundColor: i === cur ? "var(--color-accent)" : s.answered ? "var(--color-ink)" : "var(--color-paper-3)" }}
                  />
                ))}
              </div>
              <div key={steps[cur].id} style={{ animation: "drawer-app-in 0.22s ease-out" }}>
                <p className="mb-2.5 text-sm font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
                  {steps[cur].q}
                </p>

                {steps[cur].id === "met" && (<>
                  <div className="flex flex-wrap gap-1.5">
                    {MET_TAGS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          const on = metTag !== m.id;
                          setMetTag(on ? m.id : null);
                          setMetDetail("");
                          if (on && !MET_FOLLOWUP[m.id]) nextStep();
                        }}
                        className="rounded-full px-3.5 py-2 text-xs font-semibold"
                        style={chip(metTag === m.id)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  {metTag && MET_FOLLOWUP[metTag] && (
                    <div className="mt-3" style={{ animation: "drawer-app-in 0.2s ease-out" }}>
                      <p className="mb-1.5 text-[11px] font-medium" style={{ color: "var(--color-ink-soft)" }}>{MET_FOLLOWUP[metTag].q}</p>
                      {chipsRow(MET_FOLLOWUP[metTag].options.map((o) => ({ id: o, label: o })), metDetail || null, (v) => setMetDetail(v ?? ""))}
                    </div>
                  )}
                </>)}
                {steps[cur].id === "vibe" && chipsRow(VIBE, vibe, setVibe)}
                {steps[cur].id === "years" && chipsRow(YEARS, years, setYears)}
                {steps[cur].id === "freq" && chipsRow(FREQS, freq, setFreq)}
                {steps[cur].id === "hangout" && chipsRow(HANGOUT, hangout, setHangout)}
                {steps[cur].id === "plans" && chipsRow(PLANS, plans, setPlans)}
                {steps[cur].id === "volition" && chipsRow(VOLITION, volition, setVolition)}
                {steps[cur].id === "trust" && chipsRow(TRUST, trust, setTrust)}
                {steps[cur].id === "sacrifice" && chipsRow(SACRIFICE, sacrifice, setSacrifice)}
                {steps[cur].id === "open" && chipsRow(OPENNESS, openness, setOpenness)}
                {steps[cur].id === "tell" && chipsRow(TELL, tell, setTell)}
                {steps[cur].id === "loyalty" && chipsRow(LOYALTY, loyalty, setLoyalty)}
                {steps[cur].id === "attune" && chipsRow(ATTUNE, attune, setAttune)}
                {steps[cur].id === "gap" && chipsRow(GAP, gap, setGap)}
                {steps[cur].id === "shortlist" && chipsRow(SHORTLIST, shortlist, setShortlist)}
                {steps[cur].id === "phase" && chipsRow(PHASE, phase, setPhase)}

                <div className="mt-3 flex items-center justify-between">
                  {cur > 0 ? (
                    <button onClick={() => setStep(cur - 1)} className="text-[11px] font-semibold" style={{ color: "var(--color-ink-muted)" }}>
                      ← Back
                    </button>
                  ) : <span />}
                  <button onClick={() => setStep(Math.min(cur + 1, steps.length - 1))} className="text-[11px] font-semibold" style={{ color: "var(--color-accent)" }}>
                    {cur === steps.length - 1 ? "Done" : "Skip"}
                  </button>
                </div>
              </div>
            </div>

            {previewScore > 0 && (
              <p className="mb-4 text-[11px] font-medium" style={{ color: "var(--color-ink-muted)" }}>
                Lands in your <span className="font-bold" style={{ color: "var(--color-accent)" }}>{previewTier.label.toLowerCase()}</span>
                {" "}({previewScore}/100)
              </p>
            )}

            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={qlabel}>Phone — optional</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.slice(0, 40))}
              placeholder="Number — imported via “From contacts”"
              inputMode="tel"
              className="mb-4 w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={inputStyle}
            />

            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={qlabel}>Their crew — optional</label>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {crewNames.map((g) => (
                <button key={g} onClick={() => setGroupLabel(groupLabel === g ? "" : g)} className="rounded-full px-3 py-1.5 text-xs font-semibold" style={chip(groupLabel === g)}>
                  {g}
                </button>
              ))}
              <button
                onClick={() => setNewCrew({ open: !newCrew.open, name: "", hidden: false, saving: false })}
                className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ backgroundColor: "var(--color-paper-2)", border: "1px dashed var(--color-paper-3)", color: "var(--color-ink-muted)" }}
              >
                <Plus className="h-3 w-3" /> New crew
              </button>
            </div>
            {newCrew.open && (
              <div className="mb-4 rounded-xl p-3" style={{ backgroundColor: "var(--color-paper-2)", border: "1px solid var(--color-paper-3)", animation: "drawer-app-in 0.2s ease-out" }}>
                <input
                  value={newCrew.name}
                  onChange={(e) => setNewCrew({ ...newCrew, name: e.target.value.slice(0, 60) })}
                  placeholder="Crew name — school crew, the guys…"
                  className="mb-2.5 w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: "var(--color-paper)", border: "1px solid var(--color-paper-3)", color: "var(--color-ink)" }}
                  autoFocus
                />
                <button
                  onClick={() => setNewCrew({ ...newCrew, hidden: !newCrew.hidden })}
                  className="mb-2.5 flex w-full items-center justify-between text-left"
                  role="switch"
                  aria-checked={newCrew.hidden}
                >
                  <span className="text-xs font-medium" style={{ color: "var(--color-ink-soft)" }}>Hide from All view</span>
                  <span
                    className="relative h-5 w-9 rounded-full transition-colors"
                    style={{ backgroundColor: newCrew.hidden ? "var(--color-accent)" : "var(--color-paper-3)" }}
                  >
                    <span
                      className="absolute top-0.5 h-4 w-4 rounded-full transition-all"
                      style={{ left: newCrew.hidden ? 18 : 2, backgroundColor: "var(--color-paper)" }}
                    />
                  </span>
                </button>
                <button
                  disabled={!newCrew.name.trim() || newCrew.saving}
                  onClick={async () => {
                    setNewCrew({ ...newCrew, saving: true });
                    const r = await fetch("/api/crews", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: newCrew.name.trim(), hiddenFromAll: newCrew.hidden }),
                    }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
                    setNewCrew({ open: false, name: "", hidden: false, saving: false });
                    if (r?.crew) {
                      setCrews((cs) => [...cs.filter((c) => c.id !== r.crew.id), r.crew].sort((a, b) => a.name.localeCompare(b.name)));
                      setGroupLabel(r.crew.name);
                    }
                  }}
                  className="w-full rounded-lg py-2 text-xs font-bold disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-ink)", color: "var(--color-paper)" }}
                >
                  {newCrew.saving ? "Creating…" : "Create crew"}
                </button>
              </div>
            )}
            {groupLabel && !crewNames.includes(groupLabel) && (
              <p className="mb-4 -mt-1 text-[10px]" style={{ color: "var(--color-ink-muted)" }}>
                “{groupLabel}” isn&rsquo;t a crew yet — hit + to make it one.
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
            </>)}
          </div>
        </div>
      )}

      {lightbox && <PhotoLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
    </div>
  );
}
