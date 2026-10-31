import type { MinigameId, NpcEvent, NpcId, PlayerId, SkillId, StageId } from "../ids";
import type { Effect, JournalEntry, RunState } from "./types";

/**
 * Контекст обработки одного события. state здесь уже копия входного,
 * поэтому обработчики меняют его напрямую: вход редьюсера остаётся нетронутым.
 */
export interface Ctx {
  state: RunState;
  effects: Effect[];
  playerId: PlayerId;
  at: number;
  /** Следующий этап по порядку, пропуская те, которых нет в этом прохождении */
  advance: () => void;
  goTo: (stage: StageId) => void;
}

export const hasFlag = (state: RunState, prefix: string) =>
  state.config.flags.some((f) => f === prefix || f.startsWith(`${prefix}_`));

export const hasFact = (state: RunState, fact: string) => state.facts.includes(fact);

export function addFact(state: RunState, fact: string) {
  if (!hasFact(state, fact)) state.facts.push(fact);
}

export function removeFact(state: RunState, fact: string) {
  state.facts = state.facts.filter((f) => f !== fact);
}

export function getTimer(state: RunState, name: string): number | null {
  return state.timers[name] ?? null;
}

export function setTimer(state: RunState, name: string, at: number) {
  state.timers[name] = at;
}

export function log(
  ctx: Ctx,
  skill: SkillId,
  outcome: JournalEntry["outcome"],
  note: string,
  onceKey?: string,
) {
  if (onceKey) {
    const fact = `logged:${onceKey}`;
    if (hasFact(ctx.state, fact)) return;
    addFact(ctx.state, fact);
  }
  const entry: JournalEntry = {
    at: ctx.at,
    playerId: ctx.playerId,
    stage: ctx.state.stage[ctx.playerId]!,
    skill,
    outcome,
    note,
  };
  ctx.state.journal.push(entry);
  ctx.effects.push({ type: "journal", entry });
}

/** Навык засчитан как верный, только если по нему в прохождении не было ошибок. */
export function logOkIfClean(ctx: Ctx, skill: SkillId, note: string) {
  const dirty = ctx.state.journal.some((e) => e.skill === skill && e.outcome !== "ok");
  if (!dirty) log(ctx, skill, "ok", note, `ok:${skill}`);
}

export function say(ctx: Ctx, npcId: NpcId, event: NpcEvent, context?: Record<string, unknown>) {
  ctx.effects.push({
    type: "npcSay",
    npcId,
    toPlayerId: ctx.playerId,
    event,
    ...(context ? { context } : {}),
  });
}

export function openMinigame(ctx: Ctx, game: MinigameId, params?: Record<string, unknown>) {
  addFact(ctx.state, "minigame_open");
  ctx.effects.push({
    type: "openMinigame",
    playerId: ctx.playerId,
    game,
    ...(params ? { params } : {}),
  });
}
