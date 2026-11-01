/** Эффекты без файлов: мягкие частицы из canvas-текстуры, подсветка интерактива. */
import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  NormalBlending,
  Object3D,
  PointsMaterial,
  type InstancedMesh,
  type Points,
} from "three";
import type { WorldObject } from "@game/shared";
import { useFireLight } from "./LocalLights";

type Fx = Extract<WorldObject, { kind: "fx" }>;
export type Interact = Extract<WorldObject, { kind: "interactable" }>;

let softDot: CanvasTexture | null = null;

export function softTexture() {
  if (softDot) return softDot;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.45, "rgba(255,255,255,.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  softDot = new CanvasTexture(canvas);
  return softDot;
}

const FX_LOOK: Record<Fx["fx"], { color: string; size: number; speed: number; count: number; opacity: number; glow: boolean; rise: number }> = {
  // высокое пламя: огонь в коридоре, его должно быть видно с лестницы поверх парапета в 1 м
  fire: { color: "#ff8a2b", size: 0.8, speed: 0.9, count: 70, opacity: 0.8, glow: true, rise: 3.4 },
  smoke: { color: "#6d6660", size: 1.5, speed: 0.22, count: 36, opacity: 0.4, glow: false, rise: 2.4 },
  sparks: { color: "#ffe98a", size: 0.13, speed: 1.8, count: 40, opacity: 0.95, glow: true, rise: 1.5 },
  dust: { color: "#d4b998", size: 0.9, speed: 0.2, count: 30, opacity: 0.32, glow: false, rise: 1 },
};

function FireGlow({ object }: { object: Fx }) {
  useFireLight(object.pos);
  return null;
}

/** Материалы частиц общие и живут всегда: удалённый шейдер пришлось бы собирать заново. */
const fxMaterials = new Map<Fx["fx"], PointsMaterial>();

function fxMaterial(fx: Fx["fx"]) {
  let material = fxMaterials.get(fx);
  if (!material) {
    const look = FX_LOOK[fx];
    material = new PointsMaterial({
      map: softTexture(),
      color: look.color,
      size: look.size,
      transparent: true,
      opacity: look.opacity,
      depthWrite: false,
      blending: look.glow ? AdditiveBlending : NormalBlending,
    });
    fxMaterials.set(fx, material);
  }
  return material;
}

export function FxParticles({ object }: { object: Fx }) {
  const look = FX_LOOK[object.fx];
  const ref = useRef<Points>(null);
  const positions = useMemo(() => new Float32Array(look.count * 3), [look.count]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const spread = object.size ?? 1;
    for (let i = 0; i < look.count; i++) {
      const phase = (t * look.speed + i / look.count) % 1;
      const width = spread * (0.2 + phase * 0.45);
      positions[i * 3] = Math.sin(i * 17.3 + t * 0.4) * width;
      positions[i * 3 + 1] = phase * spread * look.rise;
      positions[i * 3 + 2] = Math.cos(i * 9.7 + t * 0.3) * width;
    }
    if (ref.current) ref.current.geometry.attributes.position!.needsUpdate = true;
  });
  return (
    <group position={object.pos}>
      <points ref={ref} frustumCulled={false} material={fxMaterial(object.fx)} dispose={null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
      </points>
      {object.fx === "fire" && <FireGlow object={object} />}
    </group>
  );
}

const MARKER_IDLE = new Color("#facc15").multiplyScalar(1.1);
const MARKER_NEAR = new Color("#facc15").multiplyScalar(2.6);
const marker = new Object3D();

/** Метки интерактива всего чанка одним вызовом: рядом с игроком метка растёт и светится ярче. */
export function InteractMarkers({ objects }: { objects: Interact[] }) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    objects.forEach((_, i) => mesh.current?.setColorAt(i, MARKER_IDLE));
  }, [objects]);
  useFrame(({ camera, clock }) => {
    const markers = mesh.current;
    if (!markers) return;
    const t = clock.elapsedTime;
    objects.forEach((object, i) => {
      const [x, y, z] = object.pos;
      const near = Math.hypot(camera.position.x - x, camera.position.z - z) < object.radius + 0.6
        && Math.abs(camera.position.y - y) < 2.5;
      marker.position.set(x, y + 0.6 + Math.sin(t * 2 + x) * 0.05, z);
      marker.scale.setScalar(near ? 1.5 + Math.sin(t * 6) * 0.25 : 1);
      marker.updateMatrix();
      markers.setMatrixAt(i, marker.matrix);
      markers.setColorAt(i, near ? MARKER_NEAR : MARKER_IDLE);
    });
    markers.instanceMatrix.needsUpdate = true;
    if (markers.instanceColor) markers.instanceColor.needsUpdate = true;
  });
  if (objects.length === 0) return null;
  return (
    <instancedMesh key={objects.length} ref={mesh} args={[undefined, undefined, objects.length]} frustumCulled={false}>
      <sphereGeometry args={[0.12, 10, 8]} />
      <meshBasicMaterial />
    </instancedMesh>
  );
}
