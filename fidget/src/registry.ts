export type WorldId = "pinball" | "paradise" | "sand" | "pixel" | "hose" | "sakuga" | "cockpit";

export type Toy = {
  id: string;          // "pinball/bumper"
  title: string;
  tag: string;         // custom element tag
  file: string;        // js filename inside the piece dir
  ambient?: boolean;   // needs a state driver
  loop?: boolean;      // needs a reset shim
};

export type World = {
  id: WorldId;
  name: string;
  blurb: string;
  bg: string;          // toy-screen backdrop
  card: string;        // card background
  ink: string;         // text color
  accent: string;
};

export const WORLDS: World[] = [
  { id: "pinball",  name: "Pinball",       blurb: "1960s electromechanical — chrome, lamps, relays",
    bg: "#1a1710",  card: "#f4ead2", ink: "#241c0e", accent: "#d9a441" },
  { id: "paradise", name: "Paradise OS",   blurb: "the 1995 that never happened",
    bg: "#d8d2c4",  card: "#efeae0", ink: "#3a362e", accent: "#e28bb4" },
  { id: "sand",     name: "Zen Sand",      blurb: "simulated sand, real scrape",
    bg: "#14100c",  card: "#e8ddc8", ink: "#4a3f2e", accent: "#c9a86a" },
  { id: "pixel",    name: "Pixel Worlds",  blurb: "tiny living scenes inside the controls",
    bg: "#0d0f16",  card: "#1c2233", ink: "#cfd8ea", accent: "#6f8fd4" },
  { id: "hose",     name: "Rubber Hose",   blurb: "a 1930s cartoon where every control is a guy",
    bg: "#efe6d0",  card: "#f8f1e0", ink: "#1c1812", accent: "#c22f2f" },
  { id: "sakuga",   name: "Sakuga",        blurb: "key-frame anime effects on plain controls",
    bg: "#faf8ff",  card: "#ffffff", ink: "#241f38", accent: "#e0559a" },
  { id: "cockpit",  name: "Cockpit",       blurb: "the launch bay of a 90s giant robot",
    bg: "#0a0d0a",  card: "#101512", ink: "#b8d4b0", accent: "#67d46f" },
];

const W = (id: WorldId) => WORLDS.find((w) => w.id === id)!;

export const TOYS: Toy[] = [
  // ── Pinball ──
  { id: "pinball/bumper",  title: "Pop bumpers",  tag: "pinball-bumpers", file: "bumper.js" },
  { id: "pinball/plunger", title: "Shooter rod",  tag: "pinball-plunger", file: "plunger.js", loop: true },
  { id: "pinball/toggle",  title: "Lane toggle",  tag: "pinball-toggle",  file: "toggle.js" },
  { id: "pinball/slider",  title: "Lamp lane",    tag: "pinball-slider",  file: "slider.js" },
  { id: "pinball/stepper", title: "Score reels",  tag: "pinball-stepper", file: "stepper.js" },
  { id: "pinball/targets", title: "Drop targets", tag: "pinball-targets", file: "targets.js" },
  { id: "pinball/drain",   title: "The drain",    tag: "pinball-drain",   file: "drain.js", loop: true },
  // ── Paradise ──
  { id: "paradise/cd-dial",       title: "CD jukebox",    tag: "paradise-cd-dial",        file: "cd-dial.js" },
  { id: "paradise/eq",            title: "Pool equalizer",tag: "paradise-eq",             file: "eq.js" },
  { id: "paradise/slider",        title: "Pool slider",   tag: "paradise-pool-slider",    file: "slider.js" },
  { id: "paradise/button",        title: "Cascade dialog",tag: "paradise-cascade-button", file: "button.js" },
  { id: "paradise/toggle",        title: "Dream switch",  tag: "paradise-toggle",         file: "toggle.js" },
  { id: "paradise/tabs",          title: "CRT tabs",      tag: "paradise-crt-tabs",       file: "tabs.js" },
  { id: "paradise/agent-status",  title: "Marble bust",   tag: "paradise-statue",         file: "agent-status.js", ambient: true },
  // ── Zen Sand ──
  { id: "sand/slider",    title: "The rake",      tag: "sand-slider",    file: "slider.js" },
  { id: "sand/signature", title: "Sign the sand", tag: "sand-signature", file: "signature.js" },
  { id: "sand/thinking",  title: "Self-raking",   tag: "sand-thinking",  file: "thinking.js", ambient: true },
  { id: "sand/toggle",    title: "River stone",   tag: "sand-toggle",    file: "toggle.js" },
  // ── Pixel Worlds ──
  { id: "pixel/hoard", title: "Dragon hoard",   tag: "hoard-button",  file: "hoard.js" },
  { id: "pixel/keep",  title: "Build the keep", tag: "keep-field",    file: "keep.js" },
  { id: "pixel/raven", title: "The raven",      tag: "raven-send",    file: "raven.js", loop: true },
  { id: "pixel/sage",  title: "The sage",       tag: "sage-status",   file: "sage.js", ambient: true },
  { id: "pixel/round", title: "Tavern round",   tag: "round-bar",     file: "round.js", ambient: true },
  { id: "pixel/sigil", title: "Summoning ring", tag: "sigil-spinner", file: "sigil.js", ambient: true },
  // ── Rubber Hose ──
  { id: "hose/button",   title: "Bop the dome",   tag: "hose-button",   file: "button.js" },
  { id: "hose/toggle",   title: "Taffy bulb",     tag: "hose-toggle",   file: "toggle.js" },
  { id: "hose/slider",   title: "Trombone",       tag: "hose-slider",   file: "slider.js" },
  { id: "hose/checkbox", title: "Self-tick",      tag: "hose-checkbox", file: "checkbox.js" },
  { id: "hose/radio",    title: "Sleepy heads",   tag: "hose-radio",    file: "radio.js" },
  { id: "hose/input",    title: "Fountain pen",   tag: "hose-input",    file: "input.js" },
  { id: "hose/tabs",     title: "Kicking folder", tag: "hose-tabs",     file: "tabs.js" },
  { id: "hose/progress", title: "Thermometer",    tag: "hose-progress", file: "progress.js", loop: true },
  { id: "hose/rating",   title: "Star chorus",    tag: "hose-rating",   file: "rating.js" },
  { id: "hose/toast",    title: "The toaster",    tag: "hose-toast",    file: "toast.js", loop: true },
  { id: "hose/tooltip",  title: "Hint bird",      tag: "hose-tooltip",  file: "tooltip.js" },
  // ── Sakuga ──
  { id: "sakuga/button",   title: "Impact",        tag: "sakuga-button",   file: "button.js" },
  { id: "sakuga/toggle",   title: "43 frames",     tag: "sakuga-toggle",   file: "toggle.js" },
  { id: "sakuga/slider",   title: "Teardrop",      tag: "sakuga-slider",   file: "slider.js" },
  { id: "sakuga/checkbox", title: "Crescents",     tag: "sakuga-checkbox", file: "checkbox.js" },
  { id: "sakuga/radio",    title: "Wedge fan",     tag: "sakuga-radio",    file: "radio.js" },
  { id: "sakuga/input",    title: "Dust keys",     tag: "sakuga-input",    file: "input.js" },
  { id: "sakuga/tabs",     title: "Stretch tab",   tag: "sakuga-tabs",     file: "tabs.js" },
  { id: "sakuga/progress", title: "Storm edge",    tag: "sakuga-progress", file: "progress.js", loop: true },
  { id: "sakuga/rating",   title: "Star pop",      tag: "sakuga-rating",   file: "rating.js" },
  { id: "sakuga/toast",    title: "Smear in",      tag: "sakuga-toast",    file: "toast.js", loop: true },
  { id: "sakuga/tooltip",  title: "Bubble snap",   tag: "sakuga-tooltip",  file: "tooltip.js" },
  // ── Cockpit ──
  { id: "cockpit/launch",    title: "Launch",        tag: "cockpit-launch",    file: "launch.js", loop: true },
  { id: "cockpit/dial",      title: "Output gain",   tag: "cockpit-dial",      file: "dial.js" },
  { id: "cockpit/checklist", title: "Pre-launch",    tag: "cockpit-checklist", file: "checklist.js", loop: true },
  { id: "cockpit/lock",      title: "Safety lock",   tag: "cockpit-lock",      file: "lock.js" },
  { id: "cockpit/mode",      title: "Drive mode",    tag: "cockpit-mode",      file: "mode.js" },
  { id: "cockpit/alert",     title: "Alert levels",  tag: "cockpit-alert",     file: "alert.js" },
  { id: "cockpit/tabs",      title: "Monitors",      tag: "cockpit-tabs",      file: "tabs.js" },
  { id: "cockpit/agent",     title: "Hologram",      tag: "cockpit-agent",     file: "agent.js", ambient: true },
  { id: "cockpit/loading",   title: "System load",   tag: "cockpit-loading",   file: "loading.js", ambient: true },
  { id: "cockpit/stepper",   title: "Active time",   tag: "cockpit-stepper",   file: "stepper.js" },
  { id: "cockpit/input",     title: "Callsign",      tag: "cockpit-input",     file: "input.js" },
];

export const worldOf = (toy: Toy) => W(toy.id.split("/")[0] as WorldId);
export const findToy = (id: string) => TOYS.find((t) => t.id === id);
