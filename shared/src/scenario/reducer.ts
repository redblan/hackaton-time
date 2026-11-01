import { STAGES, type Mode, type PlayerId, type Role, type StageId } from "../ids";
import {
  addFact,
  getTimer,
  hasFact,
  hasFlag,
  log,
  minigameFact,
  removeFact,
  resumeFact,
  safeAreaFact,
  say,
  setTimer,
  type Ctx,
} from "./context";
import { MISTAKE_NOTES } from "./notes";
import { cover, exitApartment, pack, wake } from "./stages/apartment";
import { collapse, elevator, exitBuilding, neighbor, smoke } from "./stages/building";
import type { StageDef } from "./stages/types";
import { aftershock, call112, debrief, firstAid, handover, triage, yardAssess } from "./stages/yard";
import { summarize } from "./summary";
import type { GameEvent, MinigameResult, ReduceResult, RunConfig, RunState } from "./types";

/** В коопе 112 и сортировка на игроке снаружи, а соседка в coop3 на игроке с 3-го этажа. */
const YARD_STAGES: StageId[] = ["first_aid", "aftershock", "handover", "debrief", "done"];

function stagesFor(role: Role, mode: Mode): StageId[] {
  if (role === "outside") return ["yard_assess", "call_112", "triage", ...YARD_STAGES];
  if (role === "inside_mid") {
    return ["wake", "cover", "pack", "exit_apartment", "neighbor", "exit_building", "yard_assess", ...YARD_STAGES];
  }
  if (mode === "solo") return [...STAGES];
  const skipped: StageId[] = mode === "coop3" ? ["call_112", "triage", "neighbor"] : ["call_112", "triage"];
  return STAGES.filter((stage) => !skipped.includes(stage));
}

const IDLE_MS = 40_000;
const NO_IDLE_HINT: StageId[] = ["wake", "cover", "debrief", "done"];

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
      if (!Object.values(ctx.state.stage).every((stage) => stage === "done")) return;
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

function hintFor(state: RunState, stage: StageId): string {
  const { hint } = STAGE_DEFS[stage];
  return typeof hint === "function" ? hint(state) : hint;
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
      setTimer(state, `activity:${playerId}`, at);
      effects.push({ type: "stage", playerId, stage, hint: hintFor(state, stage) });
      STAGE_DEFS[stage].enter?.(ctx);
    },
    advance() {
      const role = state.players.find((p) => p.id === playerId)!.role;
      const path = stagesFor(role, state.config.mode);
      const from = path.indexOf(state.stage[playerId]!);
      const next = path.slice(from + 1).find((s) => !isSkipped(state, s));
      if (next) ctx.goTo(next);
    },
  };
  return ctx;
}

function applyMinigame(ctx: Ctx, result: MinigameResult) {
  removeFact(ctx.state, minigameFact(ctx.playerId));
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
    !hasFact(state, minigameFact(ctx.playerId)) &&
    state.stage[ctx.playerId] === "first_aid"
  );
}

/** Игрок завис на этапе: папа напоминает о своём, дальше подсказывает Михалыч по рации. */
function hintIfIdle(ctx: Ctx, at: number) {
  const { state } = ctx;
  const stage = state.stage[ctx.playerId]!;
  if (NO_IDLE_HINT.includes(stage) || hasFact(state, minigameFact(ctx.playerId))) return;
  const lastAction = Math.max(
    getTimer(state, `activity:${ctx.playerId}`) ?? 0,
    getTimer(state, `idle_hint:${ctx.playerId}`) ?? 0,
  );
  if (at - lastAction < IDLE_MS) return;
  setTimer(state, `idle_hint:${ctx.playerId}`, at);
  const context = { stage, hint: hintFor(state, stage) };
  if (stage === "pack") say(ctx, "papa", "gas_smell", context);
  else if (stage === "exit_apartment") say(ctx, "papa", "door_jammed", context);
  else say(ctx, "mihalych", "route_hint", context);
}

function trackZone(ctx: Ctx, event: GameEvent) {
  if (event.type !== "enterZone") return;
  if (event.zone === "z_safe_area") addFact(ctx.state, safeAreaFact(ctx.playerId));
  else removeFact(ctx.state, safeAreaFact(ctx.playerId));
}

function handle(ctx: Ctx, event: GameEvent) {
  if (event.type === "minigameResult") applyMinigame(ctx, event.result);
  trackZone(ctx, event);
  if (event.type === "tick") hintIfIdle(ctx, event.at);
  else setTimer(ctx.state, `activity:${ctx.playerId}`, event.at);
  if (event.type === "tick" && aftershockDue(ctx, event.at)) {
    addFact(ctx.state, resumeFact(ctx.playerId));
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
    stage: Object.fromEntries(players.map((p) => [p.id, stagesFor(p.role, config.mode)[0]!])),
    inventory: Object.fromEntries(players.map((p) => [p.id, []])),
    facts: [],
    victims: Object.fromEntries(
      config.victims.map((kind) => [`victim_${kind}`, { kind, state: "untreated" }]),
    ),
    journal: [],
    startedAt: 0,
    timers: {},
    finished: false,
  };
}

/** Чистая функция: никаких сетевых вызовов, Date.now(), Math.random() без seed. */
export function reduce(state: RunState, event: GameEvent): ReduceResult {
  if (state.finished) return { state, effects: [] };

  const next = JSON.parse(JSON.stringify(state)) as RunState;
  const effects: ReduceResult["effects"] = [];

  if (event.type === "start") {
    next.startedAt = event.at;
    for (const { id } of next.players) makeCtx(next, effects, id, event.at).goTo(next.stage[id]!);
    return { state: next, effects };
  }

  const targets = event.type === "tick" ? next.players : next.players.filter((p) => p.id === event.playerId);
  for (const { id } of targets) handle(makeCtx(next, effects, id, event.at), event);

  return { state: next, effects };
}
