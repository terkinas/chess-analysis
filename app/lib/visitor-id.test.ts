import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VISITOR_COOKIE,
  mintVisitorId,
  ownerKeyFor,
  readCookie,
  signVisitorId,
  verifyVisitorCookie,
  visitorSetCookie,
} from "./visitor-id.ts";

describe("visitor ids", () => {
  it("mints unique, URL-safe ids", () => {
    const a = mintVisitorId();
    assert.match(a, /^[A-Za-z0-9_-]{22}$/);
    assert.notEqual(a, mintVisitorId());
  });

  it("round-trips through a signed cookie", () => {
    const id = mintVisitorId();
    assert.equal(verifyVisitorCookie(signVisitorId(id, "s1"), "s1"), id);
  });

  it("rejects tampered, foreign and malformed cookies", () => {
    const id = mintVisitorId();
    const cookie = signVisitorId(id, "s1");
    assert.equal(verifyVisitorCookie(cookie, "s2"), null);
    const other = mintVisitorId();
    assert.equal(
      verifyVisitorCookie(`${other}.${cookie.split(".")[1]}`, "s1"),
      null,
    );
    assert.equal(verifyVisitorCookie(`${id}.AAAA`, "s1"), null);
    assert.equal(verifyVisitorCookie(`${id}.`, "s1"), null);
    assert.equal(verifyVisitorCookie(id, "s1"), null);
    assert.equal(verifyVisitorCookie("short.sig", "s1"), null);
    assert.equal(verifyVisitorCookie("", "s1"), null);
    assert.equal(verifyVisitorCookie(null, "s1"), null);
  });

  it("derives a stable owner key that reveals neither id nor signature", () => {
    const id = mintVisitorId();
    const key = ownerKeyFor(id, "s1");
    assert.equal(key, ownerKeyFor(id, "s1"));
    assert.notEqual(key, ownerKeyFor(id, "s2"));
    assert.notEqual(key, ownerKeyFor(mintVisitorId(), "s1"));
    assert.match(key, /^[0-9a-f]{32}$/);
    assert.ok(!signVisitorId(id, "s1").includes(key));
  });
});

describe("cookies", () => {
  it("reads one cookie out of a header", () => {
    const header = `theme=dark; ${VISITOR_COOKIE}=abc.def; other=1`;
    assert.equal(readCookie(header, VISITOR_COOKIE), "abc.def");
    assert.equal(readCookie(header, "missing"), null);
    assert.equal(readCookie(null, VISITOR_COOKIE), null);
    assert.equal(readCookie("garbage", VISITOR_COOKIE), null);
  });

  it("builds a long-lived HttpOnly cookie, Secure only over https", () => {
    const plain = visitorSetCookie("v", false);
    assert.match(plain, /^gambit_vid=v; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax$/);
    assert.ok(visitorSetCookie("v", true).endsWith("; Secure"));
  });
});
