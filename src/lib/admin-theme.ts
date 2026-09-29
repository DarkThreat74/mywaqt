// Admin portal theme — separate from the user's app theme ("waqt:theme").
// Sets <html data-theme>, which globals.css keys all color tokens off of.

export type AdminTheme = "light" | "dark" | "system";

export function readAdminTheme(): AdminTheme {
  try {
    const t = localStorage.getItem("waqt:admin:theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyAdminTheme(t: AdminTheme) {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

// Restores whatever the user's app theme is — mirrors the inline script in
// src/app/layout.tsx so leaving /admin doesn't leave the whole app dark.
export function restoreAppTheme() {
  try {
    const t = localStorage.getItem("waqt:theme");
    const dark = t === "dark" || (t !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  } catch {
    /* keep whatever is set */
  }
}
