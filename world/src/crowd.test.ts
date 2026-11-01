import { expect, it } from 'vitest';
import { generateWorld } from './generate';
import { validateWorld } from './validate';

it('rejects crowd overflow, invalid seeds and routes outside the owning chunk', () => {
  for (const invalid of ['overflow', 'seed', 'route']) {
    const chunks = generateWorld();
    const chunk = chunks.find(c => c.id === 'y12')!;
    const person = chunk.objects.find(o => o.kind === 'crowd')!;
    if (person.kind !== 'crowd') throw new Error('Missing crowd');
    if (invalid === 'seed') person.seed = NaN;
    else if (invalid === 'route') person.route = [[999, 0, 999]];
    else for (let i = 0; i < 3; i++) chunk.objects.push({ ...person, id: `overflow-${i}` });
    expect(() => validateWorld(chunks)).toThrow();
  }
});
