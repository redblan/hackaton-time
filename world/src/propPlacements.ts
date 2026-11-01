import type { ChunkData, Vec3 } from '@game/shared';

/** N11 plan. Conversion to kind:prop waits for the owner's shared contract. */
export interface PropPlacement {
  id: string;
  preset: string;
  pos: Vec3;
  mass: number;
  bounce: number;
  /** Replace the old static item box rather than leaving an unpickable duplicate. */
  replaces?: string;
}

export function propPlacements(chunk: ChunkData): PropPlacement[] {
  if (!/^e[12]f[1-9]$/.test(chunk.id)) return [];
  const [x, y] = chunk.bounds.min;
  const definitions: { preset: string; pos: Vec3; mass: number; bounce: number; replaces?: string; name?: string }[] = [
    // On the apartment floor, away from the door and the decorative-only tables.
    { preset: 'first_aid_kit', pos: [9, .3, 5.9], mass: 1.2, bounce: .05, replaces: 'prop-first_aid_kit' },
    { preset: 'flashlight', pos: [8.4, .11, 5.9], mass: .3, bounce: .12, replaces: 'prop-flashlight' },
    { preset: 'water', pos: [7.8, .23, 5.9], mass: .6, bounce: .08, replaces: 'prop-water' },
    { preset: 'mug', pos: [7.3, .115, 5.9], mass: .2, bounce: .02, replaces: 'prop-mugs' },
    { preset: 'cardboard_box', name: 'hall-box', pos: [.7, .23, 3.35], mass: 1.5, bounce: .04 },
    { preset: 'cardboard_box', name: 'stair-box', pos: [11.2, .23, 2.5], mass: 1.5, bounce: .04 },
    { preset: 'extinguisher', pos: [.55, .375, 4.4], mass: 4.5, bounce: .03 },
    { preset: 'chair', pos: [4.4, .45, 10.5], mass: 3, bounce: .05 },
  ];
  return definitions.map(p => ({ id: `${chunk.id}-prop-${p.name ?? p.preset}`, preset: p.preset,
    pos: [x + p.pos[0], y + p.pos[1], p.pos[2]], mass: p.mass, bounce: p.bounce,
    ...(p.replaces ? { replaces: p.replaces } : {}) }));
}
