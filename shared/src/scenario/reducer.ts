import { STAGES, type PlayerId, type Role, type StageId } from "../ids";
import { addFact, getTimer, hasFact, hasFlag, log, removeFact, setTimer, type Ctx } from "./context";
import { MISTAKE_NOTES } from "./notes";
import { cover, exitApartment, pack, wake } from "./stages/apartment";
import { collapse, elevator, exitBuilding, neighbor, smoke } from "./stages/building";
import type { StageDef } from "./stages/types";
import { aftershock, call112, debrief, firstAid, handover, triage, yardAssess } from "./stages/yard";
import { summarize } from "./summary";
import type { GameEvent, MinigameResult, ReduceResult, RunConfig, RunState } from "./types";

/** Пока реализован одиночный режим: этапы идут только у роли inside_top. */
const ACTIVE_ROLE: Role = "inside_top";

const STAGE_DEFS: Record<StageId, StageDef> = {
  wake,
  cover,
  pack,
  exit_apartment: exitApartment,
  elevator,
  smoke,
  collapse,
  neighbor,
  exit_building: exitBuilding,
  yard_assess: yardAssess,
  call_112: call112,
  triage,
  first_aid: firstAid,
  aftershock,
  handover,
  debrief,
  done: {
    hint: "Прохождение завершено",
    enter(ctx) {
      ctx.state.finished = true;
      setTimer(ctx.state, "finished", ctx.at);
      ctx.effects.push({ type: "runEnd", summary: summarize(ctx.state) });
    },
  },
};

/** Этап выпадает из прохождения без штрафа, если для него нет элементов. */
function isSkipped(state: RunState, stage: StageId): boolean {
  if (stage === "smoke") return !hasFlag(state, "fire");
  if (stage === "collapse") return !hasFlag(state, "collapse");
  if (stage === "neighbor") return !hasFlag(state, "neighbor_valentina");
  if (stage === "aftershock") return !hasFlag(state, "aftershock") || hasFact(state, "aftershock_done");
  return false;
}

function makeCtx(
  state: RunState,
  effects: ReduceResult["effects"],
  playerId: PlayerId,
  at: number,
): Ctx {
  const ctx: Ctx = {
    state,
    effects,
    playerId,
    at,
    goTo(stage) {
      state.stage[playerId] = stage;
      effects.push({ type: "stage", playerId, stage, hint: STAGE_DEFS[stage].hint });
      STAGE_DEFS[stage].enter?.(ctx);
    },
    advance() {
      const from = STAGES.indexOf(state.stage[playerId]!);
      const next = STAGES.slice(from + 1).find((s) => !isSkipped(state, s));
      if (next) ctx.goTo(next);
    },
  };
  return ctx;
}

function applyMinigame(ctx: Ctx, result: MinigameResult) {
  removeFact(ctx.state, "minigame_open");
  for (const code of result.mistakes) {
    log(ctx, result.skill, "mistake", MISTAKE_NOTES[code] ?? code);
  }
  if (result.mistakes.length > 0) return;
  if (result.ok) log(ctx, result.skill, "ok", `Мини-игра ${result.game} пройдена без ошибок`);
  else log(ctx, result.skill, "mistake", `Мини-игра ${result.game} не пройдена`);
}

/** Толчок ждёт конца открытой мини-игры, а после него игрок возвращается к пострадавшим. */
function aftershockDue(ctx: Ctx, at: number): boolean {
  const { state } = ctx;
  const yardAt = getTimer(state, "yard");
  const delay = state.config.aftershockAfterMs;
  return (
    delay !== null &&
    yardAt !== null &&
    at - yardAt >= delay &&
    !hasFact(state, "aftershock_done") &&
    !hasFact(state, "minigame_open") &&
    state.stage[ctx.playerId] === "first_aid"
  );
}

function trackZone(ctx: Ctx, event: GameEvent) {
  if (event.type !== "enterZone") return;
  if (event.zone === "z_safe_area") addFact(ctx.state, "in_safe_area");
  else removeFact(ctx.state, "in_safe_area");
}

function handle(ctx: Ctx, event: GameEvent) {
  if (event.type === "minigameResult") applyMinigame(ctx, event.result);
  trackZone(ctx, event);
  if (event.type === "tick" && aftershockDue(ctx, event.at)) {
    addFact(ctx.state, "aftershock_resume");
    ctx.goTo("aftershock");
    return;
  }
  let stage = ctx.state.stage[ctx.playerId]!;
  STAGE_DEFS[stage].on?.(ctx, event);
  // Вход в зону не повторится, поэтому новый этап тоже должен её увидеть.
  while (event.type === "enterZone" && ctx.state.stage[ctx.playerId] !== stage) {
    stage = ctx.state.stage[ctx.playerId]!;
    STAGE_DEFS[stage].on?.(ctx, event);
  }
}

export function initRun(config: RunConfig, players: { id: PlayerId; role: Role }[]): RunState {
  return {
    config,
    players,
    stage: Object.fromEntries(players.map((p) => [p.id, "wake"])),
    inventory: Object.fromEntries(players.map((p) => [p.id, []])),
    facts: [],
    victims: Object.fromEntries(
      config.victims.map((kind) => [`victim_${kind}`, { kind, state: "untreated" }]),
    ),
    journal: [],
    startedAt: 0,
    finished: false,
  };
}

/** Чистая функция: никаких сетевых вызовов, Date.now(), Math.random() без seed. */
export function reduce(state: RunState, event: GameEvent): ReduceResult {
  if (state.finished) return { state, effects: [] };

  const next = JSON.parse(JSON.stringify(state)) as RunState;
  const effects: ReduceResult["effects"] = [];
  const active = next.players.filter((p) => p.role === ACTIVE_ROLE);

  if (event.type === "start") {
    next.startedAt = event.at;
    for (const { id } of active) makeCtx(next, effects, id, event.at).goTo("wake");
    return { state: next, effects };
  }

  const targets = event.type === "tick" ? active : active.filter((p) => p.id === event.playerId);
  for (const { id } of targets) handle(makeCtx(next, effects, id, event.at), event);

  return { state: next, effects };
}
