/**
 * Сценарий. ВЛАДЕЛЕЦ: Юра. Сейчас здесь ЗАГЛУШКИ с правильными сигнатурами:
 * сервер уже может их вызывать, а Юра заменяет тело функций настоящей логикой.
 * Сигнатуры не меняем без лида.
 */
import type { Role, PlayerId } from "../ids";
import type { GameEvent, GenerateRunInput, ReduceResult, RunConfig, RunState } from "./types";

export * from "./types";

/** Собрать конфиг прохождения. Детерминирован по seed. Слабые навыки из профилей выпадают чаще. */
export function generateRun(input: GenerateRunInput): RunConfig {
  return {
    seed: input.seed,
    mode: input.mode,
    startFloor: 7,
    flags: ["fire_f5", "collapse_f4", "lift_vanya", "neighbor_valentina", "wire"],
    victims: ["bleeding", "cpr", "unconscious"],
    address: "ул. Садовая, 14",
    aftershockAfterMs: 120_000,
  };
}

export function initRun(config: RunConfig, players: { id: PlayerId; role: Role }[]): RunState {
  return {
    config,
    players,
    stage: Object.fromEntries(players.map((p) => [p.id, "wake"])),
    inventory: Object.fromEntries(players.map((p) => [p.id, []])),
    facts: [],
    victims: {},
    journal: [],
    startedAt: 0,
    finished: false,
  };
}

/** Чистая функция: никаких сетевых вызовов, Date.now(), Math.random() без seed. */
export function reduce(state: RunState, event: GameEvent): ReduceResult {
  void event;
  return { state, effects: [] };
}
