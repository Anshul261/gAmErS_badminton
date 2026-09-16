"use client";

import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowRightIcon, ArchiveIcon, CheckIcon, ChevronRightIcon, CopyIcon, CounterClockwiseClockIcon, ExitIcon, PlusIcon, PlayIcon, ReloadIcon, BarChartIcon, PersonIcon, PauseIcon, Cross2Icon, CheckCircledIcon } from "@radix-ui/react-icons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GameForm } from "@/components/game-form";
import { addAttendee, addPlayer, archivePlayer, deleteGame, deleteSession, endSession, loadOlderSessions, loadSession, loadStats, loadWorkspace, saveGame, startSession } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";
import { dubaiDate, dubaiToday } from "@/lib/scoring";
import type { Game, GameInput, PlayerStats, Session, SessionData, Workspace } from "@/lib/types";

type Tab = "play" | "history" | "stats" | "people";
type Range = "all" | "today" | "7" | "30" | "90" | "custom";
const ranges = [{ id: "all", label: "All" }, { id: "today", label: "Today" }, { id: "7", label: "7 days" }, { id: "30", label: "30 days" }, { id: "90", label: "90 days" }, { id: "custom", label: "Custom" }] as const;
const tabs = [{ id: "play", label: "Play", icon: PlayIcon }, { id: "history", label: "History", icon: CounterClockwiseClockIcon }, { id: "stats", label: "Stats", icon: BarChartIcon }, { id: "people", label: "People", icon: PersonIcon }] as const;

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
}

// Each account remembers the court it is logging for, so a reload lands back on it.
function rememberedSession(userId: string) {
  try { return window.localStorage.getItem(`courtside:session:${userId}`); } catch { return null; }
}
function rememberSession(userId: string, id: string | null) {
  try {
    if (id) window.localStorage.setItem(`courtside:session:${userId}`, id);
    else window.localStorage.removeItem(`courtside:session:${userId}`);
  } catch { /* Private mode or a full store: the session still works, it just will not stick. */ }
}

export function Courtside({ userId }: { userId: string }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [sessions, setSessions] = useState<Record<string, SessionData>>({});
  const [playSessionId, setPlaySessionId] = useState<string | null>(null);
  const [historySessionId, setHistorySessionId] = useState<string | null>(null);
  const [olderSessions, setOlderSessions] = useState<Session[]>([]);
  const [hasOlder, setHasOlder] = useState(true);
  const [tab, setTab] = useState<Tab>("play");
  const [offline, setOffline] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [sessionErrors, setSessionErrors] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<PlayerStats[] | null>(null);
  const [statsError, setStatsError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [gamePending, setGamePending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [target, setTarget] = useState(11);
  const [latePlayerId, setLatePlayerId] = useState("");
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [gameLimit, setGameLimit] = useState(50);
  const [choosing, setChoosing] = useState(false);
  const [range, setRange] = useState<Range>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const actionLock = useRef(false);
  const revision = useRef(0);
  const refresh = useRef<() => void>(() => {});
  const activeSessions = workspace?.sessions.filter((session) => !session.ended_at) ?? [];
  const playData = playSessionId ? sessions[playSessionId] : undefined;
  const selectedId = tab === "history" ? historySessionId : playSessionId;
  const selectedData = selectedId ? sessions[selectedId] : undefined;
  const roster = workspace?.players.filter((player) => !player.archived) ?? [];
  const names = new Map(workspace?.players.map((player) => [player.id, player.display_name]) ?? []);
  const locked = Boolean(busy) || gamePending;
  const history = [...(workspace?.sessions ?? []), ...olderSessions].filter((session, index, all) => all.findIndex((item) => item.id === session.id) === index);
  const selectedError = selectedId ? sessionErrors[selectedId] : "";
  const rangeFrom = range === "today" ? dubaiToday() : range === "custom" ? customFrom : range === "all" ? "" : dubaiToday(Number(range) - 1);
  const rangeTo = range === "custom" ? customTo : "";
  const filteredHistory = history.filter((session) => (!rangeFrom || session.session_date >= rangeFrom) && (!rangeTo || session.session_date <= rangeTo));
  const oldestLoaded = history[history.length - 1];
  // Sessions load newest-first in pages of 50, so a range may reach past what is loaded.
  const rangeIncomplete = hasOlder && history.length >= 50 && (!rangeFrom || Boolean(oldestLoaded && oldestLoaded.session_date >= rangeFrom));
  const playEnded = Boolean(playData?.session.ended_at || workspace?.sessions.find((session) => session.id === playSessionId)?.ended_at);

  const poll = useEffectEvent(async (cancelled: () => boolean, workspaceDue: boolean) => {
    const readRevision = revision.current;
    const stale = () => cancelled() || readRevision !== revision.current;
    let currentWorkspace = workspace;
    if (workspaceDue || !currentWorkspace) {
      try {
        currentWorkspace = await loadWorkspace();
        if (stale()) return;
        const latestIds = new Set(currentWorkspace.sessions.map((session) => session.id));
        const displaced = workspace?.sessions.filter((session) => !latestIds.has(session.id)) ?? [];
        if (displaced.length) setOlderSessions((current) => [...displaced, ...current]);
        setWorkspace(currentWorkspace);
        setWorkspaceError("");
        setError((current) => current.startsWith("Updates paused.") ? "" : current);
        // Land on the court this account was logging for, then the one it started, then the only one open.
        const open = currentWorkspace.sessions.filter((session) => !session.ended_at);
        const remembered = rememberedSession(userId);
        const mine = open.find((session) => session.id === remembered) ?? open.find((session) => session.created_by === userId) ?? (open.length === 1 ? open[0] : undefined);
        if (mine && !choosing) setPlaySessionId((current) => current ?? mine.id);
      } catch (cause) {
        if (stale()) return;
        const code = cause instanceof Error ? String(cause.cause ?? "") : "";
        const accessDenied = code === "42501" || code === "PGRST116" || code.startsWith("PGRST30");
        if (workspace && !accessDenied) {
          setError(`Updates paused. Your draft is still here. ${message(cause)}`);
          return;
        }
        // Hide records when sign-in is rejected, but retain drafts during network failures.
        setWorkspace(null);
        setSessions({});
        setStats(null);
        setOlderSessions([]);
        setEditingGame(null);
        setWorkspaceError(message(cause));
        return;
      }
    }
    if (!currentWorkspace || stale()) return;
    const id = selectedId;
    await Promise.all([
      id ? (async () => {
        try {
          const data = await loadSession(id);
          if (stale()) return;
          setSessions((current) => ({ ...current, [id]: data }));
          setSessionErrors((current) => ({ ...current, [id]: "" }));
        } catch (cause) {
          if (!stale()) setSessionErrors((current) => ({ ...current, [id]: message(cause) }));
        }
      })() : Promise.resolve(),
      workspaceDue && tab === "stats" ? (async () => {
        try {
          const data = await loadStats();
          if (stale()) return;
          setStats(data);
          setStatsError("");
        } catch (cause) {
          if (!stale()) setStatsError(message(cause));
        }
      })() : Promise.resolve(),
    ]);
  });
  const pollDelay = useEffectEvent(() => activeSessions.length ? 4000 : 15000);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let queued = false;
    let lastWorkspace = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function run(force = false) {
      clearTimeout(timer);
      if (cancelled || document.hidden || !navigator.onLine) return;
      if (inFlight) { queued ||= force; return; }
      inFlight = true;
      const workspaceDue = force || Date.now() - lastWorkspace >= 15000;
      await poll(() => cancelled, workspaceDue);
      if (workspaceDue) lastWorkspace = Date.now();
      inFlight = false;
      if (cancelled) return;
      const nextForce = queued;
      queued = false;
      timer = setTimeout(() => void run(nextForce), nextForce ? 0 : pollDelay());
    }
    function resume() {
      setOffline(!navigator.onLine);
      if (!document.hidden && navigator.onLine) void run(true);
      else clearTimeout(timer);
    }
    refresh.current = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void run(true), 0);
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    resume();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
  }, []);

  useEffect(() => { refresh.current(); }, [selectedId, tab]);

  async function mutate(label: string, task: () => Promise<void>, success: string) {
    if (actionLock.current || offline) return;
    actionLock.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await task();
      revision.current += 1;
      setNotice(success);
      refresh.current();
    } catch (cause) {
      setError(message(cause));
    } finally {
      actionLock.current = false;
      setBusy("");
    }
  }

  async function save(input: GameInput, original?: Game) {
    if (actionLock.current) throw new Error("Another change is being saved. Try again in a moment.");
    actionLock.current = true;
    try {
      const game = await saveGame(input, original);
      revision.current += 1;
      setSessions((current) => {
        const data = current[game.session_id];
        if (!data) return current;
        const games = data.games.filter((item) => item.id !== game.id);
        games.push(game);
        games.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
        return { ...current, [game.session_id]: { ...data, games } };
      });
      setNotice(original ? "Game corrected." : "Game saved.");
      if (original) setEditingGame(null);
      // Refresh owns its errors. A recorded game must never look like a failed save.
      refresh.current();
    } finally { actionLock.current = false; }
  }

  function openSession(id: string) {
    if (playData && !playEnded && id !== playSessionId && !window.confirm("Open this session? Any unsaved draft for the current one will be lost.")) return;
    setPlaySessionId(id);
    rememberSession(userId, id);
    setChoosing(false);
    setGameLimit(50);
  }

  function chooseSession() {
    if (playData && !playEnded && !window.confirm("Leave this session? Any unsaved game draft will be lost.")) return;
    setPlaySessionId(null);
    rememberSession(userId, null);
    setChoosing(true);
    setAttendees([]);
    setGameLimit(50);
  }

  function loadMore() {
    void mutate("older", async () => {
      const last = history[history.length - 1];
      const result = await loadOlderSessions(last.created_at);
      setOlderSessions((current) => [...current, ...result]);
      setHasOlder(result.length === 50);
    }, "Older sessions loaded.");
  }

  // Keep paging until the chosen range is fully covered.
  const autoLoad = useEffectEvent(() => { if (tab === "history" && rangeFrom && rangeIncomplete && !locked && !offline) loadMore(); });
  useEffect(() => { autoLoad(); }, [tab, rangeFrom, history.length]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
    } catch { setError("Copy was blocked. Share the address from your browser instead."); }
  }

  function gameList(data: SessionData) {
    const games = [...data.games].reverse();
    return <div className="cs-game-list">
      {games.length ? <ol>
        {games.slice(0, gameLimit).map((game, index) => {
          const sideA = [game.side_a_player_1, game.side_a_player_2].filter(Boolean).map((id) => names.get(id!) ?? "Archived player").join(" + ");
          const sideB = [game.side_b_player_1, game.side_b_player_2].filter(Boolean).map((id) => names.get(id!) ?? "Archived player").join(" + ");
          return <li className="cs-game-row" key={game.id}>
            <div className="cs-game-meta"><span>GAME {String(games.length - index).padStart(2, "0")}</span><span>TO {game.target_score}</span></div>
            <div className={`cs-result-side ${game.score_a > game.score_b ? "is-winner" : ""}`}><span>{sideA}{game.score_a > game.score_b ? <span className="cs-sr-only">, winner</span> : null}</span><strong>{game.score_a}</strong></div>
            <div className={`cs-result-side ${game.score_b > game.score_a ? "is-winner" : ""}`}><span>{sideB}{game.score_b > game.score_a ? <span className="cs-sr-only">, winner</span> : null}</span><strong>{game.score_b}</strong></div>
            <div className="cs-game-actions">
              <button type="button" className="cs-text-button" disabled={locked || offline} aria-label={`Edit game ${games.length - index}`} onClick={() => setEditingGame(game)}>Edit score</button>
              <button type="button" className="cs-text-button cs-danger" disabled={locked || offline} aria-label={`Delete game ${games.length - index}`} onClick={() => {
                if (window.confirm(`Delete the ${game.score_a}-${game.score_b} game between ${sideA} and ${sideB}? This cannot be undone.`)) void mutate("delete", async () => {
                  await deleteGame(game.id);
                  setSessions((current) => {
                    const record = current[game.session_id];
                    return record ? { ...current, [game.session_id]: { ...record, games: record.games.filter((item) => item.id !== game.id) } } : current;
                  });
                }, "Game deleted. Stats are refreshing.");
              }}>Delete</button>
            </div>
          </li>;
        })}
      </ol> : <div className="cs-empty cs-empty-small"><CheckCircledIcon width={28} height={28} aria-hidden="true" /><h3>No games on the sheet yet.</h3><p>Play your first game, then log the final score.</p></div>}
      {games.length > gameLimit ? <button className="cs-button cs-button-outline cs-full" onClick={() => setGameLimit(gameLimit + 50)}>Show more games<ArrowDownIcon width={16} height={16} aria-hidden="true" /></button> : null}
    </div>;
  }

  return (
    <div className="cs-app">
      <a className="cs-skip-link" href="#main">Skip to content</a>
      <header className="cs-header">
        <button type="button" className="cs-brand" onClick={() => setTab("play")} aria-label="gAmErS cOuRtSiDe home"><span className="cs-brand-mark" aria-hidden="true"><span /></span><span className="cs-brand-name">gAmErS<span className="cs-brand-word"> cOuRtSiDe</span></span><span className="cs-brand-dot">.</span></button>
        <div className="cs-header-actions">
          <button type="button" className="cs-icon-button" aria-label="Sign out" title="Sign out" disabled={locked || offline} onClick={() => {
            if (!window.confirm("Sign out? Any unsaved game draft will be lost.")) return;
            void mutate("signout", async () => {
              const { error: signOutError } = await createClient().auth.signOut({ scope: "local" });
              if (signOutError) throw signOutError;
              // A full navigation discards authenticated client state after sign-out.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/login");
            }, "Signed out.");
          }}><ExitIcon width={19} height={19} aria-hidden="true" /></button>
        </div>
      </header>

      <main id="main" className="cs-main">
        {offline ? <div className="cs-banner cs-banner-warning" role="status"><PauseIcon width={18} height={18} aria-hidden="true" /><span>Syncing paused. You are offline. Keep this page open to retain your draft.</span></div> : null}
        {error ? <div className="cs-banner cs-banner-error" role="alert"><span>{error}</span><button className="cs-icon-button" aria-label="Dismiss error" onClick={() => setError("")}><Cross2Icon width={17} height={17} aria-hidden="true" /></button></div> : null}
        <p className="cs-global-status" role="status" aria-live="polite">{notice}</p>
        {/expired|sign.?in|jwt|auth/i.test(`${error} ${selectedError} ${statsError}`) ? <Link className="cs-text-button" href="/login">Sign in again<ArrowRightIcon width={16} height={16} aria-hidden="true" /></Link> : null}

        <div className="cs-page-heading">
          <div><p className="cs-eyebrow">YOUR BADMINTON CREW</p><h1>{workspaceError ? "Court unavailable" : "gAmErS"}</h1></div>
        </div>

        <nav className="cs-tabs" aria-label="Court sections">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={tab === id ? "is-active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => startTransition(() => setTab(id))}><Icon width={19} height={19} aria-hidden="true" /><span>{label}</span></button>)}</nav>

        {workspaceError ? <section className="cs-empty cs-access-error" role="alert"><h2>We couldn&apos;t open the court.</h2><p>{workspaceError}</p><p>Your sign-in may have expired. Scores are hidden until access is checked.</p><div className="cs-actions"><button className="cs-button cs-button-green" disabled={offline} onClick={() => refresh.current()}><ReloadIcon width={17} height={17} aria-hidden="true" />Try again</button><Link className="cs-button cs-button-outline" href="/login">Sign in again</Link></div></section> : !workspace ? <div className="cs-play-grid" role="status"><div><div className="cs-loading-court" aria-hidden="true"><div /><div /><div /><div /></div><p className="cs-help mt-4!">Getting the court ready...</p></div><div className="cs-score-sheet cs-loading-sheet" aria-hidden="true">{[0, 1, 2].map((row) => <div key={row}><span /><span /></div>)}</div></div> : <>
          {selectedError ? <div className="cs-banner cs-banner-warning" role="alert"><span>Scores may not be up to date. {selectedError}</span><button className="cs-text-button" disabled={offline} onClick={() => refresh.current()}>Retry</button></div> : null}

          <section hidden={tab !== "play"} aria-label="Play">
            <div className="cs-session-heading"><div><p className="cs-eyebrow">{playData && !playEnded ? "ON COURT" : "MAKE TIME FOR A GAME"}</p><h2>{playData ? playEnded ? "That's a session." : "Let the games begin." : activeSessions.length ? "Pick a court." : "Who's playing today?"}</h2></div>{playData ? <span className="cs-date-stamp">{dubaiDate(playData.session.session_date, { weekday: "short" })}<span>Dubai time</span></span> : null}</div>
            {playData && activeSessions.length > 1 && !playEnded ? <div className="cs-banner"><span>{activeSessions.length} sessions are on court. Make sure you are logging on the right one.</span><button className="cs-text-button" disabled={locked} onClick={chooseSession}>Switch<ArrowRightIcon width={16} height={16} aria-hidden="true" /></button></div> : null}

            {playSessionId && !playData ? <div className="cs-loading-sheet" role="status">{!sessionErrors[playSessionId] ? [0, 1, 2].map((row) => <div key={row} aria-hidden="true"><span /><span /></div>) : null}<p>{sessionErrors[playSessionId] ? "This session could not be loaded." : "Loading the score sheet..."}</p></div> : playData ? <>
              <div className="cs-session-strip"><span><PersonIcon width={16} height={16} aria-hidden="true" />{playData.playerIds.length} playing</span><span>{playData.games.length} {playData.games.length === 1 ? "game" : "games"} logged</span><span className="cs-sync-state">{offline || sessionErrors[playData.session.id] || error.startsWith("Updates paused.") ? "Sync paused" : playEnded ? "Finished" : "Updates every 4s"}</span></div>
              <div className="cs-play-grid">
                <div className="cs-log-panel">
                  <div className="cs-section-heading"><h3>Log a game</h3><span className="cs-caption">1v1 / 1v2 / 2v2</span></div>
                  {playEnded ? <p className="cs-banner cs-banner-warning">This session has finished. Your draft is kept here, but new games cannot be saved. Existing games can still be corrected.</p> : null}
                  <GameForm key={playData.session.id} session={playData.session} players={workspace.players.filter((player) => playData.playerIds.includes(player.id))} offline={offline} disabled={Boolean(busy) || playEnded} onSave={save} onPendingChange={setGamePending} />
                  {!playEnded ? <details className="cs-late-attendee"><summary>Someone joined late?</summary><form className="cs-inline-form" onSubmit={(event) => {
                    event.preventDefault();
                    if (!latePlayerId) return;
                    void mutate("attendee", async () => { await addAttendee(playData.session, latePlayerId); setLatePlayerId(""); }, "Player added to this session.");
                  }}><label className="cs-sr-only" htmlFor="late-player">Add a late attendee</label><select className="cs-input" id="late-player" value={latePlayerId} onChange={(event) => setLatePlayerId(event.target.value)} disabled={locked} required><option value="">Choose a player</option>{roster.filter((player) => !playData.playerIds.includes(player.id)).map((player) => <option key={player.id} value={player.id}>{player.display_name}</option>)}</select><button className="cs-button cs-button-outline" type="submit" disabled={locked || offline || !latePlayerId}>Add</button></form><p className="cs-help">New face? Add their name in People first.</p></details> : null}
                </div>
                <aside className="cs-score-sheet"><div className="cs-section-heading"><h3>The score sheet</h3><span className="cs-count">{playData.games.length}</span></div>{gameList(playData)}<div className="cs-session-footer">{!playEnded ? <button type="button" className="cs-button cs-button-outline cs-full" disabled={locked || offline} onClick={() => {
                  if (!window.confirm("Finish this session? Save any game draft first. Scores can still be corrected in History.")) return;
                  void mutate("finish", async () => {
                    await endSession(playData.session.id);
                    const endedAt = new Date().toISOString();
                    setSessions((current) => ({ ...current, [playData.session.id]: { ...current[playData.session.id], session: { ...playData.session, ended_at: endedAt } } }));
                    setWorkspace((current) => current ? { ...current, sessions: current.sessions.map((session) => session.id === playData.session.id ? { ...session, ended_at: endedAt } : session) } : current);
                  }, "Session finished. See you next game.");
                }}><CheckCircledIcon width={17} height={17} aria-hidden="true" />{busy === "finish" ? "Finishing..." : "Finish session"}</button> : null}<button type="button" className={`cs-button cs-full ${playEnded ? "cs-button-green" : "cs-button-outline"}`} disabled={locked} onClick={chooseSession}><PlusIcon width={17} height={17} aria-hidden="true" />{playEnded ? "Set up next session" : "Another session"}</button><p className="cs-help">Made a mistake? You can edit or delete a game.</p></div></aside>
              </div>
            </> : <div className="cs-setup-grid">{activeSessions.length ? <div className="cs-court-list"><div className="cs-section-heading"><h3 id="on-court">On court now</h3><span className="cs-count">{activeSessions.length}</span></div><ul aria-labelledby="on-court">{activeSessions.map((session) => {
              const who = (workspace.attendance[session.id] ?? []).map((id) => names.get(id) ?? "Archived player").sort((a, b) => a.localeCompare(b));
              return <li key={session.id}><div><strong>{who.length ? who.join(", ") : "No attendees yet"}</strong><small>Started {dubaiDate(session.created_at, { day: undefined, month: undefined, hour: "2-digit", minute: "2-digit" })} · Games to {session.target_score}</small></div><button type="button" className="cs-button cs-button-green" disabled={locked} onClick={() => openSession(session.id)}>Open<ArrowRightIcon width={16} height={16} aria-hidden="true" /></button></li>;
            })}</ul><p className="cs-help">Or start another session below for a second court.</p></div> : null}<form className="cs-session-setup" aria-label="Start a session" onSubmit={(event) => {
              event.preventDefault();
              const ids = attendees.filter((id) => roster.some((player) => player.id === id));
              if (ids.length < 2) { setError("Choose at least two players to start a session."); return; }
              void mutate("start", async () => { const id = await startSession(ids, target); setPlaySessionId(id); rememberSession(userId, id); setChoosing(false); setGameLimit(50); }, "Session started. Your court is ready.");
            }}><fieldset className="cs-fieldset" disabled={locked}><legend className="cs-label">Who&apos;s in?</legend><p className="cs-help">Tap everyone playing, at least two for a 1v1. You can add late arrivals later.</p>{roster.length ? <div className="cs-chips cs-attendee-chips">{roster.map((player) => <button className={`cs-chip ${attendees.includes(player.id) ? "is-selected" : ""}`} type="button" key={player.id} aria-pressed={attendees.includes(player.id)} onClick={() => setAttendees((current) => current.includes(player.id) ? current.filter((id) => id !== player.id) : [...current, player.id])}>{attendees.includes(player.id) ? <CheckIcon width={16} height={16} aria-hidden="true" /> : <PlusIcon width={16} height={16} aria-hidden="true" />}<span>{player.display_name}</span></button>)}</div> : <div className="cs-empty cs-empty-small"><p>The roster is empty. Add your friends by name. They don&apos;t need an account to play.</p><button type="button" className="cs-button cs-button-outline" onClick={() => setTab("people")}><PlusIcon width={17} height={17} aria-hidden="true" />Add players</button></div>}</fieldset><fieldset className="cs-fieldset cs-setup-target" disabled={locked}><legend className="cs-label">Usual game target</legend><div className="cs-segment">{[11, 21].map((value) => <button type="button" key={value} aria-pressed={target === value} onClick={() => setTarget(value)}>{value} points</button>)}</div><p className="cs-help">Win by two. You can change the target for each game.</p></fieldset><button type="submit" className="cs-button cs-button-green cs-full" disabled={locked || offline || attendees.filter((id) => roster.some((player) => player.id === id)).length < 2}>{busy === "start" ? "Starting session..." : attendees.length < 2 ? `Pick at least 2 players${attendees.length ? ` (${attendees.length} of 2)` : ""}` : `Start session with ${attendees.length}`}<ArrowRightIcon width={18} height={18} aria-hidden="true" /></button></form><aside className="cs-court-note"><div className="cs-decorative-court" aria-hidden="true"><span /><span /></div><p className="cs-eyebrow">THE HOUSE RULES</p><h3>Good games.<br />Honest scores.</h3><p>Singles, doubles or three friends making it work. Everyone on a side shares the result.</p><p>One person can log for the whole crew. Phones down, rackets up.</p></aside></div>}
          </section>

          <section hidden={tab !== "history"} aria-label="History"><div className="cs-session-heading"><div><p className="cs-eyebrow">THE GAMES STAY HERE</p><h2>Previously on court.</h2></div><span className="cs-caption">Dates in Dubai time</span></div><div className="cs-history-filter"><div className="cs-segment cs-segment-wrap" role="group" aria-label="Show sessions from">{ranges.map((item) => <button type="button" key={item.id} aria-pressed={range === item.id} onClick={() => setRange(item.id)}>{item.label}</button>)}</div>{range === "custom" ? <div className="cs-inline-form cs-date-range"><label><span className="cs-label">From</span><input className="cs-input" type="date" value={customFrom} max={customTo || dubaiToday()} onChange={(event) => setCustomFrom(event.target.value)} /></label><label><span className="cs-label">To</span><input className="cs-input" type="date" value={customTo} min={customFrom || undefined} max={dubaiToday()} onChange={(event) => setCustomTo(event.target.value)} /></label></div> : null}<p className="cs-help" role="status">{range === "all" ? `${filteredHistory.length} ${filteredHistory.length === 1 ? "session" : "sessions"}${rangeIncomplete ? " loaded" : ""}` : `${filteredHistory.length} ${filteredHistory.length === 1 ? "session" : "sessions"} ${range === "today" ? "today" : range === "custom" ? (rangeFrom || rangeTo ? `between ${rangeFrom || "the start"} and ${rangeTo || "today"}` : "in the chosen dates") : `in the last ${range} days`}${rangeIncomplete ? ", checking older sessions..." : ""}`}</p></div><div className="cs-history-grid"><div><div className="cs-history-list">{filteredHistory.length ? filteredHistory.map((session) => <button key={session.id} type="button" className={`cs-history-session ${historySessionId === session.id ? "is-selected" : ""}`} onClick={() => { setHistorySessionId(session.id); setGameLimit(50); }} aria-pressed={historySessionId === session.id}><span className="cs-history-date">{dubaiDate(session.session_date, { day: "2-digit", month: "short" })}<small>{dubaiDate(session.session_date, { year: "numeric", month: undefined, day: undefined })}</small></span><span><strong>{session.ended_at ? "Session finished" : "On court"}</strong><small>Games to {session.target_score}</small></span><ChevronRightIcon width={18} height={18} aria-hidden="true" /></button>) : <div className="cs-empty cs-empty-small"><CounterClockwiseClockIcon width={28} height={28} aria-hidden="true" /><h3>{history.length ? "No sessions in this range." : "Your first session is still ahead."}</h3><p>{history.length ? "Try a wider date range." : "Start playing and this becomes the crew’s game archive."}</p></div>}</div>{rangeIncomplete ? <button className="cs-button cs-button-outline cs-full" disabled={locked || offline} onClick={loadMore}>{busy === "older" ? "Loading..." : "Load older sessions"}<ArrowDownIcon width={16} height={16} aria-hidden="true" /></button> : null}</div><div className="cs-history-detail">{historySessionId ? selectedData ? <><div className="cs-section-heading"><h3>{dubaiDate(selectedData.session.session_date, { year: "numeric" })}</h3><span className="cs-caption">{selectedData.games.length} games</span></div><p className="cs-help">The original score sheet. Corrections update everyone&apos;s stats.</p>{gameList(selectedData)}<div className="cs-session-footer"><button type="button" className="cs-text-button cs-danger" disabled={locked || offline} onClick={() => {
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
            }}>{busy === "delete-session" ? "Deleting..." : "Delete this session"}</button><p className="cs-help">Removes the session, its attendance and every game on this sheet.</p></div></> : <div className="cs-loading-sheet" role="status">{!selectedError ? [0, 1, 2].map((row) => <div key={row} aria-hidden="true"><span /><span /></div>) : null}<p>{selectedError ? "Unable to load this score sheet." : "Opening score sheet..."}</p></div> : <div className="cs-empty"><div className="cs-decorative-court cs-court-outline" aria-hidden="true"><span /><span /></div><h3>Every session has a story.</h3><p>Choose a date to see the games or correct a score.</p></div>}</div></div></section>

          <section hidden={tab !== "stats"} aria-label="Stats"><div className="cs-session-heading"><div><p className="cs-eyebrow">A LITTLE FRIENDLY COMPETITION</p><h2>The numbers don&apos;t lie.</h2></div><span className="cs-caption">All sessions</span></div><p className="cs-stats-note">Every game counts equally, including mixed 1v2 games. A win belongs to everyone on the winning side.</p>{statsError ? <div className="cs-banner cs-banner-warning" role="alert"><span>Stats may not be up to date. {statsError}</span><button className="cs-text-button" disabled={offline} onClick={() => refresh.current()}>Retry</button></div> : null}{stats === null ? <div className="grid gap-4 py-4" role="status">{!statsError ? [0, 1, 2].map((row) => <div key={row} aria-hidden="true" className="grid h-12 grid-cols-[2fr_repeat(4,1fr)] gap-3 border-b pb-3"><span className="rounded bg-muted" /><span className="rounded bg-muted" /><span className="rounded bg-muted" /><span className="rounded bg-muted" /><span className="rounded bg-muted" /></div>) : null}<p className="cs-help">{statsError ? "Stats are unavailable." : "Counting the games..."}</p></div> : !stats.some((player) => player.played > 0) ? <div className="cs-empty"><BarChartIcon width={38} height={38} aria-hidden="true" /><h3>Bragging rights start with game one.</h3><p>Log a game to see wins, win rates and point differences for your players.</p><button className="cs-button cs-button-green" onClick={() => setTab("play")}>Back to the court<ArrowRightIcon width={17} height={17} aria-hidden="true" /></button></div> : <div className="cs-stats-table-wrap"><table className="cs-stats-table"><caption className="cs-sr-only">Player statistics across all sessions. Points difference is points scored minus points conceded.</caption><thead><tr><th scope="col">Player</th><th scope="col">Wins</th><th scope="col">Played</th><th scope="col">Win %</th><th scope="col"><span aria-label="Points difference">Pts +/-</span></th></tr></thead><tbody>{[...stats].sort((a, b) => b.wins - a.wins || b.played - a.played).map((player, index) => {
            const difference = player.points_for - player.points_against;
            const archived = workspace.players.find((item) => item.id === player.player_id)?.archived;
            return <tr key={player.player_id}><th scope="row"><span className="cs-rank">{String(index + 1).padStart(2, "0")}</span><span>{names.get(player.player_id) ?? "Archived player"}{archived ? <small>Archived</small> : null}</span></th><td className="cs-stat-wins">{player.wins}</td><td>{player.played}</td><td>{player.played ? `${Math.round(player.wins / player.played * 100)}%` : "0%"}</td><td className={difference > 0 ? "cs-positive" : ""}>{difference > 0 ? "+" : ""}{difference}</td></tr>;
          })}</tbody></table></div>}<p className="cs-help cs-stats-footnote">Points +/- is points scored minus points conceded. Archived players keep their results.</p></section>

          <section hidden={tab !== "people"} aria-label="People"><div className="cs-session-heading"><div><p className="cs-eyebrow">THE REGULARS. THE OCCASIONALS. EVERYONE.</p><h2>Same court. Good company.</h2></div></div><div className="cs-people-grid"><div><div className="cs-section-heading"><h3>Player roster</h3><span className="cs-count">{roster.length}</span></div><p className="cs-help">Players are names on the score sheet, not accounts. Anyone signed in can log their games.</p><form className="cs-add-player" onSubmit={(event) => {
            event.preventDefault();
            const name = playerName.trim();
            if (!name) return;
            void mutate("player", async () => {
              const player = await addPlayer(name);
              setWorkspace((current) => current ? { ...current, players: [...current.players, player] } : current);
              setPlayerName("");
            }, `${name} is on the roster.`);
          }}><label htmlFor="player-name">Add a player</label><div className="cs-inline-form"><input className="cs-input" id="player-name" placeholder="Their name or court nickname" maxLength={32} required autoComplete="off" value={playerName} disabled={locked} onChange={(event) => setPlayerName(event.target.value)} /><button className="cs-button cs-button-green" disabled={locked || offline || !playerName.trim()} type="submit"><PlusIcon width={18} height={18} aria-hidden="true" /><span>Add</span></button></div></form><ul className="cs-roster">{roster.map((player, index) => <li key={player.id}><span className="cs-player-number">{String(index + 1).padStart(2, "0")}</span><span className="cs-player-name">{player.display_name}</span><button type="button" className="cs-icon-button" aria-label={`Archive ${player.display_name}`} title="Archive player" disabled={locked || offline} onClick={() => {
            if (!window.confirm(`Archive ${player.display_name}? They will be hidden from new sessions. Their old scores and name stay in history.`)) return;
            void mutate("archive", async () => {
              await archivePlayer(player.id);
              setWorkspace((current) => current ? { ...current, players: current.players.map((item) => item.id === player.id ? { ...item, archived: true } : item) } : current);
              setAttendees((current) => current.filter((id) => id !== player.id));
            }, `${player.display_name} archived. Past games are unchanged.`);
          }}><ArchiveIcon width={17} height={17} aria-hidden="true" /></button></li>)}</ul>{!roster.length ? <p className="cs-empty cs-empty-small">No names yet. Add at least two players to start a session.</p> : null}{workspace.players.some((player) => player.archived) ? <details className="cs-archived"><summary>Archived players ({workspace.players.filter((player) => player.archived).length})</summary><ul>{workspace.players.filter((player) => player.archived).map((player) => <li key={player.id}>{player.display_name}</li>)}</ul><p className="cs-help">Their names and results remain in past games.</p></details> : null}</div><aside className="cs-invite-panel"><div className="cs-invite-symbol" aria-hidden="true"><PersonIcon width={27} height={27} /><PlusIcon width={16} height={16} /></div><p className="cs-eyebrow">BRING YOUR PEOPLE</p><h3>Better with friends.</h3><p>Send friends this address. They create an account and they&apos;re in. No codes, no approvals.</p><button className="cs-button cs-button-green cs-full" onClick={() => void copyLink()}>{copied ? <CheckIcon width={17} height={17} aria-hidden="true" /> : <CopyIcon width={17} height={17} aria-hidden="true" />}{copied ? "Link copied" : "Copy the link"}</button><p role="status" className="cs-sr-only">{copied ? "Link copied to clipboard." : ""}</p><p className="cs-help">Only share it with people you want on the score sheet.</p></aside></div></section>
        </>}
        <footer className="cs-footer"><span>gAmErS cOuRtSiDe.</span><span>For the love of the game.</span></footer>
      </main>

      <Dialog open={Boolean(editingGame)} onOpenChange={(open) => { if (!open && !gamePending) setEditingGame(null); }}><DialogContent className="cs-dialog cs-edit-dialog" showCloseButton={!gamePending} onInteractOutside={(event) => { if (gamePending) event.preventDefault(); }} onEscapeKeyDown={(event) => { if (gamePending) event.preventDefault(); }}><DialogHeader><DialogTitle>Correct a game</DialogTitle><DialogDescription>Update the teams or final score. Everyone&apos;s stats will be recalculated.</DialogDescription></DialogHeader>{editingGame && sessions[editingGame.session_id] && workspace ? <GameForm key={editingGame.id} game={editingGame} session={sessions[editingGame.session_id].session} players={workspace.players.filter((player) => sessions[editingGame.session_id].playerIds.includes(player.id) || [editingGame.side_a_player_1, editingGame.side_a_player_2, editingGame.side_b_player_1, editingGame.side_b_player_2].includes(player.id))} offline={offline} disabled={Boolean(busy)} onSave={save} onPendingChange={setGamePending} /> : null}</DialogContent></Dialog>
    </div>
  );
}
