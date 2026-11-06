"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChefHat,
  Cube,
  Monitor,
  SquaresFour,
  Storefront,
  Users,
} from "@phosphor-icons/react";

const NAV_ICONS = {
  overview: SquaresFour,
  outlets: Storefront,
  catalog: Cube,
  staff: Users,
  pos: Monitor,
  kds: ChefHat,
} as const;

export type NavIcon = keyof typeof NAV_ICONS;

export interface NavItem {
  href: string;
  label: string;
  /** Serializable key: Server Components must not pass component functions. */
  icon: NavIcon;
  exact?: boolean;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="h-scroll flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = NAV_ICONS[item.icon];
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="flex min-h-10 flex-none items-center gap-2 border-b-2 px-3 py-2 text-[12px] font-bold transition-colors hover:bg-paper lg:min-h-11 lg:w-full lg:border-b-0 lg:border-l-2 lg:px-3"
            style={{
              borderColor: active ? "#FF7A00" : "transparent",
              color: active ? "#1C1A15" : undefined,
              background: active ? "rgba(255, 122, 0, 0.09)" : "transparent",
            }}
          >
            <Icon size={19} weight={active ? "fill" : "regular"} aria-hidden="true" />
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
