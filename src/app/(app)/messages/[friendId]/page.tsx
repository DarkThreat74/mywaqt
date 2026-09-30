export const dynamic = "force-dynamic";
export const metadata = { title: "Messages · Waqt" };

import ChatClient from "./ChatClient";

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ friendId: string }>;
}) {
  const { friendId } = await params;
  return <ChatClient friendId={friendId} />;
}
