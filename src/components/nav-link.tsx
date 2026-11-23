"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Nav link with intent prefetch: warms the route's RSC payload on
 * hover/pointer-down so the tap itself paints from cache. prefetch={false}
 * stays — only an actual gesture costs data, never mere visibility.
 *
 * Also owns the active-nav contract: a link is "current" when the pathname
 * shares its first segment (/calendar/day also lights /calendar/month), and
 * gets aria-current="page" + the caller's active styles.
 */
export default function NavLink({
  href, className, style, activeClassName, activeStyle, children,
}: {
  href: string;
  className?: string;
  style?: React.CSSProperties;
  activeClassName?: string;
  activeStyle?: React.CSSProperties;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const warm = () => router.prefetch(href);
  const section = `/${href.split("/")[1]}`;
  const active = pathname === href || pathname === section || pathname.startsWith(`${section}/`);
  return (
    <Link
      href={href}
      prefetch={false}
      onPointerEnter={warm}
      onPointerDown={warm}
      className={active && activeClassName ? `${className} ${activeClassName}` : className}
      style={active && activeStyle ? { ...style, ...activeStyle } : style}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
