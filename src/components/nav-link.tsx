"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Nav link with intent prefetch: warms the route's RSC payload on
 * hover/pointer-down so the tap itself paints from cache. prefetch={false}
 * stays — only an actual gesture costs data, never mere visibility.
 */
export default function NavLink({
  href, className, style, children,
}: {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const router = useRouter();
  const warm = () => router.prefetch(href);
  return (
    <Link href={href} prefetch={false} onPointerEnter={warm} onPointerDown={warm} className={className} style={style}>
      {children}
    </Link>
  );
}
