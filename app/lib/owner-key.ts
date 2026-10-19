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

function secret(): string {
  const configured = process.env.HISTORY_OWNER_SECRET;
  if (configured) return configured;
  // Without a secret anyone could mint cookies the server would accept, so a
  // real deployment must set one.
  if (process.env.NODE_ENV === "production") {
    throw new Error("HISTORY_OWNER_SECRET is not set.");
  }
  return DEV_SECRET;
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
