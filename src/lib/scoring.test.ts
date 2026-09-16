import { describe, expect, it } from "vitest";
import { dubaiDate, scoreError } from "./scoring";

describe("final scores", () => {
  it.each([[11, 0, 11], [11, 9, 11], [9, 11, 11], [12, 10, 11], [13, 11, 11], [15, 13, 11], [21, 19, 21], [21, 23, 21], [42, 40, 21]])("accepts %i-%i to %i", (a, b, target) => {
    expect(scoreError(a, b, target)).toBeNull();
  });
  it.each([[11, 11, 11], [11, 10, 11], [10, 8, 11], [13, 10, 11], [22, 21, 21], [21, 20, 21], [0, 0, 11], [-1, 11, 11], [11.5, 9, 11], [NaN, 9, 11], [Infinity, 9, 11], [32768, 32766, 21], [15, 8, 15]])("rejects %s-%s to %i", (a, b, target) => {
    expect(scoreError(a, b, target)).toBeTruthy();
  });
  it("formats session dates in Dubai, including near midnight UTC", () => {
    expect(dubaiDate("2026-09-16T21:00:00Z")).toBe("17 Sept");
    expect(dubaiDate("2026-09-16")).toBe("16 Sept");
  });
});
