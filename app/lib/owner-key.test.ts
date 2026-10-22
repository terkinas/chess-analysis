import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ensureOwner, findOwnerKey } from "./owner-key.ts";

const env = process.env as Record<string, string | undefined>;
const saved = { ...env };

afterEach(() => {
  for (const key of ["NODE_ENV", "HISTORY_OWNER_SECRET", "DATABASE_URL"]) {
    if (saved[key] === undefined) delete env[key];
    else env[key] = saved[key];
  }
});

const request = (cookie?: string) =>
  new Request("https://example.com/api/games", {
    headers: cookie ? { cookie } : {},
  });

describe("owner key secret", () => {
  it("uses HISTORY_OWNER_SECRET in production", () => {
    env.NODE_ENV = "production";
    env.HISTORY_OWNER_SECRET = "real-secret";
    delete env.DATABASE_URL;
    assert.ok(ensureOwner(request()).ownerKey);
  });

  it("treats an empty secret as not set and derives from DATABASE_URL", () => {
    env.NODE_ENV = "production";
    env.HISTORY_OWNER_SECRET = "  ";
    env.DATABASE_URL = "postgresql://u:p@host/db";
    const { setCookie, ownerKey } = ensureOwner(request());
    const cookie = setCookie.split(";")[0];
    assert.equal(findOwnerKey(request(cookie)), ownerKey);
  });

  it("derived keys differ from the dev secret's, so dev cookies are rejected", () => {
    env.NODE_ENV = "development";
    delete env.HISTORY_OWNER_SECRET;
    const devCookie = ensureOwner(request()).setCookie.split(";")[0];
    env.NODE_ENV = "production";
    env.DATABASE_URL = "postgresql://u:p@host/db";
    assert.equal(findOwnerKey(request(devCookie)), null);
  });

  it("throws in production with neither a secret nor a database URL", () => {
    env.NODE_ENV = "production";
    delete env.HISTORY_OWNER_SECRET;
    delete env.DATABASE_URL;
    assert.throws(() => ensureOwner(request()), /HISTORY_OWNER_SECRET/);
  });
});
