import { expect, it } from 'vitest';
import type { Aabb, Vec3 } from '@game/shared';
import { generateWorld } from '../src/generate';
import { crowdPlacements } from '../src/crowdPlacements';
import { propPlacements } from '../src/propPlacements';
import { PALETTE } from '../src/palette';
import { getColliders } from '../../client/src/world/ChunkView';

function intersects(pos: Vec3, size: Vec3, box: Aabb) {
  return pos.every((v, axis) => v + size[axis] / 2 > box.min[axis] + .005 && v - size[axis] / 2 < box.max[axis] - .005);
}

it('prepares the required crowd counts with deterministic seeds and routes clear of static obstacles', () => {
  const chunks = generateWorld();
  const all = chunks.flatMap(crowdPlacements);
  const yard = chunks.filter(c => c.id.startsWith('y')).flatMap(crowdPlacements);
  expect(yard.filter(p => p.type === 'person')).toHaveLength(15);
  expect(yard.filter(p => p.type === 'cat' || p.type === 'dog')).toHaveLength(8);
  expect(yard.filter(p => p.type === 'pigeon')).toHaveLength(18);
  expect(all.filter(p => p.type === 'person')).toHaveLength(19);
  expect(new Set(all.map(p => p.id)).size).toBe(all.length);
  expect(generateWorld().flatMap(crowdPlacements)).toEqual(all);
  for (const c of chunks) {
    const crowd = crowdPlacements(c);
    expect(crowd.length).toBeLessThanOrEqual(10);
    const boxes = getColliders(c, ['collapse_f4']);
    const futureProps: Aabb[] = propPlacements(c).map(p => {
      const size = PALETTE.find(entry => entry.id === p.preset)!.size;
      return { min: p.pos.map((v, axis) => v - size[axis] / 2) as Vec3,
        max: p.pos.map((v, axis) => v + size[axis] / 2) as Vec3 };
    });
    for (const p of crowd) for (let segment = 0; segment < p.route.length; segment++) {
      const a = p.route[segment], b = p.route[(segment + 1) % p.route.length];
      for (let step = 0; step <= 20; step++) {
        const pos = a.map((v, axis) => v + (b[axis] - v) * step / 20) as Vec3;
        expect(pos.every((v, axis) => v >= c.bounds.min[axis] && v <= c.bounds.max[axis])).toBe(true);
        const height = p.type === 'person' ? 1.7 : .3;
        const centre: Vec3 = [pos[0], pos[1] + height / 2, pos[2]];
        expect([...boxes, ...futureProps].some(box => intersects(centre, [.4, height, .4], box)), `${p.id} at ${pos}`).toBe(false);
        expect(boxes.some(box => Math.abs(box.max[1] - pos[1]) < .04 && pos[0] >= box.min[0] && pos[0] <= box.max[0] && pos[2] >= box.min[2] && pos[2] <= box.max[2]), `${p.id}: no support`).toBe(true);
      }
    }
  }
});

it('prepares eight portable props per floor, including an extinguisher, with unique ids and valid physics data', () => {
  const chunks = generateWorld();
  for (const c of chunks) {
    const props = propPlacements(c);
    expect(props).toHaveLength(c.id.startsWith('e') ? 8 : 0);
    for (const p of props) {
      const boxes = getColliders({ ...c, objects: c.objects.filter(o => o.id !== p.replaces) }, []);
      const preset = PALETTE.find(entry => entry.id === p.preset)!;
      expect(preset).toBeDefined();
      expect(p.mass).toBeGreaterThan(0);
      expect(p.bounce).toBeGreaterThanOrEqual(0);
      expect(p.bounce).toBeLessThan(1);
      if (p.replaces) expect(c.objects.some(o => o.id === p.replaces && o.kind === 'box')).toBe(true);
      expect(boxes.some(box => intersects(p.pos, preset.size, box)), `${p.id}: intersects structure`).toBe(false);
    }
  }
  const all = chunks.flatMap(propPlacements);
  expect(all.filter(p => p.preset === 'extinguisher')).toHaveLength(18);
  expect(new Set(all.map(p => p.id)).size).toBe(all.length);
});
