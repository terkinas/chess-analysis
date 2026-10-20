// The year is written out rather than read from the clock: with Cache
// Components a server component may not call new Date() while prerendering.
export default function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <p className="mx-auto w-full max-w-6xl px-4 py-4 text-center text-xs text-muted sm:px-6">
        © 2026 Gambit. All rights reserved.
      </p>
    </footer>
  );
}
