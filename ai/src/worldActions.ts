/** M21: reveal Nikita's existing objects using the agreed WorldPatch contract. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChunkData, NpcRequest, WorldPatch } from "@game/shared";
import { AI_ROOT } from "./data";
import type { Intent } from "./intents";
export function actionPatch(intent: Intent, req: NpcRequest, load: (id: string) => ChunkData = id => JSON.parse(readFileSync(join(AI_ROOT, "..", "world", "chunks", `${id}.json`), "utf8")) as ChunkData): { patch: WorldPatch; text: string } | null {
  let chunkId: string, flag: string, text: string;
  if (intent === "first_aid" && req.npcId === "papa") {
    const floor = req.context.startFloor;
    if (typeof floor !== "number" || !Number.isInteger(floor) || floor < 6 || floor > 9) return null;
    chunkId = `e1f${floor}`; flag = "spawn_first_aid"; text = `Аптечка в шкафчике у стола в квартире на ${floor}-м этаже.`;
  } else if (intent === "ladder" && req.npcId === "mihalych") {
    chunkId = "y00"; flag = "spawn_ladder"; text = "Лестница у первого подъезда, сбоку от входа. Приём.";
  } else if ((intent === "blankets" || intent === "water") && (req.npcId === "gromov" || req.npcId === "mihalych")) {
    chunkId = "y12"; flag = "spawn_blankets"; text = "Одеяла и вода у места сбора на детской площадке.";
  } else return null;
  try {
    const chunk = load(chunkId);
    // Reuse original ids: repeat requests replace objects rather than duplicating them.
    const add = chunk.objects.filter(o => o.when === flag).map(o => {
      const { when: _when, ...visible } = o;
      return visible;
    });
    if (!add.length) return null;
    return { patch: { chunkId, add, remove: [] }, text };
  } catch { return null; }
}
