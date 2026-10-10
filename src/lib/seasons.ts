import { dubaiToday } from "./scoring";

/** The crew's first session. Each season starts the day after the last one ends. */
const FIRST_DAY = "2026-09-19";
const SEASON_DAYS = 61;
/** Seasons starting in June, July or August run a day longer. */
const SUMMER_DAYS = 62;

export type Season = { number: number; from: string; to: string };

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** Every season up to the one containing today, newest first. */
export function seasons(today = dubaiToday()): Season[] {
  const list: Season[] = [];
  for (let from = FIRST_DAY; !list.length || list[list.length - 1].to < today;) {
    const days = [6, 7, 8].includes(Number(from.slice(5, 7))) ? SUMMER_DAYS : SEASON_DAYS;
    list.push({ number: list.length + 1, from, to: addDays(from, days - 1) });
    from = addDays(from, days);
  }
  return list.reverse();
}

/** Games before the first season (there are none) count towards it. */
export const inSeason = (season: Season, date: string) => (season.number === 1 || date >= season.from) && date <= season.to;
