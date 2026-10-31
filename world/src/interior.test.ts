import { expect, it } from 'vitest';
import { isObjectActive, type WorldObject } from '@game/shared';
import { floorChunk, generateWorld } from './generate';
import { addInterior } from './interior';

it('decorates all floors without changing colliders or blocking the apartment opening', () => {
  const colliders = (objects: WorldObject[]) => objects.filter(o => o.kind === 'box' && o.collide !== false);
  for (const entrance of [1, 2]) for (let floor = 1; floor <= 9; floor++) {
    const original = floorChunk(entrance, floor);
    const snapshot = JSON.stringify(original);
    const decorated = addInterior(original);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(colliders(decorated.objects)).toEqual(colliders(original.objects));
    const doors = decorated.objects.filter(o => /^detail-door-[01]$/.test(o.id));
    expect(doors).toHaveLength(2);
    for (const door of doors) {
      if (door.kind !== 'box') throw new Error('Door must be box');
      const localX = door.pos[0] - original.bounds.min[0];
      expect(localX + door.size[0] / 2 < 4 || localX - door.size[0] / 2 > 6).toBe(true);
      expect(door.pos[2] - door.size[2] / 2).toBeGreaterThan(3);
    }
    const mailboxes = decorated.objects.filter(o => o.id.startsWith('detail-mailbox-'));
    expect(mailboxes).toHaveLength(floor === 1 ? 18 : 0);
    const sign = decorated.objects.find(o => o.id === 'floor-sign');
    expect(sign?.kind).toBe('sign');
    if (sign?.kind === 'sign') {
      expect(sign.text).toContain(`Этаж ${floor}`);
      expect(sign.rotY).toBe(Math.PI);
      expect(sign.pos[2]).toBeLessThan(4.925); // hall-facing wall surface
    }
  }
});

it('shows damage only for actual damage flags, not the configured future aftershock', () => {
  const chunks = generateWorld();
  const damage = chunks.flatMap(c => c.objects.filter(o => o.id.startsWith('detail-') && o.when));
  expect(damage.length).toBeGreaterThan(0);
  for (const object of damage) {
    expect(isObjectActive(object, [])).toBe(false);
    expect(isObjectActive(object, ['aftershock'])).toBe(false);
    expect(isObjectActive(object, [object.when!])).toBe(true);
    if (object.kind === 'box') expect(object.collide).toBe(false);
  }
  expect(chunks.filter(c => c.objects.some(o => o.id.startsWith('detail-aftershock-'))).map(c => c.id))
    .toEqual(['e1f4', 'e2f4']);
});
