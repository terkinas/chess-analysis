import { createHmac } from "node:crypto";
import { isIP } from "node:net";

// Works out who a request is from, for the history API. There are no accounts,
// so a visitor is identified by IP address. The address itself is never stored:
// it is run through a keyed hash (see `ownerKeyFor`) and only that is saved.
//
// IPv6 addresses are cut down to their /64 prefix, because one device rotates
// through many addresses inside the same /64 (privacy extensions), and
// IPv4-mapped IPv6 addresses (::ffff:1.2.3.4) are treated as plain IPv4.

/** Used when a request carries no usable address (for example local dev). */
export const UNKNOWN_IP = "unknown";

type HeaderReader = { get(name: string): string | null };

function expandIpv6(ip: string): number[] | null {
  let s = ip;
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const o = tail.split(".").map(Number);
    if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return null;
    }
    s =
      s.slice(0, lastColon + 1) +
      ((o[0] << 8) | o[1]).toString(16) +
      ":" +
      ((o[2] << 8) | o[3]).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  let groups: string[];
  if (halves.length === 2) {
    const rest = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill("0"), ...rest];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

/**
 * Turns the text of one address (as found in a header) into the form used to
 * identify a visitor, or null if it is not an IP address.
 */
export function normalizeIp(raw: string): string | null {
  let s = raw.trim();
  const bracketed = /^\[(.+)\](?::\d+)?$/.exec(s);
  if (bracketed) s = bracketed[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(s)) s = s.slice(0, s.lastIndexOf(":"));
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);

  const version = isIP(s);
  if (version === 4) return s;
  if (version !== 6) return null;

  const groups = expandIpv6(s);
  if (!groups) return null;
  const mapped =
    groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  if (mapped) {
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join(".");
  }
  return `v6:${groups.slice(0, 4).map((g) => g.toString(16)).join(":")}`;
}

/**
 * The visitor's address as seen by this server. `headerName` (the
 * CLIENT_IP_HEADER setting) picks one header to trust, for hosts that set a
 * dedicated one (x-vercel-forwarded-for, cf-connecting-ip, ...). Otherwise
 * x-real-ip is used, then the first entry of x-forwarded-for.
 */
export function clientIpFromHeaders(
  headers: HeaderReader,
  headerName?: string | null,
): string {
  const candidates: string[] = [];
  const name = headerName?.trim().toLowerCase();
  if (name) {
    const value = headers.get(name);
    if (value) candidates.push(value.split(",")[0]);
  } else {
    const real = headers.get("x-real-ip");
    if (real) candidates.push(real);
    const forwarded = headers.get("x-forwarded-for");
    if (forwarded) candidates.push(forwarded.split(",")[0]);
  }
  for (const candidate of candidates) {
    const ip = normalizeIp(candidate);
    if (ip) return ip;
  }
  return UNKNOWN_IP;
}

/** Keyed hash of an address: stable per address, useless without the secret. */
export function ownerKeyFor(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}
