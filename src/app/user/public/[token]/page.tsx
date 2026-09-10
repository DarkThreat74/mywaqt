import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { slugifyName } from "@/lib/slugify";

export const dynamic = "force-dynamic";

// Legacy route — redirects to /[name]/[code]/public
export default async function LegacyPublicCalendarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Token is a 6-char share code (unambiguous alphabet). Legacy 32-char hex
  // tokens are also accepted so existing shared links don't break.
  if (!token || (!/^[A-Z2-9]{6}$/.test(token) && !/^[a-f0-9]{32}$/.test(token))) {
    notFound();
  }

  let user: { id: string; displayName: string | null } | undefined;
  try {
    [user] = await db
      .select({ id: schema.users.id, displayName: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.publicShareToken, token))
      .limit(1);
  } catch {
    // DB error — treat as not found
  }

  if (!user) {
    notFound();
  }

  const slug = slugifyName(user.displayName || "shared");
  redirect(`/${slug}/${token}/public`);
}
