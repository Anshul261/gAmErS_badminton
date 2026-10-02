import type { StatGame } from "./types";

export type Result = "W" | "L";
export type WinLoss = { wins: number; losses: number };
export type DayRecord = WinLoss & { date: string };
export type Rival = WinLoss & { id: string };
/** One game from a player's point of view. */
export type Moment = { id: string; date: string; won: boolean; ours: number; theirs: number; partners: string[]; opponents: string[]; net: number };
export type Title = { name: string; line: string };

export type PlayerDashboard = {
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Every game, oldest first, with the running wins-minus-losses. */
  timeline: Moment[];
  form: Result[];
  streak: { result: Result; count: number } | null;
  bestWinStreak: number;
  peak: number;
  days: DayRecord[];
  bestDay: DayRecord | null;
  busiestDay: DayRecord | null;
  /** Last 10 games against the whole record, in win-% points. */
  recentDelta: number | null;
  /** Games that went past the target, e.g. 12-10 or 23-21. */
  deuce: WinLoss;
  /** Wins by a big margin: 6+ in a game to 11, 11+ in a game to 21. */
  demolitions: number;
  bagels: number;
  /** Losses by exactly two. */
  heartbreaks: number;
  /** The first game they played in each session. */
  openers: WinLoss;
  biggestWin: Moment | null;
  marathon: Moment | null;
  avgWinMargin: number;
  avgLossMargin: number;
  teammates: Rival[];
  beatMost: Rival[];
  lostMost: Rival[];
  title: Title;
};

const sides = (game: StatGame) => [
  [game.side_a_player_1, game.side_a_player_2].filter((id): id is string => Boolean(id)),
  [game.side_b_player_1, game.side_b_player_2].filter((id): id is string => Boolean(id)),
];

const chronological = (a: StatGame, b: StatGame) => a.session_date.localeCompare(b.session_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
const isDeuce = (game: StatGame) => Math.max(game.score_a, game.score_b) > game.target_score;
const isDemolition = (game: StatGame) => Math.abs(game.score_a - game.score_b) >= (game.target_score === 21 ? 11 : 6);

function bump(map: Map<string, Rival>, id: string, won: boolean) {
  const rival = map.get(id) ?? { id, wins: 0, losses: 0 };
  if (won) rival.wins += 1; else rival.losses += 1;
  map.set(id, rival);
}

const rate = (record: WinLoss) => record.wins + record.losses ? record.wins / (record.wins + record.losses) : 0;

function pickTitle(stats: Omit<PlayerDashboard, "title">): Title {
  const winRate = rate(stats);
  if (stats.played < 5) return { name: "Fresh Shuttle", line: "Still warming up. Results pending." };
  if (stats.streak?.result === "W" && stats.streak.count >= 4) return { name: "On Fire", line: `${stats.streak.count} straight wins. Somebody stop them.` };
  if (stats.deuce.wins >= 3 && rate(stats.deuce) >= 0.65) return { name: "Ice Veins", line: "At 20-all, this is who you want." };
  if (winRate >= 0.65 && stats.avgWinMargin >= 5) return { name: "The Bulldozer", line: "Doesn't just win. Flattens." };
  if (stats.recentDelta !== null && stats.recentDelta >= 12) return { name: "Rising Star", line: "Recent form is way up. Watch out." };
  if (winRate >= 0.6) return { name: "The Boss", line: "Wins more than they lose. Comfortably." };
  if (stats.streak?.result === "L" && stats.streak.count >= 4) return { name: "Comeback Loading", line: "The only way is up from here." };
  if (stats.losses >= 3 && stats.avgLossMargin <= 3.5) return { name: "Never Easy", line: "Even the losses make you sweat." };
  if (stats.recentDelta !== null && stats.recentDelta <= -12) return { name: "Cooling Off", line: "Had a hot spell. Due another." };
  if (winRate < 0.4) return { name: "The Underdog", line: "Every win is a statement." };
  return { name: "Court Regular", line: "Shows up, plays hard, keeps it close." };
}

export function playerDashboard(playerId: string, games: StatGame[]): PlayerDashboard {
  const mine = games.filter((game) => sides(game).some((side) => side.includes(playerId))).sort(chronological);
  const timeline: Moment[] = [];
  const days = new Map<string, DayRecord>();
  const teammates = new Map<string, Rival>();
  const opponents = new Map<string, Rival>();
  const deuce = { wins: 0, losses: 0 };
  const openers = { wins: 0, losses: 0 };
  let pointsFor = 0, pointsAgainst = 0, winMargin = 0, lossMargin = 0, run = 0, bestWinStreak = 0, net = 0, peak = 0;
  let demolitions = 0, bagels = 0, heartbreaks = 0;
  let biggestWin: Moment | null = null, marathon: Moment | null = null;

  for (const game of mine) {
    const [a, b] = sides(game);
    const onA = a.includes(playerId);
    const [us, them] = onA ? [a, b] : [b, a];
    const [ours, theirs] = onA ? [game.score_a, game.score_b] : [game.score_b, game.score_a];
    const won = ours > theirs;
    net += won ? 1 : -1;
    peak = Math.max(peak, net);
    const moment = { id: game.id, date: game.session_date, won, ours, theirs, partners: us.filter((id) => id !== playerId), opponents: them, net };
    timeline.push(moment);
    pointsFor += ours;
    pointsAgainst += theirs;
    if (won) winMargin += ours - theirs; else lossMargin += theirs - ours;
    run = won ? run + 1 : 0;
    bestWinStreak = Math.max(bestWinStreak, run);

    const day = days.get(game.session_date);
    const record = day ?? { date: game.session_date, wins: 0, losses: 0 };
    if (!day) { if (won) openers.wins += 1; else openers.losses += 1; }
    if (won) record.wins += 1; else record.losses += 1;
    days.set(game.session_date, record);

    if (isDeuce(game)) { if (won) deuce.wins += 1; else deuce.losses += 1; }
    if (won && isDemolition(game)) demolitions += 1;
    if (won && theirs === 0) bagels += 1;
    if (!won && theirs - ours === 2) heartbreaks += 1;
    if (won && (!biggestWin || ours - theirs > biggestWin.ours - biggestWin.theirs)) biggestWin = moment;
    if (!marathon || ours + theirs > marathon.ours + marathon.theirs) marathon = moment;
    for (const id of us) if (id !== playerId) bump(teammates, id, won);
    for (const id of them) bump(opponents, id, won);
  }

  const form = timeline.map((moment): Result => moment.won ? "W" : "L");
  const wins = form.filter((result) => result === "W").length;
  const losses = form.length - wins;
  const last = form.at(-1);
  let count = 0;
  for (let index = form.length - 1; index >= 0 && form[index] === last; index -= 1) count += 1;
  const dayList = [...days.values()];
  const bestDay = dayList.reduce<DayRecord | null>((best, day) =>
    !best || day.wins > best.wins || (day.wins === best.wins && day.losses <= best.losses) ? day : best, null);
  const busiestDay = dayList.reduce<DayRecord | null>((best, day) => !best || day.wins + day.losses >= best.wins + best.losses ? day : best, null);
  const recentWins = form.slice(-10).filter((result) => result === "W").length;
  const rivals = [...opponents.values()];
  const total = (rival: Rival) => rival.wins + rival.losses;

  const stats = {
    played: form.length,
    wins,
    losses,
    pointsFor,
    pointsAgainst,
    timeline,
    form,
    streak: last ? { result: last, count } : null,
    bestWinStreak,
    peak,
    days: dayList,
    bestDay: bestDay && bestDay.wins > 0 ? bestDay : null,
    busiestDay,
    recentDelta: form.length >= 15 ? Math.round((recentWins / 10 - wins / form.length) * 100) : null,
    deuce,
    demolitions,
    bagels,
    heartbreaks,
    openers,
    biggestWin,
    marathon,
    avgWinMargin: wins ? winMargin / wins : 0,
    avgLossMargin: losses ? lossMargin / losses : 0,
    teammates: [...teammates.values()].sort((x, y) => y.wins - x.wins || y.wins / total(y) - x.wins / total(x) || total(y) - total(x)).slice(0, 3),
    beatMost: rivals.filter((rival) => rival.wins > 0).sort((x, y) => y.wins - x.wins || x.losses - y.losses).slice(0, 3),
    lostMost: rivals.filter((rival) => rival.losses > 0).sort((x, y) => y.losses - x.losses || x.wins - y.wins).slice(0, 3),
  };
  return { ...stats, title: pickTitle(stats) };
}

export type Award = { id: string; name: string; line: string; players: string[]; value: string };

/** Crew-wide superlatives for the Stats tab. Each award is skipped until someone qualifies. */
export function crewAwards(games: StatGame[], playerIds: string[]): Award[] {
  const cards = playerIds.map((id) => ({ id, stats: playerDashboard(id, games) })).filter((card) => card.stats.played > 0);
  const awards: Award[] = [];
  const best = <T,>(items: T[], score: (item: T) => number, min = 1) => {
    const top = items.reduce<T | null>((winner, item) => score(item) >= min && (!winner || score(item) > score(winner)) ? item : winner, null);
    return top;
  };

  const hot = best(cards, (card) => card.stats.streak?.result === "W" ? card.stats.streak.count : 0, 2);
  if (hot) awards.push({ id: "fire", name: "On Fire", line: "Longest win streak going right now", players: [hot.id], value: `${hot.stats.streak!.count} straight` });

  const ice = best(cards, (card) => card.stats.deuce.wins * 100 + rate(card.stats.deuce) * 10, 100);
  if (ice) awards.push({ id: "ice", name: "Ice Veins", line: "Most deuce games won", players: [ice.id], value: `${ice.stats.deuce.wins}–${ice.stats.deuce.losses} in deuce` });

  const dozer = best(cards, (card) => card.stats.demolitions);
  if (dozer) awards.push({ id: "dozer", name: "Bulldozer", line: "Most wins by a landslide", players: [dozer.id], value: `${dozer.stats.demolitions} demolition${dozer.stats.demolitions === 1 ? "" : "s"}` });

  const lungs = best(cards, (card) => card.stats.busiestDay ? card.stats.busiestDay.wins + card.stats.busiestDay.losses : 0, 2);
  if (lungs) awards.push({ id: "lungs", name: "Iron Lungs", line: "Most games in a single session", players: [lungs.id], value: `${lungs.stats.busiestDay!.wins + lungs.stats.busiestDay!.losses} games` });

  const pairs = new Map<string, WinLoss & { ids: string[] }>();
  const rivalries = new Map<string, WinLoss & { ids: string[] }>();
  for (const game of games) {
    const [a, b] = sides(game);
    const aWon = game.score_a > game.score_b;
    for (const [side, won] of [[a, aWon], [b, !aWon]] as const) {
      if (side.length !== 2) continue;
      const ids = [...side].sort();
      const pair = pairs.get(ids.join()) ?? { ids, wins: 0, losses: 0 };
      if (won) pair.wins += 1; else pair.losses += 1;
      pairs.set(ids.join(), pair);
    }
    for (const x of a) for (const y of b) {
      const ids = [x, y].sort();
      const rivalry = rivalries.get(ids.join()) ?? { ids, wins: 0, losses: 0 };
      // wins counts for ids[0], losses for ids[1].
      if ((aWon && x === ids[0]) || (!aWon && y === ids[0])) rivalry.wins += 1; else rivalry.losses += 1;
      rivalries.set(ids.join(), rivalry);
    }
  }
  const duo = best([...pairs.values()], (pair) => pair.wins, 2);
  if (duo) awards.push({ id: "duo", name: "Dynamic Duo", line: "Most wins as a pair", players: duo.ids, value: `${duo.wins} wins together` });

  const feud = best([...rivalries.values()], (rivalry) => rivalry.wins + rivalry.losses, 3);
  if (feud) awards.push({ id: "feud", name: "The Rivalry", line: "Faced each other the most", players: feud.ids, value: `${feud.wins}–${feud.losses}` });

  const heart = best(cards, (card) => card.stats.heartbreaks, 2);
  if (heart) awards.push({ id: "heart", name: "Heartbreak Kid", line: "Most losses by two points", players: [heart.id], value: `${heart.stats.heartbreaks} so-close losses` });

  const opener = best(cards, (card) => card.stats.openers.wins * 100 + rate(card.stats.openers) * 10, 200);
  if (opener) awards.push({ id: "opener", name: "No Warm-up Needed", line: "Most first games of the day won", players: [opener.id], value: `${opener.stats.openers.wins}–${opener.stats.openers.losses} openers` });

  return awards;
}
