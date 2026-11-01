/**
 * Подвижные части этажа (G10): двери лифта, люстры, шторы, дверца холодильника, крышка плиты.
 * Статичная часть — в общем меше этажа (Interior), здесь только то, что двигается.
 * Геометрии общие на все этажи (строятся один раз), анимация в useFrame без аллокаций.
 *
 *   лифт      — открыт, когда игрок ближе 2 м; Ваня в лифте (lift_vanya / vanya_fN) — застрял приоткрытым и дёргается
 *   люстры    — качаются при толчке, амплитуда от strength, затухают 3 с после конца
 *   шторы     — чуть колышутся всегда, сильно — при выбитом окне кухни (window_broken)
 *   холодильник и плита — дверца и крышка хлопают при толчке
 */
import { useRef } from "react";
import { useFrame, type RootState } from "@react-three/fiber";
import { MeshStandardMaterial, type BufferGeometry, type Group } from "three";
import { local } from "../../core/local";
import { store } from "../../core/store";
import { paintSurface } from "../style";
import * as P from "./props";

export const CEIL = 2.9;
export const LIFT_Z = 3.75;
export const LAMPS: [number, number][] = [
  [10, 1.5],
  [5, 4],
  [3, 8.5],
  [9, 8.5],
];
/** Окна квартиры: комната (стекло наше) и кухня (стекло из данных, бьётся по window_broken) */
export const WINDOWS = [2.5, 8] as const;
export const CURTAIN_H = 1.7;
const CURTAIN_W = 2.0;
export const FRIDGE: [number, number] = [6.6, 11.4];
export const STOVE: [number, number] = [10.2, 11.4];

const LIFT_OPEN = 1.26;
const LIFT_STUCK = 0.55;
const LIFT_NEAR = 2;
const QUAKE_FADE_MS = 3000;

const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
paintSurface(material);

let shared: { lamp: BufferGeometry; leaf: BufferGeometry; lid: BufferGeometry; door: BufferGeometry } | null = null;
const geo = () => (shared ??= { lamp: P.ceilingLamp(), leaf: P.elevatorLeaf(), lid: P.stoveLid(), door: P.fridgeDoor() });
const curtainCache = new Map<string, [BufferGeometry, BufferGeometry]>();
const curtainGeo = (color: string) => {
  let g = curtainCache.get(color);
  if (!g) {
    g = [P.curtainPanel(CURTAIN_H, color, -1), P.curtainPanel(CURTAIN_H, color, 1)];
    curtainCache.set(color, g);
  }
  return g;
};

/** Сила толчка сейчас (0..1+): во время — strength, потом линейно гаснет за 3 с */
let lastQuake: { until: number; strength: number } | null = null;
export function quakeLevel(now = performance.now()): number {
  const q = store.get().quake;
  if (q) lastQuake = q;
  if (!lastQuake) return 0;
  if (now <= lastQuake.until) return lastQuake.strength;
  return Math.max(0, lastQuake.strength * (1 - (now - lastQuake.until) / QUAKE_FADE_MS));
}

/** Где игрок (в песочнице, без игрока — камера) */
function playerXZ(state: RootState): [number, number, number] {
  if (local.ready) return local.pos;
  const c = state.camera.position;
  return [c.x, c.y - 1.6, c.z];
}

export function FloorAnimated({ origin, floor, curtain, flags }: { origin: readonly number[]; floor: number; curtain: string; flags: readonly string[] }) {
  const g = geo();
  const curtains = curtainGeo(curtain);
  const lamps = useRef<(Group | null)[]>([]);
  const leaves = useRef<(Group | null)[]>([]);
  const panels = useRef<(Group | null)[]>([]);
  const fridgeDoor = useRef<Group>(null);
  const lid = useRef<Group>(null);
  const gap = useRef(0);
  const stuck = flags.includes("lift_vanya") || flags.includes(`vanya_f${floor}`);
  const broken = flags.includes("window_broken");

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const q = quakeLevel();

    // люстры: маятник, у каждой своя фаза
    const amp = Math.min(1, q) * 0.3;
    lamps.current.forEach((l, i) => {
      if (!l) return;
      l.rotation.x = amp * Math.sin(t * 3.1 + i * 1.3);
      l.rotation.z = amp * 0.7 * Math.sin(t * 2.6 + i * 2.1);
    });

    // лифт: створки разъезжаются от центра
    const [px, py, pz] = playerXZ(state);
    const near = Math.abs(py - origin[1]!) < 2 && Math.hypot(px - (origin[0]! + 10), pz - (origin[2]! + LIFT_Z)) < LIFT_NEAR;
    const target = near ? LIFT_OPEN : stuck ? LIFT_STUCK + 0.08 * Math.max(0, Math.sin(t * 4.3) * Math.sin(t * 1.7)) : 0;
    gap.current += (target - gap.current) * Math.min(1, dt * 3);
    const lw = 1.3 / 2 - 0.02;
    leaves.current.forEach((l, i) => {
      if (l) l.position.x = (i === 0 ? -1 : 1) * (lw / 2 + gap.current / 2);
    });

    // шторы: верх на карнизе, низ качается в комнату
    panels.current.forEach((p, i) => {
      if (!p) return;
      const kitchen = i >= 2;
      const wind = kitchen && broken ? 0.18 + 0.12 * Math.sin(t * 2.3 + i) + 0.05 * Math.sin(t * 6.1 + i * 2) : 0;
      p.rotation.x = 0.02 * Math.sin(t * 1.1 + i * 0.8) + wind + Math.min(1, q) * 0.1 * Math.sin(t * 5 + i);
    });

    // холодильник и плита: хлопают при толчке
    const bang = Math.min(1, q);
    if (fridgeDoor.current) fridgeDoor.current.rotation.y = -bang * 0.55 * Math.max(0, Math.sin(t * 6.5));
    if (lid.current) lid.current.rotation.x = -0.12 + bang * 0.9 * Math.max(0, Math.sin(t * 7.3 + 1));
  });

  return (
    <group>
      {LAMPS.map(([x, z], i) => (
        <group key={`lamp${i}`} ref={(el) => void (lamps.current[i] = el)} position={[x, CEIL, z]}>
          <mesh geometry={g.lamp} material={material} />
        </group>
      ))}
      <group position={[10, 0, LIFT_Z]} rotation-y={Math.PI}>
        {[0, 1].map((i) => (
          <group key={i} ref={(el) => void (leaves.current[i] = el)}>
            <mesh geometry={g.leaf} material={material} castShadow />
          </group>
        ))}
      </group>
      {WINDOWS.flatMap((wx, w) =>
        ([-1, 1] as const).map((s, k) => (
          <group
            key={`curtain${w}${k}`}
            ref={(el) => void (panels.current[w * 2 + k] = el)}
            position={[wx + (s * (CURTAIN_W + 0.15)) / 2, 0.8 + CURTAIN_H + 0.1, 11.62]}
          >
            <mesh geometry={curtains[k]!} material={material} />
          </group>
        )),
      )}
      <group position={[FRIDGE[0], 0, FRIDGE[1]]} rotation-y={Math.PI}>
        <group ref={fridgeDoor} position={[-0.325, 0, 0.275]}>
          <mesh geometry={g.door} material={material} castShadow />
        </group>
      </group>
      <group position={[STOVE[0], 0, STOVE[1]]} rotation-y={-Math.PI / 2}>
        <group ref={lid} position={[0, 0.9, -0.3]} rotation-x={-0.12}>
          <mesh geometry={g.lid} material={material} />
        </group>
      </group>
    </group>
  );
}
