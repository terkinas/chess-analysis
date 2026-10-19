import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { soundForSan } from "./move-sound.ts";

describe("soundForSan", () => {
  it("uses the plain sound for ordinary moves, captures, castling and promotion", () => {
    for (const san of ["e4", "Nf3", "exd5", "exd6", "O-O", "O-O-O", "a8=Q"]) {
      assert.equal(soundForSan(san), "move", san);
    }
  });

  it("uses the check sound for check and for checkmate", () => {
    for (const san of ["Qh5+", "Bxf7+", "O-O+", "a8=Q+", "Qh4#", "e8=Q#"]) {
      assert.equal(soundForSan(san), "check", san);
    }
  });
});
