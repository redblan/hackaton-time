import { addFact, hasFact, hasFlag, log, logOkIfClean, say, type Ctx } from "../context";
import type { GameEvent } from "../types";
import type { StageDef } from "./types";

/** Ошибки сопровождения Валентины: убежал вперёд или повёл её под козырёк. */
export function trackEscort(ctx: Ctx, event: GameEvent) {
  if (!hasFact(ctx.state, "valentina_agreed")) return;
  if (event.type === "dialogOutcome" && event.npcId === "valentina" && event.outcome === "left_behind") {
    log(ctx, "escort", "mistake", "Убежал вперёд и оставил соседку позади", "escort_left_behind");
  }
  if (event.type === "enterZone" && event.zone === "z_canopy_danger") {
    log(ctx, "escort", "mistake", "Повёл соседку под треснувший козырёк", "escort_canopy");
  }
}

function leaveNeighbor(ctx: Ctx) {
  if (!hasFact(ctx.state, "valentina_agreed")) {
    log(ctx, "escort", "missed", "Оставил соседку в квартире");
  }
  ctx.advance();
}

export const elevator: StageDef = {
  hint: "Спускайся по лестнице, лифтом пользоваться нельзя",
  on(ctx, event) {
    const { state } = ctx;
    if (
      (event.type === "interact" && event.target === "elevator_call") ||
      (event.type === "enterZone" && event.zone === "z_elevator")
    ) {
      log(ctx, "elevator", "mistake", "Хотел спуститься на лифте", "elevator_call");
      say(ctx, "mihalych", "mistake", { mistake: { skill: "elevator", code: "elevator_call" } });
      return;
    }
    if (event.type === "interact" && event.target === "elevator_shaft" && hasFlag(state, "lift_vanya")) {
      addFact(state, "saw_vanya");
      say(ctx, "vanya", "elevator_met");
      return;
    }
    if (event.type === "dialogOutcome" && event.npcId === "vanya") {
      if (event.outcome === "calmed") {
        addFact(state, "vanya_calmed");
        logOkIfClean(ctx, "elevator", "Успокоил Ваню и пообещал сообщить спасателям");
      }
      if (event.outcome === "panicked") {
        log(ctx, "elevator", "mistake", "Ваня запаниковал от разговора", "vanya_panicked");
      }
      return;
    }
    if (event.type === "enterZone" && event.zone === "z_stairs") {
      if (!hasFlag(state, "lift_vanya")) {
        logOkIfClean(ctx, "elevator", "Выбрал лестницу вместо лифта");
      } else if (!hasFact(state, "saw_vanya")) {
        log(ctx, "elevator", "missed", "Прошёл мимо Вани в лифте");
      } else if (!hasFact(state, "vanya_calmed")) {
        log(ctx, "elevator", "missed", "Не успокоил Ваню");
      }
      ctx.advance();
    }
  },
};

export const smoke: StageDef = {
  hint: "Впереди дым: пригнись и закрой нос и рот мокрой тканью",
  enter: (ctx) => say(ctx, "mihalych", "smoke_ahead"),
  on(ctx, event) {
    if (event.type !== "enterZone" || event.zone !== "z_smoke") return;
    addFact(ctx.state, "saw_fire");
    if (ctx.state.inventory[ctx.playerId]?.includes("water")) {
      log(ctx, "smoke", "ok", "Прошёл дым с мокрой тканью");
    } else {
      log(ctx, "smoke", "mistake", "Прошёл дым без мокрой ткани: не взял воду");
    }
    ctx.advance();
  },
};

export const collapse: StageDef = {
  hint: "Лестница разрушена: ищи обходной путь",
  enter: (ctx) => say(ctx, "mihalych", "collapse_found"),
  on(ctx, event) {
    if (event.type === "enterZone" && event.zone === "z_collapse") {
      log(ctx, "route", "mistake", "Полез по обломкам", "route_debris");
      say(ctx, "mihalych", "route_hint");
    }
    if (
      (event.type === "interact" && event.target === "balcony_door") ||
      (event.type === "enterZone" && event.zone === "z_balcony")
    ) {
      logOkIfClean(ctx, "route", "Прошёл через переходной балкон");
      ctx.advance();
    }
  },
};

export const neighbor: StageDef = {
  hint: "Спокойно поговори с соседкой и уговори её уйти",
  on(ctx, event) {
    const { state } = ctx;
    if (event.type === "interact" && event.target === "neighbor_door") {
      say(ctx, "valentina", "neighbor_met");
    }
    if (event.type === "dialogOutcome" && event.npcId === "valentina") {
      if (event.outcome === "panicked") {
        log(ctx, "psych_support", "mistake", "Соседка запаниковала от разговора", "valentina_panicked");
      }
      if (event.outcome === "agreed_to_go") {
        addFact(state, "valentina_agreed");
        logOkIfClean(ctx, "psych_support", "Спокойно уговорил соседку уйти");
        say(ctx, "valentina", "escort_start");
        ctx.advance();
      }
    }
    if (event.type === "enterZone" && (event.zone === "z_exit_door" || event.zone === "z_yard")) {
      leaveNeighbor(ctx);
    }
  },
};

export const exitBuilding: StageDef = {
  hint: "Не задерживайся у стены, сразу отходи на открытое место",
  enter: (ctx) => say(ctx, "mihalych", "exit_warning"),
  on(ctx, event) {
    trackEscort(ctx, event);
    if (event.type !== "enterZone") return;
    if (event.zone === "z_canopy_danger") {
      log(ctx, "exit_building", "mistake", "Задержался под треснувшим козырьком", "canopy");
    }
    if (event.zone === "z_yard" || event.zone === "z_safe_area") {
      logOkIfClean(ctx, "exit_building", "Быстро отошёл от здания");
      ctx.advance();
    }
  },
};
