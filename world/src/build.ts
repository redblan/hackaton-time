/**
 * Генератор мира. ВЛАДЕЛЕЦ: Никита. ТЗ: docs/tz/nikita-world.md
 * Собирает world/chunks/*.json из шаблонов. Сейчас — минимальный пример одного этажа.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChunkData } from "@game/shared";

const out = join(import.meta.dirname, "..", "chunks");
mkdirSync(out, { recursive: true });

const floor = 7;
const y = (floor - 1) * 3;
const example: ChunkData = {
  id: `e1f${floor}`,
  bounds: { min: [0, y, 0], max: [12, y + 3, 12] },
  neighbors: [`e1f${floor - 1}`, `e1f${floor + 1}`],
  objects: [
    { id: "floor", kind: "box", pos: [6, y - 0.05, 6], size: [12, 0.1, 12], color: "#d9c9b0", collide: true },
    { id: "wall-n", kind: "box", pos: [6, y + 1.5, 0], size: [12, 3, 0.2], color: "#f2efe8", collide: true },
    { id: "table", kind: "interactable", target: "cover_table", pos: [3, y, 3], radius: 1.5, label: "Укрыться под столом" },
    { id: "spawn-a", kind: "spawn", role: "inside_top", pos: [2, y, 2] },
    { id: "papa", kind: "npc", npcId: "papa", pos: [5, y, 4] },
    { id: "z-apt", kind: "zone", zone: "z_apartment", min: [0, y, 0], max: [8, y + 3, 8] },
  ],
};

writeFileSync(join(out, `${example.id}.json`), JSON.stringify(example, null, 2));
console.log(`[world] чанков: 1 (${example.id})`);
