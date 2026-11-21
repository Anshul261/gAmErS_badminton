"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ChevronRightIcon, Cross2Icon, MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { findMatches, playerDashboard, type MatchFilter, type Moment, type Rival, type WinLoss } from "@/lib/player-stats";
import { dubaiDate, dubaiToday } from "@/lib/scoring";
import type { StatGame } from "@/lib/types";

const pct = (record: WinLoss) => record.wins + record.losses ? `${Math.round(record.wins / (record.wins + record.losses) * 100)}%` : "–";
const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

function deuceVerdict(deuce: WinLoss) {
  const played = deuce.wins + deuce.losses;
  if (!played) return "No deuce drama yet";
  const rate = deuce.wins / played;
  return rate >= 0.6 ? "Ice in the veins" : rate <= 0.4 ? "Sweaty palms" : "Pure coin flip";
}

function Momentum({ timeline, label }: { timeline: Moment[]; label: (moment: Moment) => string }) {
  const [picked, setPicked] = useState(timeline.length - 1);
  const clip = useId();
  const area = useRef<HTMLDivElement>(null);
  const nets = timeline.map((moment) => moment.net);
  const top = Math.max(1, ...nets);
  const bottom = Math.min(-1, ...nets);
  const span = top - bottom;
  const x = (index: number) => (index + 1) / timeline.length * 100;
  const y = (net: number) => (top - net) / span * 100;
  const line = `M0 ${y(0)} ${timeline.map((moment, index) => `L${x(index)} ${y(moment.net)}`).join(" ")}`;
  const boundaries = timeline.flatMap((moment, index) => index > 0 && moment.date !== timeline[index - 1].date ? [x(index - 1) + 50 / timeline.length] : []);
  const peakIndex = nets.lastIndexOf(Math.max(...nets));
  const moment = timeline[picked];

  function pick(clientX: number) {
    const box = area.current?.getBoundingClientRect();
    if (!box) return;
    setPicked(Math.min(timeline.length - 1, Math.max(0, Math.round((clientX - box.left) / box.width * timeline.length) - 1)));
  }

  return <div className="cs-mo">
    <div className="cs-mo-readout" aria-live="polite">
      <span className="cs-mo-game">Game {picked + 1} of {timeline.length} · {dubaiDate(moment.date, { weekday: "short" })}</span>
      <strong className={moment.won ? "cs-positive" : "cs-danger"}>{moment.won ? "Won" : "Lost"} {moment.ours}–{moment.theirs}</strong>
      <span className="cs-mo-who">{label(moment)}</span>
      <span className="cs-mo-net">Net {signed(moment.net)}</span>
    </div>
    <div
      ref={area}
      className="cs-mo-plot"
      tabIndex={0}
      role="group"
      aria-label="Momentum: running wins minus losses. Use left and right arrows to step through games."
      onPointerDown={(event) => pick(event.clientX)}
      onPointerMove={(event) => { if (event.pointerType === "mouse" || event.buttons) pick(event.clientX); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") { event.preventDefault(); setPicked((index) => Math.max(0, index - 1)); }
        if (event.key === "ArrowRight") { event.preventDefault(); setPicked((index) => Math.min(timeline.length - 1, index + 1)); }
      }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {boundaries.map((at) => <line key={at} x1={at} x2={at} y1="0" y2="100" className="cs-mo-session" vectorEffect="non-scaling-stroke" />)}
        <line x1="0" x2="100" y1={y(0)} y2={y(0)} className="cs-mo-zero" vectorEffect="non-scaling-stroke" />
        <defs>
          <clipPath id={`${clip}-up`}><rect x="0" y="0" width="100" height={y(0)} /></clipPath>
          <clipPath id={`${clip}-down`}><rect x="0" y={y(0)} width="100" height={100 - y(0)} /></clipPath>
        </defs>
        {(["up", "down"] as const).map((half) => <g key={half} clipPath={`url(#${clip}-${half})`} className={`is-${half}`}>
          <path d={`${line} L100 ${y(0)} Z`} className="cs-mo-area" />
          <path d={line} className="cs-mo-line" vectorEffect="non-scaling-stroke" />
        </g>)}
      </svg>
      {timeline[peakIndex].net > 0 ? <span className="cs-mo-peak" style={{ left: `${x(peakIndex)}%`, top: `${y(timeline[peakIndex].net)}%` }}>Peak {signed(timeline[peakIndex].net)}</span> : null}
      <span className={`cs-mo-dot ${moment.won ? "is-win" : "is-loss"}`} style={{ left: `${x(picked)}%`, top: `${y(moment.net)}%` }} aria-hidden="true" />
      <span className="cs-mo-scale" aria-hidden="true"><span>{signed(top)}</span><span>{signed(bottom)}</span></span>
    </div>
    <div className="cs-mo-axis" aria-hidden="true"><span>{dubaiDate(timeline[0].date)}</span><span>{plural(boundaries.length + 1, "session")}</span><span>{dubaiDate(timeline.at(-1)!.date)}</span></div>
  </div>;
}

const filters: { id: MatchFilter; label: string }[] = [{ id: "all", label: "All" }, { id: "won", label: "Won" }, { id: "lost", label: "Lost" }, { id: "deuce", label: "Deuce" }, { id: "close", label: "By 2" }];

function MatchFinder({ timeline, name, vs, suggestions, onOpenSession }: {
  timeline: Moment[];
  name: (id: string) => string;
  vs: (moment: Moment) => string;
  suggestions: string[];
  onOpenSession: (sessionId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MatchFilter>("all");
  const [limit, setLimit] = useState(10);
  const input = useRef<HTMLInputElement>(null);
  const when = (date: string) => dubaiDate(date, { weekday: "short", year: "numeric" });
  const results = useMemo(() => findMatches(timeline, query, filter, name, when), [timeline, query, filter, name]);
  const search = (value: string) => { setQuery(value); setLimit(10); };

  return <div className="cs-mf">
    <div className="cs-player-search">
      <MagnifyingGlassIcon width={16} height={16} aria-hidden="true" />
      <label className="cs-sr-only" htmlFor="match-search">Search this player&apos;s games</label>
      <input ref={input} id="match-search" className="cs-input" type="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false}
        placeholder="vs Bobby, with Annie, 11-9, Sat…" value={query} onChange={(event) => search(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); event.stopPropagation(); search(""); } }} />
      {query ? <button type="button" className="cs-icon-button" aria-label="Clear search" onClick={() => { search(""); input.current?.focus(); }}><Cross2Icon width={15} height={15} aria-hidden="true" /></button> : null}
    </div>
    {!query && suggestions.length ? <div className="cs-mf-suggest"><span>Try</span>{suggestions.map((text) => <button type="button" key={text} onClick={() => search(text)}>{text}</button>)}</div> : null}
    <div className="cs-mf-filters" role="group" aria-label="Show games">{filters.map((item) => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setLimit(10); }}>{item.label}</button>)}</div>
    <p className="cs-help" role="status">{results.length === timeline.length ? `All ${plural(timeline.length, "game")}, newest first` : `${results.length} of ${plural(timeline.length, "game")}`}</p>
    {results.length ? <ol className="cs-mf-list">{results.slice(0, limit).map((moment) => <li key={moment.id}><button type="button" onClick={() => onOpenSession(moment.sessionId)} aria-label={`${moment.won ? "Won" : "Lost"} ${moment.ours}–${moment.theirs} ${vs(moment)}, ${when(moment.date)}. Open the score sheet.`}>
      <span className="cs-mf-date">{dubaiDate(moment.date, { day: "numeric", month: undefined })}<small>{dubaiDate(moment.date, { day: undefined, month: "short" })}</small></span>
      <span className="cs-mf-who">{vs(moment)}<small>{dubaiDate(moment.date, { weekday: "short", day: undefined, month: undefined })}{moment.deuce ? " · deuce" : ""}{moment.target !== 11 ? ` · to ${moment.target}` : ""}</small></span>
      <span className={`cs-mf-score ${moment.won ? "is-win" : "is-loss"}`}><b>{moment.won ? "W" : "L"}</b>{moment.ours}–{moment.theirs}</span>
    </button></li>)}</ol> : <p className="cs-empty cs-empty-small">No games match. Try a first name, a score like 11-9, or a day like Sat.</p>}
    {results.length > limit ? <button type="button" className="cs-button cs-button-outline cs-full" onClick={() => setLimit(limit + 20)}>Show more ({results.length - limit} left)</button> : null}
  </div>;
}

export function PlayerDashboard({ playerId, games, names, error, onPick, onOpenSession }: {
  playerId: string;
  games: StatGame[] | null;
  names: Map<string, string>;
  error: string;
  onPick: (id: string) => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const stats = useMemo(() => games ? playerDashboard(playerId, games) : null, [playerId, games]);
  const name = (id: string) => names.get(id) ?? "Archived player";
  const dayLabel = (date: string) => dubaiDate(date, { weekday: "short", year: date.slice(0, 4) === dubaiToday().slice(0, 4) ? undefined : "numeric" });
  const vs = (moment: Moment) => `${moment.partners.length ? `with ${moment.partners.map(name).join(" + ")} ` : ""}vs ${moment.opponents.map(name).join(" + ")}`;

  if (!stats) return <div className="cs-loading-sheet" role="status">{!error ? [0, 1, 2].map((row) => <div key={row} aria-hidden="true"><span /><span /></div>) : null}<p>{error ? `Stats are unavailable. ${error}` : "Counting the games..."}</p></div>;
  if (!stats.played) return <div className="cs-empty cs-empty-small"><h3>No games yet.</h3><p>Once {name(playerId)} plays a logged game, their card fills in here.</p></div>;

  const difference = stats.pointsFor - stats.pointsAgainst;
  // tone colours the card: good = green, bad = red, record = gold. A count of zero stays neutral.
  const trophies: { label: string; value: string; note: string; tone: "good" | "bad" | "record" | "neutral" }[] = [
    { label: deuceVerdict(stats.deuce), value: `${stats.deuce.wins}–${stats.deuce.losses}`, note: `Deuce games · ${pct(stats.deuce)} won`, tone: stats.deuce.wins + stats.deuce.losses === 0 ? "neutral" : deuceVerdict(stats.deuce) === "Ice in the veins" ? "good" : deuceVerdict(stats.deuce) === "Sweaty palms" ? "bad" : "neutral" },
    { label: "Bulldozer runs", value: String(stats.demolitions), note: stats.bagels ? `Wins by a mile, incl. ${plural(stats.bagels, "bagel")}` : "Wins by a mile", tone: stats.demolitions ? "good" : "neutral" },
    { label: "So close", value: String(stats.heartbreaks), note: "Losses by just two points", tone: stats.heartbreaks ? "bad" : "neutral" },
    { label: stats.openers.wins >= stats.openers.losses ? "No warm-up needed" : "Slow starter", value: `${stats.openers.wins}–${stats.openers.losses}`, note: "First game of each session", tone: stats.openers.wins + stats.openers.losses === 0 ? "neutral" : stats.openers.wins >= stats.openers.losses ? "good" : "bad" },
    ...stats.biggestWin ? [{ label: "Biggest beatdown", value: `${stats.biggestWin.ours}–${stats.biggestWin.theirs}`, note: `${vs(stats.biggestWin)} · ${dubaiDate(stats.biggestWin.date)}`, tone: "good" as const }] : [],
    ...stats.marathon ? [{ label: "The marathon", value: `${stats.marathon.ours}–${stats.marathon.theirs}`, note: `Longest game · ${stats.marathon.won ? "won" : "lost"} ${dubaiDate(stats.marathon.date)}`, tone: stats.marathon.won ? "good" as const : "bad" as const }] : [],
    ...stats.bestDay ? [{ label: "Best day", value: dayLabel(stats.bestDay.date), note: `${plural(stats.bestDay.wins, "win")}, ${plural(stats.bestDay.losses, "loss", "losses")}`, tone: "record" as const }] : [],
    ...stats.busiestDay ? [{ label: "Iron lungs", value: String(stats.busiestDay.wins + stats.busiestDay.losses), note: `Most games in a day · ${dubaiDate(stats.busiestDay.date)}`, tone: "record" as const }] : [],
  ];

  const rivalList = (rivals: Rival[], tone: "good" | "bad", label: (rival: Rival) => string, empty: string) => rivals.length
    ? <ol className={`cs-pd-list is-${tone}`}>{rivals.map((rival, index) => <li key={rival.id}><button type="button" onClick={() => onPick(rival.id)}><span className="cs-pd-rank">{index + 1}</span><span className="cs-pd-name">{name(rival.id)}<small>{label(rival)}</small></span><ChevronRightIcon width={16} height={16} aria-hidden="true" /></button></li>)}</ol>
    : <p className="cs-help">{empty}</p>;

  return <div className="cs-pd">
    <div className="cs-pd-hero">
      <p className="cs-pd-title">{stats.title.name}</p>
      <p className="cs-pd-tagline">{stats.title.line}</p>
      <div className="cs-pd-form" aria-label={`Last ${Math.min(10, stats.form.length)} games, oldest first: ${stats.form.slice(-10).map((result) => result === "W" ? "win" : "loss").join(", ")}`}>
        {stats.form.slice(-10).map((result, index) => <span key={index} className={result === "W" ? "is-win" : "is-loss"} aria-hidden="true">{result}</span>)}
        <small>{stats.streak ? `${stats.streak.result === "W" ? plural(stats.streak.count, "win") : plural(stats.streak.count, "loss", "losses")} in a row` : ""}</small>
      </div>
    </div>

    <dl className="cs-pd-tiles">
      <div className={stats.wins ? "is-good" : ""}><dt>Wins</dt><dd>{stats.wins}</dd></div>
      <div className={stats.losses ? "is-bad" : ""}><dt>Losses</dt><dd>{stats.losses}</dd></div>
      <div><dt>Win %</dt><dd>{pct(stats)}</dd></div>
      <div className={difference > 0 ? "is-good" : difference < 0 ? "is-bad" : ""}><dt>Pts +/-</dt><dd>{signed(difference)}</dd></div>
    </dl>

    <section className="cs-pd-card" aria-labelledby="pd-momentum">
      <div className="cs-section-heading"><h3 id="pd-momentum">Momentum</h3>{stats.recentDelta !== null ? <span className={`cs-pd-delta ${stats.recentDelta >= 5 ? "cs-positive" : stats.recentDelta <= -5 ? "cs-danger" : ""}`}>{stats.recentDelta >= 5 ? "Heating up" : stats.recentDelta <= -5 ? "Cooling down" : "Steady"} {signed(stats.recentDelta)}%</span> : null}</div>
      <p className="cs-help">Every win steps the line up, every loss steps it down. Tap or drag along it to replay any game.</p>
      <Momentum timeline={stats.timeline} label={vs} />
      <p className="cs-help">Best run: {plural(stats.bestWinStreak, "win")} in a row.{stats.recentDelta !== null ? ` Last 10 games vs their overall win rate: ${signed(stats.recentDelta)} points.` : ""}</p>
    </section>

    <section className="cs-pd-card" aria-labelledby="pd-matches">
      <div className="cs-section-heading"><h3 id="pd-matches">Find a match</h3><span className="cs-caption">Tap one to open it</span></div>
      <MatchFinder timeline={stats.timeline} name={name} vs={vs} onOpenSession={onOpenSession}
        suggestions={[...stats.lostMost[0] ? [`vs ${name(stats.lostMost[0].id).split(" ")[0]}`] : [], ...stats.teammates[0] ? [`with ${name(stats.teammates[0].id).split(" ")[0]}`] : [], ...stats.deuce.wins + stats.deuce.losses ? ["deuce"] : []]} />
    </section>

    <section aria-labelledby="pd-trophies">
      <div className="cs-section-heading"><h3 id="pd-trophies">Trophy cabinet</h3></div>
      <ul className="cs-pd-trophies">{trophies.map((trophy) => <li key={trophy.label} className={`is-${trophy.tone}`}><span>{trophy.label}</span><strong>{trophy.value}</strong><small>{trophy.note}</small></li>)}</ul>
    </section>

    <section className="cs-pd-card" aria-labelledby="pd-mates">
      <div className="cs-section-heading"><h3 id="pd-mates">Ride or die</h3><span className="cs-caption">Best teammates</span></div>
      {rivalList(stats.teammates, "good", (mate) => `${plural(mate.wins, "win")} together`, "Hasn't teamed up yet.")}
    </section>

    <section className="cs-pd-card" aria-labelledby="pd-h2h">
      <div className="cs-section-heading"><h3 id="pd-h2h">Head to head</h3></div>
      <div className="cs-pd-h2h">
        <div><p className="cs-eyebrow">FAVOURITE CUSTOMERS</p>{rivalList(stats.beatMost, "good", (rival) => `Beaten ${plural(rival.wins, "time")} · ${rival.wins}–${rival.losses} overall`, "No victims yet.")}</div>
        <div><p className="cs-eyebrow">NEMESIS</p>{rivalList(stats.lostMost, "bad", (rival) => `Lost to ${plural(rival.losses, "time")} · ${rival.wins}–${rival.losses} overall`, "Unbeaten so far. Suspicious.")}</div>
      </div>
    </section>
  </div>;
}
