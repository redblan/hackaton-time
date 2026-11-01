import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { ChunkStore } from '../../server/src/chunks';
import { PALETTE } from '../src/palette';

it('exports the admin palette alongside chunks without creating a 31st chunk', () => {
  const dir = new URL('../chunks/', import.meta.url);
  const palette: unknown = JSON.parse(readFileSync(new URL('palette.json', dir), 'utf8'));
  expect(palette).toEqual(PALETTE);
  const store = new ChunkStore(fileURLToPath(dir), false);
  expect(store.ids()).toHaveLength(30);
  expect(store.ids().every(id => /^(?:e[12]f[1-9]|y[0-2][0-3])$/.test(id))).toBe(true);
  expect(store.get('e1f9')?.objects.filter(o => o.kind === 'prop')).toHaveLength(8);
  expect(store.findSpawn('inside_top', 9).pos[1]).toBe(24);
});
