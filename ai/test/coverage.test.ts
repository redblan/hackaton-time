/**
 * M13: на каждую реплику, которую шлёт сценарий Юры, у NPC есть что сказать.
 * Читаем вызовы say()/sayMistake() прямо из кода сценария — новый вызов без реплик уронит тест.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadData } from "../src/index";

const SCENARIO = fileURLToPath(new URL("../../shared/src/scenario", import.meta.url));
/** Эти NPC и события ведут конечные автоматы (dispatcher.ts, gromov.ts), им карточка не нужна */
const FSM = new Set(["dispatcher.dispatcher_open", "gromov.brigade_arrived", "gromov.debrief"]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : n.endsWith(".ts") ? [readFileSync(p, "utf8")] : [];
  });
}

describe("реплики на всё, что шлёт сценарий (M13)", () => {
  const code = sources(SCENARIO).join("\n");
  const pairs = new Set<string>();
  for (const m of code.matchAll(/\bsay\(ctx,\s*"([a-z_]+)",\s*"([a-z_]+)"/g)) pairs.add(`${m[1]}.${m[2]}`);
  for (const m of code.matchAll(/\bsayMistake\(ctx,\s*"([a-z_]+)"/g)) pairs.add(`${m[1]}.mistake`);
  const { cards } = loadData();

  it("нашли вызовы в сценарии", () => expect(pairs.size).toBeGreaterThan(10));

  for (const pair of pairs) {
    if (FSM.has(pair)) continue;
    it(pair, () => {
      const [npc, event] = pair.split(".") as [string, string];
      const card = [...cards.values()].find((c) => c.id === npc);
      expect(card, `нет карточки ai/npcs/${npc}.json`).toBeDefined();
      const ev = card?.events[event as keyof typeof card.events];
      expect(ev?.templates.length ?? 0, `${npc}: нет реплик на ${event}`).toBeGreaterThanOrEqual(3);
    });
  }
});
