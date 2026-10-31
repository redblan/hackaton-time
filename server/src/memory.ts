import type { MemoryStore } from "@game/shared";
import type { Store } from "./db";

/** Память NPC в БД — тот же интерфейс, что JSON-хранилище Матвея. */
export function dbMemoryStore(store: Store): MemoryStore {
  return {
    get: (playerId) => store.getMemory(playerId),
    save: (memory) => store.saveMemory(memory),
  };
}
