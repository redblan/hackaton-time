import { useLayoutEffect, useMemo, useRef } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { AnimationClip, AnimationMixer, Bone, Box3, Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, QuaternionKeyframeTrack, SphereGeometry, TorusGeometry, Vector3, VectorKeyframeTrack, type Object3D } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RESIDENTS, residentParts, type Resident, type ResidentStyle } from './characterPresets';

// Vite includes a licensed local file in the final game only when it exists.
// A public checkout with no vendor download still builds and uses CC0 characters.
const packs = import.meta.glob('../../../world/assets/characters/creative/residents.glb', {
  eager: true, query: '?url', import: 'default',
});
export const residentModelUrl = Object.values(packs)[0] as string | undefined;
const solid = new Map<string, MeshStandardMaterial>();
function material(color: string) {
  let result = solid.get(color);
  if (!result) { result = new MeshStandardMaterial({ color: new Color(color), roughness: 0.85 }); solid.set(color, result); }
  return result;
}
const bunGeometry = new SphereGeometry(0.09, 10, 8);
const scarfGeometry = new TorusGeometry(0.115, 0.035, 6, 16);
const scarfTailGeometry = new ConeGeometry(0.065, 0.16, 3);
const earringGeometry = new TorusGeometry(0.022, 0.006, 5, 10);
const helmetGeometry = new SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const helmetBrimGeometry = new CylinderGeometry(0.18, 0.18, 0.02, 12);

function dress(scene: Object3D, style: ResidentStyle) {
  const body = clone(scene);
  const wanted = residentParts(style);
  const remove: Mesh[] = [];
  body.traverse(node => {
    if (!(node instanceof Mesh)) return;
    // Multi-material GLTF parts (glasses) are a named group with unnamed meshes.
    const part = wanted.has(node.name) ? node.name : node.parent && wanted.has(node.parent.name) ? node.parent.name : undefined;
    if (!part) { remove.push(node); return; }
    node.castShadow = true; node.frustumCulled = false;
    let color: string | undefined;
    if (/Hairstyle|Moustache/.test(part)) color = style.hairColor;
    if (/Outerwear|T_Shirt/.test(part)) color = style.coat;
    if (/Pants|Shorts/.test(part)) color = style.trousers;
    if (color) node.material = material(color);
  });
  remove.forEach(node => node.removeFromParent());
  if (style.helmet) {
    for (const geometry of [helmetGeometry, helmetBrimGeometry]) {
      const helmet = new Mesh(geometry, material('#e5b854'));
      helmet.name = 'Resident_helmet'; helmet.position.y = 0.24; helmet.castShadow = true;
      body.getObjectByName('Head')?.add(helmet);
    }
  }
  if (style.bun) {
    const bun = new Mesh(bunGeometry, material(style.hairColor));
    bun.name = 'Resident_bun'; bun.position.set(0, 0.19, -0.12); bun.castShadow = true;
    body.getObjectByName('Head')?.add(bun);
    for (const sign of [-1, 1]) {
      const lock = new Mesh(bunGeometry, material(style.hairColor));
      lock.name = 'Resident_hair_lock'; lock.scale.set(0.55, 1.2, 0.8);
      lock.position.set(sign * 0.11, 0.14, -0.015);
      body.getObjectByName('Head')?.add(lock);
      const earring = new Mesh(earringGeometry, material('#d8ae52'));
      earring.name = 'Resident_earring'; earring.position.set(sign * 0.125, 0.065, 0.01);
      body.getObjectByName('Head')?.add(earring);
    }
  }
  if (style.scarf) {
    const scarf = new Mesh(scarfGeometry, material(style.scarf));
    scarf.name = 'Resident_scarf'; scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.04;
    body.getObjectByName('Neck')?.add(scarf);
    const tail = new Mesh(scarfTailGeometry, material(style.scarf));
    tail.name = 'Resident_scarf_tail'; tail.rotation.z = Math.PI;
    tail.scale.z = 0.2; tail.position.set(0, -0.055, 0.13);
    body.getObjectByName('Neck')?.add(tail);
  }
  return body;
}

/** Freeze a supplied pose into a looping clip: no fall/death animation during play. */
function still(clip: AnimationClip, name: string) {
  return new AnimationClip(name, 1, clip.tracks.map(track => {
    const values = track.values.slice(-track.getValueSize());
    const result = track.clone();
    result.times = new Float32Array([0, 1]); result.values = new Float32Array([...values, ...values]);
    return result;
  }));
}

/** A floor-seated pose on the same rig, without changing the world contract. */
function seated(body: Object3D, idle: AnimationClip) {
  const mixer = new AnimationMixer(body);
  mixer.clipAction(idle).play(); mixer.setTime(0);
  mixer.stopAllAction();
  // stopAllAction restores bind transforms; sample once more and keep the pose.
  mixer.clipAction(idle).play(); mixer.setTime(0);
  const hips = body.getObjectByName('Hips')!;
  hips.position.y = 0.23;
  body.updateMatrixWorld(true);
  const up = new Vector3(0, 1, 0);
  const point = (name: string, direction: Vector3) => {
    const bone = body.getObjectByName(name)!;
    const parent = bone.parent!.getWorldQuaternion(new Quaternion());
    bone.quaternion.copy(parent.invert().multiply(new Quaternion().setFromUnitVectors(up, direction.normalize())));
    body.updateMatrixWorld(true);
  };
  for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
    point(`${side}UpLeg`, new Vector3(sign * 0.15, 0.12, 0.32));
    point(`${side}Leg`, new Vector3(0, -0.23, 0.3));
  }
  const tracks: (QuaternionKeyframeTrack | VectorKeyframeTrack)[] = [];
  body.traverse(node => {
    if (!(node instanceof Bone)) return;
    const q = node.quaternion.toArray(); const p = node.position.toArray();
    tracks.push(new QuaternionKeyframeTrack(`${node.name}.quaternion`, [0, 1], [...q, ...q]));
    tracks.push(new VectorKeyframeTrack(`${node.name}.position`, [0, 1], [...p, ...p]));
  });
  mixer.stopAllAction(); mixer.uncacheRoot(body);
  return new AnimationClip('Sit_Floor_Idle', 1, tracks);
}

export function ResidentModel({ variant, anim, pose }: { variant: Resident; anim: 'idle' | 'walk' | 'run'; pose: 'stand' | 'lie' | 'sit' }) {
  const root = useRef<Group>(null);
  const { scene, animations } = useGLTF(residentModelUrl!, false, false);
  const prepared = useMemo(() => {
    const style: ResidentStyle = RESIDENTS[variant];
    const body = dress(scene, style);
    const idle = animations.find(a => a.name === 'Idle')!;
    const lie = still(animations.find(a => a.name === 'Lie_Idle')!, 'Lie_Idle');
    const sit = seated(body, idle);
    const clips = [...animations.filter(a => a.name !== 'Lie_Idle'), lie, sit];
    const sample = new AnimationMixer(body);
    sample.clipAction(idle).play(); sample.setTime(0);
    body.updateMatrixWorld(true);
    const box = new Box3().setFromObject(body, true);
    const scale = style.height / box.getSize(new Vector3()).y;
    sample.stopAllAction();
    sample.clipAction(pose === 'lie' ? lie : pose === 'sit' ? sit : idle).play(); sample.setTime(0);
    body.updateMatrixWorld(true);
    const floor = new Box3().setFromObject(body, true).min.y;
    sample.stopAllAction(); sample.uncacheRoot(body);
    return { body, clips, scale, offset: -floor * scale };
  }, [scene, animations, variant, pose]);
  const { actions } = useAnimations(prepared.clips, root);
  const clip = pose === 'lie' ? 'Lie_Idle' : pose === 'sit' ? 'Sit_Floor_Idle' : { idle: 'Idle', walk: 'Walking_A', run: 'Running_A' }[anim];
  useLayoutEffect(() => {
    const action = actions[clip];
    action?.reset();
    if (pose === 'stand') action?.fadeIn(0.15);
    action?.play();
    return () => { action?.fadeOut(0.15); };
  }, [actions, clip, pose]);
  return <group ref={root} rotation-y={Math.PI} position-y={prepared.offset} scale={prepared.scale}>
    <primitive object={prepared.body} dispose={null} />
  </group>;
}
