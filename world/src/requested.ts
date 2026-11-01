import type { ChunkData, WorldObject } from '@game/shared';
import { paletteObjects } from './palette';

/** N13: placements for agents. Setting a flag is owned by AI/server. */
export function addRequestedObjects(chunk: ChunkData): ChunkData {
  const objects: WorldObject[] = chunk.objects.map(o => ({ ...o }));
  const [x, y, z] = chunk.bounds.min;
  const add = (preset: string, id: string, pos: [number, number, number], flag: string) => {
    objects.push(...paletteObjects(preset, id, pos, 0, false).map(o => ({ ...o, when: flag })));
  };
  if (/^e1f[6-9]$/.test(chunk.id)) {
    // Beside the table: neither the spawn nor the apartment door is covered.
    add('first_aid_cabinet', 'requested-cabinet', [x + 4.8, y, 9.7], 'spawn_first_aid');
    add('first_aid_kit', 'requested-kit', [x + 4.8, y + .8, 9.7], 'spawn_first_aid');
  }
  if (chunk.id === 'y00' || chunk.id === 'y10') {
    // Outside canopy-danger x=3..9 and outside the evacuation-plan board.
    add('ladder', 'requested-ladder', [x + 11.4, 0, z + 10.9], 'spawn_ladder');
    objects.push({ id: 'requested-ladder-label', kind: 'sign', pos: [x + 11.4, 1.7, z + 10.6],
      text: 'Лестница спасателей', when: 'spawn_ladder' });
  }
  if (chunk.id === 'y12') {
    add('blankets', 'requested-blankets', [x + .8, 0, z + 10.7], 'spawn_blankets');
    for (let i = 0; i < 3; i++) add('water', `requested-water-${i}`, [x + .55 + i * .25, 0, z + 9.9], 'spawn_blankets');
    objects.push({ id: 'requested-supplies-label', kind: 'sign', pos: [x + 1.4, 1.6, z + 11],
      text: 'Одеяла и питьевая вода · Место сбора', when: 'spawn_blankets' });
  }
  if (chunk.id === 'y20') {
    // Existing renderer has no light object. The bright head is also a light anchor for Yura.
    for (const [id, color, when, unless] of [
      ['requested-lamp-off', '#35434a', undefined, 'power_on'],
      ['requested-lamp-on', '#fff2bd', 'power_on', undefined],
    ] as const) objects.push({ id, kind: 'box', pos: [x + 3, 4.3, z + 6], size: [.6, .25, .6],
      color, collide: false, ...(when ? { when } : {}), ...(unless ? { unless } : {}) });
  }
  if (chunk.id === 'e1f1') {
    // A second ground-floor exit x=9.1..10.9, clear of canopy and evacuation-plan board.
    // Keep the wall closed until the agent opens it; no opening beyond world bounds.
    const wall = objects.findIndex(o => o.id === 'south-wall-e');
    objects.splice(wall, 1,
      { id: 'south-wall-e', kind: 'box', pos: [10, 1.5, 0], size: [4, 3, .2], color: '#f3ddbd', collide: true, unless: 'spawn_exit' },
      { id: 'requested-exit-left', kind: 'box', pos: [8.55, 1.5, 0], size: [1.1, 3, .2], color: '#f3ddbd', collide: true, when: 'spawn_exit' },
      { id: 'requested-exit-right', kind: 'box', pos: [11.45, 1.5, 0], size: [1.1, 3, .2], color: '#f3ddbd', collide: true, when: 'spawn_exit' },
      { id: 'requested-exit-lintel', kind: 'box', pos: [10, 2.7, 0], size: [1.8, .6, .2], color: '#f3ddbd', collide: true, when: 'spawn_exit' },
    );
    // Hide exterior window parts in the new opening; interior trim is owned by Yura.
    for (const o of objects) if (/^facade-(window|sill|mullion|transom)-10$/.test(o.id)) o.unless = 'spawn_exit';
    objects.push({ id: 'requested-exit-sign', kind: 'sign', pos: [10, 2.65, -.22], rotY: Math.PI,
      text: 'ДОПОЛНИТЕЛЬНЫЙ ВЫХОД', when: 'spawn_exit' });
  }
  return { ...chunk, objects };
}
