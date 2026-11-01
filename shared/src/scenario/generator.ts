import type { SkillId } from "../ids";
import { createRng, randomInt } from "./rng";
import type { GenerateRunInput, PlayerProfile, RunConfig, VictimKind } from "./types";

const ADDRESSES = [
  "ул. Садовая, 14",
  "ул. Лесная, 7",
  "ул. Мира, 23",
  "ул. Гагарина, 5",
  "пр. Победы, 31",
  "ул. Школьная, 12",
];

/** light_injury не выдаём: для него пока нет NPC и интерактивного объекта. */
const VICTIM_SKILLS: Record<Exclude<VictimKind, "light_injury">, SkillId> = {
  bleeding: "bleeding",
  cpr: "cpr",
  unconscious: "recovery_position",
  scared: "psych_support",
};

function fails(profiles: PlayerProfile[], skills: SkillId[]): number {
  return profiles.reduce(
    (sum, p) => sum + skills.reduce((s, skill) => s + (p.skills[skill]?.fail ?? 0), 0),
    0,
  );
}

/** Выбор без повторов: вес растёт как квадрат числа ошибок по навыку. */
/**
 * Пострадавшие во дворе (решение Егора 01.11): всегда трое, у каждого своя мини-игра —
 * кровотечение (жгут), без дыхания (СЛР), без сознания (устойчивое боковое положение).
 * Порядок по профилю: чаще ошибался — тот навык первым (адаптивность сохраняем, но без лотереи «есть/нет»).
 */
function pickVictims(_rng: () => number, profiles: PlayerProfile[]): VictimKind[] {
  const kinds: VictimKind[] = ["bleeding", "cpr", "unconscious"];
  return kinds
    .map((kind) => ({ kind, fail: fails(profiles, [VICTIM_SKILLS[kind as keyof typeof VICTIM_SKILLS]]) }))
    .sort((a, b) => b.fail - a.fail)
    .map((v) => v.kind);
}

export function generateRun(input: GenerateRunInput): RunConfig {
  const { mode, profiles, seed } = input;
  const rng = createRng(seed);
  const chance = (base: number, skills: SkillId[]) =>
    rng() < Math.min(0.95, base + 0.15 * fails(profiles, skills));

  const startFloor = randomInt(rng, 6, 9);
  // Пожар обязателен на 5-м этаже, ниже любого этажа старта (6–9).
  const flags: string[] = ["fire_f5", "collapse_f4"];
  // Обвал тоже обязателен: обходной балкон есть только на 4-м этаже, поэтому обвал всегда там.
  if (chance(0.7, ["elevator"])) flags.push("lift_vanya");
  // Довести соседку вниз — обязательное задание. При обвале обход идёт через 2-й подъезд, поэтому
  // она ждёт там, иначе до неё не дойти. В coop3 её ведёт игрок с 3-го этажа 1-го подъезда.
  const inSecondEntrance = flags.includes("collapse_f4") && mode !== "coop3";
  flags.push("neighbor_valentina", inSecondEntrance ? "valentina_e2" : "valentina_e1");
  flags.push(rng() < 0.5 ? "wire" : "gas");
  if (mode === "coop3") flags.push("neighbor_leg");

  const hasAftershock = chance(0.5, ["aftershock"]);
  if (hasAftershock) flags.push("aftershock");

  return {
    seed,
    mode,
    startFloor,
    flags,
    victims: pickVictims(rng, profiles),
    address: ADDRESSES[randomInt(rng, 0, ADDRESSES.length - 1)]!,
    aftershockAfterMs: hasAftershock ? randomInt(rng, 60, 150) * 1000 : null,
  };
}
