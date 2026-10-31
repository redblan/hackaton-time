/**
 * Память игрока на JSON-файлах: ai/memory/<playerId>.json.
 * Егор потом подменит на БД — интерфейс MemoryStore из shared/src/ai.ts не меняется.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MemoryStore, PlayerId, PlayerMemory } from "@game/shared";
import { AI_ROOT } from "./data";

export const RECENT_LIMIT = 20;

export function emptyMemory(playerId: PlayerId): PlayerMemory {
  return { playerId, toldFacts: {}, usedExplanations: {}, mistakes: {}, npc: {}, recent: [] };
}

function safeName(playerId: PlayerId): string {
  return playerId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function createFileMemory(dir: string = join(AI_ROOT, "memory")): MemoryStore {
  return {
    async get(playerId) {
      try {
        const raw = await readFile(join(dir, `${safeName(playerId)}.json`), "utf8");
        return { ...emptyMemory(playerId), ...(JSON.parse(raw) as Partial<PlayerMemory>) };
      } catch {
        return emptyMemory(playerId);
      }
    },
    async save(memory) {
      await mkdir(dir, { recursive: true });
      const file = join(dir, `${safeName(memory.playerId)}.json`);
      // Пишем во временный файл и переименовываем, чтобы при падении не остался обрезанный JSON
      await writeFile(`${file}.tmp`, JSON.stringify(memory, null, 2), "utf8");
      await rename(`${file}.tmp`, file);
    },
  };
}

/** Память в процессе — для тестов. */
export function createInMemoryStore(): MemoryStore {
  const all = new Map<PlayerId, PlayerMemory>();
  return {
    async get(playerId) {
      return structuredClone(all.get(playerId) ?? emptyMemory(playerId));
    },
    async save(memory) {
      all.set(memory.playerId, structuredClone(memory));
    },
  };
}
