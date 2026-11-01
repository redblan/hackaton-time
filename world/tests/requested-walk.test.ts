import { expect, it } from 'vitest';
import { generateWorld } from '../src/generate';
import { getColliders } from '../../client/src/world/ChunkView';
import { stepBody, type Body } from '../../client/src/core/physics';

// Cross-workspace integration is run by Vitest; world/src remains a Node-only TS project.
it('opens a walkable second exit only after spawn_exit while retaining the main exit', () => {
  const chunks = generateWorld();
  const colliders = (flags: string[]) => chunks.filter(c => c.id === 'e1f1' || c.id === 'y00').flatMap(c => getColliders(c, flags));
  for (const enabled of [false, true]) {
    const body: Body = { pos: [10, 0, 1], vy: 0, grounded: true };
    const boxes = colliders(enabled ? ['spawn_exit'] : []);
    for (let i = 0; i < 160; i++) stepBody(body, 0, -.05, boxes, .016, { gravity: true, jump: false });
    if (enabled) expect(body.pos[2]).toBeLessThan(-6);
    else expect(body.pos[2]).toBeGreaterThan(.2);
    expect(body.pos[1]).toBeCloseTo(0, 1);
  }
  for (const flags of [[], ['spawn_exit']]) {
    const body: Body = { pos: [6, 0, 1], vy: 0, grounded: true };
    const boxes = colliders(flags);
    for (let i = 0; i < 80; i++) stepBody(body, 0, -.05, boxes, .016, { gravity: true, jump: false });
    expect(body.pos[2]).toBeLessThan(-2);
  }
});
