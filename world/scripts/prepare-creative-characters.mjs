// Only processes a locally licensed download. Never downloads or publishes assets.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
if (!input) throw new Error('Укажите локальный Creative_Character_free.glb из архива автора');
const source = readFileSync(input);
if (source.readUInt32LE(0) !== 0x46546c67) throw new Error('Ожидается GLB');
const jsonLength = source.readUInt32LE(12);
const doc = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
const bin = source.subarray(28 + jsonLength);
if (doc.buffers.length !== 1 || doc.buffers[0].uri || doc.images.some(i => i.uri)) {
  throw new Error('Текстуры и буферы должны быть встроены');
}
const allowed = /^(Body_010|Male_emotion_(usual_001|happy_002|angry_003)|Hairstyle_male_01[02]|Glasses_00[46]|Moustache_00[12]|Outerwear_0(29|36)|Pants_01[04]|Shorts_003|T_Shirt_009|Shoe_(Slippers_00[25]|Sneakers_009)|Headphones_002|Hat_057)$/;
const keptNodes = new Set(doc.nodes.flatMap((n, i) => n.mesh === undefined || allowed.test(n.name) ? [i] : []));
const meshes = [];
for (const node of doc.nodes) {
  if (node.children) node.children = node.children.filter(i => keptNodes.has(i));
  if (node.mesh === undefined) continue;
  if (!allowed.test(node.name)) { delete node.mesh; delete node.skin; continue; }
  const mesh = doc.meshes[node.mesh];
  node.mesh = meshes.length;
  meshes.push(mesh);
}
doc.meshes = meshes;
const clips = { Idle_Breathing: 'Idle', Walk_Forward: 'Walking_A', Run_Forward: 'Running_A', Death_Backward: 'Lie_Idle' };
doc.animations = doc.animations.filter(a => clips[a.name]).map(a => ({ ...a, name: clips[a.name] }));
for (const name of Object.values(clips)) {
  if (!doc.animations.some(a => a.name === name)) throw new Error(`В архиве нет анимации ${name}; нужен полный Creative_Character_free.glb`);
}
if (!doc.nodes.some(n => n.name === 'Body_010' && n.skin !== undefined)) throw new Error('Нет ожидаемого скелета Body_010');
// Keep only referenced accessors and buffer views; discarded costumes/actions cost no RAM.
const accessors = new Map();
const useAccessor = old => {
  if (!accessors.has(old)) accessors.set(old, structuredClone(doc.accessors[old]));
  return [...accessors.keys()].indexOf(old);
};
for (const mesh of doc.meshes) for (const p of mesh.primitives) {
  for (const key of Object.keys(p.attributes)) p.attributes[key] = useAccessor(p.attributes[key]);
  if (p.indices !== undefined) p.indices = useAccessor(p.indices);
}
for (const skin of doc.skins) skin.inverseBindMatrices = useAccessor(skin.inverseBindMatrices);
for (const a of doc.animations) for (const s of a.samplers) {
  s.input = useAccessor(s.input); s.output = useAccessor(s.output);
}
doc.accessors = [...accessors.values()];
const views = new Map();
const useView = old => {
  if (!views.has(old)) views.set(old, structuredClone(doc.bufferViews[old]));
  return [...views.keys()].indexOf(old);
};
for (const a of doc.accessors) {
  if (a.sparse) throw new Error('Sparse accessors need explicit support');
  a.bufferView = useView(a.bufferView);
}
for (const image of doc.images) image.bufferView = useView(image.bufferView);
let size = 0;
const chunks = [];
for (const view of views.values()) {
  const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const padding = Buffer.alloc((4 - bytes.length % 4) % 4);
  view.byteOffset = size; view.buffer = 0;
  chunks.push(bytes, padding); size += bytes.length + padding.length;
}
doc.bufferViews = [...views.values()];
doc.buffers = [{ byteLength: size }];
doc.asset.copyright = 'ITHappy Studios — licensed for use in the final game; no standalone redistribution';
const json = Buffer.from(JSON.stringify(doc));
const jsonPad = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + jsonPad.length + size, 8);
header.writeUInt32LE(jsonPad.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(size); binHeader.writeUInt32LE(0x004e4942, 4);
const output = fileURLToPath(new URL('../assets/characters/creative/residents.glb', import.meta.url));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.concat([header, jsonPad, binHeader, ...chunks]));
console.log(`Локальные персонажи: ${resolve(output)} (${Math.round((28 + jsonPad.length + size) / 1024)} КиБ). Не добавлять GLB в git.`);
