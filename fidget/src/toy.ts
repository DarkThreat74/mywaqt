import { findToy, worldOf, TOYS, type Toy } from "./registry";
import { sfx } from "./sfx";
import { applySoundPref, haptic, hushAllAudio, prefs, savePrefs } from "./settings";
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

// Selectable states for the ambient (non-interactive) toys — shown as chips.
const AMBIENT_OPTIONS: Record<string, string[]> = {
  "paradise/agent-status": ["idle", "thinking", "searching", "tool", "writing", "error", "done"],
  "sand/thinking": ["idle", "thinking", "searching", "tool", "writing"],
  "cockpit/agent": ["standby", "thinking", "working", "waiting", "done", "error"],
};

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
    case "cockpit/stepper": {
      // "Active time" — once a value is committed, count it down in real time.
      on("change", () => {
        let v = Number((getEl() as AnyEl & { value?: number }).value) || 0;
        if (v <= 0) return;
        const iv = setInterval(() => {
          const cur = getEl() as AnyEl & { value?: number };
          v -= 1;
          cur.value = v;
          if (v <= 0) { clearInterval(iv); haptic("success"); }
        }, 1000);
        timers.push(iv as unknown as ReturnType<typeof setTimeout>);
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
        const opts = AMBIENT_OPTIONS[t.id];
        type AmbientEl = AnyEl & { state?: string; states?: string[]; set?: (s: string) => void; simulateRun?: () => void; demo?: () => void; play?: () => void };
        const setState = (s: string) => {
          const cur = getEl() as AmbientEl;
          if (typeof cur.set === "function") cur.set(s);
          else { cur.state = s; cur.setAttribute?.("state", s); }
        };
        // Tap the toy itself → replay the current animation, never switch.
        host.addEventListener("pointerdown", (e) => {
          if ((e.target as HTMLElement).closest?.(".toy-opts")) return;
          const cur = getEl() as AmbientEl;
          const s = String(cur.state ?? cur.getAttribute?.("state") ?? "");
          if (s) { cur.removeAttribute?.("state"); void cur.offsetWidth; cur.setAttribute?.("state", s); }
          else if (typeof cur.simulateRun === "function") cur.simulateRun();
          else if (typeof cur.play === "function") cur.play();
          else if (typeof cur.demo === "function") cur.demo();
        });
        // Option chips: pick which animation/state plays.
        const states = opts ?? (getEl() as AmbientEl).states;
        if (states?.length) {
          const bar = document.createElement("div");
          bar.className = "toy-opts";
          let active = String((getEl() as AmbientEl).state ?? "");
          for (const s of states) {
            const b = document.createElement("button");
            b.className = "toy-opt";
            b.textContent = s;
            b.dataset.on = String(s === active);
            b.addEventListener("click", () => {
              active = s; setState(s); haptic("light");
              bar.querySelectorAll(".toy-opt").forEach((x) => { (x as HTMLElement).dataset.on = String(x === b); });
            });
            bar.append(b);
          }
          host.append(bar);
          bar.addEventListener("pointerdown", (e) => e.stopPropagation());
        }
        // Kick off a first animation so the screen isn't static.
        const cur = getEl() as AmbientEl;
        if (typeof cur.simulateRun === "function") cur.simulateRun();
        else if (typeof cur.play === "function") cur.play();
        else if (typeof cur.demo === "function") cur.demo();
        else if (states?.length) setState(states.find((s) => s !== "idle") ?? states[0]);
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
  let t = findToy(toyId);
  if (!t) { onClose(); return; }
  const w = worldOf(t);
  const worldToys = TOYS.filter((x) => worldOf(x).id === w.id);
  let idx = worldToys.indexOf(t);
  tintBars(w.bg);

  const scr = document.createElement("div");
  scr.className = "toy";
  scr.style.background = w.bg;
  scr.style.color = w.ink;
  scr.innerHTML = `
    <div class="toy-top">
      <button class="toy-close" aria-label="Back to shelf">‹ Shelf</button>
      <span class="toy-name"><span class="world-dot" style="background:${w.accent}"></span><span class="toy-title">${t.title}</span></span>
    </div>
    <div class="toy-stage"></div>
    <div class="toy-bar">
      <button class="toy-nav" id="nav-prev" aria-label="Previous toy">‹</button>
      <button class="toy-mute" aria-label="Toggle sound" aria-pressed="${prefs.sound}"></button>
      <button class="toy-nav" id="nav-next" aria-label="Next toy">›</button>
    </div>`;
  const stage = scr.querySelector(".toy-stage") as HTMLElement;
  root.append(scr);
  // Lock the shelf behind the toy — wheel/scroll must not move it.
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  scr.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
  const prevFocus = document.activeElement as HTMLElement | null;
  const closeBtn = scr.querySelector(".toy-close") as HTMLElement;

  // Per-toy loading: a contained card, blurred still + accent spinner.
  const loadScreen = (toy: Toy, msg: string, retry = false) => `
    <div class="toy-load" style="--toy-accent:${w.accent}">
      <div class="toy-load-frame">
        <img class="toy-load-still" src="toys/${toy.id}/card.png" alt="" onerror="this.remove()" />
        <div class="toy-load-card">
          ${retry ? "" : '<span class="toy-load-spin"></span>'}
          <p class="toy-load-name">${toy.title}</p>
          <p class="toy-load-msg">${msg}</p>
          ${retry ? '<button class="toy-retry">Try again</button>' : ""}
        </div>
      </div>
    </div>`;

  let curToy = t;
  const wireSfx = () => {
    stage.onpointerdown = () => sfx(w.id, "down", curToy.id);
    stage.onpointerup = () => sfx(w.id, "up", curToy.id);
  };
  wireSfx();

  let dispose: (() => void) | null = null;
  const mount = async (dir = 0) => {
    const toy = curToy;
    stage.innerHTML = loadScreen(toy, `winding up the ${w.name}…`);
    await loadPiece(toy);
    const anim = document.createElement("div");
    anim.className = "toy-anim";
    const el = mountEl(toy);
    stripReadouts(el);
    anim.append(el);
    if (dir !== 0) {
      anim.style.transform = `translateX(${dir * 60}px)`;
      anim.style.opacity = "0";
    }
    stage.innerHTML = "";
    stage.append(anim);
    // paradise/tabs: the CRT scene is a fixed 500px painting — shrink it
    // to the stage so all three monitors stay on screen.
    if (toy.id === "paradise/tabs") {
      const fit = () => { el.style.zoom = String(Math.min(1, (stage.clientWidth - 16) / 500)); };
      fit();
      setTimeout(fit, 60);
    }
    if (dir !== 0) {
      void anim.offsetHeight; // reflow → transition runs
      anim.style.transform = "translateX(0)";
      anim.style.opacity = "1";
    }
    if (prefs.keepAwake) void KeepAwake.keepAwake().catch(() => {});
    // Read the live child — recreate() swaps the node after resets.
    const current = () => { const c = anim.firstElementChild as AnyEl; if (c) stripReadouts(c); return c; };
    dispose = attachBehavior(toy, anim, current);
  };

  // Slide out current toy, swap in the neighbor.
  let navBusy = false;
  const nav = async (dir: 1 | -1) => {
    if (navBusy || worldToys.length < 2) return;
    navBusy = true;
    idx = (idx + dir + worldToys.length) % worldToys.length;
    curToy = worldToys[idx];
    location.replace(`#/toy/${curToy.id}`);
    scr.querySelector(".toy-title")!.textContent = curToy.title;
    const old = stage.firstElementChild as HTMLElement | null;
    dispose?.(); dispose = null;
    killMedia(stage);
    hushAllAudio(); // dead toy's looping contexts go silent before the next mounts
    if (old) {
      old.style.transition = "transform .18s ease, opacity .18s ease";
      old.style.transform = `translateX(${dir * -60}px)`;
      old.style.opacity = "0";
      await new Promise((r) => setTimeout(r, 180));
    }
    stage.innerHTML = "";
    try { await mount(dir); } catch {
      stage.innerHTML = loadScreen(curToy, "this toy didn't load.", true);
      stage.querySelector(".toy-retry")!.addEventListener("click", () => { void mount(0).catch(() => {}); });
    }
    wireSfx();
    navBusy = false;
  };

  navBusy = true;
  try {
    await mount();
  } catch (err) {
    stage.innerHTML = loadScreen(t, "this toy didn't load.", true);
    stage.querySelector(".toy-retry")!.addEventListener("click", () => { void mount(0).catch(() => {}); });
    void err;
  }
  navBusy = false;
  closeBtn.focus();

  scr.querySelector("#nav-prev")!.addEventListener("click", () => void nav(-1));
  scr.querySelector("#nav-next")!.addEventListener("click", () => void nav(1));
  const esc = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") void nav(-1);
    else if (e.key === "ArrowRight") void nav(1);
  };
  document.addEventListener("keydown", esc);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", esc);
    dispose?.();
    if (prefs.keepAwake) void KeepAwake.allowSleep().catch(() => {});
    killMedia(scr);
    hushAllAudio();
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
