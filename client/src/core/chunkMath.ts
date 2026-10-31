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
    if (f === 4) out.push(`e${3-ent}f4`);
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
  const floor = /^e([12])f(\d)$/.exec(cur);
  if (floor) {
    const ent=Number(floor[1]), f=Number(floor[2]);
    // At the fourth-floor corridor the balcony is more urgent than upstairs.
    // In the stairwell retain the vertically adjacent flights instead.
    const balcony=f===4 && pos[2]>=3 && Math.abs(pos[0]-12)<3;
    const priority=balcony ? [`e${3-ent}f4`] : [];
    return [...new Set([cur,...priority,...neighbors])].slice(0,MAX_CHUNKS);
  }
  // Closest edge first: a static north/west-first list starved south/east tiles.
  const distance=(id:ChunkId)=>{
    const yard=/^y(\d)(\d)$/.exec(id);
    const min=yard ? [Number(yard[1])*12,-(Number(yard[2])+1)*12] : [(Number(id[1])-1)*12,0];
    const max=yard ? [min[0]+12,min[1]+12] : [min[0]+12,12];
    return Math.hypot(Math.max(min[0]-pos[0],0,pos[0]-max[0]),Math.max(min[1]-pos[2],0,pos[2]-max[1]));
  };
  return [...new Set([cur,...[...neighbors].sort((a,b)=>distance(a)-distance(b))])].slice(0,MAX_CHUNKS);
}

/** A descending flight belongs to the floor ABOVE the player's feet. */
export function supportingChunks(pos: Vec3): ChunkId[] {
  const cur=chunkAt(pos);
  if(pos[2]<0 || pos[2]>3) return [cur];
  const entrance=pos[0]<12 ? 1 : 2;
  const owner=clamp(Math.ceil((pos[1]-.01)/3)+1,1,9);
  return [...new Set([cur,`e${entrance}f${owner}`])];
}

export function movementChunksReady(pos: Vec3, loaded: Record<ChunkId,ChunkData>): boolean {
  return supportingChunks(pos).every(id=>Boolean(loaded[id]));
}

export function transitionChunks(pos:Vec3,target:Vec3,loaded:Record<ChunkId,ChunkData>):ChunkId[] {
  return [...new Set([...supportingChunks(pos),...supportingChunks(target),...wantedChunks(target,loaded)])].slice(0,MAX_CHUNKS);
}

export const isActive = (o: WorldObject, flags: string[]) => isObjectActive(o, flags);
