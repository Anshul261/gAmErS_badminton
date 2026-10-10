import { describe, expect, it } from "vitest";
import { inSeason, seasons } from "./seasons";

describe("seasons", () => {
  it("runs 61 days from the first session, 62 when a season starts in summer", () => {
    expect(seasons("2027-08-01").reverse().map((season) => [season.from, season.to])).toEqual([
      ["2026-09-19", "2026-11-18"],
      ["2026-11-19", "2027-01-18"],
      ["2027-01-19", "2027-03-20"],
      ["2027-03-21", "2027-05-20"],
      ["2027-05-21", "2027-07-20"],
      ["2027-07-21", "2027-09-20"],
    ]);
  });

  it("lists seasons up to the current one, newest first", () => {
    expect(seasons("2026-11-18").map((season) => season.number)).toEqual([1]);
    expect(seasons("2026-11-19").map((season) => season.number)).toEqual([2, 1]);
  });

  it("puts a session in the season its date falls in", () => {
    const [two, one] = seasons("2026-12-01");
    expect(inSeason(one, "2026-11-18")).toBe(true);
    expect(inSeason(one, "2026-11-19")).toBe(false);
    expect(inSeason(two, "2026-11-19")).toBe(true);
  });
});
