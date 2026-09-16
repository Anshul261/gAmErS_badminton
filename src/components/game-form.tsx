"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { CheckIcon, PlusIcon, Cross2Icon } from "@radix-ui/react-icons";
import Link from "next/link";
import { scoreError } from "@/lib/scoring";
import type { Game, GameInput, Player, Session } from "@/lib/types";

type GameFormProps = {
  session: Session;
  players: Player[];
  game?: Game;
  offline: boolean;
  disabled?: boolean;
  onSave: (input: GameInput, original?: Game) => Promise<void>;
  onPendingChange?: (pending: boolean) => void;
};

export function GameForm({ session, players, game, offline, disabled = false, onSave, onPendingChange }: GameFormProps) {
  const prefix = useId();
  const [side, setSide] = useState<"a" | "b">("a");
  const [teamA, setTeamA] = useState<string[]>(() => game ? [game.side_a_player_1, game.side_a_player_2].filter((id): id is string => Boolean(id)) : []);
  const [teamB, setTeamB] = useState<string[]>(() => game ? [game.side_b_player_1, game.side_b_player_2].filter((id): id is string => Boolean(id)) : []);
  const [scoreA, setScoreA] = useState(game ? String(game.score_a) : "");
  const [scoreB, setScoreB] = useState(game ? String(game.score_b) : "");
  const [target, setTarget] = useState(game?.target_score ?? session.target_score);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const draftId = useRef<string | null>(game?.id ?? null);
  const saving = useRef(false);
  const firstScore = useRef<HTMLInputElement>(null);
  const names = new Map(players.map((player) => [player.id, player.display_name]));
  const locked = pending || disabled;

  function assign(playerId: string) {
    setError("");
    setNotice("");
    if (teamA.includes(playerId)) {
      setTeamA(teamA.filter((id) => id !== playerId));
      return;
    }
    if (teamB.includes(playerId)) {
      setTeamB(teamB.filter((id) => id !== playerId));
      return;
    }
    const team = side === "a" ? teamA : teamB;
    if (team.length === 2) {
      setError(`Side ${side.toUpperCase()} already has two players. Remove one or choose the other side.`);
      return;
    }
    if (side === "a") setTeamA([...teamA, playerId]);
    else setTeamB([...teamB, playerId]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || locked) return;
    setNotice("");
    if (offline || !navigator.onLine) {
      setError("You are offline. Your draft is still here. Reconnect before saving.");
      return;
    }
    if (!teamA.length || !teamB.length) {
      setError("Choose at least one player on each side.");
      return;
    }
    if (!/^\d+$/.test(scoreA) || !/^\d+$/.test(scoreB)) {
      setError("Enter a whole score for both sides, including zero.");
      return;
    }
    const invalidScore = scoreError(Number(scoreA), Number(scoreB), target);
    if (invalidScore) {
      setError(invalidScore);
      return;
    }
    setError("");
    saving.current = true;
    setPending(true);
    onPendingChange?.(true);
    try {
      // A retry must use the same ID, even if the first response was lost.
      draftId.current ??= crypto.randomUUID();
      await onSave({
        id: draftId.current,
        session_id: session.id,
        target_score: target,
        side_a_player_1: teamA[0],
        side_a_player_2: teamA[1] ?? null,
        side_b_player_1: teamB[0],
        side_b_player_2: teamB[1] ?? null,
        score_a: Number(scoreA),
        score_b: Number(scoreB),
      }, game);
      if (!game) {
        draftId.current = null;
        setScoreA("");
        setScoreB("");
      }
      setNotice(game ? "Correction saved." : "Game saved. Same teams? Enter the next score.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The game could not be saved. Your draft is still here.");
    } finally {
      saving.current = false;
      setPending(false);
      onPendingChange?.(false);
      if (!game) requestAnimationFrame(() => firstScore.current?.focus());
    }
  }

  return (
    <form className="cs-game-form" onSubmit={submit} aria-label={game ? "Correct game" : "Log game"}>
      <fieldset disabled={locked} className="cs-fieldset">
        <legend className="cs-label">1. Pick your sides</legend>
        <p className="cs-help" id={`${prefix}-teams-help`}>Choose a side, then tap names. Tap again to remove. One or two players per side.</p>
        <div className="cs-court" aria-describedby={`${prefix}-teams-help`}>
          {(["a", "b"] as const).map((value) => {
            const team = value === "a" ? teamA : teamB;
            return (
              <button type="button" className={`cs-court-side ${side === value ? "is-selected" : ""}`} key={value}
                aria-pressed={side === value} onClick={() => setSide(value)}>
                <span className="cs-court-side-label">Side {value.toUpperCase()} {side === value ? <CheckIcon width={15} height={15} aria-hidden="true" /> : null}</span>
                <span className="cs-court-names">{team.length ? team.map((id) => names.get(id) ?? "Archived player").join(" + ") : "Pick players"}</span>
                <span className="cs-court-count">{team.length}/2 players</span>
              </button>
            );
          })}
          <span className="cs-net" aria-hidden="true">VS</span>
        </div>
        <div className="cs-chips">
          {players.map((player) => {
            const assigned = teamA.includes(player.id) ? "A" : teamB.includes(player.id) ? "B" : null;
            return (
              <button type="button" className={`cs-chip ${assigned ? "is-selected" : ""}`} key={player.id}
                aria-pressed={Boolean(assigned)} aria-label={assigned ? `Remove ${player.display_name} from side ${assigned}` : `Add ${player.display_name} to side ${side.toUpperCase()}`}
                onClick={() => assign(player.id)}>
                {assigned ? <span className="cs-chip-side">{assigned}</span> : <PlusIcon width={15} height={15} aria-hidden="true" />}
                <span>{player.display_name}</span>
                {assigned ? <Cross2Icon width={15} height={15} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
        {!players.length ? <p className="cs-help">Add attendees to this session before logging a game.</p> : null}
      </fieldset>

      <fieldset disabled={locked} className="cs-fieldset cs-score-fieldset">
        <legend className="cs-label">2. Enter the final score</legend>
        <div className="cs-between cs-target-row">
          <span className="cs-help">Play to</span>
          <div className="cs-segment" aria-label="Game target">
            {[11, 21].map((value) => <button type="button" key={value} aria-pressed={target === value}
              onClick={() => { setTarget(value); setNotice(""); }}>{value}</button>)}
          </div>
        </div>
        <div className="cs-scoreboard">
          <div>
            <label htmlFor={`${prefix}-score-a`}>Side A</label>
            <input ref={firstScore} id={`${prefix}-score-a`} className="cs-score-input" type="text" inputMode="numeric" pattern="[0-9]*"
              autoComplete="off" maxLength={5} placeholder="0" value={scoreA} aria-invalid={Boolean(error)} aria-describedby={error ? `${prefix}-error` : undefined}
              onChange={(event) => { setScoreA(event.target.value); setNotice(""); }} />
          </div>
          <span className="cs-score-divider" aria-hidden="true">:</span>
          <div>
            <label htmlFor={`${prefix}-score-b`}>Side B</label>
            <input id={`${prefix}-score-b`} className="cs-score-input" type="text" inputMode="numeric" pattern="[0-9]*"
              autoComplete="off" maxLength={5} placeholder="0" value={scoreB} aria-invalid={Boolean(error)} aria-describedby={error ? `${prefix}-error` : undefined}
              onChange={(event) => { setScoreB(event.target.value); setNotice(""); }} />
          </div>
        </div>
        <p className="cs-help cs-centered">First to {target}, win by two. No score cap.</p>
      </fieldset>
      {error ? <p className="cs-error" id={`${prefix}-error`} role="alert">{error}</p> : null}
      {/expired|sign.?in|jwt|auth/i.test(error) ? <Link className="cs-text-button" href="/login">Sign in again</Link> : null}
      <p className="cs-form-status" role="status" aria-live="polite">{notice}</p>
      <button className="cs-button cs-button-green cs-save-button" type="submit" disabled={locked || offline}>
        {pending ? "Saving game..." : game ? "Save correction" : "Save game"}<CheckIcon width={18} height={18} aria-hidden="true" />
      </button>
      {offline ? <p className="cs-help">Syncing paused. Your unsaved draft stays here while this page is open.</p> : null}
    </form>
  );
}
