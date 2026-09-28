import { unstable_cache, revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";

const KEY = "feedback_enabled";

// Cached 30s — the admin toggle propagates within a minute without
// costing a Neon round-trip on every app render.
export const isFeedbackEnabled = unstable_cache(
  async (): Promise<boolean> => {
    try {
      const [row] = await db
        .select({ value: schema.appSettings.value })
        .from(schema.appSettings)
        .where(eq(schema.appSettings.key, KEY))
        .limit(1);
      return row ? row.value === "1" : true; // default: enabled
    } catch {
      return true; // fail open — never hide the widget on a DB hiccup
    }
  },
  ["app-settings", KEY],
  { revalidate: 30, tags: ["app-settings"] },
);

export async function setFeedbackEnabled(enabled: boolean): Promise<void> {
  await db
    .insert(schema.appSettings)
    .values({ key: KEY, value: enabled ? "1" : "0", updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: enabled ? "1" : "0", updatedAt: new Date() },
    });
  revalidateTag("app-settings", "max");
}
