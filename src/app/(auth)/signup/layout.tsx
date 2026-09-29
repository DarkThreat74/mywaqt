import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Sign up for Waqt — a free prayer-centered life tracker. Prayer check-ins, qadaa tracking, prayer friends, masjid iqamah times, and full offline support.",
  alternates: { canonical: "/signup" },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
