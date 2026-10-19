"use client";

import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type MobileNavProps = {
  items: readonly { label: string; href: string; current: boolean }[];
};

// The primary navigation on phones: a hamburger button that opens a dropdown of
// the same links the header shows in a row on wider screens (SiteHeader hides
// one or the other).
export default function MobileNav({ items }: MobileNavProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu"
        className="group inline-flex size-10 items-center justify-center rounded-md text-foreground outline-none transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[state=open]:bg-surface"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-5 group-data-[state=open]:hidden"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="hidden size-5 group-data-[state=open]:block"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            asChild
            className={item.current ? "bg-line/40 font-medium text-foreground" : ""}
          >
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
            >
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
