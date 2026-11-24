import { prefs, savePrefs } from "./settings";
import { KeepAwake } from "@capacitor-community/keep-awake";

const ROWS: { key: keyof typeof prefs; label: string; hint: string }[] = [
  { key: "sound",        label: "Sound",          hint: "every world's recorded effects" },
  { key: "haptics",      label: "Haptics",        hint: "detents, thuds, rumbles on native" },
  { key: "reduceMotion", label: "Reduce motion",  hint: "calmer toys on weak devices" },
  { key: "keepAwake",    label: "Keep screen awake", hint: "while a toy is open" },
];

export function openSettingsSheet() {
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", "Settings");
  sheet.innerHTML = `<h2>Settings</h2>`;
  for (const r of ROWS) {
    const row = document.createElement("div");
    row.className = "sheet-row";
    row.innerHTML = `<div>${r.label}<div style="color:var(--ink-dim);font-size:11px">${r.hint}</div></div>`;
    const sw = document.createElement("button");
    sw.className = `sw${prefs[r.key] ? " on" : ""}`;
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", String(prefs[r.key]));
    sw.setAttribute("aria-label", r.label);
    sw.addEventListener("click", () => {
      prefs[r.key] = !prefs[r.key];
      savePrefs();
      sw.classList.toggle("on", prefs[r.key]);
      sw.setAttribute("aria-checked", String(prefs[r.key]));
      if (r.key === "keepAwake") void (prefs.keepAwake ? KeepAwake.keepAwake() : KeepAwake.allowSleep()).catch(() => {});
      if (r.key === "sound") import("./settings").then((m) => m.applySoundPref()).catch(() => {});
    });
    row.append(sw);
    sheet.append(row);
  }
  const fine = document.createElement("p");
  fine.className = "sheet-fine";
  fine.textContent = "Toys from the finktheartist collections (MIT): Paradise OS, Zen Sand, Pinball, Cockpit, Rubber Hose, Sakuga VFX, Pixel Worlds. Works fully offline — no network, no account.";
  sheet.append(fine);
  bg.append(sheet);
  const prevFocus = document.activeElement as HTMLElement | null;
  const esc = (e: KeyboardEvent) => { if (e.key === "Escape") done(); };
  const done = () => { document.removeEventListener("keydown", esc); bg.remove(); prevFocus?.focus?.(); };
  document.addEventListener("keydown", esc);
  bg.addEventListener("click", (e) => { if (e.target === bg) done(); });
  document.body.append(bg);
  (sheet.querySelector(".sw") as HTMLElement | null)?.focus();
}
