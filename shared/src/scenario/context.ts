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

/** TODO(D-40): перенести в `RunState.timers`, когда поле появится в контракте. */
export function getTimer(state: RunState, name: string): number | null {
  const prefix = `timer:${name}:`;
  const fact = state.facts.find((f) => f.startsWith(prefix));
  return fact ? Number(fact.slice(prefix.length)) : null;
}

export function setTimer(state: RunState, name: string, at: number) {
  const prefix = `timer:${name}:`;
  state.facts = state.facts.filter((f) => !f.startsWith(prefix));
  state.facts.push(`${prefix}${at}`);
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
  // TODO(Q-04): после перезахода сервер должен заново открыть мини-игру, иначе этап заблокирован.
  addFact(ctx.state, "minigame_open");
  ctx.effects.push({
    type: "openMinigame",
    playerId: ctx.playerId,
    game,
    ...(params ? { params } : {}),
  });
}
