import ShareLinkExpired from "@/components/share-link-expired";

export const dynamic = "force-dynamic";

// Legacy route — old share links land here. Any old-format token (32-char hex
// or 5-digit numeric) is expired. Show a clear message, never redirect.
export default async function LegacyNamedPublicCalendarPage({
  params,
}: {
  params: Promise<{ name: string; token: string }>;
}) {
  const { token } = await params;

  // Validate format to avoid rendering for garbage paths.
  if (!token || (!/^[a-f0-9]{32}$/.test(token) && !/^\d{5}$/.test(token) && !/^[A-Z2-9]{6}$/.test(token))) {
    return <ShareLinkExpired />;
  }

  // Old-format tokens are expired by definition — the owner has a new code.
  return <ShareLinkExpired />;
}
