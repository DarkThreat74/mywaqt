import type { Metadata } from "next";
import FriendsClient from "./FriendsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Friends" };

export default function FriendsPage() {
  return <FriendsClient />;
}
