import "./styles.css";
import { renderShelf } from "./shelf";
import { openToyScreen } from "./toy";
import { installSoundGate } from "./settings";
import { App } from "@capacitor/app";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";

installSoundGate();

const root = document.getElementById("app")!;
let toyOpen = false;

const open = (id: string) => {
  if (toyOpen) return;
  toyOpen = true;
  location.hash = `#/toy/${id}`;
  void openToyScreen(root, id, () => { toyOpen = false; location.replace("#/"); });
};

renderShelf(root, open);

// Hash navigation (back button / manual)
window.addEventListener("hashchange", () => {
  const m = location.hash.match(/^#\/toy\/(.+)$/);
  if (m && !toyOpen) open(m[1]);
  if (!m && toyOpen) document.querySelector(".toy-close")?.dispatchEvent(new Event("click"));
});

// Deep link on load
const m0 = location.hash.match(/^#\/toy\/(.+)$/);
if (m0) open(m0[1]);

// Native chrome
void App.addListener("backButton", () => {
  if (toyOpen) document.querySelector(".toy-close")?.dispatchEvent(new Event("click"));
  else if (location.pathname.includes("/myapps/")) {
    try { window.top!.location.href = "/"; } catch { location.href = "/"; }
  } else void App.exitApp();
}).catch(() => {});
void Keyboard.setResizeMode({ mode: KeyboardResize.Native }).catch(() => {});
