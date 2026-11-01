import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildShell } from '../src/world/decor/Building';
import { buildFloorResources, floorResourceCache } from '../src/world/decor/Interior';
import { generateWorld } from '../../world/src/generate';
import { getColliders } from '../src/world/ChunkView';
import { stepBody, type Body } from '../src/core/physics';

beforeAll(() => vi.stubGlobal('document', { createElement: () => ({
  width: 0, height: 0, getContext: () => ({ fillRect() {}, fillText() {} }),
}) }));
afterAll(() => { floorResourceCache.clearIdle(); vi.unstubAllGlobals(); });

it.each([1, 2])('entrance %i stays visibly open when switching between shell and detailed chunk', entrance => {
  const shell = buildShell(entrance, 1);
  const lease = floorResourceCache.acquire(`entrance-test:${entrance}`, () => buildFloorResources(entrance, 1));
  const material = new MeshBasicMaterial({ side: DoubleSide });
  try {
    // The same sightlines must remain clear before loading, after loading and after eviction.
    for (const geometry of [shell, lease.value.solid, shell]) {
      const mesh = new Mesh(geometry, material);
      mesh.updateMatrixWorld(true);
      // The wall below the upper stairs narrows the actual walkable entrance.
      for (const x of [6, 6.5, 7]) for (const y of [.5, 1, 1.6]) {
        const ray = new Raycaster(new Vector3(x, y, -3), new Vector3(0, 0, 1), 0, 5.8);
        const hits = ray.intersectObject(mesh).map(hit => hit.point.toArray());
        expect(hits, `entrance ${entrance}, ${geometry === shell ? 'shell' : 'detail'}, ray ${x}/${y}: ${JSON.stringify(hits)}`).toHaveLength(0);
      }
    }
  } finally {
    shell.dispose();
    material.dispose();
    lease.release();
    floorResourceCache.clearIdle();
  }
});

it.each([1, 2])('entrance %i has no ledge to climb onto and fall off beside the descending stairs', entrance => {
  const x = (entrance - 1) * 12;
  const colliders = generateWorld().flatMap(chunk => getColliders(chunk, []));
  const body: Body = { pos: [x + 7.5, 2.85, .625], vy: 0, grounded: true };
  for (const [tx, tz] of [[x + 7.5, .375], [x + 6.75, .375], [x + 6.75, .625]]) {
    const before = body.pos[1];
    for (let i = 0; i < 20; i++) {
      const dx = tx - body.pos[0], dz = tz - body.pos[2], distance = Math.hypot(dx, dz);
      if (distance < .001) break;
      const scale = Math.min(.05, distance) / distance;
      stepBody(body, dx * scale, dz * scale, colliders, .01, { gravity: true, jump: false });
    }
    for (let i = 0; i < 60 && !(body.grounded && i > 2); i++)
      stepBody(body, 0, 0, colliders, .04, { gravity: true, jump: false });
    expect(before - body.pos[1]).toBeLessThan(.5);
    expect(body.pos[1]).toBeLessThan(3);
    expect(Math.hypot(tx - body.pos[0], tz - body.pos[2])).toBeLessThan(.001);
  }
});
