import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db/client";
import OnboardingWizard from "./wizard";

export const dynamic = "force-dynamic";

/**
 * Server gate for /onboarding: a completed account can never render the
 * wizard — the URL itself redirects. This is the hard backstop; the client
 * OnboardingGuard covers client-side navigation between renders.
 */
export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [u] = await db
    .select({ onboardingCompleted: schema.users.onboardingCompleted })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);

  if (u?.onboardingCompleted) redirect("/calendar/day");

  return <OnboardingWizard userId={session.userId} />;
}
