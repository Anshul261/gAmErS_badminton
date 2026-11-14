import { describe, expect, it } from "vitest";
import { PROVISIONAL_GAMES, crewAwards, findMatches, playerDashboard, seasonPerformance, seasonScore, standings } from "./player-stats";
import { inSeason, seasons } from "./seasons";
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

describe("match finder", () => {
  const games = [
    game("2026-09-01", ["me", "ann"], ["bob", "cat"], 11, 5),
    game("2026-09-01", ["me", "bob"], ["ann", "cat"], 9, 11),
    game("2026-09-02", ["me"], ["bob"], 12, 10),
  ];
  const { timeline } = playerDashboard("me", games);
  const names: Record<string, string> = { ann: "Annie", bob: "Bobby", cat: "Cat" };
  const find = (query: string, filter: Parameters<typeof findMatches>[2] = "all") =>
    findMatches(timeline, query, filter, (id) => names[id], (date) => date === "2026-09-02" ? "Wed 2 Sept" : "Tue 1 Sept").map((m) => `${m.ours}-${m.theirs}`);

  it("lists newest first and filters by result", () => {
    expect(find("")).toEqual(["12-10", "9-11", "11-5"]);
    expect(find("", "lost")).toEqual(["9-11"]);
    expect(find("", "deuce")).toEqual(["12-10"]);
    expect(find("", "close")).toEqual(["12-10", "9-11"]);
  });

  it("matches names, scores and dates, and pins sides with 'with' and 'vs'", () => {
    expect(find("bob")).toEqual(["12-10", "9-11", "11-5"]);
    expect(find("with bob")).toEqual(["9-11"]);
    expect(find("vs bob")).toEqual(["12-10", "11-5"]);
    expect(find("vs bob won 1 sept")).toEqual(["11-5"]);
    expect(find("11–5")).toEqual(["11-5"]);
    expect(find("nobody")).toEqual([]);
  });
});

describe("season performance", () => {
  // A regular who wins 3 of 4 over 20 games, and a newcomer on a 4-0 hot start against the same crew.
  const crew = ["p0", "p1", "p2", "p3", "p4"];
  const games = [
    ...Array.from({ length: 20 }, (_, i) => game("2026-09-01", ["vet"], [crew[i % 5]], i % 4 ? 11 : 6, i % 4 ? 6 : 11)),
    ...Array.from({ length: 4 }, (_, i) => game("2026-09-02", ["new"], [crew[i]], 11, 6)),
  ];
  const performance = new Map(seasonPerformance(games).map((row) => [row.player_id, row]));

  it(`keeps a hot start provisional until ${PROVISIONAL_GAMES} games`, () => {
    expect(performance.get("vet")).toMatchObject({ played: 20, provisional: false });
    expect(performance.get("new")).toMatchObject({ played: 4, provisional: true });
    expect(seasonPerformance(games)[0].player_id).toBe("vet");
  });

  it("matches independently calculated Wilson lower bounds", () => {
    expect(seasonScore({ wins: 85, losses: 29 })).toBeCloseTo(65.8566489212, 8);
    expect(seasonScore({ wins: 78, losses: 29 })).toBeCloseTo(63.7906641368, 8);
    expect(seasonScore({ wins: 50, losses: 50 })).toBeCloseTo(40.3829828590, 8);
    expect(seasonScore({ wins: 0, losses: 0 })).toBe(0);
    expect(seasonScore({ wins: 0, losses: 20 })).toBe(0);
  });

  it("keeps the same scores and ordering when games are logged in a different order", () => {
    const shuffled = [...games].reverse().map((item, i) => ({ ...item, created_at: `2026-09-0${1 + (i % 2)}T09:${String(i).padStart(2, "0")}:00Z` }));
    expect(seasonPerformance(shuffled)).toEqual(seasonPerformance(games));
  });

  it("counts every format equally without opponent or partner weights", () => {
    const scoreFor = (a: string[], b: string[]) => seasonPerformance([
      game("2026-09-01", a, b, 11, 5),
      game("2026-09-01", a, b, 9, 11),
    ]).find((row) => row.player_id === "me")!.score;
    const singles = scoreFor(["me"], ["bob"]);
    expect(scoreFor(["me", "ann"], ["bob", "cat"])).toBe(singles);
    expect(scoreFor(["me"], ["bob", "cat"])).toBe(singles);
    expect(scoreFor(["me", "ann"], ["bob"])).toBe(singles);
    const again = seasonPerformance([...games, ...Array.from({ length: 20 }, () => game("2026-09-03", ["p0"], ["p1"], 11, 0))]);
    expect(again.find((row) => row.player_id === "vet")).toEqual(performance.get("vet"));
  });

  it("rewards wins and a longer record at the same win rate", () => {
    expect(seasonScore({ wins: 16, losses: 5 })).toBeGreaterThan(seasonScore({ wins: 15, losses: 5 }));
    expect(seasonScore({ wins: 15, losses: 6 })).toBeLessThan(seasonScore({ wins: 15, losses: 5 }));
    expect(seasonScore({ wins: 60, losses: 40 })).toBeGreaterThan(seasonScore({ wins: 6, losses: 4 }));
    expect(seasonScore({ wins: 100, losses: 1 })).toBeGreaterThan(seasonScore({ wins: 2, losses: 0 }));
  });

  it("never ranks a qualified record with more wins and a better win rate lower", () => {
    const records = [{ wins: 78, losses: 29 }, { wins: 46, losses: 46 }, { wins: 35, losses: 68 }];
    for (const record of records) {
      for (let extraWins = 1; extraWins <= 15; extraWins += 1) {
        for (let losses = 0; losses <= record.losses + 15; losses += 1) {
          const better = { wins: record.wins + extraWins, losses };
          if (better.wins / (better.wins + losses) <= record.wins / (record.wins + record.losses)) continue;
          expect(seasonScore(better)).toBeGreaterThan(seasonScore(record));
        }
      }
    }
  });

  it("starts a new season without carrying over results or qualification", () => {
    const current = seasons("2026-11-19")[0];
    const nextGames = [...games, game("2026-11-19", ["vet"], ["new"], 11, 5)];
    const rows = seasonPerformance(nextGames.filter((item) => inSeason(current, item.session_date)));
    expect(rows.find((row) => row.player_id === "vet")).toMatchObject({ wins: 1, losses: 0, played: 1, provisional: true });
    expect(rows.find((row) => row.player_id === "vet")!.score).toBe(seasonScore({ wins: 1, losses: 0 }));
  });

  it("breaks identical records consistently", () => {
    const tied = Array.from({ length: 16 }, (_, i) => game("2026-09-01", ["z", "a"], ["b", "c"], i % 2 ? 11 : 5, i % 2 ? 5 : 11));
    expect(seasonPerformance(tied).map((row) => row.player_id)).toEqual(["a", "b", "c", "z"]);
  });

  it("counts wins and losses for the table", () => {
    const rows = new Map(standings(games).map((row) => [row.player_id, row]));
    expect(rows.get("vet")).toEqual({ player_id: "vet", played: 20, wins: 15, losses: 5 });
    expect(rows.get("new")).toEqual({ player_id: "new", played: 4, wins: 4, losses: 0 });
  });
});
