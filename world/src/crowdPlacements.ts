import type { ChunkData, Vec3, WorldObject } from '@game/shared';

type CrowdObject = Extract<WorldObject, { kind: 'crowd' }>;
export type CrowdPlacement = Omit<CrowdObject, 'kind'> & { route: Vec3[] };

export function addCrowd(chunk: ChunkData): ChunkData {
  return { ...chunk, objects: [...chunk.objects, ...crowdPlacements(chunk).map((p): CrowdObject => ({ ...p, kind: 'crowd' }))] };
}

/** All routes stay on one floor / yard tile, preserving the three-chunk budget. */
export function crowdPlacements(chunk: ChunkData): CrowdPlacement[] {
  const [x, y, z] = chunk.bounds.min;
  const result: CrowdPlacement[] = [];
  const add = (type: CrowdPlacement['type'], points: Vec3[]) => {
    const id = `${chunk.id}-crowd-${type}-${result.length}`;
    const route = points.map(([a, b, c]): Vec3 => [x + a, y + b + (chunk.id.startsWith('y') && b === 0 ? .021 : 0), z + c]);
    let seed = 2166136261;
    for (const char of id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
    result.push({ id, type, pos: [...route[0]], route: route.slice(1), seed });
  };
  const floor = /^e[12]f([1-9])$/.exec(chunk.id);
  if (floor) {
    // Two neighbours per entrance, on wide floor landings, never on a stair flight.
    if (floor[1] === '2' || floor[1] === '5') add('person', [[10, 0, 1.8], [10.4, 0, 2.5], [9.5, 0, 2.5]]);
    return result;
  }
  if (!/^y[0-2][0-3]$/.test(chunk.id)) return result;
  if (chunk.id === 'y20') {
    // Hazard is z=2..10, so this resident stays on the southern strip.
    add('person', [[5, 0, 1], [7, 0, 1]]);
  } else if (chunk.id === 'y00' || chunk.id === 'y10') {
    add('person', [[10, 0, 4], [10, 0, 7]]);
  } else if (chunk.id === 'y12') {
    add('person', [[6, 0, 2], [6, 0, 9.5]]);
  } else if (chunk.id === 'y13') {
    add('person', [[5, 0, 8], [5, 0, 10]]);
  } else add('person', [[5, 0, 2], [5, 0, 8.5], [6, 0, 8.5]]);
  // 15 yard residents in total.
  if (['y01', 'y11', 'y12'].includes(chunk.id)) add('person', [[7, 0, 1], [8.5, 0, 1]]);

  const animalChunks = ['y01', 'y02', 'y03', 'y11', 'y12', 'y21', 'y22', 'y23'];
  const animal = animalChunks.indexOf(chunk.id);
  if (animal >= 0) add(animal % 2 ? 'dog' : 'cat', chunk.id === 'y12'
    ? [[11, 0, 5.5], [11, 0, 7.5]] : [[3.8, 0, 4.5], [3.8, 0, 6.5]]);

  const pigeons = ({ y00: 3, y10: 3, y12: 5, y22: 4, y23: 3 } as Record<string, number>)[chunk.id] ?? 0;
  for (let i = 0; i < pigeons; i++) {
    if (chunk.id === 'y00' || chunk.id === 'y10') {
      // Top of the canopy = 2.7 + .25 / 2.
      add('pigeon', [[4 + i * 1.5, 2.825, 9.1], [4.3 + i * 1.5, 2.825, 10.4]]);
    } else add('pigeon', [[7.4 + i * .5, 0, 6.4], [7.6 + i * .5, 0, 7.1]]);
  }
  return result;
}
