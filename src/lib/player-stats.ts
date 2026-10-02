import type { StatGame } from "./types";

export type Result = "W" | "L";
export type Format = "1v1" | "2v2" | "1v2 solo" | "1v2 pair";
export type WinLoss = { wins: number; losses: number };
export type DayRecord = WinLoss & { date: string };
export type Rival = WinLoss & { id: string };

export type PlayerDashboard = {
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Oldest first, so the last entry is the most recent game. */
  form: Result[];
  streak: { result: Result; count: number } | null;
  bestWinStreak: number;
  /** One entry per session day, oldest first. */
  days: DayRecord[];
  bestDay: DayRecord | null;
  formats: { format: Format; wins: number; losses: number }[];
  /** Games that went past the target, e.g. 12-10 or 23-21. */
  deuce: WinLoss;
  avgWinMargin: number;
  avgLossMargin: number;
  teammates: Rival[];
  beatMost: Rival[];
  lostMost: Rival[];
};

const sides = (game: StatGame) => [
  [game.side_a_player_1, game.side_a_player_2].filter((id): id is string => Boolean(id)),
  [game.side_b_player_1, game.side_b_player_2].filter((id): id is string => Boolean(id)),
];

function bump(map: Map<string, Rival>, id: string, won: boolean) {
  const rival = map.get(id) ?? { id, wins: 0, losses: 0 };
  if (won) rival.wins += 1; else rival.losses += 1;
  map.set(id, rival);
}

export function playerDashboard(playerId: string, games: StatGame[]): PlayerDashboard {
  const mine = games
    .filter((game) => sides(game).some((side) => side.includes(playerId)))
    .sort((a, b) => a.session_date.localeCompare(b.session_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const form: Result[] = [];
  const days = new Map<string, DayRecord>();
  const formats = new Map<Format, WinLoss>();
  const teammates = new Map<string, Rival>();
  const opponents = new Map<string, Rival>();
  const deuce = { wins: 0, losses: 0 };
  let pointsFor = 0, pointsAgainst = 0, winMargin = 0, lossMargin = 0, run = 0, bestWinStreak = 0;

  for (const game of mine) {
    const [a, b] = sides(game);
    const onA = a.includes(playerId);
    const [us, them] = onA ? [a, b] : [b, a];
    const [ours, theirs] = onA ? [game.score_a, game.score_b] : [game.score_b, game.score_a];
    const won = ours > theirs;
    form.push(won ? "W" : "L");
    pointsFor += ours;
    pointsAgainst += theirs;
    if (won) winMargin += ours - theirs; else lossMargin += theirs - ours;
    run = won ? run + 1 : 0;
    bestWinStreak = Math.max(bestWinStreak, run);

    const day = days.get(game.session_date) ?? { date: game.session_date, wins: 0, losses: 0 };
    if (won) day.wins += 1; else day.losses += 1;
    days.set(game.session_date, day);

    const format: Format = us.length === them.length ? (us.length === 1 ? "1v1" : "2v2") : us.length === 1 ? "1v2 solo" : "1v2 pair";
    const record = formats.get(format) ?? { wins: 0, losses: 0 };
    if (won) record.wins += 1; else record.losses += 1;
    formats.set(format, record);

    if (Math.max(ours, theirs) > game.target_score) {
      if (won) deuce.wins += 1; else deuce.losses += 1;
    }
    for (const id of us) if (id !== playerId) bump(teammates, id, won);
    for (const id of them) bump(opponents, id, won);
  }

  const wins = form.filter((result) => result === "W").length;
  const losses = form.length - wins;
  const last = form.at(-1);
  let count = 0;
  for (let index = form.length - 1; index >= 0 && form[index] === last; index -= 1) count += 1;
  const dayList = [...days.values()];
  const bestDay = dayList.reduce<DayRecord | null>((best, day) =>
    !best || day.wins > best.wins || (day.wins === best.wins && day.losses <= best.losses) ? day : best, null);
  const rivals = [...opponents.values()];
  const total = (rival: Rival) => rival.wins + rival.losses;

  return {
    played: form.length,
    wins,
    losses,
    pointsFor,
    pointsAgainst,
    form,
    streak: last ? { result: last, count } : null,
    bestWinStreak,
    days: dayList,
    bestDay: bestDay && bestDay.wins > 0 ? bestDay : null,
    formats: (["2v2", "1v1", "1v2 solo", "1v2 pair"] as Format[]).filter((format) => formats.has(format)).map((format) => ({ format, ...formats.get(format)! })),
    deuce,
    avgWinMargin: wins ? winMargin / wins : 0,
    avgLossMargin: losses ? lossMargin / losses : 0,
    teammates: [...teammates.values()].sort((x, y) => y.wins - x.wins || y.wins / total(y) - x.wins / total(x) || total(y) - total(x)).slice(0, 3),
    beatMost: rivals.filter((rival) => rival.wins > 0).sort((x, y) => y.wins - x.wins || x.losses - y.losses).slice(0, 3),
    lostMost: rivals.filter((rival) => rival.losses > 0).sort((x, y) => y.losses - x.losses || x.wins - y.wins).slice(0, 3),
  };
}
