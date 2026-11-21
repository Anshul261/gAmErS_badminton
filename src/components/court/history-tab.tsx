"use client";

import type { Dispatch, SetStateAction } from "react";
import { ArrowDownIcon, ChevronRightIcon, CounterClockwiseClockIcon, PlayIcon, ReloadIcon } from "@radix-ui/react-icons";
import { rememberSession, useCourt } from "@/components/court/context";
import { GameList } from "@/components/court/game-list";
import { deleteSession, reopenSession, updateSession } from "@/lib/data";
import { dubaiDate, dubaiToday, shortTime } from "@/lib/scoring";
import type { Season } from "@/lib/seasons";
import type { Session, SessionData } from "@/lib/types";

export type Range = "all" | "today" | "7" | "30" | "90" | "custom";
const ranges = [{ id: "all", label: "All" }, { id: "today", label: "Today" }, { id: "7", label: "7 days" }, { id: "30", label: "30 days" }, { id: "90", label: "90 days" }, { id: "custom", label: "Custom" }] as const;

type HistoryTabProps = {
  hidden: boolean;
  history: Session[];
  filteredHistory: Session[];
  range: Range;
  setRange: (range: Range) => void;
  customFrom: string;
  setCustomFrom: (date: string) => void;
  customTo: string;
  setCustomTo: (date: string) => void;
  rangeFrom: string;
  rangeTo: string;
  rangeIncomplete: boolean;
  historySessionId: string | null;
  setHistorySessionId: (id: string | null) => void;
  selectedData: SessionData | undefined;
  selectedError: string;
  gameLimit: number;
  setGameLimit: (limit: number) => void;
  loadMore: () => void;
  openSession: (id: string) => boolean;
  playData: SessionData | undefined;
  playEnded: boolean;
  playSessionId: string | null;
  setPlaySessionId: Dispatch<SetStateAction<string | null>>;
  setChoosing: (choosing: boolean) => void;
  setOlderSessions: Dispatch<SetStateAction<Session[]>>;
  seasonList: Season[];
  whoPlayed: (sessionId: string) => string[];
  isPlanned: (session: Session) => boolean;
};

export function HistoryTab({ hidden, history, filteredHistory, range, setRange, customFrom, setCustomFrom, customTo, setCustomTo, rangeFrom, rangeTo, rangeIncomplete, historySessionId, setHistorySessionId, selectedData, selectedError, gameLimit, setGameLimit, loadMore, openSession, playData, playEnded, playSessionId, setPlaySessionId, setChoosing, setOlderSessions, seasonList, whoPlayed, isPlanned }: HistoryTabProps) {
  const { userId, locked, offline, busy, mutate, setError, setTab, setSessions, setWorkspace, frozen } = useCourt();

  return (
    <section hidden={hidden} aria-label="History"><div className="cs-session-heading"><div><p className="cs-eyebrow">THE GAMES STAY HERE</p><h2>Previously on court.</h2></div><span className="cs-caption">Dates in Dubai time</span></div><div className="cs-history-filter"><div className="cs-segment cs-segment-wrap" role="group" aria-label="Show sessions from">{ranges.map((item) => <button type="button" key={item.id} aria-pressed={range === item.id} onClick={() => setRange(item.id)}>{item.label}</button>)}</div>{range === "custom" ? <div className="cs-inline-form cs-date-range"><label><span className="cs-label">From</span><input className="cs-input" type="date" value={customFrom} max={customTo || dubaiToday()} onChange={(event) => setCustomFrom(event.target.value)} /></label><label><span className="cs-label">To</span><input className="cs-input" type="date" value={customTo} min={customFrom || undefined} max={dubaiToday()} onChange={(event) => setCustomTo(event.target.value)} /></label></div> : null}<p className="cs-help" role="status">{range === "all" ? `${filteredHistory.length} ${filteredHistory.length === 1 ? "session" : "sessions"}${rangeIncomplete ? " loaded" : ""}` : `${filteredHistory.length} ${filteredHistory.length === 1 ? "session" : "sessions"} ${range === "today" ? "today" : range === "custom" ? (rangeFrom || rangeTo ? `between ${rangeFrom || "the start"} and ${rangeTo || "today"}` : "in the chosen dates") : `in the last ${range} days`}${rangeIncomplete ? ", checking older sessions..." : ""}`}</p></div><div className="cs-history-grid"><div><div className="cs-history-list">{filteredHistory.length ? filteredHistory.map((session) => <button key={session.id} type="button" className={`cs-history-session ${historySessionId === session.id ? "is-selected" : ""}`} onClick={() => { setHistorySessionId(session.id); setGameLimit(50); }} aria-pressed={historySessionId === session.id}><span className="cs-history-date">{dubaiDate(session.session_date, { day: "2-digit", month: "short" })}<small>{dubaiDate(session.session_date, { year: "numeric", month: undefined, day: undefined })}</small></span><span><strong>{session.ended_at ? "Session finished" : isPlanned(session) ? "Planned" : "On court"}</strong><small>{whoPlayed(session.id).join(", ") || "No attendees"}{session.venue_name ? ` · ${session.venue_name}` : ""} · Games to {session.target_score}</small></span><ChevronRightIcon width={18} height={18} aria-hidden="true" /></button>) : <div className="cs-empty cs-empty-small"><CounterClockwiseClockIcon width={28} height={28} aria-hidden="true" /><h3>{history.length ? "No sessions in this range." : "Your first session is still ahead."}</h3><p>{history.length ? "Try a wider date range." : "Start playing and this becomes the crew’s game archive."}</p></div>}</div>{rangeIncomplete ? <button className="cs-button cs-button-outline cs-full" disabled={locked || offline} onClick={loadMore}>{busy === "older" ? "Loading..." : "Load older sessions"}<ArrowDownIcon width={16} height={16} aria-hidden="true" /></button> : null}</div><div className="cs-history-detail">{historySessionId ? selectedData ? <><div className="cs-section-heading"><h3>{dubaiDate(selectedData.session.session_date, { year: "numeric" })}</h3><span className="cs-caption">{selectedData.games.length} games</span></div>{frozen(selectedData.session.session_date) ? <p className="cs-help">The original score sheet. This season is over, so its results are final.</p> : <><p className="cs-help">The original score sheet. Corrections update everyone&apos;s stats.</p><details className="cs-session-edit"><summary>Edit session details</summary><form key={selectedData.session.id} aria-label="Edit session details" onSubmit={(event) => {
        event.preventDefault();
        const fields = new FormData(event.currentTarget);
        const id = selectedData.session.id;
        const mapUrl = String(fields.get("venue_url") ?? "").trim();
        if (mapUrl && !/^https:\/\//i.test(mapUrl)) { setError("Paste a full https:// link from Google Maps or Waze."); return; }
        const changes = { session_date: String(fields.get("session_date")), target_score: Number(fields.get("target_score")), start_time: String(fields.get("start_time") ?? "") || null, venue_name: String(fields.get("venue_name") ?? "").trim() || null, venue_url: mapUrl || null };
        void mutate("edit-session", async () => {
          const updated = await updateSession(id, changes);
          setSessions((current) => current[id] ? { ...current, [id]: { ...current[id], session: updated } } : current);
          setWorkspace((current) => current ? { ...current, sessions: current.sessions.map((session) => session.id === id ? updated : session) } : current);
          setOlderSessions((current) => current.map((session) => session.id === id ? updated : session));
        }, "Session details saved.");
      }}><label><span className="cs-label">Date</span><input className="cs-input" type="date" name="session_date" required min={seasonList[0].from} defaultValue={selectedData.session.session_date} disabled={locked} /></label><label><span className="cs-label">Time</span><input className="cs-input" type="time" name="start_time" defaultValue={shortTime(selectedData.session.start_time)} disabled={locked} /></label><label><span className="cs-label">Place</span><input className="cs-input" name="venue_name" maxLength={80} defaultValue={selectedData.session.venue_name ?? ""} disabled={locked} /></label><label><span className="cs-label">Map link</span><input className="cs-input" type="url" name="venue_url" maxLength={500} defaultValue={selectedData.session.venue_url ?? ""} disabled={locked} /></label><label><span className="cs-label">Games to</span><select className="cs-input" name="target_score" defaultValue={selectedData.session.target_score} disabled={locked}><option value={11}>11</option><option value={21}>21</option></select></label><button type="submit" className="cs-button cs-button-outline" disabled={locked || offline}>{busy === "edit-session" ? "Saving..." : "Save"}</button></form></details>{selectedData.session.ended_at ? <button type="button" className="cs-button cs-button-primary cs-full" disabled={locked || offline} onClick={() => {
        const id = selectedData.session.id;
        if (playData && !playEnded && id !== playSessionId && !window.confirm("Reopen this session and switch to it? Any unsaved draft on the current court will be lost.")) return;
        void mutate("reopen", async () => {
          await reopenSession(id);
          setSessions((current) => current[id] ? { ...current, [id]: { ...current[id], session: { ...current[id].session, ended_at: null } } } : current);
          setWorkspace((current) => current ? { ...current, sessions: current.sessions.map((session) => session.id === id ? { ...session, ended_at: null } : session) } : current);
          setOlderSessions((current) => current.map((session) => session.id === id ? { ...session, ended_at: null } : session));
          setPlaySessionId(id);
          rememberSession(userId, id);
          setChoosing(false);
          setGameLimit(50);
          setTab("play");
        }, "Session reopened. Log the game, then finish it again.");
      }}><ReloadIcon width={17} height={17} aria-hidden="true" />{busy === "reopen" ? "Reopening..." : "Reopen session"}</button> : <button type="button" className="cs-button cs-button-outline cs-full" disabled={locked} onClick={() => { if (openSession(selectedData.session.id)) setTab("play"); }}><PlayIcon width={17} height={17} aria-hidden="true" />Open on Play</button>}</>}<GameList data={selectedData} limit={gameLimit} onMore={() => setGameLimit(gameLimit + 50)} />{!frozen(selectedData.session.session_date) ? <div className="cs-session-footer"><button type="button" className="cs-text-button cs-danger" disabled={locked || offline} onClick={() => {
        const id = selectedData.session.id;
        if (!window.confirm(`Delete this whole session and its ${selectedData.games.length} ${selectedData.games.length === 1 ? "game" : "games"}? Stats will drop them. This cannot be undone.`)) return;
        void mutate("delete-session", async () => {
          await deleteSession(id);
          setHistorySessionId(null);
          setPlaySessionId((current) => current === id ? null : current);
          setSessions((current) => { const next = { ...current }; delete next[id]; return next; });
          setOlderSessions((current) => current.filter((session) => session.id !== id));
          setWorkspace((current) => current ? { ...current, sessions: current.sessions.filter((session) => session.id !== id) } : current);
        }, "Session deleted. Stats are refreshing.");
      }}>{busy === "delete-session" ? "Deleting..." : "Delete this session"}</button><p className="cs-help">Removes the session, its attendance and every game on this sheet.</p></div> : null}</> : <div className="cs-loading-sheet" role="status">{!selectedError ? [0, 1, 2].map((row) => <div key={row} aria-hidden="true"><span /><span /></div>) : null}<p>{selectedError ? "Unable to load this score sheet." : "Opening score sheet..."}</p></div> : <div className="cs-empty"><div className="cs-decorative-court cs-court-outline" aria-hidden="true"><span /><span /></div><h3>Every session has a story.</h3><p>Choose a date to see the games or correct a score.</p></div>}</div></div></section>
  );
}
