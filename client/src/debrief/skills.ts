import type { PlayerProfile, RunSummary, SkillId } from "@game/shared";
import { SKILL_NAMES } from "../core/names";

export type SkillStatus = "ok" | "fixed" | "mistake";

export interface SkillRow {
  skill: SkillId;
  name: string;
  status: SkillStatus;
  notes: string[];
}

/** Навыки прохождения: сначала ошибки, потом исправленное и освоенное. */
export function skillRows(
  mine: RunSummary["perPlayer"][number] | undefined,
  profile: PlayerProfile | null | undefined,
): SkillRow[] {
  if (!mine) return [];
  const notes = new Map<SkillId, string[]>();
  for (const { skill, note } of mine.mistakes) notes.set(skill, [...(notes.get(skill) ?? []), note]);

  const failed: SkillRow[] = [...notes].map(([skill, list]) => ({
    skill,
    name: SKILL_NAMES[skill],
    status: "mistake",
    notes: list,
  }));
  const passed: SkillRow[] = mine.ok
    .filter((skill) => !notes.has(skill))
    .map((skill) => ({
      skill,
      name: SKILL_NAMES[skill],
      status: (profile?.skills[skill]?.fail ?? 0) > 0 ? "fixed" : "ok",
      notes: [],
    }));
  return [...failed, ...passed];
}
