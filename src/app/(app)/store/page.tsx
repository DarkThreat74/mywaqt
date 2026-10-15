import type { Metadata } from "next";
import StoreClient from "./StoreClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Store" };

export default function StorePage() {
  return <StoreClient />;
}
