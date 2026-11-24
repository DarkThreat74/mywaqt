import { TOYS, WORLDS, worldOf, type Toy } from "./registry";

// Toys whose capture stayed blank (cockpit set + toasts) get a live-mounted
// preview when the card scrolls into view instead of a still frame.
let previewIO: IntersectionObserver | null = null;
function observeLiveCard(card: HTMLElement, t: Toy) {
  previewIO ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      const c = e.target as HTMLElement;
      if (e.isIntersecting) {
        const toy = TOYS.find((x) => x.id === c.dataset.toy);
        if (toy) mountPreview(c, toy);
      } else {
        // Offscreen previews are torn down — live elements run rAF/video
        // forever otherwise, which freezes the shelf.
        c.querySelector(".card-live:not([data-hover])")?.remove();
      }
    }
  }, { rootMargin: "80px" });
  card.dataset.toy = t.id;
  previewIO.observe(card);
}

const NO_STILL = new Set([
  "cockpit/checklist", "cockpit/dial", "cockpit/input", "cockpit/launch",
  "cockpit/loading", "cockpit/lock", "cockpit/stepper", "cockpit/tabs",
  "hose/toast", "paradise/slider", "sakuga/toast",
]);

function mountPreview(card: HTMLElement, t: Toy, hover = false) {
  void import("./toy").then(async ({ loadPiece, mountEl }) => {
    await loadPiece(t);
    if (card.querySelector(".card-live")) return;
    const live = document.createElement("span");
    live.className = "card-live";
    if (hover) live.dataset.hover = "1";
    const el = mountEl(t);
    live.append(el);
    card.prepend(live);
    // Toasts render nothing until fired — re-fire while the card is alive.
    const show = (el as unknown as { show?: (m?: string) => void }).show;
    if (typeof show === "function") {
      show.call(el, t.title);
      const iv = setInterval(() => {
        if (!card.isConnected) { clearInterval(iv); return; }
        show.call(el, t.title);
      }, 4000);
    }
  }).catch(() => {});
}

// Desktop hover: mount the live element inside the card, one at a time.
const finePointer = matchMedia("(min-width: 768px) and (pointer: fine)");
let liveCard: HTMLElement | null = null;
function armPreview(card: HTMLElement, t: Toy) {
  card.addEventListener("pointerenter", () => {
    if (!finePointer.matches || liveCard === card) return;
    liveCard?.querySelector(".card-live")?.remove();
    liveCard = card;
    void (async () => {
      await new Promise((r) => setTimeout(r, 0));
      if (liveCard === card) mountPreview(card, t, true);
    })();
  });
  card.addEventListener("pointerleave", () => {
    if (liveCard === card) { card.querySelector(".card-live[data-hover]")?.remove(); liveCard = null; }
  });
}

const PIN_KEY = "fidget.pins";
const pins = new Set<string>(JSON.parse(localStorage.getItem(PIN_KEY) ?? "[]") as string[]);
const savePins = () => { try { localStorage.setItem(PIN_KEY, JSON.stringify([...pins])); } catch { /* ignore */ } };

function toyCard(t: Toy, onOpen: (id: string) => void): HTMLElement {
  const w = worldOf(t);
  const card = document.createElement("button");
  card.className = "card";
  card.style.background = w.card;
  card.style.color = w.ink;
  card.setAttribute("aria-label", t.title);
  const noStill = NO_STILL.has(t.id);
  card.innerHTML = `${pins.has(t.id) ? '<span class="card-pin" aria-hidden="true"></span>' : ""}
    ${noStill ? "" : `<img class="card-still" src="toys/${t.id}/card.png" alt="" loading="lazy" onerror="this.remove()" />`}
    <span class="card-name">${t.title}</span>`;
  if (noStill) observeLiveCard(card, t);
  // Long-press / right-click → pin. Suppress the click that follows release.
  let timer: ReturnType<typeof setTimeout> | null = null;
  let suppress = false;
  card.addEventListener("click", () => { if (suppress) { suppress = false; return; } onOpen(t.id); });
  armPreview(card, t);
  const togglePin = () => {
    suppress = true;
    if (pins.has(t.id)) pins.delete(t.id); else pins.add(t.id);
    savePins(); card.querySelector(".card-pin")?.remove();
    if (pins.has(t.id)) { const p = document.createElement("span"); p.className = "card-pin"; p.setAttribute("aria-hidden", "true"); card.prepend(p); }
    announce(pins.has(t.id) ? `Pinned ${t.title}` : `Unpinned ${t.title}`);
    ensurePinRow();
  };
  const start = () => { timer = setTimeout(togglePin, 550); };
  const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
  card.addEventListener("pointerdown", start);
  card.addEventListener("pointerup", cancel);
  card.addEventListener("pointercancel", cancel);
  card.addEventListener("pointerleave", cancel);
  card.addEventListener("contextmenu", (e) => { e.preventDefault(); });
  // Keyboard equivalent: P on a focused card pins it (gesture isn't the only path).
  card.addEventListener("keydown", (e) => {
    if (e.key === "p" || e.key === "P") { e.preventDefault(); togglePin(); }
  });
  return card;
}

function ensurePinRow() {
  const existing = document.getElementById("pin-row");
  const pinned = TOYS.filter((t) => pins.has(t.id));
  if (!pinned.length) { existing?.remove(); return; }
  if (existing) { // rebuild contents
    existing.querySelector(".row")!.replaceChildren(...pinned.map((t) => toyCard(t, openToy)));
    return;
  }
  const sec = document.createElement("section");
  sec.className = "world"; sec.id = "pin-row";
  sec.innerHTML = `<div class="world-head"><span class="world-dot" style="background:var(--ink)"></span>
    <h2 class="world-name">Your shelf</h2></div>`;
  const row = document.createElement("div");
  row.className = "row";
  row.append(...pinned.map((t) => toyCard(t, openToy)));
  sec.append(row);
  document.getElementById("shelf-worlds")!.prepend(sec);
}

let openToy: (id: string) => void = () => {};

let liveRegion: HTMLElement | null = null;
function announce(msg: string) {
  liveRegion ??= (() => {
    const el = document.createElement("div");
    el.setAttribute("aria-live", "polite");
    el.className = "sr-only";
    document.body.append(el);
    return el;
  })();
  liveRegion.textContent = msg;
}

export function renderShelf(root: HTMLElement, onOpen: (id: string) => void) {
  openToy = onOpen;
  root.innerHTML = "";
  const shelf = document.createElement("div");
  shelf.className = "shelf";
  shelf.innerHTML = `
    <div class="shelf-head">
      <div>
        ${location.pathname.includes("/myapps/") ? '<button class="shelf-back" id="back-btn" aria-label="Back to Waqt">‹ Waqt</button>' : ""}
        <h1 class="shelf-title">Fidget</h1>
        <p class="shelf-sub">${TOYS.length} toys · ${WORLDS.length} worlds · everything works offline</p>
      </div>
      <button class="icon-btn" id="settings-btn" aria-label="Settings">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
    </div>
    <div id="shelf-worlds"></div>`;
  root.append(shelf);

  const holder = shelf.querySelector("#shelf-worlds")!;
  for (const w of WORLDS) {
    const sec = document.createElement("section");
    sec.className = "world";
    sec.innerHTML = `<div class="world-head">
      <span class="world-dot" style="background:${w.accent}"></span>
      <h2 class="world-name">${w.name}</h2>
      <span class="world-blurb">${w.blurb}</span></div>`;
    const row = document.createElement("div");
    row.className = "row";
    const toys = TOYS.filter((t) => worldOf(t).id === w.id);
    row.append(...toys.map((t) => toyCard(t, onOpen)));
    sec.append(row);
    holder.append(sec);
  }
  ensurePinRow();

  shelf.querySelector("#back-btn")?.addEventListener("click", () => {
    if (window.history.length > 1) window.history.back(); else location.href = "/";
  });
  shelf.querySelector("#settings-btn")!.addEventListener("click", () => {
    import("./settingsSheet").then((m) => m.openSettingsSheet());
  });
}
