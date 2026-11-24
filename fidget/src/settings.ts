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
export function installSoundGate() {
  let ctxRef: AudioContext | null = null;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctx) {
    const orig = Ctx.prototype.resume;
    Ctx.prototype.resume = function (this: AudioContext) {
      ctxRef = this; liveCtx = this;
      return prefs.sound ? orig.call(this) : Promise.resolve();
    };
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    if (!prefs.sound) { this.pause(); return Promise.resolve(); }
    return play.call(this);
  };
  // First user gesture unlocks audio (WebView autoplay policy).
  window.addEventListener("pointerdown", () => {
    if (prefs.sound && ctxRef && ctxRef.state === "suspended") void origResume(ctxRef);
  }, { capture: true, passive: true });
}
function origResume(ctx: AudioContext) { return ctx.resume(); }

// Called when the Sound toggle flips: off silences in-flight audio, on
// re-unlocks at the next gesture via the gate above.
let liveCtx: AudioContext | null = null;
export function applySoundPref() {
  if (!liveCtx) return;
  if (prefs.sound) { if (liveCtx.state === "suspended") void origResume(liveCtx); }
  else if (liveCtx.state === "running") void liveCtx.suspend();
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
