"use client";

import { useMemo, useState } from "react";
import { ArrowRightIcon, BarChartIcon, Cross2Icon } from "@radix-ui/react-icons";
import { useCourt } from "@/components/court/context";
import { dubaiDate, dubaiToday } from "@/lib/scoring";
import { PROVISIONAL_GAMES, crewAwards, playerDashboard, seasonPerformance } from "@/lib/player-stats";
import type { SeasonPerformance } from "@/lib/player-stats";
import type { Season } from "@/lib/seasons";
import type { StatGame } from "@/lib/types";

const statColumns: { id: string; label: string; help: string }[] = [
  { id: "score", label: "Season score", help: `Win rate adjusted for the number of games played, using the Wilson lower bound with z = 1.96. Higher is better. Short records get a larger adjustment; more games at the same win rate raise the score. Every format counts equally. This is a performance score, not your raw win rate or an individual skill estimate. Scores are shown to two decimals, but full precision decides places. Under ${PROVISIONAL_GAMES} games you're Provisional.` },
  { id: "record", label: "W–L", help: "Games won and games lost. Every player on the winning side gets the win." },
  { id: "winpct", label: "Win %", help: "Wins divided by games played. First tiebreak when ranks are equal." },
];

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th, 21st. */
function ordinal(n: number) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

type StatsTabProps = {
  hidden: boolean;
  season: Season | null;
  seasonList: Season[];
  seasonPick: number | "all";
  setSeasonPick: (pick: number | "all") => void;
  seasonGames: StatGame[] | null;
  gamesError: string;
};

export function StatsTab({ hidden, season, seasonList, seasonPick, setSeasonPick, seasonGames, gamesError }: StatsTabProps) {
  const { workspace, names, offline, setProfileId, setTab, refresh } = useCourt();
  const [legend, setLegend] = useState<string | null>(null);
  // Whole Dubai days between two dates; a season ends at the close of its last day.
  const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  const seasonTimer = () => {
    const current = seasonList[0];
    const left = daysBetween(dubaiToday(), current.to);
    const length = daysBetween(current.from, current.to) + 1;
    return <div className="cs-season-timer" role="status"><p className="cs-eyebrow">SEASON {current.number} · ENDS {dubaiDate(current.to).toUpperCase()}</p><p>{left ? <><strong>{left}</strong> {left === 1 ? "day" : "days"} to go</> : <strong>Final day</strong>}</p><div className="cs-season-bar" aria-hidden="true"><span style={{ width: `${Math.round((length - left) / length * 100)}%` }} /></div><small>Then the table resets and everyone starts level. This season stays viewable.</small></div>;
  };
  const stats = useMemo(() => seasonGames ? seasonPerformance(seasonGames) : null, [seasonGames]);
  const forms = useMemo(() => new Map((stats ?? []).map((player) => [player.player_id, seasonGames ? playerDashboard(player.player_id, seasonGames).form.slice(-5) : []])), [stats, seasonGames]);
  const table = useMemo(() => {
    if (!stats) return null;
    return { settled: stats.filter((player) => !player.provisional), provisional: stats.filter((player) => player.provisional) };
  }, [stats]);
  const awards = useMemo(() => seasonGames && workspace ? crewAwards(seasonGames, workspace.players.map((player) => player.id)) : [], [seasonGames, workspace]);
  const statRow = (player: SeasonPerformance, place: number | null) => {
    const archived = workspace?.players.find((item) => item.id === player.player_id)?.archived;
    return <tr key={player.player_id}><th scope="row">{place ? <span className={`cs-rank ${place <= 3 ? `is-top is-${place}` : ""}`} aria-label={`${ordinal(place)} place`}>{place}<sup>{ordinal(place).slice(-2)}</sup></span> : <span className="cs-rank is-none" aria-hidden="true">–</span>}<span><button type="button" className="cs-player-link" onClick={() => setProfileId(player.player_id)}>{names.get(player.player_id) ?? "Archived player"}</button>{archived ? <small>Archived</small> : null}{forms.get(player.player_id)?.length ? <span className="cs-mini-form" aria-label={`Last ${forms.get(player.player_id)!.length} games, oldest first: ${forms.get(player.player_id)!.map((result) => result === "W" ? "win" : "loss").join(", ")}`}>{forms.get(player.player_id)!.map((result, i) => <b key={i} className={result === "W" ? "is-win" : "is-loss"} aria-hidden="true" />)}</span> : null}</span></th><td className="cs-stat-score">{player.score.toFixed(2)}</td><td><span className="cs-stat-wins">{player.wins}</span><span className="cs-dim">–</span>{player.losses}</td><td>{player.played ? `${Math.round(player.wins / player.played * 100)}%` : "0%"}</td></tr>;
  };

  return (
    <section hidden={hidden} aria-label="Stats">
      <div className="cs-session-heading">
        <div><p className="cs-eyebrow">A LITTLE FRIENDLY COMPETITION</p><h2>This season on court.</h2></div>
        <span className="cs-caption">{season ? `${dubaiDate(season.from)} – ${dubaiDate(season.to)}${season === seasonList[0] ? "" : " · final"}` : "Every season"}</span>
      </div>
      <div className="cs-history-filter">
        <div className="cs-segment cs-segment-wrap" role="group" aria-label="Season">
          {seasonList.map((item) => <button type="button" key={item.number} aria-pressed={seasonPick === item.number} onClick={() => setSeasonPick(item.number)}>Season {item.number}</button>)}
          <button type="button" aria-pressed={seasonPick === "all"} onClick={() => setSeasonPick("all")}>All time</button>
        </div>
      </div>
      {seasonTimer()}
      <p className="cs-stats-note">Ranked by <strong>Season score</strong>, a win rate adjusted for the number of games played. Singles, doubles and 1v2 count equally. Each season starts fresh; under {PROVISIONAL_GAMES} games you&apos;re Provisional. Tap a <span className="cs-th-help" aria-hidden="true">?</span> to see what a column means.</p>
      {gamesError ? <div className="cs-banner cs-banner-warning" role="alert"><span>Stats may not be up to date. {gamesError}</span><button className="cs-text-button" disabled={offline} onClick={refresh}>Retry</button></div> : null}
      {stats === null || table === null ? <div className="grid gap-4 py-4" role="status">
          {!gamesError ? [0, 1, 2].map((row) => <div key={row} aria-hidden="true" className="grid h-12 grid-cols-[2fr_repeat(4,1fr)] gap-3 border-b pb-3"><span className="rounded bg-muted" /><span className="rounded bg-muted" /><span className="rounded bg-muted" /><span className="rounded bg-muted" /><span className="rounded bg-muted" /></div>) : null}
          <p className="cs-help">{gamesError ? "Stats are unavailable." : "Counting the games..."}</p>
        </div>
        : !stats.some((player) => player.played > 0) ? <div className="cs-empty">
          <BarChartIcon width={38} height={38} aria-hidden="true" />
          <h3>{season && season.number > 1 ? `Season ${season.number} starts fresh.` : "Bragging rights start with game one."}</h3>
          <p>Log a game to see wins, win rates and season scores for your players.</p>
          <button className="cs-button cs-button-green" onClick={() => setTab("play")}>Back to the court<ArrowRightIcon width={17} height={17} aria-hidden="true" /></button>
        </div>
        : <>
          {awards.length ? <section className="cs-awards" aria-labelledby="hall-of-fame">
            <div className="cs-section-heading"><h3 id="hall-of-fame">Hall of fame</h3><span className="cs-caption">Swipe for more</span></div>
            <ul>{awards.map((award) => <li key={award.id}><p className="cs-award-name">{award.name}</p><p className="cs-award-who">{award.players.map((id, index) => <span key={id}>{index ? <span className="cs-dim">{award.id === "feud" ? " vs " : " & "}</span> : null}<button type="button" className="cs-player-link" onClick={() => setProfileId(id)}>{names.get(id) ?? "Archived player"}</button></span>)}</p><p className="cs-award-value">{award.value}</p><small>{award.line}</small></li>)}</ul>
          </section> : null}
          <div className="cs-stats-table-wrap">
            <table className="cs-stats-table">
              <caption className="cs-sr-only">Player statistics for the selected period, ranked by confidence-adjusted win rate, with provisional players last. Under each name, the last five results.</caption>
              <thead><tr><th scope="col">Player</th>{statColumns.map((column) => <th scope="col" key={column.id}><span className="cs-th"><span>{column.label}</span><button type="button" className="cs-th-help" aria-label={`What does ${column.label} mean?`} aria-expanded={legend === column.id} aria-controls="stats-legend" onClick={() => setLegend((current) => current === column.id ? null : column.id)}>?</button></span></th>)}</tr></thead>
              <tbody>{table.settled.map((player, index) => statRow(player, index + 1))}{table.provisional.length ? <tr className="cs-stats-group"><th scope="rowgroup" colSpan={statColumns.length + 1}>Provisional<small>Under {PROVISIONAL_GAMES} games. Places start at {PROVISIONAL_GAMES} games.</small></th></tr> : null}{table.provisional.map((player) => statRow(player, null))}</tbody>
            </table>
          </div>
        </>}
      <div id="stats-legend" className="cs-legend" hidden={!legend} role="region" aria-live="polite" aria-label="Column meaning">{legend ? (() => { const column = statColumns.find((item) => item.id === legend)!; return <><div className="cs-section-heading"><h3>{column.label}</h3><button type="button" className="cs-icon-button" aria-label="Close" onClick={() => setLegend(null)}><Cross2Icon width={16} height={16} aria-hidden="true" /></button></div><p>{column.help}</p></>; })() : null}</div>
      <p className="cs-help cs-stats-footnote">Dots under each name are the last 5 games, oldest first. Archived players keep their results. Tap a name for their player card.</p>
    </section>
  );
}
