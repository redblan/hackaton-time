/** Эффект толчка отдельно от ChunkView: ему нужен стор клиента. */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Points } from "three";
import { useStore } from "../core/store";
import { softTexture } from "./Effects";

const DUST_COUNT = 160;

/** Пыль сыплется вокруг игрока, пока идёт толчок. Один вызов отрисовки. */
export function QuakeDust() {
  const quake = useStore((s) => s.quake);
  const ref = useRef<Points>(null);
  const positions = useMemo(() => new Float32Array(DUST_COUNT * 3), []);
  useFrame(({ clock, camera }) => {
    if (!quake || !ref.current) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < DUST_COUNT; i++) {
      const phase = (t * 0.35 + i * 0.37) % 1;
      positions[i * 3] = camera.position.x + Math.sin(i * 12.9) * 6;
      positions[i * 3 + 1] = camera.position.y + 2.2 - phase * 3;
      positions[i * 3 + 2] = camera.position.z + Math.cos(i * 7.3) * 6;
    }
    ref.current.geometry.attributes.position!.needsUpdate = true;
  });
  if (!quake) return null;
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={softTexture()}
        color="#cdb597"
        size={0.3}
        transparent
        opacity={Math.min(0.7, 0.35 + quake.strength * 0.35)}
        depthWrite={false}
      />
    </points>
  );
}
