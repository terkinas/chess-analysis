/**
 * A random v4 UUID. `crypto.randomUUID` only exists in secure contexts (https
 * or localhost), so opening the dev server from a phone over the local network
 * would otherwise break; `getRandomValues` works everywhere.
 */
export function newGameId(cryptoSource: Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">> = globalThis.crypto): string {
  if (typeof cryptoSource.randomUUID === "function") {
    return cryptoSource.randomUUID();
  }
  const bytes = cryptoSource.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}
