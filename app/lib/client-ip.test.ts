import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  UNKNOWN_IP,
  clientIpFromHeaders,
  normalizeIp,
  ownerKeyFor,
} from "./client-ip.ts";

const headers = (init: Record<string, string>) => ({
  get: (name: string) => init[name.toLowerCase()] ?? null,
});

describe("normalizeIp", () => {
  it("keeps IPv4 and strips ports", () => {
    assert.equal(normalizeIp("203.0.113.7"), "203.0.113.7");
    assert.equal(normalizeIp(" 203.0.113.7:51234 "), "203.0.113.7");
  });

  it("treats IPv4-mapped IPv6 as IPv4", () => {
    assert.equal(normalizeIp("::ffff:203.0.113.7"), "203.0.113.7");
    assert.equal(normalizeIp("::ffff:cb00:7107"), "203.0.113.7");
  });

  it("reduces IPv6 to its /64 prefix", () => {
    const a = normalizeIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    const b = normalizeIp("2001:DB8:1:2::1");
    assert.equal(a, "v6:2001:db8:1:2");
    assert.equal(b, a);
    assert.notEqual(normalizeIp("2001:db8:1:3::1"), a);
    assert.equal(normalizeIp("[2001:db8:1:2::1]:443"), a);
    assert.equal(normalizeIp("fe80::1%eth0"), "v6:fe80:0:0:0");
  });

  it("rejects things that are not addresses", () => {
    assert.equal(normalizeIp("not-an-ip"), null);
    assert.equal(normalizeIp(""), null);
    assert.equal(normalizeIp("999.1.1.1"), null);
  });
});

describe("clientIpFromHeaders", () => {
  it("prefers x-real-ip, then the first x-forwarded-for entry", () => {
    assert.equal(
      clientIpFromHeaders(headers({ "x-real-ip": "198.51.100.1", "x-forwarded-for": "203.0.113.7" })),
      "198.51.100.1",
    );
    assert.equal(
      clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })),
      "203.0.113.7",
    );
  });

  it("uses only the configured header when one is set", () => {
    const h = headers({ "cf-connecting-ip": "198.51.100.9", "x-forwarded-for": "203.0.113.7" });
    assert.equal(clientIpFromHeaders(h, "CF-Connecting-IP"), "198.51.100.9");
    assert.equal(clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.7" }), "cf-connecting-ip"), UNKNOWN_IP);
  });

  it("falls back to a shared bucket when nothing usable is sent", () => {
    assert.equal(clientIpFromHeaders(headers({})), UNKNOWN_IP);
    assert.equal(clientIpFromHeaders(headers({ "x-forwarded-for": "garbage" })), UNKNOWN_IP);
  });
});

describe("ownerKeyFor", () => {
  it("is stable per address and secret, and differs otherwise", () => {
    const key = ownerKeyFor("203.0.113.7", "s1");
    assert.equal(key, ownerKeyFor("203.0.113.7", "s1"));
    assert.notEqual(key, ownerKeyFor("203.0.113.8", "s1"));
    assert.notEqual(key, ownerKeyFor("203.0.113.7", "s2"));
    assert.match(key, /^[0-9a-f]{32}$/);
    assert.ok(!key.includes("203"));
  });
});
