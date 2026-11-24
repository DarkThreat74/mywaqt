import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.waqt.fidget",
  appName: "Fidget",
  webDir: "dist",
  android: { allowMixedContent: false },
  plugins: {
    EdgeToEdge: { backgroundColor: "#17140f" },
  },
};

export default config;
