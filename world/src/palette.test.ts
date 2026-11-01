import { expect, it } from 'vitest';
import { PALETTE, paletteObjects } from './palette';

it('provides bounded local box presets with Russian labels and no external resources', () => {
  expect(new Set(PALETTE.map(p => p.id)).size).toBe(PALETTE.length);
  for (const p of PALETTE) {
    expect(p.label).toMatch(/[А-Яа-я]/);
    expect(p.parts.length).toBeGreaterThan(0);
    expect(p.parts.length).toBeLessThanOrEqual(12);
    for (let axis = 0; axis < 3; axis++) {
      const lo = Math.min(...p.parts.map(part => part.pos[axis] - part.size[axis] / 2));
      const hi = Math.max(...p.parts.map(part => part.pos[axis] + part.size[axis] / 2));
      expect(hi - lo).toBeLessThanOrEqual(p.size[axis] + .00001);
    }
    expect(paletteObjects(p.id, 'admin-one', [1, 3, -5]).every(o => o.kind === 'box' && o.collide)).toBe(true);
  }
});

it('places independently editable instances with rotated part offsets and without mutating presets', () => {
  const before = JSON.stringify(PALETTE);
  const one = paletteObjects('chair', 'one', [10, 3, -6], Math.PI / 2, false);
  const two = paletteObjects('chair', 'two', [0, 0, 0]);
  expect(one.map(o => o.id).some(id => two.some(o => o.id === id))).toBe(false);
  expect(one[1].pos[0]).toBeCloseTo(10.21);
  expect(one[1].pos[2]).toBeCloseTo(-6);
  expect(one[1].rotY).toBe(Math.PI / 2);
  one[0].size[0] = 99;
  expect(JSON.stringify(PALETTE)).toBe(before);
  expect(() => paletteObjects('missing', 'id', [0, 0, 0])).toThrow();
  expect(() => paletteObjects('water', '', [0, 0, 0])).toThrow();
});
