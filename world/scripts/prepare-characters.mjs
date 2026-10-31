// Usage: node world/scripts/prepare-characters.mjs <directory with Mage.glb and Rogue.glb>
// Retain gameplay clips and repack referenced accessors/views; no new dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const clips = ['Idle', 'Walking_A', 'Running_A', 'Lie_Idle', 'Sit_Floor_Idle', 'Interact', 'Cheer'];
for (const name of ['Mage', 'Rogue']) {
  const source = readFileSync(resolve(process.argv[2], `${name}.glb`));
  const jsonLength = source.readUInt32LE(12);
  const doc = JSON.parse(source.subarray(20, 20 + jsonLength));
  const binary = source.subarray(28 + jsonLength);
  doc.animations = clips.map(name => {
    const clip = doc.animations.find(a => a.name === name);
    if (!clip) throw new Error(`Missing clip: ${name}`);
    return clip;
  });
  const accessors = new Map();
  const accessor = index => {
    if (!accessors.has(index)) accessors.set(index, accessors.size);
    return accessors.get(index);
  };
  for (const mesh of doc.meshes) for (const p of mesh.primitives) {
    for (const key of Object.keys(p.attributes)) p.attributes[key] = accessor(p.attributes[key]);
    if (p.indices !== undefined) p.indices = accessor(p.indices);
    for (const target of p.targets ?? []) for (const key of Object.keys(target)) target[key] = accessor(target[key]);
  }
  for (const skin of doc.skins) skin.inverseBindMatrices = accessor(skin.inverseBindMatrices);
  for (const a of doc.animations) for (const s of a.samplers) {
    s.input = accessor(s.input); s.output = accessor(s.output);
  }
  doc.accessors = [...accessors.keys()].map(i => doc.accessors[i]);
  const views = new Map();
  const view = index => {
    if (!views.has(index)) views.set(index, views.size);
    return views.get(index);
  };
  for (const a of doc.accessors) {
    if (a.sparse) throw new Error('Sparse accessor requires explicit repacking');
    if (a.bufferView !== undefined) a.bufferView = view(a.bufferView);
  }
  for (const image of doc.images ?? []) image.bufferView = view(image.bufferView);
  const parts = [];
  let offset = 0;
  doc.bufferViews = [...views.keys()].map(i => {
    const v = doc.bufferViews[i];
    const data = binary.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
    const padding = Buffer.alloc((4 - data.length % 4) % 4);
    const result = { ...v, buffer: 0, byteOffset: offset };
    parts.push(data, padding); offset += data.length + padding.length;
    return result;
  });
  doc.buffers = [{ byteLength: offset }];
  const json = Buffer.from(JSON.stringify(doc));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + padded.length + offset, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(offset); binHeader.writeUInt32LE(0x004e4942, 4);
  const output = Buffer.concat([header, padded, binHeader, ...parts]);
  writeFileSync(new URL(`../assets/characters/${name.toLowerCase()}.glb`, import.meta.url), output);
  console.log(`${name}: ${source.length} -> ${output.length} bytes; ${clips.join(', ')}`);
}
