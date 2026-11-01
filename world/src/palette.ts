import type { Vec3, WorldObject } from '@game/shared';

type Box = Extract<WorldObject, { kind: 'box' }>;
type Part = { pos: Vec3; size: Vec3; color: string };

/** Local coordinates: origin is the centre of the footprint, Y=0 is the floor. */
export interface PaletteEntry {
  id: string;
  label: string;
  size: Vec3;
  color: string;
  parts: Part[];
}

const cross: Part[] = [
  { pos: [0, .28, -.151], size: [.09, .24, .025], color: '#e6f1df' },
  { pos: [0, .28, -.151], size: [.24, .09, .025], color: '#e6f1df' },
];

/** N14: offline, box-based presets; no new model loader or shared contract needed. */
export const PALETTE: PaletteEntry[] = [
  { id: 'first_aid_kit', label: 'Аптечка', size: [.5, .56, .33], color: '#b83c36', parts: [
    { pos: [0, .24, 0], size: [.5, .4, .3], color: '#b83c36' },
    { pos: [0, .5, 0], size: [.24, .12, .08], color: '#ded9c7' }, ...cross,
  ] },
  { id: 'flashlight', label: 'Фонарь', size: [.18, .18, .42], color: '#e2b64a', parts: [
    { pos: [0, .09, .04], size: [.12, .12, .32], color: '#e2b64a' },
    { pos: [0, .09, -.14], size: [.18, .18, .12], color: '#354552' },
    { pos: [0, .09, -.205], size: [.13, .13, .01], color: '#f5edbd' },
  ] },
  { id: 'water', label: 'Бутылка воды', size: [.16, .42, .16], color: '#74b8ca', parts: [
    { pos: [0, .18, 0], size: [.16, .36, .16], color: '#74b8ca' },
    { pos: [0, .39, 0], size: [.09, .06, .09], color: '#d5e7e4' },
  ] },
  { id: 'cardboard_box', label: 'Картонная коробка', size: [.55, .46, .5], color: '#ba8e5c', parts: [
    { pos: [0, .225, 0], size: [.55, .45, .5], color: '#ba8e5c' },
    { pos: [0, .452, 0], size: [.1, .004, .5], color: '#e0c295' },
  ] },
  { id: 'extinguisher', label: 'Огнетушитель', size: [.26, .75, .26], color: '#bf4035', parts: [
    { pos: [0, .28, 0], size: [.24, .56, .24], color: '#bf4035' },
    { pos: [0, .59, 0], size: [.1, .08, .1], color: '#343d42' },
    { pos: [0, .7, 0], size: [.26, .1, .06], color: '#343d42' },
    { pos: [0, .3, -.123], size: [.16, .2, .02], color: '#e9e3cd' },
  ] },
  { id: 'chair', label: 'Стул', size: [.48, .9, .5], color: '#98704f', parts: [
    { pos: [0, .45, 0], size: [.48, .08, .48], color: '#98704f' },
    { pos: [0, .72, .21], size: [.48, .36, .08], color: '#98704f' },
    ...[-.18, .18].flatMap(x => [-.18, .18].map(z => ({ pos: [x, .215, z] as Vec3, size: [.06, .43, .06] as Vec3, color: '#74513a' }))),
  ] },
  { id: 'mug', label: 'Кружка', size: [.22, .19, .16], color: '#e7dfc4', parts: [
    { pos: [0, .09, 0], size: [.14, .18, .16], color: '#e7dfc4' },
    { pos: [.105, .09, 0], size: [.07, .12, .06], color: '#e7dfc4' },
    { pos: [0, .181, 0], size: [.1, .005, .12], color: '#65513c' },
  ] },
  { id: 'blankets', label: 'Сложенные одеяла', size: [.8, .2, .6], color: '#71928e', parts: [
    { pos: [0, .05, 0], size: [.8, .1, .6], color: '#71928e' },
    { pos: [.02, .15, 0], size: [.74, .1, .56], color: '#d0b385' },
  ] },
  { id: 'ladder', label: 'Приставная лестница', size: [.65, 2.6, .12], color: '#c3c6be', parts: [
    ...[-.29, .29].map(x => ({ pos: [x, 1.3, 0] as Vec3, size: [.07, 2.6, .12] as Vec3, color: '#c3c6be' })),
    ...Array.from({ length: 8 }, (_, i) => ({ pos: [0, .2 + i * .3, 0] as Vec3, size: [.58, .06, .1] as Vec3, color: '#c3c6be' })),
  ] },
  { id: 'first_aid_cabinet', label: 'Шкафчик с аптечкой', size: [.8, 1.6, .4], color: '#d9e0d2', parts: [
    { pos: [0, .8, .16], size: [.8, 1.6, .08], color: '#d9e0d2' },
    ...[-.37, .37].map(x => ({ pos: [x, .8, 0] as Vec3, size: [.06, 1.6, .4] as Vec3, color: '#d9e0d2' })),
    ...[.04, .75, 1.56].map(y => ({ pos: [0, y, 0] as Vec3, size: [.8, .08, .4] as Vec3, color: '#d9e0d2' })),
  ] },
  { id: 'barrier', label: 'Ограждение', size: [1.6, 1, .3], color: '#cf9d50', parts: [
    { pos: [0, .75, 0], size: [1.6, .3, .12], color: '#cf9d50' },
    ...[-.65, .65].map(x => ({ pos: [x, .4, 0] as Vec3, size: [.1, .8, .3] as Vec3, color: '#555f65' })),
  ] },
];

/** Stable prefix avoids collisions when an admin places the same preset twice. */
export function paletteObjects(presetId: string, instanceId: string, pos: Vec3, rotY = 0, collide = true): Box[] {
  const preset = PALETTE.find(entry => entry.id === presetId);
  if (!preset) throw new Error(`Unknown palette preset: ${presetId}`);
  if (!instanceId.trim()) throw new Error('Palette instance id is required');
  const cos = Math.cos(rotY), sin = Math.sin(rotY);
  return preset.parts.map((part, i) => ({
    id: `${instanceId}-${i}`, kind: 'box',
    pos: [pos[0] + cos * part.pos[0] + sin * part.pos[2], pos[1] + part.pos[1], pos[2] - sin * part.pos[0] + cos * part.pos[2]],
    size: [...part.size], color: part.color, rotY, collide,
  }));
}
