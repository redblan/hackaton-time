import { ITEMS, type ItemId } from "../../ids";
import { addFact, getTimer, hasFact, log, minigameFact, openMinigame, say, sayMistake, setTimer, type Ctx } from "../context";
import type { StageDef } from "./types";

const WAKE_MS = 3_000;
const COVER_LIMIT_MS = 10_000;
/** Папа успевает договорить, потом открывается рюкзак */
const PACK_DELAY_MS = 5_000;

function finishPack(ctx: Ctx) {
  if (!hasFact(ctx.state, "gas_closed")) log(ctx, "gas", "missed", "Не перекрыл газ на кухне");
  ctx.advance();
}

function openDoor(ctx: Ctx) {
  ctx.effects.push({ type: "setFlag", flag: "papa_left" });
  say(ctx, "mihalych", "partner_call");
  ctx.advance();
}

export const wake: StageDef = {
  hint: "Что происходит? Осмотрись",
  enter: (ctx) => setTimer(ctx.state, "wake", ctx.at),
  on(ctx, event) {
    if (event.type !== "tick" || event.at - getTimer(ctx.state, "wake")! < WAKE_MS) return;
    if (!hasFact(ctx.state, "quake_started")) {
      addFact(ctx.state, "quake_started");
      ctx.effects.push({ type: "quake", strength: 1, durationMs: COVER_LIMIT_MS });
    }
    say(ctx, "papa", "quake_started");
    ctx.advance();
  },
};

export const cover: StageDef = {
  hint: "Укройся: подальше от окон и того, что может упасть",
  enter: (ctx) => setTimer(ctx.state, "cover", ctx.at),
  on(ctx, event) {
    if (event.type === "tick") {
      if (event.at - getTimer(ctx.state, "cover")! < COVER_LIMIT_MS) return;
      log(ctx, "cover", "missed", "Не выбрал укрытие за 10 секунд");
      ctx.advance();
      return;
    }
    if (event.type !== "interact") return;
    switch (event.target) {
      case "cover_table":
        log(ctx, "cover", "ok", "Укрылся под прочным столом");
        break;
      case "cover_wall":
        log(ctx, "cover", "ok", "Укрылся у несущей стены");
        break;
      case "cover_window":
        log(ctx, "cover", "mistake", "Встал у окна: стекло лопнуло рядом");
        ctx.effects.push({ type: "setFlag", flag: "window_broken" });
        sayMistake(ctx, "papa", "cover", "cover_window");
        break;
      case "cover_wardrobe":
        log(ctx, "cover", "mistake", "Встал у шкафа: он упал рядом");
        ctx.effects.push({ type: "setFlag", flag: "wardrobe_fallen" });
        sayMistake(ctx, "papa", "cover", "cover_wardrobe");
        break;
      case "cover_run_out":
        log(ctx, "cover", "mistake", "Побежал на лестницу во время толчка");
        sayMistake(ctx, "papa", "cover", "cover_run_out");
        break;
      default:
        return;
    }
    ctx.advance();
  },
};

export const pack: StageDef = {
  hint: "Собери рюкзак и перекрой газ на кухне",
  enter(ctx) {
    say(ctx, "papa", "quake_over_pack");
    setTimer(ctx.state, `pack:${ctx.playerId}`, ctx.at);
  },
  on(ctx, event) {
    const bagOpened = `bag_opened:${ctx.playerId}`;
    if (!hasFact(ctx.state, bagOpened)) {
      if (event.type !== "tick" || event.at - getTimer(ctx.state, `pack:${ctx.playerId}`)! < PACK_DELAY_MS) return;
      addFact(ctx.state, bagOpened);
      openMinigame(ctx, "go_bag");
      return;
    }
    if (event.type === "minigameResult" && event.result.game === "go_bag") {
      const taken = (event.result.data?.items ?? []) as ItemId[];
      const items = taken.filter((item) => ITEMS.includes(item));
      ctx.state.inventory[ctx.playerId] = items;
      ctx.effects.push({ type: "inventory", playerId: ctx.playerId, items });
      say(ctx, "papa", "gas_smell");
      return;
    }
    if (event.type !== "interact" || hasFact(ctx.state, minigameFact(ctx.playerId))) return;
    if (event.target === "light_switch") {
      log(ctx, "gas", "mistake", "Потянулся к выключателю при запахе газа", "gas_switch");
      sayMistake(ctx, "papa", "gas", "gas_light_switch");
    }
    if (event.target === "gas_valve") {
      addFact(ctx.state, "gas_closed");
      log(ctx, "gas", "ok", "Перекрыл газовый кран");
      finishPack(ctx);
    }
    if (event.target === "apartment_door") {
      finishPack(ctx);
      openDoor(ctx);
    }
  },
};

export const exitApartment: StageDef = {
  hint: "Открой дверь вместе с папой",
  enter: (ctx) => say(ctx, "papa", "door_jammed"),
  on(ctx, event) {
    if (event.type === "interact" && event.target === "apartment_door") openDoor(ctx);
  },
};
