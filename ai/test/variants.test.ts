/**
 * M18: у каждого факта ≥ 3 варианта объяснения (правило / пример / «что будет, если»),
 * и три раза подряд NPC объясняет факт тремя разными способами — для всех фактов, не только демо.
 */
import { describe, expect, it } from "vitest";
import { createAi, createInMemoryStore, loadData } from "../src/index";
import type { AiData } from "../src/data";

const offline = (async () => {
  throw new Error("ECONNREFUSED");
}) as unknown as typeof fetch;

const real = loadData();

describe("варианты объяснений у всех фактов (M18)", () => {
  for (const fact of real.facts.values()) {
    it(fact.id, async () => {
      expect(fact.explanations.length).toBeGreaterThanOrEqual(3);
      const [rule, example, whatIf] = fact.explanations;
      expect(rule).toMatch(/^Правило/);
      expect(example).toMatch(/^Пример/);
      expect(whatIf).toMatch(/^Что будет, если/);
      // Карточка, которая говорит только этот факт, без готовых реплик — ответ берётся из базы знаний
      const data: AiData = {
        facts: real.facts,
        cards: new Map([["papa", { id: "papa", name: "Сергей", role: "отец", personality: "", speech: "", events: { quake_started: { goal: "", facts: [fact.id], templates: [] } } }]]),
      };
      const ai = createAi({ memory: createInMemoryStore(), data, fetchImpl: offline });
      const said: string[] = [];
      for (let i = 0; i < 3; i++) {
        const r = await ai.say({ npcId: "papa", playerId: "v", event: "quake_started", context: { flags: [], facts: [] } });
        said.push(r.text.replace(/^Я уже говорил, коротко: /, ""));
      }
      expect(new Set(said).size).toBe(3);
    });
  }
});
