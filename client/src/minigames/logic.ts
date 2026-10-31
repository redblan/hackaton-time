/** Чистая логика мини-игр: коды ошибок и проверки без React, их покрывают тесты. */
import type { ItemId, MinigameId, SkillId, VictimKind } from "@game/shared";

export const GAME_SKILLS: Record<MinigameId, SkillId> = {
  go_bag: "go_bag",
  tourniquet: "bleeding",
  cpr: "cpr",
  recovery_position: "recovery_position",
  triage: "triage",
};

export const BAG_SLOTS = 6;
const BAG_TRAPS: ItemId[] = ["laptop", "console", "mugs"];

export function bagMistakes(items: ItemId[]): string[] {
  const mistakes: string[] = [];
  if (items.some((item) => BAG_TRAPS.includes(item))) mistakes.push("bag_trap_item");
  if (!items.includes("documents")) mistakes.push("bag_no_documents");
  if (!items.includes("first_aid_kit")) mistakes.push("bag_no_kit");
  return mistakes;
}

export type LegSpot = "above_wound" | "below_wound";

export function tourniquetMistakes(released: boolean, spot: LegSpot, time: string): string[] {
  const mistakes: string[] = [];
  if (released) mistakes.push("pressure_released");
  if (spot === "below_wound") mistakes.push("tourniquet_below_wound");
  if (time.trim() === "") mistakes.push("tourniquet_no_time");
  return mistakes;
}

/** 100–120 нажатий в минуту, допуск на человеческую неточность — четверть нажатий мимо темпа. */
export const CPR_MIN_MS = 500;
export const CPR_MAX_MS = 600;
const CPR_TOLERANCE_MS = 50;
const CPR_PAUSE_MS = 2000;
const CPR_OFF_TEMPO_SHARE = 0.25;

export function cprMistakes(pressTimes: number[], durationMs: number): string[] {
  const edges = [0, ...pressTimes, durationMs];
  const hasPause = edges.slice(1).some((t, i) => t - edges[i]! > CPR_PAUSE_MS);
  const intervals = pressTimes.slice(1).map((t, i) => t - pressTimes[i]!);
  const limit = Math.max(1, intervals.length * CPR_OFF_TEMPO_SHARE);
  const slow = intervals.filter((ms) => ms > CPR_MAX_MS + CPR_TOLERANCE_MS).length;
  const fast = intervals.filter((ms) => ms < CPR_MIN_MS - CPR_TOLERANCE_MS).length;

  const mistakes: string[] = [];
  if (hasPause) mistakes.push("cpr_pause");
  if (slow > limit) mistakes.push("cpr_too_slow");
  if (fast > limit) mistakes.push("cpr_too_fast");
  return mistakes;
}

/** Текущий темп по последним нажатиям, нажатий в минуту. */
export function cprRate(pressTimes: number[]): number | null {
  const recent = pressTimes.slice(-5);
  if (recent.length < 2) return null;
  return Math.round((60_000 * (recent.length - 1)) / (recent[recent.length - 1]! - recent[0]!));
}

export type TriageGroups = VictimKind[][];

/** D-22: ошибка, если выбран пострадавший из группы хуже лучшей из оставшихся. */
export function triageMistakes(sequence: VictimKind[], groups: TriageGroups): string[] {
  const groupOf = (kind: VictimKind) => groups.findIndex((group) => group.includes(kind));
  const wrong = sequence.some((kind, i) => {
    const best = Math.min(...sequence.slice(i).map(groupOf));
    return groupOf(kind) > best;
  });
  return wrong ? ["triage_wrong_order"] : [];
}

/** TODO(Q-01): формулировки и порядок шагов сверить с базой знаний Матвея. */
export const RECOVERY_STEPS = [
  "Ближнюю руку отвести в сторону под прямым углом",
  "Дальнюю руку приложить тыльной стороной к щеке",
  "Дальнюю ногу согнуть в колене",
  "Потянуть за колено и повернуть человека на бок",
];

export function recoveryMistakes(order: number[]): string[] {
  return order.every((step, i) => step === i) ? [] : ["recovery_wrong_order"];
}

export function shuffled<T>(list: T[], random: () => number = Math.random): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
