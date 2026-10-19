import { clientIpFromHeaders, ownerKeyFor } from "./client-ip.ts";

// Server-only: who owns the games this request reads or writes.

const DEV_SECRET = "gambit-dev-only-secret";

function secret(): string {
  const configured = process.env.HISTORY_OWNER_SECRET;
  if (configured) return configured;
  // Without a secret, hashed IPv4 addresses could be recovered by trying all of
  // them, so a real deployment must set one.
  if (process.env.NODE_ENV === "production") {
    throw new Error("HISTORY_OWNER_SECRET is not set.");
  }
  return DEV_SECRET;
}

/** The key stored in games.ownerKey for the visitor behind `request`. */
export function getOwnerKey(request: Request): string {
  const ip = clientIpFromHeaders(request.headers, process.env.CLIENT_IP_HEADER);
  return ownerKeyFor(ip, secret());
}
