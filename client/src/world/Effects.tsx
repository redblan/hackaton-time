/** Эффекты без файлов: мягкие частицы из canvas-текстуры, подсветка интерактива. */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  CanvasTexture,
  NormalBlending,
  type Mesh,
  type MeshStandardMaterial,
  type PointLight,
  type Points,
} from "three";
import type { WorldObject } from "@game/shared";

type Fx = Extract<WorldObject, { kind: "fx" }>;
type Interact = Extract<WorldObject, { kind: "interactable" }>;

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
  fire: { color: "#ff8a2b", size: 0.55, speed: 0.9, count: 42, opacity: 0.8, glow: true, rise: 1.3 },
  smoke: { color: "#6d6660", size: 1.5, speed: 0.22, count: 36, opacity: 0.4, glow: false, rise: 2.4 },
  sparks: { color: "#ffe98a", size: 0.13, speed: 1.8, count: 40, opacity: 0.95, glow: true, rise: 1.5 },
  dust: { color: "#d4b998", size: 0.9, speed: 0.2, count: 30, opacity: 0.32, glow: false, rise: 1 },
};

export function FxParticles({ object }: { object: Fx }) {
  const look = FX_LOOK[object.fx];
  const ref = useRef<Points>(null);
  const light = useRef<PointLight>(null);
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
    if (light.current) light.current.intensity = 10 + Math.sin(t * 13) * 2 + Math.sin(t * 29) * 1.5;
  });
  return (
    <group position={object.pos}>
      <points ref={ref} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={softTexture()}
          color={look.color}
          size={look.size}
          transparent
          opacity={look.opacity}
          depthWrite={false}
          blending={look.glow ? AdditiveBlending : NormalBlending}
        />
      </points>
      {object.fx === "fire" && <pointLight ref={light} position={[0, 0.6, 0]} color="#ff9440" distance={9} decay={1.8} />}
    </group>
  );
}

/** Метка интерактива: рядом с игроком растёт и светится ярче. */
export function InteractMarker({ object }: { object: Interact }) {
  const mesh = useRef<Mesh>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const [x, y, z] = object.pos;
  useFrame(({ camera, clock }) => {
    if (!mesh.current || !material.current) return;
    const near = Math.hypot(camera.position.x - x, camera.position.z - z) < object.radius + 0.6
      && Math.abs(camera.position.y - y) < 2.5;
    const pulse = near ? 1.5 + Math.sin(clock.elapsedTime * 6) * 0.25 : 1;
    mesh.current.scale.setScalar(pulse);
    mesh.current.position.y = y + 0.6 + Math.sin(clock.elapsedTime * 2 + x) * 0.05;
    material.current.emissiveIntensity = near ? 2.6 : 0.8;
  });
  return (
    <mesh ref={mesh} position={[x, y + 0.6, z]}>
      <sphereGeometry args={[0.12, 12, 12]} />
      <meshStandardMaterial ref={material} color="#facc15" emissive="#facc15" emissiveIntensity={0.8} />
    </mesh>
  );
}
