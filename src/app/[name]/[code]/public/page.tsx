import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import PublicCalendarClient from "@/app/user/public/[token]/PublicCalendarClient";
import { slugifyName } from "@/lib/slugify";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

// Generate metadata for the public calendar page — shows in link previews
// as "Umar's calendar" with the Waqt icon.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string; code: string }>;
}): Promise<Metadata> {
  const { code } = await params;

  let user: { id: string; displayName: string | null } | undefined;
  try {
    [user] = await db
      .select({ id: schema.users.id, displayName: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.publicShareToken, code))
      .limit(1);
  } catch {
    // DB error — treat as not found
  }

  if (!user) {
    return { title: "Calendar not found — Waqt" };
  }

  const name = user.displayName || "Shared";
  const title = `${name}'s calendar — Waqt`;
  const description = `${name}'s prayer-centered calendar. Read-only shared view.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "Waqt",
      type: "website",
      images: [
        {
          url: "/icon.svg",
          width: 512,
          height: 512,
          alt: "Waqt",
        },
      ],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: ["/icon.svg"],
    },
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    },
  };
}

export default async function PublicCalendarPage({
  params,
}: {
  params: Promise<{ name: string; code: string }>;
}) {
  const { name, code } = await params;

  // Code is a 128-bit hex string (32 chars). Legacy 5-digit codes are no
  // longer accepted — they were enumerable and allowed IDOR access.
  if (!code || !/^[a-f0-9]{32}$/.test(code)) {
    notFound();
  }

  // Verify the code exists and get the display name
  let user: { id: string; displayName: string | null } | undefined;
  try {
    [user] = await db
      .select({ id: schema.users.id, displayName: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.publicShareToken, code))
      .limit(1);
  } catch {
    // DB error — treat as not found
  }

  if (!user) {
    notFound();
  }

  // If the name in the URL doesn't match the user's slugified name,
  // redirect to the correct URL (handles old links or name changes)
  const expectedSlug = slugifyName(user.displayName || "shared");
  if (name !== expectedSlug) {
    redirect(`/${expectedSlug}/${code}/public`);
  }

  return <PublicCalendarClient token={code} displayName={user.displayName || "Shared"} />;
}
