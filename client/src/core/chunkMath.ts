/** Какие чанки нужны по позиции игрока. Сетка — из шапки shared/src/world.ts. */
import { isObjectActive, type ChunkData, type ChunkId, type Vec3, type WorldObject } from "@game/shared";

export const TOTAL_CHUNKS = 30;
export const MAX_CHUNKS = 3;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function chunkAt([x, y, z]: Vec3): ChunkId {
  if (z < 0) {
    const col = clamp(Math.floor(x / 12), 0, 2);
    const row = clamp(Math.floor(-z / 12), 0, 3);
    return `y${col}${row}`;
  }
  const entrance = x < 12 ? 1 : 2;
  const floor = clamp(Math.floor((y + 0.5) / 3) + 1, 1, 9);
  return `e${entrance}f${floor}`;
}

/** Соседи по сетке — если чанк ещё не пришёл и его neighbors неизвестны. */
export function gridNeighbors(id: ChunkId): ChunkId[] {
  const e = /^e([12])f(\d)$/.exec(id);
  if (e) {
    const [ent, f] = [Number(e[1]), Number(e[2])];
    const out: ChunkId[] = [];
    if (f > 1) out.push(`e${ent}f${f - 1}`);
    if (f < 9) out.push(`e${ent}f${f + 1}`);
    if (f === 1) out.unshift(`y${ent === 1 ? 0 : 1}0`);
    return out;
  }
  const y = /^y(\d)(\d)$/.exec(id);
  if (y) {
    const [c, r] = [Number(y[1]), Number(y[2])];
    const out: ChunkId[] = [];
    if (r === 0 && c <= 1) out.push(`e${c + 1}f1`);
    if (r > 0) out.push(`y${c}${r - 1}`);
    if (c > 0) out.push(`y${c - 1}${r}`);
    if (c < 2) out.push(`y${c + 1}${r}`);
    if (r < 3) out.push(`y${c}${r + 1}`);
    return out;
  }
  return [];
}

/** Список чанков по приоритету, не больше MAX_CHUNKS: текущий + его соседи. */
export function wantedChunks(pos: Vec3, loaded: Record<ChunkId, ChunkData>): ChunkId[] {
  const cur = chunkAt(pos);
  const neighbors = loaded[cur]?.neighbors ?? gridNeighbors(cur);
  return [...new Set([cur, ...neighbors])].slice(0, MAX_CHUNKS);
}

export const isActive = (o: WorldObject, flags: string[]) => isObjectActive(o, flags);
