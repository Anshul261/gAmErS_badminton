"use client";

import { ArrowDownIcon, CheckCircledIcon } from "@radix-ui/react-icons";
import { useConfirm } from "@/components/court/confirm";
import { useCourt } from "@/components/court/context";
import { deleteGame } from "@/lib/data";
import type { SessionData } from "@/lib/types";

/** The score sheet: every game in a session, newest first, with edit and delete. */
export function GameList({ data, limit, onMore }: { data: SessionData; limit: number; onMore: () => void }) {
  const { names, userId, workspace, locked, offline, mutate, setSessions, setEditingGame, frozen } = useCourt();
  const confirm = useConfirm();
  const loggedBy = (id: string) => workspace.profiles[id] ?? "a friend";
  const games = [...data.games].reverse();
  return <div className="cs-game-list">
    {games.length ? <ol>
      {games.slice(0, limit).map((game, index) => {
        const sideA = [game.side_a_player_1, game.side_a_player_2].filter(Boolean).map((id) => names.get(id!) ?? "Archived player").join(" + ");
        const sideB = [game.side_b_player_1, game.side_b_player_2].filter(Boolean).map((id) => names.get(id!) ?? "Archived player").join(" + ");
        return <li className="cs-game-row" key={game.id}>
          <div className="cs-game-meta"><span>GAME {String(games.length - index).padStart(2, "0")}</span><span className={`cs-logged-by ${game.created_by === userId ? "is-mine" : ""}`}>by {game.created_by === userId ? "you" : loggedBy(game.created_by)}</span><span>TO {game.target_score}</span></div>
          <div className={`cs-result-side ${game.score_a > game.score_b ? "is-winner" : ""}`}><span>{sideA}{game.score_a > game.score_b ? <span className="cs-sr-only">, winner</span> : null}</span><strong>{game.score_a}</strong></div>
          <div className={`cs-result-side ${game.score_b > game.score_a ? "is-winner" : ""}`}><span>{sideB}{game.score_b > game.score_a ? <span className="cs-sr-only">, winner</span> : null}</span><strong>{game.score_b}</strong></div>
          {!frozen(data.session.session_date) ? <div className="cs-game-actions">
            <button type="button" className="cs-text-button" disabled={locked || offline} aria-label={`Edit game ${games.length - index}`} onClick={() => setEditingGame(game)}>Edit score</button>
            <button type="button" className="cs-text-button cs-danger" disabled={locked || offline} aria-label={`Delete game ${games.length - index}`} onClick={async () => {
              if (await confirm({ title: `Delete the ${game.score_a}-${game.score_b} game?`, body: `${sideA} against ${sideB}. This cannot be undone.`, action: "Delete game", danger: true })) void mutate("delete", async () => {
                await deleteGame(game.id);
                setSessions((current) => {
                  const record = current[game.session_id];
                  return record ? { ...current, [game.session_id]: { ...record, games: record.games.filter((item) => item.id !== game.id) } } : current;
                });
              }, "Game deleted. Stats are refreshing.");
            }}>Delete</button>
          </div> : null}
        </li>;
      })}
    </ol> : <div className="cs-empty cs-empty-small"><CheckCircledIcon width={28} height={28} aria-hidden="true" /><h3>No games on the sheet yet.</h3><p>Play your first game, then log the final score.</p></div>}
    {games.length > limit ? <button className="cs-button cs-button-outline cs-full" onClick={onMore}>Show more games<ArrowDownIcon width={16} height={16} aria-hidden="true" /></button> : null}
  </div>;
}
