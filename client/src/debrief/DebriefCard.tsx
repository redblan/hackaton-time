/** Карточка разбора (D-57): очки, навыки по-русски, слова Громова, сравнение с прошлым разом. */
import type { PlayerId, PlayerProfile, RunSummary } from "@game/shared";
import { Card } from "../core/ui";
import { skillRows } from "./skills";
import "./debrief.css";

const STATUS = {
  ok: "Освоено",
  mistake: "Надо потренировать",
  fixed: "Исправил ошибку",
};

export function DebriefCard(props: {
  summary: RunSummary;
  debrief: string;
  playerId: PlayerId | undefined;
  /** Профиль до этого прохождения, для сравнения. Может быть ещё не загружен. */
  profile?: PlayerProfile | null;
}) {
  const { summary, debrief, playerId, profile } = props;
  const mine = summary.perPlayer.find((p) => p.playerId === playerId);
  const rows = skillRows(mine, profile);
  const seconds = Math.round(summary.durationMs / 1000);
  const team = summary.perPlayer.length > 1;
  return (
    <Card wide>
      <div className="debrief-card">
        <h1>Разбор прохождения</h1>
        <div className="debrief-stats">
          <div>
            <b>{mine?.score ?? summary.score}</b>
            <span>{team ? "твои очки" : "очков"}</span>
          </div>
          {team && (
            <div>
              <b>{summary.score}</b>
              <span>очков команды</span>
            </div>
          )}
          <div>
            <b>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</b>
            <span>время</span>
          </div>
          {profile && profile.runs > 0 && (
            <div>
              <b>{profile.runs + 1}</b>
              <span>прохождение</span>
            </div>
          )}
        </div>
        {debrief && (
          <p className="debrief-speech">
            <b>Громов:</b> {debrief}
          </p>
        )}
        <ul className="debrief-skills">
          {rows.map((row) => (
            <li key={row.skill} className={`debrief-skill debrief-${row.status}`}>
              <span>{row.name}</span>
              <small>{row.notes[0] ?? STATUS[row.status]}</small>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
