import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { AnimationMixer, Box3, SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

for (const name of ['mage', 'rogue']) {
  it(`${name}: offline skinned model with playable gameplay clips`, async () => {
    const data = readFileSync(new URL(`../assets/characters/${name}.glb`, import.meta.url));
    const manifest = JSON.parse(readFileSync(new URL('../assets/characters/manifest.json', import.meta.url), 'utf8'));
    const entry = manifest.models.find((model: { id: string }) => model.id === name);
    expect(entry.bytes).toBe(data.length);
    expect(entry.sha256).toBe(createHash('sha256').update(data).digest('hex'));
    expect(data.readUInt32LE(0)).toBe(0x46546c67);
    expect(data.readUInt32LE(8)).toBe(data.length);
    expect(data.length).toBeLessThan(1024 * 1024);
    const jsonLength = data.readUInt32LE(12);
    const doc = JSON.parse(data.subarray(20, 20 + jsonLength).toString());
    const bin = data.subarray(28 + jsonLength);
    expect(doc.buffers).toEqual([{ byteLength: bin.length }]);
    for (const view of doc.bufferViews) {
      expect(view.buffer).toBe(0);
      expect(view.byteOffset + view.byteLength).toBeLessThanOrEqual(bin.length);
    }
    for (const image of doc.images) {
      expect(image.uri).toBeUndefined();
      expect(image.mimeType).toBe('image/png');
      const view = doc.bufferViews[image.bufferView];
      expect(bin.subarray(view.byteOffset, view.byteOffset + 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
    // Node has no image decoder. Preserve geometry/rig/animations and test them
    // with the actual client loader; embedded PNG payload is checked above.
    doc.images = []; doc.textures = []; doc.materials = [];
    for (const mesh of doc.meshes) for (const primitive of mesh.primitives) delete primitive.material;
    const json = Buffer.from(JSON.stringify(doc));
    const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
    const head = Buffer.from(data.subarray(0, 20));
    head.writeUInt32LE(28 + padded.length + bin.length, 8);
    head.writeUInt32LE(padded.length, 12);
    const glb = Buffer.concat([head, padded, data.subarray(20 + jsonLength, 28 + jsonLength), bin]);
    const scene = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
    let skinned = 0;
    scene.scene.traverse(node => { if (node instanceof SkinnedMesh) { skinned++; expect(node.skeleton.bones.length).toBeGreaterThan(10); } });
    expect(skinned).toBeGreaterThan(0);
    expect(scene.animations.map(a => a.name)).toEqual(['Idle', 'Walking_A', 'Running_A', 'Lie_Idle', 'Sit_Floor_Idle', 'Interact', 'Cheer']);
    const mixer = new AnimationMixer(scene.scene);
    for (const clip of scene.animations) {
      expect(clip.validate()).toBe(true);
      expect(clip.duration).toBeGreaterThan(0);
      mixer.clipAction(clip).play(); mixer.update(clip.duration / 2);
      scene.scene.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(scene.scene);
      expect(Number.isFinite(bounds.min.y)).toBe(true);
      expect(bounds.max.y).toBeGreaterThan(bounds.min.y);
      mixer.stopAllAction();
    }
  });
}
