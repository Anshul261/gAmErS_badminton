import { describe, expect, it } from "vitest";
import { playerDashboard } from "./player-stats";
import type { StatGame } from "./types";

let n = 0;
function game(date: string, a: string[], b: string[], scoreA: number, scoreB: number, target = 11): StatGame {
  n += 1;
  return {
    id: `g${n}`, created_at: `${date}T10:${String(n).padStart(2, "0")}:00Z`, session_id: date, session_date: date, target_score: target,
    side_a_player_1: a[0], side_a_player_2: a[1] ?? null, side_b_player_1: b[0], side_b_player_2: b[1] ?? null, score_a: scoreA, score_b: scoreB,
  };
}

describe("player dashboard", () => {
  const games = [
    game("2026-09-01", ["me", "ann"], ["bob", "cat"], 11, 5),
    game("2026-09-01", ["me", "ann"], ["bob", "cat"], 9, 11),
    game("2026-09-02", ["me"], ["bob"], 12, 10),
    game("2026-09-02", ["me", "dan"], ["bob"], 11, 3),
    game("2026-09-02", ["cat"], ["me"], 11, 7),
    game("2026-09-03", ["bob"], ["cat"], 11, 0),
  ];
  const stats = playerDashboard("me", games);

  it("counts the record, form and streaks", () => {
    expect([stats.played, stats.wins, stats.losses]).toEqual([5, 3, 2]);
    expect(stats.form.join("")).toBe("WLWWL");
    expect(stats.streak).toEqual({ result: "L", count: 1 });
    expect(stats.bestWinStreak).toBe(2);
  });

  it("finds the best day and splits by format", () => {
    expect(stats.bestDay).toEqual({ date: "2026-09-02", wins: 2, losses: 1 });
    expect(stats.formats.map((f) => `${f.format}:${f.wins}-${f.losses}`)).toEqual(["2v2:1-1", "1v1:1-1", "1v2 pair:1-0"]);
    expect(stats.deuce).toEqual({ wins: 1, losses: 0 });
  });

  it("ranks teammates and head-to-heads", () => {
    expect(stats.teammates.map((t) => t.id)).toEqual(["dan", "ann"]);
    expect(stats.beatMost[0]).toEqual({ id: "bob", wins: 3, losses: 1 });
    expect(stats.lostMost[0]).toEqual({ id: "cat", wins: 1, losses: 2 });
  });

  it("handles a player with no games", () => {
    const empty = playerDashboard("nobody", games);
    expect(empty.played).toBe(0);
    expect(empty.streak).toBeNull();
    expect(empty.bestDay).toBeNull();
  });
});
