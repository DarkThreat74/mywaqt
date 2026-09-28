export const dynamic = "force-dynamic";
export const metadata = { title: "Friend profile · Waqt" };

import ProfileClient from "../ProfileClient";

export default async function FriendProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProfileClient userId={id} />;
}
