import type { MinigameId } from "../../ids";
import {
  addFact,
  getTimer,
  hasFact,
  log,
  logOkIfClean,
  openMinigame,
  removeFact,
  say,
  setTimer,
  type Ctx,
} from "../context";
import { HANDOVER_NOTES, SLOT_NOTES } from "../notes";
import type { VictimKind } from "../types";
import type { StageDef } from "./types";

const AFTERSHOCK_LIMIT_MS = 10_000;
const DEBRIEF_MS = 60_000;

/** Временная заглушка от лида, финальный порядок даст Матвей по официальному алгоритму. */
const TRIAGE_ORDER: VictimKind[] = ["bleeding", "cpr", "unconscious", "scared", "light_injury"];

const VICTIM_GAMES: Partial<Record<VictimKind, MinigameId>> = {
  bleeding: "tourniquet",
  cpr: "cpr",
  unconscious: "recovery_position",
};

function finishAftershock(ctx: Ctx) {
  ctx.effects.push({ type: "setFlag", flag: "balcony_debris" });
  if (hasFact(ctx.state, "aftershock_resume")) {
    removeFact(ctx.state, "aftershock_resume");
    ctx.goTo("first_aid");
  } else {
    ctx.advance();
  }
}

function allStable(ctx: Ctx) {
  return Object.values(ctx.state.victims).every((v) => v.state === "stable");
}

function stabilize(ctx: Ctx, id: string) {
  ctx.state.victims[id]!.state = "stable";
  if (allStable(ctx)) ctx.advance();
}

export const yardAssess: StageDef = {
  hint: "Отведи людей на детскую площадку, обходи опасности",
  enter(ctx) {
    setTimer(ctx.state, "yard", ctx.at);
    say(ctx, "mihalych", "yard_hazard");
  },
  on(ctx, event) {
    if (event.type !== "enterZone") return;
    if (event.zone === "z_wire_danger") {
      log(ctx, "yard_hazard", "mistake", "Подошёл к опасному месту во дворе", "yard_hazard");
    }
    if (event.zone === "z_safe_area") {
      logOkIfClean(ctx, "yard_hazard", "Обошёл опасность во дворе");
      if (hasFact(ctx.state, "valentina_agreed")) {
        log(ctx, "escort", "ok", "Довёл соседку до безопасного места");
      }
      ctx.advance();
    }
  },
};

export const call112: StageDef = {
  hint: "Позвони 112: адрес, что случилось, сколько пострадавших",
  enter: (ctx) =>
    say(ctx, "dispatcher", "dispatcher_open", {
      flags: ctx.state.config.flags,
      address: ctx.state.config.address,
    }),
  on(ctx, event) {
    if (event.type !== "dialogOutcome" || event.npcId !== "dispatcher") return;
    if (event.outcome === "slots_complete") {
      logOkIfClean(ctx, "call_112", "Передал диспетчеру всё нужное");
      ctx.advance();
    } else if (event.outcome.startsWith("slot_missing:")) {
      const slot = event.outcome.slice("slot_missing:".length);
      log(ctx, "call_112", "missed", SLOT_NOTES[slot] ?? `Не сообщил: ${slot}`, `slot:${slot}`);
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
      order: TRIAGE_ORDER.filter((kind) => victims.includes(kind)),
    });
  },
  on(ctx, event) {
    if (event.type === "minigameResult" && event.result.game === "triage") ctx.advance();
  },
};

export const firstAid: StageDef = {
  hint: "Помоги пострадавшим",
  enter(ctx) {
    if (allStable(ctx)) ctx.advance();
  },
  on(ctx, event) {
    if (event.type === "interact") {
      const victim = ctx.state.victims[event.target];
      if (!victim || victim.state === "stable" || hasFact(ctx.state, "minigame_open")) return;
      removeFact(ctx.state, "in_safe_area");
      victim.state = "in_progress";
      const game = VICTIM_GAMES[victim.kind];
      if (game) openMinigame(ctx, game);
      else say(ctx, "victim_scared", "victim_help");
    }
    if (event.type === "minigameResult") {
      const entry = Object.entries(ctx.state.victims).find(
        ([, v]) => VICTIM_GAMES[v.kind] === event.result.game,
      );
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
    say(ctx, "mihalych", "aftershock");
    if (hasFact(ctx.state, "in_safe_area")) {
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
  enter: (ctx) => say(ctx, "gromov", "brigade_arrived"),
  on(ctx, event) {
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
    setTimer(ctx.state, "debrief", ctx.at);
    say(ctx, "gromov", "debrief", { journal: ctx.state.journal });
  },
  on(ctx, event) {
    const timeUp = event.type === "tick" && event.at - getTimer(ctx.state, "debrief")! >= DEBRIEF_MS;
    if (timeUp || (event.type === "interact" && event.target === "brigade")) ctx.advance();
  },
};
