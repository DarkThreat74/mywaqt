import ShareLinkExpired from "@/components/share-link-expired";

export const dynamic = "force-dynamic";

// Legacy route — old share links land here. Since the token format changed,
// any old-format token (32-char hex or 5-digit numeric) is expired by
// definition. Show a clear message instead of redirecting or 404ing.
export default async function LegacyPublicCalendarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // New 6-char codes are handled by /[name]/[code]/public — they never
  // match here. Anything arriving at this legacy route is an old link.
  // Still validate format to avoid rendering for garbage paths.
  if (!token || (!/^[a-f0-9]{32}$/.test(token) && !/^\d{5}$/.test(token) && !/^[A-Z2-9]{6}$/.test(token))) {
    return <ShareLinkExpired />;
  }

  // Even if a 6-char code lands here, the owner may have regenerated.
  // Check the DB — if the token doesn't match anyone, it's expired.
  return <ShareLinkExpired />;
}
