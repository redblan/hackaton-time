/** Мир: читает world/chunks/*.json, следит за изменениями (npm run world пересобирает на лету). */
import { existsSync, readdirSync, readFileSync, watch } from "node:fs";
import { join } from "node:path";
import type { ChunkData, ChunkId, NpcId, Role, Vec3 } from "@game/shared";

/** Сколько чанков клиент держит одновременно (≤ 10% от 30) */
export const MAX_CHUNKS_PER_CLIENT = 3;

export class ChunkStore {
  private chunks = new Map<ChunkId, ChunkData>();

  constructor(
    private dir: string,
    watchDir = true,
  ) {
    this.reload();
    if (watchDir && existsSync(dir)) {
      let timer: NodeJS.Timeout | undefined;
      watch(dir, () => {
        clearTimeout(timer);
        timer = setTimeout(() => this.reload(), 300);
      });
    }
  }

  reload() {
    const next = new Map<ChunkId, ChunkData>();
    if (existsSync(this.dir)) {
      for (const f of readdirSync(this.dir)) {
        if (!f.endsWith(".json")) continue;
        try {
          const c = JSON.parse(readFileSync(join(this.dir, f), "utf8")) as ChunkData;
          next.set(c.id, c);
        } catch (e) {
          console.warn(`[world] не читается ${f}: ${(e as Error).message}`);
        }
      }
    }
    this.chunks = next;
    console.log(`[world] чанков загружено: ${next.size}`);
  }

  /** Где стоит NPC в мире (с учётом флагов `when`) */
  findNpc(npcId: NpcId, flags: ReadonlySet<string>): Vec3 | null {
    for (const c of this.chunks.values()) {
      for (const o of c.objects) {
        if (o.kind === "npc" && o.npcId === npcId && (!o.when || flags.has(o.when))) return o.pos;
      }
    }
    return null;
  }

  get(id: ChunkId) {
    return this.chunks.get(id);
  }
  ids() {
    return [...this.chunks.keys()].sort();
  }

  /**
   * Точка появления для роли. Для inside_top предпочитаем чанк этажа старта.
   * Нет спауна в мире — возвращаем разумную точку по контракту координат.
   */
  findSpawn(role: Role, startFloor: number): { pos: Vec3; rotY: number } {
    const preferred = role === "inside_top" ? `e1f${startFloor}` : role === "inside_mid" ? "e1f3" : "y10";
    const candidates: { chunk: ChunkId; pos: Vec3; rotY: number }[] = [];
    for (const c of this.chunks.values()) {
      for (const o of c.objects) {
        if (o.kind === "spawn" && o.role === role) candidates.push({ chunk: c.id, pos: o.pos, rotY: o.rotY ?? 0 });
      }
    }
    const hit = candidates.find((c) => c.chunk === preferred) ?? candidates[0];
    if (hit) return { pos: hit.pos, rotY: hit.rotY };
    if (role === "outside") return { pos: [6, 0, -6], rotY: 0 };
    const floor = role === "inside_mid" ? 3 : startFloor;
    return { pos: [2, (floor - 1) * 3, 2], rotY: 0 };
  }
}

/**
 * Что отдать клиенту: первые MAX существующих чанков из его списка (порядок = приоритет).
 * Возвращает новый набор, что дослать и что выгрузить.
 */
export function planChunks(have: ReadonlySet<ChunkId>, want: unknown, exists: (id: ChunkId) => boolean) {
  const list = Array.isArray(want) ? want.filter((x): x is string => typeof x === "string") : [];
  const next = new Set<ChunkId>();
  for (const id of list) {
    if (next.size >= MAX_CHUNKS_PER_CLIENT) break;
    if (exists(id)) next.add(id);
  }
  const send = [...next].filter((id) => !have.has(id));
  const drop = [...have].filter((id) => !next.has(id));
  return { next, send, drop };
}
