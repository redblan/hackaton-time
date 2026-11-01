import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { AnimationMixer, Box3, SkinnedMesh } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RESIDENTS, residentParts, type ResidentStyle } from '../../client/src/world/characterPresets';

const localPack = new URL('../assets/characters/creative/residents.glb', import.meta.url);
// Vendor assets cannot be redistributed in the public repository. Run after local installation.
it.skipIf(!existsSync(localPack))('locally installed ITHappy pack loads every resident and keeps independent, animated skeletons', async () => {
  const data = readFileSync(localPack);
  expect(data.length).toBeLessThan(2 * 1024 * 1024);
  const jsonLength = data.readUInt32LE(12);
  const doc = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
  expect(doc.buffers).toHaveLength(1);
  expect(doc.buffers[0].uri).toBeUndefined();
  expect(doc.images.length).toBeGreaterThan(0);
  for (const image of doc.images) { expect(image.uri).toBeUndefined(); expect(image.mimeType).toBe('image/png'); }
  const names = new Set(doc.nodes.filter((n: { mesh?: number }) => n.mesh !== undefined).map((n: { name: string }) => n.name));
  for (const style of Object.values(RESIDENTS) as ResidentStyle[]) {
    for (const part of residentParts(style)) expect(names.has(part), `${style.label}: ${part}`).toBe(true);
  }
  // Decode rig/animations with the same loader as the browser; PNGs verified above.
  doc.images = []; doc.textures = []; doc.materials = [];
  for (const mesh of doc.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  const json = Buffer.from(JSON.stringify(doc));
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const header = Buffer.from(data.subarray(0, 20));
  const bin = data.subarray(28 + jsonLength);
  header.writeUInt32LE(28 + padded.length + bin.length, 8); header.writeUInt32LE(padded.length, 12);
  const glb = Buffer.concat([header, padded, data.subarray(20 + jsonLength, 28 + jsonLength), bin]);
  const loaded = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  expect(loaded.animations.map(a => a.name).sort()).toEqual(['Idle', 'Lie_Idle', 'Running_A', 'Walking_A']);
  const first = clone(loaded.scene); const second = clone(loaded.scene);
  const firstBody = first.getObjectByName('Body_010') as SkinnedMesh;
  const secondBody = second.getObjectByName('Body_010') as SkinnedMesh;
  expect(firstBody.skeleton.bones.length).toBeGreaterThan(40);
  expect(firstBody.skeleton.bones[0]).not.toBe(secondBody.skeleton.bones[0]);
  const untouched = second.getObjectByName('Hips')!.quaternion.clone();
  const mixer = new AnimationMixer(first);
  for (const clip of loaded.animations) {
    expect(clip.validate()).toBe(true);
    mixer.clipAction(clip).play(); mixer.setTime(clip.duration / 2);
    first.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(first, true);
    expect(Number.isFinite(bounds.min.y)).toBe(true);
    expect(bounds.max.y).toBeGreaterThan(bounds.min.y);
    expect(second.getObjectByName('Hips')!.quaternion.equals(untouched)).toBe(true);
    mixer.stopAllAction();
  }
});
