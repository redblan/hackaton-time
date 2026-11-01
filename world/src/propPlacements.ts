import type { ChunkData, Vec3, WorldObject } from '@game/shared';
import { PALETTE } from './palette';

/** N11: initial positions use box centres, as required by the prop contract. */
export interface PropPlacement {
  id: string;
  preset: string;
  pos: Vec3;
  mass: number;
  bounce: number;
  /** Replace the old static item box rather than leaving an unpickable duplicate. */
  replaces?: string;
}

export function addProps(chunk: ChunkData): ChunkData {
  const placements = propPlacements(chunk);
  if (!placements.length) return chunk;
  const removed = new Set(placements.flatMap(p => p.replaces ? [p.replaces] : []));
  const interactions = new Map(placements.filter(p => p.replaces).map(p => [p.replaces!.replace('prop-', 'item_'), p.pos]));
  const objects = chunk.objects.filter(o => !removed.has(o.id)).map(o => {
    const pos = interactions.get(o.id);
    return o.kind === 'interactable' && pos ? { ...o, pos: [...pos] as Vec3 } : o;
  });
  for (const placement of placements) {
    const preset = PALETTE.find(p => p.id === placement.preset);
    if (!preset) throw new Error(`Unknown prop preset: ${placement.preset}`);
    const object: Extract<WorldObject, { kind: 'prop' }> = {
      id: placement.id, kind: 'prop', pos: [...placement.pos], size: [...preset.size],
      label: preset.label, color: preset.color, mass: placement.mass, bounce: placement.bounce,
    };
    objects.push(object);
  }
  return { ...chunk, objects };
}

export function propPlacements(chunk: ChunkData): PropPlacement[] {
  if (!/^e[12]f[1-9]$/.test(chunk.id)) return [];
  const [x, y] = chunk.bounds.min;
  const definitions: { preset: string; pos: Vec3; mass: number; bounce: number; replaces?: string; name?: string }[] = [
    // On the apartment floor, away from the door and the decorative-only tables.
    // Separate the tall kit from low props so they cannot form steps onto it.
    { preset: 'first_aid_kit', pos: [9, .3, 6.9], mass: 1.2, bounce: .05, replaces: 'prop-first_aid_kit' },
    { preset: 'flashlight', pos: [8.4, .11, 5.9], mass: .3, bounce: .12, replaces: 'prop-flashlight' },
    { preset: 'water', pos: [7.8, .23, 5.9], mass: .6, bounce: .08, replaces: 'prop-water' },
    { preset: 'mug', pos: [7.3, .115, 5.9], mass: .2, bounce: .02, replaces: 'prop-mugs' },
    { preset: 'cardboard_box', name: 'hall-box', pos: [.7, .23, 3.35], mass: 1.5, bounce: .04 },
    { preset: 'cardboard_box', name: 'stair-box', pos: [11.2, .23, .6], mass: 1.5, bounce: .04 },
    { preset: 'extinguisher', pos: [2.8, .375, 3.5], mass: 4.5, bounce: .03 },
    { preset: 'chair', pos: [4.4, .45, 10.5], mass: 3, bounce: .05 },
  ];
  return definitions.map(p => ({ id: `${chunk.id}-prop-${p.name ?? p.preset}`, preset: p.preset,
    pos: [x + p.pos[0], y + p.pos[1], p.pos[2]], mass: p.mass, bounce: p.bounce,
    ...(p.replaces ? { replaces: p.replaces } : {}) }));
}
