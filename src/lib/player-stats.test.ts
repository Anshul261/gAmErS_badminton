import { describe, expect, it } from "vitest";
import { crewAwards, playerDashboard } from "./player-stats";
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

  it("finds the best day and the fun numbers", () => {
    expect(stats.bestDay).toEqual({ date: "2026-09-02", wins: 2, losses: 1 });
    expect(stats.busiestDay?.date).toBe("2026-09-02");
    expect(stats.deuce).toEqual({ wins: 1, losses: 0 });
    expect(stats.demolitions).toBe(2);
    expect(stats.heartbreaks).toBe(1);
    expect(stats.openers).toEqual({ wins: 2, losses: 0 });
    expect(stats.biggestWin?.ours).toBe(11);
    expect(stats.biggestWin?.theirs).toBe(3);
    expect(stats.marathon?.ours).toBe(12);
    expect(stats.timeline.map((m) => m.net)).toEqual([1, 0, 1, 2, 1]);
    expect(stats.peak).toBe(2);
    expect(stats.title.name).toBe("The Boss");
  });

  it("hands out crew awards", () => {
    const awards = crewAwards(games, ["me", "ann", "bob", "cat", "dan"]);
    const byId = Object.fromEntries(awards.map((award) => [award.id, award]));
    expect(byId.feud.players).toEqual(["bob", "me"]);
    expect(byId.feud.value).toBe("1–3");
    expect(byId.dozer.players).toEqual(["me"]);
    expect(byId.lungs.players).toEqual(["me"]);
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
