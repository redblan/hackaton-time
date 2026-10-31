import type { ChunkData, Vec3, WorldObject } from '@game/shared';

/** N7: surface decorations only; structural collision geometry stays unchanged. */
export function addInterior(chunk: ChunkData): ChunkData {
  const match = /^e([12])f([1-9])$/.exec(chunk.id);
  if (!match) return chunk;
  const entrance = Number(match[1]), floor = Number(match[2]);
  const [x, y] = chunk.bounds.min;
  const objects: WorldObject[] = chunk.objects.map(o => o.id === 'floor-sign' && o.kind === 'sign'
    ? { ...o, pos: [x + 7, y + 2.55, 4.82], rotY: Math.PI,
      text: `Подъезд ${entrance} · Этаж ${floor} · Квартиры ${(entrance - 1) * 18 + (floor - 1) * 2 + 1}–${(entrance - 1) * 18 + floor * 2}` }
    : o);
  const box = (id: string, pos: Vec3, size: Vec3, color: string, when?: string) => {
    objects.push({ id: `detail-${id}`, kind: 'box', pos: [x + pos[0], y + pos[1], pos[2]],
      size, color, collide: false, ...(when ? { when } : {}) });
  };

  // Closed decorative doors sit against existing hall walls, not the opening
  // x=4..6 or the balcony passage. The door at x=7 marks Valentina's apartment.
  for (const [index, dx] of [2, 7].entries()) {
    box(`door-${index}`, [dx, 1.05, 4.87], [1.05, 2.1, .08], index ? '#91664f' : '#678781');
    for (const side of [-1, 1]) box(`door-${index}-jamb-${side}`, [dx + side * .57, 1.1, 4.84], [.09, 2.2, .1], '#d6bc92');
    box(`door-${index}-lintel`, [dx, 2.16, 4.84], [1.23, .1, .1], '#d6bc92');
    box(`door-${index}-handle`, [dx + .36, 1, 4.8], [.12, .07, .06], '#c7bd9f');
    box(`door-${index}-peephole`, [dx, 1.62, 4.81], [.045, .045, .03], '#283c3a');
  }

  if (floor === 1) {
    // Eighteen mailboxes per entrance, matching two apartments on nine floors.
    // A grouped label
    // uses the existing sign renderer; no new interaction or asset dependency.
    for (let row = 0; row < 6; row++) for (let col = 0; col < 3; col++) {
      const z = 3.35 + col * .5, h = .65 + row * .25;
      box(`mailbox-${row}-${col}`, [.23, h, z], [.22, .22, .44], '#5a7d84');
      box(`mail-slot-${row}-${col}`, [.35, h + .05, z], [.015, .025, .28], '#233b40');
      box(`mail-lock-${row}-${col}`, [.35, h - .07, z + .12], [.02, .045, .045], '#d5c992');
    }
    objects.push({ id: 'mailboxes-label', kind: 'sign', pos: [x + .36, 2.2, 4], rotY: Math.PI / 2,
      text: `ПОЧТА · Подъезд ${entrance}` });
  }

  // Broken-window plaster is local to the apartment, alongside the N3 shards.
  for (let i = 0; i < 3; i++) {
    box(`window-crack-${i}`, [7.1 + i * .13, 1.1 + i * .15, 11.77], [.18, .035, .015], '#685e55', 'window_broken');
    box(`window-plaster-${i}`, [6.9 + i * .3, .025, 11.3], [.18, .04, .13], '#e4d3bc', 'window_broken');
  }
  if (floor === 4) {
    // balcony_debris is emitted by finishAftershock, unlike the configuration
    // flag aftershock which is already present before the second quake.
    const edge = entrance === 1 ? 11.4 : .6;
    for (let i = 0; i < 4; i++) {
      box(`aftershock-crack-${i}`, [edge - .3 + i * .15, .8 + i * .18, 4.9], [.2, .035, .018], '#786757', 'balcony_debris');
      box(`aftershock-plaster-${i}`, [edge - .3 + i * .15, .025, 4.75], [.17, .04, .14], '#d9c4a9', 'balcony_debris');
    }
  }
  return { ...chunk, objects };
}
