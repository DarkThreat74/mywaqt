export type Prefs = { sound: boolean; haptics: boolean; reduceMotion: boolean; keepAwake: boolean };

const KEY = "fidget.prefs";
const defaults: Prefs = { sound: true, haptics: true,
  reduceMotion: matchMedia("(prefers-reduced-motion: reduce)").matches, keepAwake: false };

export const prefs: Prefs = (() => {
  try { return { ...defaults, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Prefs>) }; }
  catch { return { ...defaults }; }
})();

export function savePrefs() {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode */ }
}

// ── Sound gate: elements own their audio internals, so we gate at the
// platform seam — AudioContext stays suspended and media play() no-ops. ──
// Weak refs — contexts from closed toys must stay GC-able; a strong Set
// leaks them forever and every pointerdown would resume dead contexts.
const ctxs = new Set<WeakRef<AudioContext>>();
let origResumeFn: ((this: AudioContext) => Promise<void>) | null = null;
function eachCtx(fn: (c: AudioContext) => void) {
  for (const r of [...ctxs]) {
    const c = r.deref();
    if (!c) ctxs.delete(r); else fn(c);
  }
}

export function installSoundGate() {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctx) {
    origResumeFn = Ctx.prototype.resume;
    Ctx.prototype.resume = function (this: AudioContext) {
      return prefs.sound ? origResumeFn!.call(this) : Promise.resolve();
    };
    // Register every context an element creates — most worlds never call
    // resume() themselves, so without this they stay suspended (silent).
    const Orig = Ctx;
    const Wrapped = new Proxy(Orig, {
      construct(target, args) {
        const c = new target(...args) as AudioContext;
        ctxs.add(new WeakRef(c));
        return c;
      },
    });
    (window as { AudioContext?: typeof AudioContext }).AudioContext = Wrapped;
    const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
    if (w.webkitAudioContext) w.webkitAudioContext = Wrapped;
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    if (!prefs.sound) { this.pause(); return Promise.resolve(); }
    return play.call(this);
  };
  // Every user gesture unlocks every context (WebView autoplay policy).
  window.addEventListener("pointerdown", () => {
    if (!prefs.sound) return;
    eachCtx((c) => { if (c.state === "suspended") void origResumeFn?.call(c); });
  }, { capture: true, passive: true });
}

// Called when the Sound toggle flips: off silences in-flight audio, on
// re-unlocks at the next gesture via the gate above.
export function applySoundPref() {
  eachCtx((c) => {
    if (prefs.sound) { if (c.state === "suspended") void origResumeFn?.call(c); }
    else if (c.state === "running") void c.suspend();
  });
}

export function haptic(level: "light" | "medium" | "heavy" | "success" | "error" | "warn") {
  if (!prefs.haptics) return;
  void import("@capacitor/haptics").then(({ Haptics, ImpactStyle, NotificationType }) => {
    if (level === "success") void Haptics.notification({ type: NotificationType.Success });
    else if (level === "error") void Haptics.notification({ type: NotificationType.Error });
    else if (level === "warn") void Haptics.notification({ type: NotificationType.Warning });
    else void Haptics.impact({ style: level === "heavy" ? ImpactStyle.Heavy : level === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
  }).catch(() => {});
}
