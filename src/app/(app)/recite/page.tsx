export const dynamic = "force-dynamic";
export const metadata = { title: "Recite Coach · Waqt" };

import ReciteCoachClient from "@/features/recite-coach/ReciteCoachClient";

export default function RecitePage() {
  return <ReciteCoachClient />;
}
