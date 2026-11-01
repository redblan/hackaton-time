import { expect, it } from 'vitest';
import { isObjectActive } from '@game/shared';
import { generateWorld } from './generate';

it('shows requested supplies only after their own flag and keeps them off the evacuation path', () => {
  const chunks = generateWorld();
  const expected = {
    spawn_first_aid: ['e1f6', 'e1f7', 'e1f8', 'e1f9'],
    spawn_ladder: ['y00', 'y10'], spawn_blankets: ['y12'], power_on: ['y20'], spawn_exit: ['e1f1'],
  };
  for (const [flag, ids] of Object.entries(expected)) {
    const tagged = chunks.flatMap(c => c.objects.filter(o => o.when === flag).map(o => ({ chunk: c.id, object: o })));
    expect(new Set(tagged.map(o => o.chunk))).toEqual(new Set(ids));
    for (const { object } of tagged) {
      expect(isObjectActive(object, [])).toBe(false);
      expect(isObjectActive(object, ['unrelated_flag'])).toBe(false);
      expect(isObjectActive(object, [flag])).toBe(true);
      if (object.kind === 'box' && !object.id.startsWith('requested-exit')) expect(object.collide).toBe(false);
    }
  }
  const lamp = chunks.find(c => c.id === 'y20')!;
  expect(lamp.objects.filter(o => isObjectActive(o, [])).map(o => o.id)).toContain('requested-lamp-off');
  expect(lamp.objects.filter(o => isObjectActive(o, ['power_on'])).map(o => o.id)).not.toContain('requested-lamp-off');
});

