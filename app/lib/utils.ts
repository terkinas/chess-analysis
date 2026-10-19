/** shadcn's `cn`, without clsx/tailwind-merge: joins the class names that are set. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
