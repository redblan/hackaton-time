import { expect, it } from 'vitest';
import { generateWorld } from './generate';
import { validateWorld } from './validate';

it('rejects invalid portable-object dimensions, labels, mass and bounce', () => {
  for (const invalid of ['size', 'label', 'mass', 'bounce']) {
    const chunks = generateWorld();
    const prop = chunks[0].objects.find(o => o.kind === 'prop')!;
    if (prop.kind !== 'prop') throw new Error('Missing prop');
    if (invalid === 'size') prop.size[0] = 0;
    if (invalid === 'label') prop.label = ' ';
    if (invalid === 'mass') prop.mass = NaN;
    if (invalid === 'bounce') prop.bounce = 1.1;
    expect(() => validateWorld(chunks)).toThrow();
  }
});
