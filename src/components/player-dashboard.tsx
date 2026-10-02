"use client";

import { useMemo } from "react";
import { ChevronRightIcon } from "@radix-ui/react-icons";
import { playerDashboard, type Rival } from "@/lib/player-stats";
import { dubaiDate, dubaiToday } from "@/lib/scoring";
import type { StatGame } from "@/lib/types";

const pct = (wins: number, played: number) => played ? `${Math.round(wins / played * 100)}%` : "–";
const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

export function PlayerDashboard({ playerId, games, names, error, onPick }: {
  playerId: string;
  games: StatGame[] | null;
  names: Map<string, string>;
  error: string;
  onPick: (id: string) => void;
}) {
  const stats = useMemo(() => games ? playerDashboard(playerId, games) : null, [playerId, games]);
  const name = (id: string) => names.get(id) ?? "Archived player";
  const dayLabel = (date: string) => dubaiDate(date, { weekday: "short", year: date.slice(0, 4) === dubaiToday().slice(0, 4) ? undefined : "numeric" });

  if (!stats) return <div className="cs-loading-sheet" role="status">{!error ? [0, 1, 2].map((row) => <div key={row} aria-hidden="true"><span /><span /></div>) : null}<p>{error ? `Stats are unavailable. ${error}` : "Counting the games..."}</p></div>;
  if (!stats.played) return <div className="cs-empty cs-empty-small"><h3>No games yet.</h3><p>Once {name(playerId)} plays a logged game, their card fills in here.</p></div>;

  const difference = stats.pointsFor - stats.pointsAgainst;
  const recent = stats.days.slice(-12);
  const peak = Math.max(1, ...recent.map((day) => Math.max(day.wins, day.losses)));
  const lastFive = stats.days.slice(-5).reduce((sum, day) => ({ wins: sum.wins + day.wins, played: sum.played + day.wins + day.losses }), { wins: 0, played: 0 });
  const trendDelta = stats.days.length > 5 ? Math.round(lastFive.wins / lastFive.played * 100 - stats.wins / stats.played * 100) : null;

  const rivalList = (rivals: Rival[], label: (rival: Rival) => string, empty: string) => rivals.length
    ? <ol className="cs-pd-list">{rivals.map((rival, index) => <li key={rival.id}><button type="button" onClick={() => onPick(rival.id)}><span className="cs-pd-rank">{index + 1}</span><span className="cs-pd-name">{name(rival.id)}<small>{label(rival)}</small></span><ChevronRightIcon width={16} height={16} aria-hidden="true" /></button></li>)}</ol>
    : <p className="cs-help">{empty}</p>;

  return <div className="cs-pd">
    <div className="cs-pd-form" aria-label={`Last ${Math.min(10, stats.form.length)} games, oldest first: ${stats.form.slice(-10).map((result) => result === "W" ? "win" : "loss").join(", ")}`}>
      {stats.form.slice(-10).map((result, index) => <span key={index} className={result === "W" ? "is-win" : "is-loss"} aria-hidden="true">{result}</span>)}
      <small>{stats.streak ? `${stats.streak.result === "W" ? plural(stats.streak.count, "win") : plural(stats.streak.count, "loss", "losses")} in a row` : ""}</small>
    </div>

    <dl className="cs-pd-tiles">
      <div><dt>Wins</dt><dd className="cs-positive">{stats.wins}</dd></div>
      <div><dt>Losses</dt><dd>{stats.losses}</dd></div>
      <div><dt>Win %</dt><dd>{pct(stats.wins, stats.played)}</dd></div>
      <div><dt>Pts +/-</dt><dd className={difference > 0 ? "cs-positive" : ""}>{difference > 0 ? "+" : ""}{difference}</dd></div>
    </dl>
    <p className="cs-help">{plural(stats.played, "game")} over {plural(stats.days.length, "session")} · best win streak {stats.bestWinStreak}</p>

    <section className="cs-pd-card" aria-labelledby="pd-trend">
      <div className="cs-section-heading"><h3 id="pd-trend">Trend</h3>{trendDelta !== null ? <span className={`cs-pd-delta ${trendDelta > 0 ? "cs-positive" : trendDelta < 0 ? "cs-danger" : ""}`}>{trendDelta > 0 ? "▲" : trendDelta < 0 ? "▼" : "■"} {trendDelta > 0 ? "+" : ""}{trendDelta} pts</span> : null}</div>
      <p className="cs-help">{trendDelta === null ? "Wins above the line, losses below, one bar pair per session." : `Last 5 sessions: ${pct(lastFive.wins, lastFive.played)} win rate vs ${pct(stats.wins, stats.played)} overall.`}</p>
      <div className="cs-pd-chart" role="img" aria-label={`Wins and losses for the last ${plural(recent.length, "session")}`}>
        {recent.map((day) => <div key={day.date} className="cs-pd-bar" title={`${dayLabel(day.date)}: ${day.wins}W ${day.losses}L`}>
          <span className="cs-pd-up"><i style={{ height: `${day.wins / peak * 100}%` }} /></span>
          <span className="cs-pd-down"><i style={{ height: `${day.losses / peak * 100}%` }} /></span>
        </div>)}
      </div>
      <div className="cs-pd-axis" aria-hidden="true"><span>{dubaiDate(recent[0].date)}</span><span><b className="is-win" />Won <b className="is-loss" />Lost</span><span>{dubaiDate(recent.at(-1)!.date)}</span></div>
      <table className="cs-sr-only"><caption>Wins and losses by session</caption><thead><tr><th>Date</th><th>Wins</th><th>Losses</th></tr></thead><tbody>{recent.map((day) => <tr key={day.date}><td>{dayLabel(day.date)}</td><td>{day.wins}</td><td>{day.losses}</td></tr>)}</tbody></table>
    </section>

    {stats.bestDay ? <section className="cs-pd-card cs-pd-best" aria-labelledby="pd-best"><p className="cs-eyebrow" id="pd-best">BEST DAY</p><strong>{dayLabel(stats.bestDay.date)}</strong><span>{plural(stats.bestDay.wins, "win")}, {plural(stats.bestDay.losses, "loss", "losses")}</span></section> : null}

    <section className="cs-pd-card" aria-labelledby="pd-mates">
      <div className="cs-section-heading"><h3 id="pd-mates">Best teammates</h3></div>
      {rivalList(stats.teammates, (mate) => `${mate.wins}–${mate.losses} together · ${pct(mate.wins, mate.wins + mate.losses)}`, "No doubles games yet.")}
    </section>

    <section className="cs-pd-card" aria-labelledby="pd-h2h">
      <div className="cs-section-heading"><h3 id="pd-h2h">Head to head</h3></div>
      <div className="cs-pd-h2h">
        <div><p className="cs-eyebrow">BEATS MOST</p>{rivalList(stats.beatMost, (rival) => `${rival.wins}–${rival.losses} against`, "No wins yet.")}</div>
        <div><p className="cs-eyebrow">LOSES MOST TO</p>{rivalList(stats.lostMost, (rival) => `${rival.wins}–${rival.losses} against`, "Unbeaten so far.")}</div>
      </div>
    </section>

    <section className="cs-pd-card" aria-labelledby="pd-more">
      <div className="cs-section-heading"><h3 id="pd-more">The details</h3></div>
      <dl className="cs-pd-rows">
        {stats.formats.map((row) => <div key={row.format}><dt>{row.format}</dt><dd>{row.wins}–{row.losses} <small>{pct(row.wins, row.wins + row.losses)}</small></dd></div>)}
        <div><dt>Deuce games</dt><dd>{stats.deuce.wins}–{stats.deuce.losses} <small>{pct(stats.deuce.wins, stats.deuce.wins + stats.deuce.losses)}</small></dd></div>
        <div><dt>Avg win margin</dt><dd>{stats.wins ? `+${stats.avgWinMargin.toFixed(1)}` : "–"}</dd></div>
        <div><dt>Avg loss margin</dt><dd>{stats.losses ? `−${stats.avgLossMargin.toFixed(1)}` : "–"}</dd></div>
      </dl>
      <p className="cs-help">Deuce games went past the target, like 12–10. 1v2 solo means you played alone against two.</p>
    </section>
  </div>;
}
