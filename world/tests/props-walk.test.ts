import { expect, it } from 'vitest';
import type { Vec3 } from '@game/shared';
import { generateWorld } from '../src/generate';
import { getColliders } from '../../client/src/world/ChunkView';
import { stepBody, type Body } from '../../client/src/core/physics';

it('keeps the narrow passage beside the lift open when props are solid obstacles', () => {
  const chunks = generateWorld();
  const colliders = chunks.flatMap(chunk => getColliders({ ...chunk,
    objects: chunk.objects.map(o => o.kind === 'prop'
      ? { ...o, kind: 'box' as const, color: o.color ?? '#cccccc', collide: true } : o),
  }, ['collapse_f4']));
  function walk(start: Vec3, route: Vec3[], label: string) {
    const body: Body = { pos: [...start], vy: 0, grounded: true };
    for (const target of route) {
      const maxSteps = Math.ceil(Math.hypot(target[0] - body.pos[0], target[2] - body.pos[2]) / .05) + 10;
      for (let step = 0; step < maxSteps; step++) {
        const dx = target[0] - body.pos[0], dz = target[2] - body.pos[2];
        const distance = Math.hypot(dx, dz);
        if (distance < .005) break;
        const scale = Math.min(.05, distance) / distance;
        stepBody(body, dx * scale, dz * scale, colliders, .01, { gravity: true, jump: false });
      }
      expect(Math.hypot(body.pos[0] - target[0], body.pos[2] - target[2]), label).toBeLessThan(.005);
      expect(body.pos[1], label).toBeCloseTo(target[1]);
    }
  }
  for (const chunk of chunks.filter(c => c.id.startsWith('e'))) {
    const [x, y] = chunk.bounds.min;
    walk([x + 11.5, y, 4.5], [[x + 11.5, y, 1.5], [x + 8.5, y, 1.5], [x + 8.5, y, .775]], chunk.id);
  }
  // The fourth-floor balcony is the only detour around collapse_f4.
  walk([11.5, 9, 4.5], [[23.5, 9, 4.5]], 'fourth-floor balcony detour');
});
