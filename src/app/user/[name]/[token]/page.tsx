import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { slugifyName } from "@/lib/slugify";

export const dynamic = "force-dynamic";

// Legacy route — redirects to /[name]/[code]/public
export default async function LegacyNamedPublicCalendarPage({
  params,
}: {
  params: Promise<{ name: string; token: string }>;
}) {
  const { token } = await params;

  // Token may be an old 32-char hex string or a new 5-digit code
  if (!token || !(/^([a-f0-9]{32}|\d{5})$/.test(token))) {
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
