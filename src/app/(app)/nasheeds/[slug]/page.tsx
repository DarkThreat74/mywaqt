export const dynamic = "force-dynamic";
export const metadata = { title: "Nasheed · Waqt" };

import NasheedClient from "./NasheedClient";

export default async function NasheedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <NasheedClient slug={slug} />;
}
