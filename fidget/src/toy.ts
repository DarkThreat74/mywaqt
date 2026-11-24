import { findToy, worldOf, type Toy } from "./registry";
import { sfx } from "./sfx";
import { applySoundPref, haptic, prefs, savePrefs } from "./settings";
import { KeepAwake } from "@capacitor-community/keep-awake";

// Strip value readouts inside open shadow roots — pure feel, no numbers.
const READOUT_CSS = `[class*=value],[class*=readout],[class*=counter],[part=value],output{display:none!important}`;
function stripReadouts(el: AnyEl) {
  const sr = el.shadowRoot;
  if (!sr || sr.querySelector("style.fidget-strip")) return;
  const s = document.createElement("style");
  s.className = "fidget-strip";
  s.textContent = READOUT_CSS;
  sr.append(s);
}

// ── Edge-to-edge world tint (native only; no-op on web) ──
function tintBars(color: string) {
  void import("@capawesome/capacitor-android-edge-to-edge-support")
    .then((m) => m.EdgeToEdge.setBackgroundColor({ color })).catch(() => {});
}

type AnyEl = HTMLElement & Record<string, unknown>;

const loading = new Map<string, Promise<void>>();
export function loadPiece(t: Toy): Promise<void> {
  let p = loading.get(t.id);
  if (!p) {
    // Classic <script> tag, not import(): the elements resolve sibling assets
    // via document.currentScript.src, which is null inside a module load.
    p = new Promise<void>((res, rej) => {
      const s = document.createElement("script");
      s.src = `toys/${t.id}/${t.file}`;
      s.onload = () => res();
      s.onerror = () => { loading.delete(t.id); rej(new Error(`toy load failed: ${t.id}`)); };
      document.head.appendChild(s);
    });
    loading.set(t.id, p);
  }
  return p;
}

export function mountEl(t: Toy): AnyEl {
  const el = document.createElement(t.tag) as AnyEl;
  // Piece attrs that need to exist before connect
  if (t.id === "paradise/cd-dial") el.setAttribute("tracks", "toys/paradise/audio/");
  if (t.id === "pinball/drain") el.setAttribute("window", "5000");
  return el;
}

// Deep cleanup before a toy screen dies — elements keep videos decoding
// and WebGL buffers alive inside shadow roots unless we kill them first.
function killMedia(root: HTMLElement) {
  const walk = (node: Element | ShadowRoot) => {
    for (const v of node.querySelectorAll("video")) {
      v.pause();
      if (v.src.startsWith("blob:")) URL.revokeObjectURL(v.src);
      v.removeAttribute("src");
      v.load();
    }
    for (const c of node.querySelectorAll("canvas")) {
      const gl = (c.getContext("webgl") ?? c.getContext("webgl2")) as WebGLRenderingContext | null;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    }
    for (const el of node.querySelectorAll("*")) if (el.shadowRoot) walk(el.shadowRoot);
  };
  walk(root);
}

// Universal reset: a fresh node resets every internal state.
function recreate(host: HTMLElement, t: Toy): AnyEl {
  const el = mountEl(t);
  host.replaceChildren(el);
  return el;
}

const AMBIENT_STATES = ["thinking", "searching", "writing", "running", "reading", "done"];

// Per-toy shims — the tier-2 resets and tier-3 drivers.
function attachBehavior(t: Toy, host: HTMLElement, getEl: () => AnyEl): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
  // Bind to host, not el: events bubble up from whichever child node is
  // live — listeners must survive recreate() swaps.
  const on = (type: string, fn: (e: Event) => void) => host.addEventListener(type, fn);

  switch (t.id) {
    case "cockpit/launch":
      on("cockpit:launch", () => {
        haptic("success");
        later(2200, () => {
          const cur = getEl() as AnyEl & { reset?: () => void };
          if (typeof cur.reset === "function") cur.reset(); else recreate(host, t);
        });
      });
      break;
    case "pinball/drain":
      on("commit", () => { haptic("warn"); later(900, () => recreate(host, t)); });
      break;
    case "pinball/plunger":
      on("send", () => { haptic("heavy"); later(1400, () => recreate(host, t)); });
      break;
    case "pixel/raven":
      // flight completes ~2.5s after send → re-arm
      on("raven:sent", () => { haptic("medium"); later(3200, () => recreate(host, t)); });
      break;
    case "cockpit/checklist": {
      // Reset once all four are ticked (ITEMS = 4 in the element source)
      let ticks = 0;
      on("change", (e) => {
        ticks += (e as CustomEvent).detail?.checked === false ? -1 : 1;
        if (ticks >= 4) { haptic("success"); later(2600, () => { recreate(host, t); ticks = 0; }); }
      });
      break;
    }
    case "hose/toast": case "sakuga/toast": {
      // Verified: el.show(message) — self-dismisses, re-arms itself.
      const msgs = ["POP!", "Fresh toast!", "Done!", "Hot one!"];
      let mi = 0;
      host.addEventListener("pointerdown", () => {
        const cur = getEl() as AnyEl & { show?: (m: string) => void };
        cur.show?.(msgs[mi++ % msgs.length]);
        haptic("light");
      });
      break;
    }
    // tooltips self-toggle on tap — no shim needed
    case "hose/progress": case "sakuga/progress": case "pixel/sigil": case "cockpit/loading": {
      if (prefs.reduceMotion) break; // no self-running animation
      // hold-to-fill / auto-loop driver
      let v = 0;
      const tick = () => {
        const cur = getEl() as AnyEl & { value?: number; set?: (n: number) => void; demo?: () => void };
        if (typeof cur.demo === "function" && v === 0) { cur.demo(); v = -1; return; }
        v = v >= 0 ? Math.min(1, v + 0.02) : v;
        if (v >= 0) {
          if (typeof cur.set === "function") cur.set(v); else cur.value = v;
          if (v >= 1) { haptic("success"); v = 0; later(1800, () => { const c = getEl(); if (typeof c.set === "function") c.set(0); else c.value = 0; }); }
        }
      };
      const iv = setInterval(tick, 120);
      timers.push(iv as unknown as ReturnType<typeof setTimeout>);
      break;
    }
    default:
      if (t.ambient) {
        // state-cycling driver: tap → next state, else idle cycle every 8s
        let i = 0;
        const cycle = () => {
          const cur = getEl() as AnyEl & { state?: string; simulateRun?: () => void; demo?: () => void };
          if (typeof cur.simulateRun === "function") { cur.simulateRun(); return; }
          if (typeof cur.demo === "function") { cur.demo(); return; }
          cur.state = AMBIENT_STATES[i++ % AMBIENT_STATES.length];
          cur.setAttribute?.("state", String(cur.state));
        };
        host.addEventListener("pointerdown", cycle);
        if (!prefs.reduceMotion) {
          const iv = setInterval(cycle, 8000);
          timers.push(iv as unknown as ReturnType<typeof setTimeout>);
        }
        cycle();
      }
  }

  // Generic tactile haptics: medium on pointerdown for mechanical worlds.
  if (["pinball", "cockpit", "hose"].includes(t.id.split("/")[0])) {
    host.addEventListener("pointerdown", () => haptic("medium"));
  }
  // Detent ticks: light haptic on control input, throttled to ≤80ms.
  let lastTick = 0;
  host.addEventListener("input", () => {
    const now = performance.now();
    if (now - lastTick >= 80) { lastTick = now; haptic("light"); }
  });

  return () => timers.forEach((x) => { clearTimeout(x); clearInterval(x as unknown as ReturnType<typeof setInterval>); });
}

export async function openToyScreen(root: HTMLElement, toyId: string, onClose: () => void) {
  const t = findToy(toyId);
  if (!t) { onClose(); return; }
  const w = worldOf(t);
  tintBars(w.bg);

  const scr = document.createElement("div");
  scr.className = "toy";
  scr.style.background = w.bg;
  scr.style.color = w.ink;
  scr.innerHTML = `
    <div class="toy-top">
      <button class="toy-close" aria-label="Back to shelf">‹ Shelf</button>
      <span class="toy-name"><span class="world-dot" style="background:${w.accent}"></span>${t.title}</span>
    </div>
    <div class="toy-stage"></div>
    <button class="toy-mute" aria-label="Toggle sound" aria-pressed="${prefs.sound}"></button>`;
  const stage = scr.querySelector(".toy-stage") as HTMLElement;
  stage.addEventListener("pointerdown", () => sfx(w.id, "down"));
  stage.addEventListener("pointerup", () => sfx(w.id, "up"));
  root.append(scr);
  // Lock the shelf behind the toy — wheel/scroll must not move it.
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  scr.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
  const prevFocus = document.activeElement as HTMLElement | null;
  const closeBtn = scr.querySelector(".toy-close") as HTMLElement;

  // Per-toy loading: blurred card still (or accent glow) + name + spinner.
  const loadScreen = (msg: string, retry = false) => `
    <div class="toy-load" style="--toy-accent:${w.accent}">
      <img class="toy-load-still" src="toys/${t.id}/card.png" alt="" onerror="this.remove()" />
      <div class="toy-load-card">
        ${retry ? "" : '<span class="toy-load-spin"></span>'}
        <p class="toy-load-name">${t.title}</p>
        <p class="toy-load-msg">${msg}</p>
        ${retry ? '<button class="toy-retry">Try again</button>' : ""}
      </div>
    </div>`;

  const mount = async () => {
    stage.innerHTML = loadScreen(`winding up the ${w.name}…`);
    await loadPiece(t);
    stage.innerHTML = "";
    const el = mountEl(t);
    stripReadouts(el);
    stage.append(el);
    if (prefs.keepAwake) void KeepAwake.keepAwake().catch(() => {});
    // Read the live child — recreate() swaps the node after resets.
    const current = () => { const c = stage.firstElementChild as AnyEl; if (c) stripReadouts(c); return c; };
    dispose = attachBehavior(t, stage, current);
  };

  let dispose: (() => void) | null = null;
  try {
    await mount();
  } catch (err) {
    stage.innerHTML = loadScreen("this toy didn't load.", true);
    stage.querySelector(".toy-retry")!.addEventListener("click", () => { void mount().catch(() => {}); });
    void err;
  }
  closeBtn.focus();

  const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", esc);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", esc);
    dispose?.();
    if (prefs.keepAwake) void KeepAwake.allowSleep().catch(() => {});
    killMedia(scr);
    stage.replaceChildren(); // disconnect the element → its own cleanup fires
    scr.remove();
    document.body.style.overflow = prevOverflow;
    tintBars("#17140f");
    prevFocus?.focus?.();
    onClose();
  };
  scr.querySelector(".toy-close")!.addEventListener("click", close);

  const muteBtn = scr.querySelector(".toy-mute") as HTMLButtonElement;
  const paintMute = () => {
    muteBtn.dataset.on = String(prefs.sound);
    muteBtn.setAttribute("aria-pressed", String(prefs.sound));
    muteBtn.title = prefs.sound ? "Sound on" : "Sound off";
  };
  paintMute();
  muteBtn.addEventListener("click", () => {
    prefs.sound = !prefs.sound;
    savePrefs(); applySoundPref(); paintMute();
  });
}
