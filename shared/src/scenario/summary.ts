import type { SkillId } from "../ids";
import { getTimer } from "./context";
import type { JournalEntry, RunState, RunSummary } from "./types";

const POINTS: Record<JournalEntry["outcome"], number> = { ok: 10, mistake: -5, missed: -10 };
const PAR_MS = 600_000;
const MAX_TIME_BONUS = 30;

function journalScore(journal: JournalEntry[]): number {
  return journal.reduce((sum, e) => sum + POINTS[e.outcome], 0);
}

function timeBonus(durationMs: number): number {
  return Math.min(MAX_TIME_BONUS, Math.max(0, Math.floor((PAR_MS - durationMs) / 10_000)));
}

export function summarize(state: RunState): RunSummary {
  const lastAt = state.journal[state.journal.length - 1]?.at ?? state.startedAt;
  const durationMs = (getTimer(state, "finished") ?? lastAt) - state.startedAt;
  const bonus = timeBonus(durationMs);

  const perPlayer = state.players.map(({ id }) => {
    const own = state.journal.filter((e) => e.playerId === id);
    return {
      playerId: id,
      score: journalScore(own) + bonus,
      ok: [...new Set(own.filter((e) => e.outcome === "ok").map((e) => e.skill))] as SkillId[],
      mistakes: own.filter((e) => e.outcome !== "ok").map((e) => ({ skill: e.skill, note: e.note })),
    };
  });

  return { score: journalScore(state.journal) + bonus, durationMs, perPlayer };
}
