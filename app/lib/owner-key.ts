import {
  VISITOR_COOKIE,
  mintVisitorId,
  ownerKeyFor,
  readCookie,
  signVisitorId,
  verifyVisitorCookie,
  visitorSetCookie,
} from "./visitor-id.ts";

// Server-only: who owns the games this request reads or writes.

const DEV_SECRET = "gambit-dev-only-secret";

let warnedAboutFallback = false;

function secret(): string {
  // `.env.example` ships `HISTORY_OWNER_SECRET=""`, and hosts sometimes keep a
  // blank value, so an empty or whitespace-only value counts as not set.
  const configured = process.env.HISTORY_OWNER_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production") return DEV_SECRET;

  // Production without a dedicated secret. Anyone who could mint cookies the
  // server accepts could read other visitors' history, so a fixed, public
  // fallback is out. DATABASE_URL carries the database password: it is secret,
  // server-only and already required, so a key derived from it cannot be
  // guessed by a visitor. Set HISTORY_OWNER_SECRET to use a dedicated key
  // (changing either value detaches visitors from their existing history).
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    if (!warnedAboutFallback) {
      warnedAboutFallback = true;
      console.warn(
        "HISTORY_OWNER_SECRET is not set or empty; deriving the visitor key from DATABASE_URL. Set HISTORY_OWNER_SECRET to use a dedicated key.",
      );
    }
    return `gambit-history-owner-v1:${databaseUrl}`;
  }
  throw new Error("HISTORY_OWNER_SECRET is not set (or is empty).");
}

function isHttps(request: Request): boolean {
  return (
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https"
  );
}

function visitorIdOf(request: Request, key: string): string | null {
  return verifyVisitorCookie(
    readCookie(request.headers.get("cookie"), VISITOR_COOKIE),
    key,
  );
}

/**
 * The key of the visitor behind a request, or null if they have no valid
 * visitor cookie, in which case they have no history yet. Never sets anything.
 */
export function findOwnerKey(request: Request): string | null {
  const key = secret();
  const id = visitorIdOf(request, key);
  return id ? ownerKeyFor(id, key) : null;
}

/**
 * The key to save under: the visitor's own, or a new one for someone without a
 * cookie. `setCookie` must be sent back with the response; it is also sent to
 * returning visitors, which renews the cookie's lifetime.
 */
export function ensureOwner(request: Request): {
  ownerKey: string;
  setCookie: string;
} {
  const key = secret();
  const id = visitorIdOf(request, key) ?? mintVisitorId();
  return {
    ownerKey: ownerKeyFor(id, key),
    setCookie: visitorSetCookie(signVisitorId(id, key), isHttps(request)),
  };
}
