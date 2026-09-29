import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log in",
  description:
    "Log in to Waqt — your prayer-anchored calendar, prayer check-ins, and qadaa tracker.",
  alternates: { canonical: "/login" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
