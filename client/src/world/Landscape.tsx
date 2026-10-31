/**
 * Неигровой фон вокруг дома: каньон, сосны, трава. Это не данные мира: геометрия считается
 * на клиенте из seed и не занимает лимит чанков. Рисуется четырьмя вызовами, на всё инстансинг.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  type InstancedMesh,
} from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { paintGround, paintRock, PALETTE, seededRandom } from "./style";

const CENTER = { x: 18, z: -18 };
const PLAY_AREA = { minX: -6, maxX: 42, minZ: -54, maxZ: 18 };

const insidePlayArea = (x: number, z: number) =>
  x > PLAY_AREA.minX && x < PLAY_AREA.maxX && z > PLAY_AREA.minZ && z < PLAY_AREA.maxZ;

function tinted(geometry: BufferGeometry, color: string, shade = 1) {
  const count = geometry.attributes.position!.count;
  const c = new Color(color).multiplyScalar(shade);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return geometry;
}

/** Камень: сглаженный икосаэдр со смещёнными вершинами и уступами, как у песчаника. */
function rockGeometry() {
  const sphere = new IcosahedronGeometry(1, 5);
  sphere.deleteAttribute("normal");
  sphere.deleteAttribute("uv");
  const geometry = mergeVertices(sphere);
  const position = geometry.attributes.position!;
  for (let i = 0; i < position.count; i++) {
    const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
    const bump = 1 + 0.16 * Math.sin(x * 4.1 + z * 3.3) + 0.1 * Math.sin(y * 7.3 + x * 5.1) + 0.07 * Math.cos(z * 9.2);
    const shelf = Math.round(y * 4) / 4;
    position.setXYZ(i, x * bump, (y * 0.45 + shelf * 0.55) * bump, z * bump);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function pineGeometry() {
  const tiers = [
    { radius: 1.5, height: 2.3, y: 2.3, shade: 0.8 },
    { radius: 1.2, height: 2.0, y: 3.6, shade: 0.95 },
    { radius: 0.85, height: 1.7, y: 4.8, shade: 1.1 },
    { radius: 0.5, height: 1.3, y: 5.9, shade: 1.25 },
  ];
  const parts = tiers.map(({ radius, height, y, shade }) =>
    tinted(new ConeGeometry(radius, height, 8).translate(0, y, 0), PALETTE.pine, shade),
  );
  const trunk = tinted(new CylinderGeometry(0.16, 0.26, 2, 6).translate(0, 1, 0), PALETTE.trunk);
  return mergeGeometries([trunk, ...parts].map((g) => g.toNonIndexed()));
}

function tuftGeometry() {
  const blades = [0, 1, 2].map((i) => {
    const blade = new ConeGeometry(0.1, 0.55, 3).translate(0, 0.27, 0);
    blade.rotateZ(0.25).rotateY((i * Math.PI * 2) / 3);
    return tinted(blade, PALETTE.grass, 0.95 + i * 0.1).toNonIndexed();
  });
  return mergeGeometries(blades);
}

function useInstances(ref: React.RefObject<InstancedMesh | null>, matrices: Matrix4[]) {
  useLayoutEffect(() => {
    if (!ref.current) return;
    matrices.forEach((m, i) => ref.current!.setMatrixAt(i, m));
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [ref, matrices]);
}

function place(x: number, y: number, z: number, scale: [number, number, number], rotY: number) {
  const o = new Object3D();
  o.position.set(x, y, z);
  o.scale.set(...scale);
  o.rotation.y = rotY;
  o.updateMatrix();
  return o.matrix.clone();
}

function Rocks() {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(rockGeometry, []);
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ roughness: 0.95, emissive: "#8a4520", emissiveIntensity: 0.35 });
    paintRock(m);
    return m;
  }, []);
  const matrices = useMemo(() => {
    const random = seededRandom(7);
    const out: Matrix4[] = [];
    for (let i = 0; i < 34; i++) {
      const angle = (i / 34) * Math.PI * 2 + random() * 0.3;
      const distance = 105 + random() * 70;
      const height = 26 + random() * 52;
      out.push(
        place(
          CENTER.x + Math.cos(angle) * distance,
          height * 0.2,
          CENTER.z + Math.sin(angle) * distance,
          [34 + random() * 34, height, 30 + random() * 34],
          random() * Math.PI,
        ),
      );
    }
    for (let i = 0; i < 22; i++) {
      const angle = random() * Math.PI * 2;
      const distance = 62 + random() * 34;
      const x = CENTER.x + Math.cos(angle) * distance;
      const z = CENTER.z + Math.sin(angle) * distance;
      if (insidePlayArea(x, z)) continue;
      const size = 2 + random() * 5;
      out.push(place(x, size * 0.25, z, [size * 1.4, size, size * 1.2], random() * Math.PI));
    }
    return out;
  }, []);
  useInstances(ref, matrices);
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} receiveShadow frustumCulled={false} />;
}

function Pines() {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(pineGeometry, []);
  const matrices = useMemo(() => {
    const random = seededRandom(21);
    const out: Matrix4[] = [];
    while (out.length < 130) {
      const angle = random() * Math.PI * 2;
      const distance = 34 + random() * 82;
      const x = CENTER.x + Math.cos(angle) * distance;
      const z = CENTER.z + Math.sin(angle) * distance;
      if (insidePlayArea(x, z)) continue;
      const scale = 1.3 + random() * 1.4;
      out.push(place(x, 0, z, [scale, scale * (0.9 + random() * 0.4), scale], random() * Math.PI));
    }
    return out;
  }, []);
  useInstances(ref, matrices);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, matrices.length]} castShadow receiveShadow frustumCulled={false}>
      <meshStandardMaterial vertexColors roughness={0.9} flatShading />
    </instancedMesh>
  );
}

function Grass() {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(tuftGeometry, []);
  const matrices = useMemo(() => {
    const random = seededRandom(3);
    const out: Matrix4[] = [];
    while (out.length < 1400) {
      const x = CENTER.x + (random() - 0.5) * 120;
      const z = CENTER.z + (random() - 0.5) * 120;
      if (insidePlayArea(x, z)) continue;
      const scale = 0.7 + random() * 1.1;
      out.push(place(x, 0, z, [scale, scale * (0.8 + random() * 0.8), scale], random() * Math.PI));
    }
    return out;
  }, []);
  useInstances(ref, matrices);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, matrices.length]} frustumCulled={false}>
      <meshStandardMaterial vertexColors roughness={1} flatShading />
    </instancedMesh>
  );
}

function Ground() {
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ roughness: 1 });
    paintGround(m);
    return m;
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[CENTER.x, -0.22, CENTER.z]} material={material} receiveShadow>
      <circleGeometry args={[270, 48]} />
    </mesh>
  );
}

export function Landscape() {
  return (
    <group name="landscape">
      <Ground />
      <Rocks />
      <Pines />
      <Grass />
    </group>
  );
}
