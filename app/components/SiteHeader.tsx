import Link from "next/link";

type NavKey = "play" | "analysis" | "history" | "settings";

const NAV_ITEMS: readonly {
  label: string;
  href: string;
  /** Set for pages that exist; the placeholder entries have no key. */
  key?: NavKey;
}[] = [
  { label: "Play", href: "/", key: "play" },
  { label: "Analysis", href: "/analysis", key: "analysis" },
  { label: "History", href: "/games", key: "history" },
  { label: "Settings", href: "/settings", key: "settings" },
];

type SiteHeaderProps = {
  /** The page being shown, so its link is highlighted and marked current. */
  current?: NavKey;
};

export default function SiteHeader({ current }: SiteHeaderProps) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Placeholder wordmark */}
        <Link
          href="/"
          className="rounded-sm text-lg font-semibold tracking-tight text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Gambit
          <span className="text-accent">.</span>
        </Link>

        <nav aria-label="Primary">
          <ul className="flex items-center gap-1 text-sm">
            {NAV_ITEMS.map((item) => {
              const isCurrent = item.key !== undefined && item.key === current;
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    aria-current={isCurrent ? "page" : undefined}
                    className={`rounded-md px-3 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      isCurrent
                        ? "bg-surface font-medium text-foreground"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
