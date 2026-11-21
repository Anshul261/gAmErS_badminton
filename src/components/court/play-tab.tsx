"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ArrowRightIcon, CheckCircledIcon, CheckIcon, PersonIcon, PlusIcon, SewingPinIcon } from "@radix-ui/react-icons";
import { useConfirm } from "@/components/court/confirm";
import { rememberSession, useCourt } from "@/components/court/context";
import { GameForm } from "@/components/game-form";
import { AddToSession } from "@/components/court/add-to-session";
import { GameList } from "@/components/court/game-list";
import { addAttendee, endSession, startSession } from "@/lib/data";
import { dubaiDate, dubaiToday, mapLabel, shortTime } from "@/lib/scoring";
import type { Game, GameInput, Session, SessionData } from "@/lib/types";

type PlayTabProps = {
  hidden: boolean;
  playSessionId: string | null;
  setPlaySessionId: (id: string | null) => void;
  playData: SessionData | undefined;
  playEnded: boolean;
  activeSessions: Session[];
  sessionErrors: Record<string, string>;
  attendees: string[];
  setAttendees: Dispatch<SetStateAction<string[]>>;
  gameLimit: number;
  setGameLimit: (limit: number) => void;
  setChoosing: (choosing: boolean) => void;
  openSession: (id: string) => Promise<boolean>;
  chooseSession: () => Promise<void>;
  save: (input: GameInput, original?: Game) => Promise<void>;
  setGamePending: (pending: boolean) => void;
  whoPlayed: (sessionId: string) => string[];
  isPlanned: (session: Session) => boolean;
};

export function PlayTab({ hidden, playSessionId, setPlaySessionId, playData, playEnded, activeSessions, sessionErrors, attendees, setAttendees, gameLimit, setGameLimit, setChoosing, openSession, chooseSession, save, setGamePending, whoPlayed, isPlanned }: PlayTabProps) {
  const { userId, workspace, names, locked, offline, busy, error, mutate, setError, setTab, setSessions, setWorkspace } = useCourt();
  const confirm = useConfirm();
  const [target, setTarget] = useState(11);
  const [planDate, setPlanDate] = useState(() => dubaiToday());
  const [planTime, setPlanTime] = useState("");
  const [planVenue, setPlanVenue] = useState("");
  const [planUrl, setPlanUrl] = useState("");
  const [adding, setAdding] = useState<string | null>(null); // null = closed; a string = open with that search
  const roster = workspace.players.filter((player) => !player.archived);
  const whenWhere = (session: Session) => [
    dubaiDate(session.session_date, { weekday: "short", year: session.session_date.slice(0, 4) === dubaiToday().slice(0, 4) ? undefined : "numeric" }),
    shortTime(session.start_time),
    session.venue_name,
  ].filter(Boolean).join(" · ");

  return (
    <section hidden={hidden} aria-label="Play">
      <div className="cs-session-heading"><div><p className="cs-eyebrow">{playData && !playEnded ? isPlanned(playData.session) ? "PLANNED" : "ON COURT" : "MAKE TIME FOR A GAME"}</p><h2>{playData ? playEnded ? "That's a session." : playData.playerIds.length < 2 ? "Who's here?" : "Let the games begin." : activeSessions.length ? "Pick a court." : "Who's playing today?"}</h2></div>{playData ? <span className="cs-date-stamp">{dubaiDate(playData.session.session_date, { weekday: "short" })}{playData.session.start_time ? ` · ${shortTime(playData.session.start_time)}` : ""}<span>Dubai time</span></span> : null}</div>
      {playData && (playData.session.venue_name || playData.session.venue_url) ? <p className="cs-venue"><SewingPinIcon width={15} height={15} aria-hidden="true" /><span>{playData.session.venue_name ?? "Venue"}</span>{playData.session.venue_url ? <a href={playData.session.venue_url} target="_blank" rel="noopener noreferrer">Open in {mapLabel(playData.session.venue_url)}<ArrowRightIcon width={14} height={14} aria-hidden="true" /></a> : null}</p> : null}
      {playData && activeSessions.length > 1 && !playEnded ? <div className="cs-banner"><span>{activeSessions.length} sessions are on court. Make sure you are logging on the right one.</span><button className="cs-text-button" disabled={locked} onClick={chooseSession}>Switch<ArrowRightIcon width={16} height={16} aria-hidden="true" /></button></div> : null}

      {playSessionId && !playData ? <div className="cs-loading-sheet" role="status">{!sessionErrors[playSessionId] ? [0, 1, 2].map((row) => <div key={row} aria-hidden="true"><span /><span /></div>) : null}<p>{sessionErrors[playSessionId] ? "This session could not be loaded." : "Loading the score sheet..."}</p></div> : playData ? <>
        <div className="cs-session-strip"><span><PersonIcon width={16} height={16} aria-hidden="true" />{playData.playerIds.length} playing</span><span>{playData.games.length} {playData.games.length === 1 ? "game" : "games"} logged</span><span className="cs-sync-state">{offline || sessionErrors[playData.session.id] || error.startsWith("Updates paused.") ? "Sync paused" : playEnded ? "Finished" : "Updates every 4s"}</span></div>
        <div className="cs-play-grid">
          <div className="cs-log-panel">
            <div className="cs-section-heading"><h3>{playData.playerIds.length < 2 && !playEnded ? "Who's in?" : "Log a game"}</h3><span className="cs-caption">{playData.playerIds.length < 2 && !playEnded ? `${playData.playerIds.length} of 2 needed` : "1v1 / 1v2 / 2v2"}</span></div>
            {playEnded ? <p className="cs-banner cs-banner-warning">This session has finished. Your draft is kept here, but new games cannot be saved. Existing games can still be corrected.</p> : null}
            {playData.playerIds.length < 2 && !playEnded ? <div className="cs-whos-here"><p className="cs-help">{playData.playerIds.length ? `Only ${names.get(playData.playerIds[0]) ?? "one player"} so far. ` : "Nobody is in yet. "}Tap everyone who&apos;s here; you need two to log a game.</p><div className="cs-chips cs-attendee-chips">{roster.map((player) => { const here = playData.playerIds.includes(player.id); return <button className={`cs-chip ${here ? "is-selected" : ""}`} type="button" key={player.id} aria-pressed={here} disabled={locked || offline || here} onClick={() => void mutate("attendee", async () => {
              await addAttendee(playData.session, player.id);
              setSessions((current) => current[playData.session.id] ? { ...current, [playData.session.id]: { ...current[playData.session.id], playerIds: [...current[playData.session.id].playerIds, player.id] } } : current);
            }, `${player.display_name} is in.`)}>{here ? <CheckIcon width={16} height={16} aria-hidden="true" /> : <PlusIcon width={16} height={16} aria-hidden="true" />}<span>{player.display_name}</span></button>; })}<button type="button" className="cs-chip cs-chip-add" disabled={locked || offline} onClick={() => setAdding("")}><PlusIcon width={16} height={16} aria-hidden="true" /><span>Add to session</span></button></div>{!roster.length ? <button type="button" className="cs-button cs-button-outline" onClick={() => setTab("people")}><PlusIcon width={17} height={17} aria-hidden="true" />Add players</button> : null}</div> : <GameForm key={playData.session.id} session={playData.session} players={workspace.players.filter((player) => playData.playerIds.includes(player.id))} offline={offline} disabled={Boolean(busy) || playEnded} onSave={save} onPendingChange={setGamePending} onAddPlayers={playEnded ? undefined : setAdding} />}
          </div>
          <aside className="cs-score-sheet"><div className="cs-section-heading"><h3>The score sheet</h3><span className="cs-count">{playData.games.length}</span></div><GameList data={playData} limit={gameLimit} onMore={() => setGameLimit(gameLimit + 50)} /><div className="cs-session-footer">{!playEnded ? <button type="button" className="cs-button cs-button-outline cs-full" disabled={locked || offline} onClick={async () => {
            if (!(await confirm({ title: "Finish this session?", body: "Save any game draft first. Scores can still be corrected in History.", action: "Finish session" }))) return;
            void mutate("finish", async () => {
              await endSession(playData.session.id);
              const endedAt = new Date().toISOString();
              setSessions((current) => ({ ...current, [playData.session.id]: { ...current[playData.session.id], session: { ...playData.session, ended_at: endedAt } } }));
              setWorkspace((current) => current ? { ...current, sessions: current.sessions.map((session) => session.id === playData.session.id ? { ...session, ended_at: endedAt } : session) } : current);
            }, "Session finished. See you next game.");
          }}><CheckCircledIcon width={17} height={17} aria-hidden="true" />{busy === "finish" ? "Finishing..." : "Finish session"}</button> : null}<button type="button" className={`cs-button cs-full ${playEnded ? "cs-button-primary" : "cs-button-outline"}`} disabled={locked} onClick={chooseSession}><PlusIcon width={17} height={17} aria-hidden="true" />{playEnded ? "Set up next session" : "Another session"}</button><p className="cs-help">Made a mistake? You can edit or delete a game.</p></div></aside>
        </div>
      </> : <div className="cs-setup-grid">{activeSessions.length ? <div className="cs-court-list"><div className="cs-section-heading"><h3 id="on-court">On court or planned</h3><span className="cs-count">{activeSessions.length}</span></div><ul aria-labelledby="on-court">{activeSessions.map((session) => {
        const who = whoPlayed(session.id);
        return <li key={session.id}><div><strong>{who.length ? who.join(", ") : "Nobody in yet"}</strong><small>{isPlanned(session) || session.start_time || session.venue_name ? `${isPlanned(session) ? "Planned " : ""}${whenWhere(session)}` : `Started ${dubaiDate(session.created_at, { day: undefined, month: undefined, hour: "2-digit", minute: "2-digit" })}`} · Games to {session.target_score}</small></div><button type="button" className="cs-button cs-button-primary" disabled={locked} onClick={() => void openSession(session.id)}>Open<ArrowRightIcon width={16} height={16} aria-hidden="true" /></button></li>;
      })}</ul><p className="cs-help">Everyone logging the same court should open the same session. Only start a new one below if you are on another court.</p></div> : null}<form className="cs-session-setup" aria-label="Start a session" onSubmit={(event) => {
        event.preventDefault();
        const ids = attendees.filter((id) => roster.some((player) => player.id === id));
        if (planUrl.trim() && !/^https:\/\//i.test(planUrl.trim())) { setError("Paste a full https:// link from Google Maps or Waze."); return; }
        void mutate("start", async () => {
          const id = await startSession({ attendees: ids, target, date: planDate || dubaiToday(), time: planTime, venue: planVenue, mapUrl: planUrl });
          setPlaySessionId(id); rememberSession(userId, id); setChoosing(false); setGameLimit(50);
          setAttendees([]); setPlanTime(""); setPlanVenue(""); setPlanUrl(""); setPlanDate(dubaiToday());
        }, ids.length >= 2 ? "Session started. Your court is ready." : "Session created. People can add themselves when they arrive.");
      }}><fieldset className="cs-fieldset" disabled={locked}><legend className="cs-label">Who&apos;s in?</legend><p className="cs-help">Tap everyone playing. Planning ahead? Leave this empty and people add themselves when they arrive.</p>{roster.length ? <div className="cs-chips cs-attendee-chips">{roster.map((player) => <button className={`cs-chip ${attendees.includes(player.id) ? "is-selected" : ""}`} type="button" key={player.id} aria-pressed={attendees.includes(player.id)} onClick={() => setAttendees((current) => current.includes(player.id) ? current.filter((id) => id !== player.id) : [...current, player.id])}>{attendees.includes(player.id) ? <CheckIcon width={16} height={16} aria-hidden="true" /> : <PlusIcon width={16} height={16} aria-hidden="true" />}<span>{player.display_name}</span></button>)}</div> : <div className="cs-empty cs-empty-small"><p>The roster is empty. Add your friends by name. They don&apos;t need an account to play.</p><button type="button" className="cs-button cs-button-outline" onClick={() => setTab("people")}><PlusIcon width={17} height={17} aria-hidden="true" />Add players</button></div>}</fieldset><fieldset className="cs-fieldset cs-setup-when" disabled={locked}><legend className="cs-label">When &amp; where</legend><div className="cs-when-grid"><label><span className="cs-label">Date</span><input className="cs-input" type="date" value={planDate} min={dubaiToday(365)} onChange={(event) => setPlanDate(event.target.value)} required /></label><label><span className="cs-label">Time <em>(optional)</em></span><input className="cs-input" type="time" value={planTime} onChange={(event) => setPlanTime(event.target.value)} /></label><label><span className="cs-label">Place <em>(optional)</em></span><input className="cs-input" maxLength={80} placeholder="e.g. Al Nasr Leisureland" value={planVenue} onChange={(event) => setPlanVenue(event.target.value)} /></label><label><span className="cs-label">Map link <em>(optional)</em></span><input className="cs-input" type="url" inputMode="url" maxLength={500} placeholder="Paste a Google Maps or Waze link" value={planUrl} onChange={(event) => setPlanUrl(event.target.value)} /></label></div><p className="cs-help">Dates are Dubai time. Share a Google Maps or Waze link so everyone finds the court.</p></fieldset><fieldset className="cs-fieldset cs-setup-target" disabled={locked}><legend className="cs-label">Usual game target</legend><div className="cs-segment">{[11, 21].map((value) => <button type="button" key={value} aria-pressed={target === value} onClick={() => setTarget(value)}>{value} points</button>)}</div><p className="cs-help">Win by two. You can change the target for each game.</p></fieldset><button type="submit" className="cs-button cs-button-primary cs-full" disabled={locked || offline || !planDate}>{busy === "start" ? "Creating session..." : attendees.length >= 2 ? `Start session with ${attendees.length}` : planDate > dubaiToday() ? "Plan session" : "Create session"}<ArrowRightIcon width={18} height={18} aria-hidden="true" /></button></form><aside className="cs-court-note"><div className="cs-decorative-court" aria-hidden="true"><span /><span /></div><p className="cs-eyebrow">THE HOUSE RULES</p><h3>Good games.<br />Honest scores.</h3><p>Singles, doubles or three friends making it work. Everyone on a side shares the result.</p><p>One person can log for the whole crew. Phones down, rackets up.</p></aside></div>}
      {playData && !playEnded ? <AddToSession open={adding !== null} onOpenChange={(open) => { if (!open) setAdding(null); }} session={playData.session} here={playData.playerIds} initialQuery={adding ?? ""} /> : null}
    </section>
  );
}
