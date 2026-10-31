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
function pickVictims(rng: () => number, profiles: PlayerProfile[]): VictimKind[] {
  const pool = (Object.keys(VICTIM_SKILLS) as (keyof typeof VICTIM_SKILLS)[]).map((kind) => {
    const fail = fails(profiles, [VICTIM_SKILLS[kind]]);
    return { kind, weight: 1 + 3 * fail * fail };
  });
  const count = randomInt(rng, 2, 4);
  const picked: VictimKind[] = [];
  while (picked.length < count) {
    const total = pool.reduce((sum, v) => sum + v.weight, 0);
    let roll = rng() * total;
    const index = pool.findIndex((v) => (roll -= v.weight) < 0);
    picked.push(pool.splice(index === -1 ? pool.length - 1 : index, 1)[0]!.kind);
  }
  return picked;
}

export function generateRun(input: GenerateRunInput): RunConfig {
  const { mode, profiles, seed } = input;
  const rng = createRng(seed);
  const chance = (base: number, skills: SkillId[]) =>
    rng() < Math.min(0.95, base + 0.15 * fails(profiles, skills));

  const startFloor = randomInt(rng, 6, 9);
  const flags: string[] = [];
  if (chance(0.7, ["smoke"])) flags.push(`fire_f${randomInt(rng, 5, startFloor - 1)}`);
  // Обходной балкон есть только на 4-м этаже, поэтому обвал ставим только под ним.
  if (chance(0.7, ["route"])) flags.push("collapse_f4");
  if (chance(0.7, ["elevator"])) flags.push("lift_vanya");
  if (chance(0.7, ["escort", "psych_support"])) flags.push("neighbor_valentina");
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
