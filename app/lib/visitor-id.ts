import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// An anonymous, signed visitor id, kept in a cookie, identifies whose game
// history is whose. Unlike an IP address it survives moving between Wi-Fi and
// mobile data, and two people on one network never share it.
//
// The cookie holds `<id>.<signature>`. The id is 128 random bits; the signature
// is an HMAC of it under a server secret, so the server only accepts ids it
// issued. The database never stores the id itself, only a second HMAC of it
// (`ownerKeyFor`), so a copy of the database can't be turned into cookies.

export const VISITOR_COOKIE = "gambit_vid";

/** 400 days: the longest lifetime browsers allow for a cookie. */
export const VISITOR_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

const hmac = (secret: string, purpose: string, id: string) =>
  createHmac("sha256", secret).update(`${purpose}|${id}`);

/** A fresh visitor id (128 random bits, URL-safe). */
export function mintVisitorId(): string {
  return randomBytes(16).toString("base64url");
}

/** The cookie value for an id. */
export function signVisitorId(id: string, secret: string): string {
  return `${id}.${hmac(secret, "cookie", id).digest("base64url")}`;
}

/** The id inside a cookie value, or null if it is malformed or not ours. */
export function verifyVisitorCookie(
  value: string | null | undefined,
  secret: string,
): string | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot === -1) return null;
  const id = value.slice(0, dot);
  if (!ID_PATTERN.test(id)) return null;
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(hmac(secret, "cookie", id).digest("base64url"));
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? id : null;
}

/** What goes in games.ownerKey: a keyed hash of the id, never the id itself. */
export function ownerKeyFor(id: string, secret: string): string {
  return hmac(secret, "owner", id).digest("hex").slice(0, 32);
}

/** One cookie's value out of a Cookie request header. */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** A Set-Cookie header value that (re)issues the visitor cookie. */
export function visitorSetCookie(value: string, secure: boolean): string {
  return [
    `${VISITOR_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${VISITOR_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}
