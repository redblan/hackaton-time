import type { MinigameId, NpcId, StageId } from "../../ids";
import {
  addFact,
  getTimer,
  hasFact,
  hasFlag,
  log,
  logOkIfClean,
  minigameFact,
  openMinigame,
  removeFact,
  resumeFact,
  safeAreaFact,
  say,
  sayMistake,
  setTimer,
  type Ctx,
} from "../context";
import { HANDOVER_NOTES, SLOT_NOTES } from "../notes";
import type { VictimKind } from "../types";
import { trackEscort } from "./building";
import type { StageDef } from "./types";

const AFTERSHOCK_LIMIT_MS = 10_000;
const DEBRIEF_MS = 60_000;
const CALL_LIMIT_MS = 120_000;
const HANDOVER_LIMIT_MS = 120_000;
const AFTER_AID: StageId[] = ["first_aid", "aftershock", "handover", "debrief", "done"];

/** Временные группы сортировки из D-20. TODO(Q-01): заменить на подтверждённый порядок. */
const TRIAGE_GROUPS: VictimKind[][] = [["bleeding"], ["cpr", "unconscious"], ["scared"], ["light_injury"]];

const VICTIM_GAMES: Partial<Record<VictimKind, MinigameId>> = {
  bleeding: "tourniquet",
  cpr: "cpr",
  unconscious: "recovery_position",
};

function finishAftershock(ctx: Ctx) {
  if (hasFact(ctx.state, resumeFact(ctx.playerId))) {
    removeFact(ctx.state, resumeFact(ctx.playerId));
    ctx.goTo("first_aid");
  } else {
    ctx.advance();
  }
}

function allStable(ctx: Ctx) {
  return Object.values(ctx.state.victims).every((v) => v.state === "stable");
}

/** В коопе бригаду ждут все: напарник внутри дома ещё может спускаться. */
function everyoneOutside(ctx: Ctx) {
  return Object.values(ctx.state.stage).every((stage) => AFTER_AID.includes(stage));
}

function leaveIfDone(ctx: Ctx) {
  if (allStable(ctx) && everyoneOutside(ctx)) ctx.advance();
}

function stabilize(ctx: Ctx, id: string) {
  ctx.state.victims[id]!.state = "stable";
  leaveIfDone(ctx);
}

export const yardAssess: StageDef = {
  hint: (state) =>
    hasFact(state, "valentina_agreed")
      ? "Доведи соседку до детской площадки, обходи опасности"
      : "Отведи людей на детскую площадку, обходи опасности",
  enter(ctx) {
    setTimer(ctx.state, "yard", ctx.at);
    say(ctx, "mihalych", "yard_hazard");
  },
  on(ctx, event) {
    trackEscort(ctx, event);
    if (event.type !== "enterZone") return;
    if (event.zone === "z_wire_danger") {
      if (log(ctx, "yard_hazard", "mistake", "Подошёл к опасному месту во дворе", "yard_hazard")) {
        sayMistake(ctx, "mihalych", "yard_hazard", "z_wire_danger");
      }
    }
    if (event.zone === "z_safe_area") {
      logOkIfClean(ctx, "yard_hazard", "Обошёл опасность во дворе");
      if (hasFact(ctx.state, "valentina_agreed")) {
        logOkIfClean(ctx, "escort", "Довёл соседку до безопасного места");
      }
      ctx.advance();
    }
  },
};

/** Слоты, обязательные в этом прохождении (D-23). */
function requiredSlots(ctx: Ctx): string[] {
  const { state } = ctx;
  return [
    "address",
    "what",
    "victims",
    "condition",
    ...(hasFlag(state, "lift") ? ["trapped"] : []),
    ...(hasFlag(state, "fire") ? ["fire"] : []),
    ...(hasFlag(state, "wire") || hasFlag(state, "gas") ? ["hazard"] : []),
  ];
}

/**
 * Звонок оборван (D-62). Диспетчер спрашивает по одному слоту, поэтому считаем несказанными
 * тот, что он спросил последним, и те, до которых не дошёл.
 */
function endCall(ctx: Ctx) {
  const { state } = ctx;
  for (const slot of requiredSlots(ctx)) {
    if (!hasFact(state, `slot_reported:${slot}`) || hasFact(state, `slot_last:${slot}`)) {
      log(ctx, "call_112", "missed", SLOT_NOTES[slot] ?? `Не сообщил: ${slot}`);
    }
  }
  ctx.advance();
}

export const call112: StageDef = {
  hint: "Позвони 112: адрес, что случилось, сколько пострадавших",
  enter(ctx) {
    setTimer(ctx.state, "call", ctx.at);
    say(ctx, "dispatcher", "dispatcher_open", {
      flags: ctx.state.config.flags,
      address: ctx.state.config.address,
    });
  },
  on(ctx, event) {
    if (event.type === "tick" && event.at - getTimer(ctx.state, "call")! >= CALL_LIMIT_MS) endCall(ctx);
    if (event.type !== "dialogOutcome" || event.npcId !== "dispatcher") return;
    if (event.outcome === "call_ended") {
      endCall(ctx);
    } else if (event.outcome === "slots_complete") {
      log(ctx, "call_112", "ok", "Передал диспетчеру всё нужное");
      ctx.advance();
    } else if (event.outcome.startsWith("slot_missing:")) {
      const slot = event.outcome.slice("slot_missing:".length);
      addFact(ctx.state, `slot_reported:${slot}`);
      ctx.state.facts = ctx.state.facts.filter((f) => !f.startsWith("slot_last:"));
      addFact(ctx.state, `slot_last:${slot}`);
      log(ctx, "call_112", "mistake", SLOT_NOTES[slot] ?? `Не сообщил: ${slot}`, `slot:${slot}`);
    }
  },
};

export const triage: StageDef = {
  hint: "Реши, кому помогать первым",
  enter(ctx) {
    const victims = ctx.state.config.victims;
    say(ctx, "mihalych", "triage_start");
    openMinigame(ctx, "triage", {
      victims,
      order: TRIAGE_GROUPS.map((group) => group.filter((kind) => victims.includes(kind))).filter(
        (group) => group.length > 0,
      ),
    });
  },
  on(ctx, event) {
    if (event.type === "minigameResult" && event.result.game === "triage") ctx.advance();
  },
};

export const firstAid: StageDef = {
  hint: "Помоги пострадавшим",
  enter: leaveIfDone,
  on(ctx, event) {
    if (event.type === "tick") leaveIfDone(ctx);
    if (event.type === "interact") {
      const victim = ctx.state.victims[event.target];
      if (!victim || victim.state === "stable" || hasFact(ctx.state, minigameFact(ctx.playerId))) return;
      const game = VICTIM_GAMES[victim.kind];
      if (game && victim.state === "in_progress") return;
      removeFact(ctx.state, safeAreaFact(ctx.playerId));
      victim.state = "in_progress";
      say(ctx, event.target as NpcId, "victim_help");
      if (game) openMinigame(ctx, game);
    }
    if (event.type === "minigameResult") {
      const entry = Object.entries(ctx.state.victims).find(
        ([, v]) => VICTIM_GAMES[v.kind] === event.result.game,
      );
      if (event.result.game === "tourniquet") addFact(ctx.state, "tourniquet_applied");
      if (entry) stabilize(ctx, entry[0]);
    }
    if (event.type === "dialogOutcome" && event.npcId === "victim_scared") {
      if (event.outcome === "calmed") {
        log(ctx, "psych_support", "ok", "Успокоил напуганного пострадавшего");
        stabilize(ctx, "victim_scared");
      }
      if (event.outcome === "panicked") {
        log(ctx, "psych_support", "mistake", "Пострадавший запаниковал от разговора", "scared_panicked");
      }
    }
  },
};

export const aftershock: StageDef = {
  hint: "Повторный толчок! Уводи всех на детскую площадку",
  enter(ctx) {
    addFact(ctx.state, "aftershock_done");
    setTimer(ctx.state, "aftershock", ctx.at);
    ctx.effects.push({ type: "quake", strength: 0.7, durationMs: AFTERSHOCK_LIMIT_MS });
    ctx.effects.push({ type: "setFlag", flag: "balcony_debris" });
    say(ctx, "mihalych", "aftershock");
    if (hasFact(ctx.state, safeAreaFact(ctx.playerId))) {
      log(ctx, "aftershock", "ok", "Оставался в безопасной зоне при повторном толчке");
      finishAftershock(ctx);
    }
  },
  on(ctx, event) {
    if (event.type === "enterZone" && event.zone === "z_safe_area") {
      log(ctx, "aftershock", "ok", "Увёл людей в безопасную зону");
      finishAftershock(ctx);
    }
    if (event.type === "tick" && event.at - getTimer(ctx.state, "aftershock")! >= AFTERSHOCK_LIMIT_MS) {
      log(ctx, "aftershock", "missed", "Не ушёл в безопасную зону за 10 секунд");
      finishAftershock(ctx);
    }
  },
};

export const handover: StageDef = {
  hint: "Расскажи бригаде: кто, в каком состоянии, что сделано",
  enter(ctx) {
    setTimer(ctx.state, `handover:${ctx.playerId}`, ctx.at);
    say(ctx, "gromov", "brigade_arrived", {
      flags: ctx.state.config.flags,
      tourniquetApplied: hasFact(ctx.state, "tourniquet_applied"),
    });
  },
  on(ctx, event) {
    const timeUp =
      event.type === "tick" && event.at - getTimer(ctx.state, `handover:${ctx.playerId}`)! >= HANDOVER_LIMIT_MS;
    if (timeUp) {
      log(ctx, "handover", "missed", "Не закончил передачу бригаде за 2 минуты");
      ctx.advance();
      return;
    }
    if (event.type !== "dialogOutcome" || event.npcId !== "gromov") return;
    if (event.outcome === "handover_complete") {
      logOkIfClean(ctx, "handover", "Полностью передал информацию бригаде");
      ctx.advance();
    } else if (event.outcome.startsWith("handover_missing:")) {
      const what = event.outcome.slice("handover_missing:".length);
      log(ctx, "handover", "missed", HANDOVER_NOTES[what] ?? `Не передал: ${what}`, `handover:${what}`);
    }
  },
};

export const debrief: StageDef = {
  hint: "Разбор с капитаном Громовым",
  enter(ctx) {
    setTimer(ctx.state, `debrief:${ctx.playerId}`, ctx.at);
    say(ctx, "gromov", "debrief", { journal: ctx.state.journal });
  },
  on(ctx, event) {
    const timeUp = event.type === "tick" && event.at - getTimer(ctx.state, `debrief:${ctx.playerId}`)! >= DEBRIEF_MS;
    if (timeUp || (event.type === "interact" && event.target === "brigade")) ctx.advance();
  },
};
