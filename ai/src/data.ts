/** Загрузка базы знаний и карточек NPC с диска. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NpcId, SkillId } from "@game/shared";
import type { KnowledgeFact, NpcCard } from "./types";

export const AI_ROOT = fileURLToPath(new URL("..", import.meta.url));

export interface AiData {
  facts: Map<string, KnowledgeFact>;
  cards: Map<NpcId, NpcCard>;
}

function readJsonDir(dir: string): { file: string; json: unknown }[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith(".json"))
    .sort()
    .map((file) => ({ file, json: JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown }));
}

export function loadData(root: string = AI_ROOT): AiData {
  const facts = new Map<string, KnowledgeFact>();
  // Файлы-массивы — факты. Остальные (например, triage.json) — данные для сценария, их здесь не трогаем.
  for (const { json } of readJsonDir(join(root, "knowledge"))) {
    if (!Array.isArray(json)) continue;
    for (const f of json as KnowledgeFact[]) facts.set(f.id, f);
  }
  const cards = new Map<NpcId, NpcCard>();
  for (const { json } of readJsonDir(join(root, "npcs"))) {
    const card = json as NpcCard;
    cards.set(card.id, card);
  }
  return { facts, cards };
}

export function factsBySkill(data: AiData, skills: readonly SkillId[]): KnowledgeFact[] {
  return [...data.facts.values()].filter((f) => skills.includes(f.skill));
}

/** Факты без ссылки на официальный источник: их нельзя пускать в игру до проверки. */
export function unverifiedFacts(data: AiData): KnowledgeFact[] {
  return [...data.facts.values()].filter((f) => !f.source?.url);
}
