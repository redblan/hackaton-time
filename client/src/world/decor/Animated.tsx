/**
 * Подвижные части этажа (G10): двери лифта, люстры, шторы, дверца холодильника, крышка плиты.
 * Статичная часть — в общем меше этажа (Interior), здесь только то, что двигается.
 * Геометрии общие на все этажи (строятся один раз), анимация в useFrame без аллокаций.
 *
 *   лифт      — открыт, когда игрок ближе 2 м; Ваня в лифте (lift_vanya / vanya_fN) — застрял приоткрытым и дёргается
 *   люстры    — качаются при толчке, амплитуда от strength, затухают 3 с после конца
 *   шторы     — чуть колышутся всегда, сильно — при выбитом окне кухни (window_broken)
 *   холодильник и плита — дверца и крышка хлопают при толчке
 *   свет      — выключатель у двери квартиры (E): гаснут люстры комнат и их свет, клавиша щёлкает
 *   окна      — прозрачное стекло (стены с проёмами рисует ChunkView)
 *   плита     — горят две конфорки; перекрыл газ (E на кране, флаг сервера gas_off_<чанк>) — гаснут
 */
import { useMemo, useRef } from "react";
import { useFrame, type RootState } from "@react-three/fiber";
import { MeshStandardMaterial, type BufferGeometry, type Group } from "three";
import type { Vec3 } from "@game/shared";
import { local } from "../../core/local";
import { store, useStore } from "../../core/store";
import { useLampLight } from "../LocalLights";
import { Builder } from "./build";
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
/** Люстра с выключенным светом: абажур и лампочка темнее */
const lampOff = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, color: "#5a5a5a" });
const glass = new MeshStandardMaterial({ color: "#bfe3ee", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false });
/** Комнатные люстры (индексы в LAMPS), их гасит выключатель */
const ROOM_LAMPS = [2, 3];

let glassGeo: { fixed: BufferGeometry; kitchen: BufferGeometry } | null = null;
/** Стёкла: окна лестницы (x 2, 10) и комнаты (x 2.5) — всегда; кухня (x 8) — пока окно не выбито */
const glassGeometry = () =>
  (glassGeo ??= {
    fixed: new Builder()
      .box(1.5, 1.25, 0.02, "#ffffff", { x: 2, y: 1.8, z: 0.0 })
      .box(1.5, 1.25, 0.02, "#ffffff", { x: 10, y: 1.8, z: 0.0 })
      .box(2.0, 1.5, 0.02, "#ffffff", { x: 2.5, y: 1.7, z: 11.8 })
      .build(),
    kitchen: new Builder().box(2.0, 1.5, 0.02, "#ffffff", { x: 8, y: 1.7, z: 11.8 }).build(),
  });

/** Пламя конфорки: венчик голубых язычков, низ на y 0 */
let flameGeo: BufferGeometry | null = null;
const flame = () => {
  if (flameGeo) return flameGeo;
  const b = new Builder();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.cone(0.012, 0.05, "#ffffff", { x: Math.cos(a) * 0.045, y: 0.025, z: Math.sin(a) * 0.045 }, 4);
  }
  b.cone(0.03, 0.03, "#ffffff", { y: 0.015 }, 8);
  return (flameGeo = b.build());
};
const flameMaterial = new MeshStandardMaterial({ vertexColors: true, color: "#2f6dff", emissive: "#1f4fe0", emissiveIntensity: 1.1, transparent: true, opacity: 0.85, depthWrite: false });
/** Горящие конфорки (в координатах плиты: передние) */
const BURNERS: [number, number][] = [
  [-0.15, 0.15],
  [0.15, -0.15],
];

let leverGeo: BufferGeometry | null = null;
const lever = () => (leverGeo ??= new Builder().box(0.03, 0.045, 0.02, "#f4f2ee", { z: 0.01 }).build());

/** Свет люстры в общий пул точечных источников (LocalLights), пока свет включён */
function RoomLight({ pos }: { pos: Vec3 }) {
  useLampLight(pos);
  return null;
}

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

export function FloorAnimated({ chunkId, origin, floor, curtain, flags }: { chunkId: string; origin: readonly number[]; floor: number; curtain: string; flags: readonly string[] }) {
  const g = geo();
  const glassG = glassGeometry();
  const lightOn = useStore((s) => s.lights[chunkId] ?? true);
  const lightPos = useMemo(
    () => ROOM_LAMPS.map((i): Vec3 => [origin[0]! + LAMPS[i]![0], origin[1]! + CEIL - 0.75, origin[2]! + LAMPS[i]![1]]),
    [origin],
  );
  const curtains = curtainGeo(curtain);
  const lamps = useRef<(Group | null)[]>([]);
  const leaves = useRef<(Group | null)[]>([]);
  const panels = useRef<(Group | null)[]>([]);
  const fridgeDoor = useRef<Group>(null);
  const lid = useRef<Group>(null);
  const gap = useRef(0);
  const stuck = flags.includes("lift_vanya") || flags.includes(`vanya_f${floor}`);
  const broken = flags.includes("window_broken");
  const gasOn = !flags.includes(`gas_off_${chunkId}`) && !flags.includes("gas_off");
  const flames = useRef<(Group | null)[]>([]);

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

    // пламя конфорок: дрожит
    flames.current.forEach((f, i) => {
      if (!f) return;
      const k = 0.85 + 0.15 * Math.sin(t * 23 + i * 2) + 0.08 * Math.sin(t * 41 + i);
      f.scale.set(1, k, 1);
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
          <mesh geometry={g.lamp} material={!lightOn && ROOM_LAMPS.includes(i) ? lampOff : material} />
        </group>
      ))}
      {lightOn && lightPos.map((p, i) => <RoomLight key={i} pos={p} />)}
      {/* клавиши выключателя: в квартире у двери и со стороны коридора */}
      <mesh geometry={lever()} material={material} position={[6.2, 1.2, 5.075 + 0.03]} rotation-x={lightOn ? -0.35 : 0.35} />
      <mesh geometry={lever()} material={material} position={[3.2, 1.25, 4.925 - 0.03]} rotation={[lightOn ? -0.35 : 0.35, Math.PI, 0]} />
      <mesh geometry={glassG.fixed} material={glass} renderOrder={2} />
      {!broken && <mesh geometry={glassG.kitchen} material={glass} renderOrder={2} />}
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
        {gasOn &&
          BURNERS.map(([x, z], i) => (
            <group key={i} ref={(el) => void (flames.current[i] = el)} position={[x, 0.915, z]}>
              <mesh geometry={flame()} material={flameMaterial} renderOrder={3} />
            </group>
          ))}
        <group ref={lid} position={[0, 0.9, -0.3]} rotation-x={-0.12}>
          <mesh geometry={g.lid} material={material} />
        </group>
      </group>
    </group>
  );
}
