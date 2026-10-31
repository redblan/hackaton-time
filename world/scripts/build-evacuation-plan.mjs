import { readFileSync, writeFileSync } from 'node:fs';
// Embedded PNG on an unlit plane: readable with the existing model renderer.
for (const entrance of [1, 2]) {
  const parts = [], views = [];
  let offset = 0;
  const add = data => {
    const index = views.length;
    views.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
    const padding = Buffer.alloc((4 - data.length % 4) % 4);
    parts.push(data, padding); offset += data.length + padding.length;
    return index;
  };
  const positions = add(Buffer.from(new Float32Array([-1.3,0,0, 1.3,0,0, 1.3,1.8,0, -1.3,1.8,0]).buffer));
  const uv = add(Buffer.from(new Float32Array([0,1, 1,1, 1,0, 0,0]).buffer));
  const indices = add(Buffer.from(new Uint16Array([0,1,2,0,2,3]).buffer));
  const png = add(readFileSync(new URL(`../assets/signs/evacuation-e${entrance}.png`, import.meta.url)));
  const doc = {
    asset: { version: '2.0', generator: 'hackaton-time evacuation plan' },
    extensionsUsed: ['KHR_materials_unlit'],
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    accessors: [
      { bufferView: positions, componentType: 5126, count: 4, type: 'VEC3', min: [-1.3,0,0], max: [1.3,1.8,0] },
      { bufferView: uv, componentType: 5126, count: 4, type: 'VEC2' },
      { bufferView: indices, componentType: 5123, count: 6, type: 'SCALAR' },
    ],
    materials: [{ doubleSided: false, extensions: { KHR_materials_unlit: {} }, pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 } }],
    textures: [{ source: 0 }], images: [{ bufferView: png, mimeType: 'image/png' }],
    bufferViews: views, buffers: [{ byteLength: offset }],
  };
  const json = Buffer.from(JSON.stringify(doc));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2,4);
  header.writeUInt32LE(28+padded.length+offset,8);
  header.writeUInt32LE(padded.length,12); header.writeUInt32LE(0x4e4f534a,16);
  const bin = Buffer.alloc(8); bin.writeUInt32LE(offset); bin.writeUInt32LE(0x004e4942,4);
  writeFileSync(new URL(`../assets/signs/evacuation-e${entrance}.glb`, import.meta.url), Buffer.concat([header,padded,bin,...parts]));
}
