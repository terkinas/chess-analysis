"use client";

// The server does not know the visitor's time zone, so the date is formatted
// in the browser. The text differs between server and client on purpose.
export default function LocalDate({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })}
    </time>
  );
}
