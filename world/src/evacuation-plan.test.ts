import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { generateWorld } from './generate';

it('keeps a readable plan at the first entrance and removes the second board and its interaction', () => {
  const chunks = generateWorld();
  const plans = chunks.flatMap(c => c.objects.filter(o => o.id === 'evacuation-plan'));
  expect(plans).toHaveLength(1);
  const second = chunks.find(c => c.id === 'y10')!;
  expect(second.objects.some(o => o.id === 'evacuation-plan')).toBe(false);
  expect(second.objects.some(o => o.kind === 'interactable' && o.target === 'building_plan')).toBe(false);
  for (const col of [0]) {
    const chunk = chunks.find(c => c.id === `y${col}0`)!;
    const plan = chunk.objects.find(o => o.id === 'evacuation-plan');
    const interaction = chunk.objects.find(o => o.kind === 'interactable' && o.target === 'building_plan');
    expect(plan?.kind).toBe('model');
    expect(interaction?.kind).toBe('interactable');
    if (plan?.kind !== 'model' || interaction?.kind !== 'interactable') throw new Error('Missing plan');
    expect(plan.src).toBe(`signs/evacuation-e${col + 1}.glb`);
    expect(plan.collide).toBe(false);
    expect(plan.rotY).toBe(Math.PI);
    expect(plan.pos[0] + 1.3).toBeLessThanOrEqual(col * 12 + 3);
    expect(plan.pos[2]).toBeLessThan(-.1); // in front of the wall, not inside it
    expect(interaction.pos[0]).toBe(plan.pos[0]);
    expect(interaction.pos[2]).toBeLessThan(plan.pos[2]);
    const data = readFileSync(new URL(`../assets/${plan.src}`, import.meta.url));
    expect(data.length).toBeLessThan(512 * 1024);
    expect(data.readUInt32LE(0)).toBe(0x46546c67);
    expect(data.readUInt32LE(8)).toBe(data.length);
    const doc = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
    expect(doc.buffers[0].uri).toBeUndefined();
    expect(doc.images[0].uri).toBeUndefined();
    expect(doc.materials[0].extensions).toHaveProperty('KHR_materials_unlit');
    expect(doc.accessors[0].max).toEqual([1.3, 1.8, 0]);
  }
});
