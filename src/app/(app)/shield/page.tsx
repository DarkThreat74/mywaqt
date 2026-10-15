import type { Metadata } from "next";
import ShieldClient from "./ShieldClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Salah Shield" };

export default function ShieldPage() {
  return <ShieldClient />;
}
