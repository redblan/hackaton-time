/**
 * Точечный свет фонарей и огня. Источников сколько угодно, а ламп в сцене всегда три: смена их
 * числа заставила бы three пересобрать все шейдеры, это секундный рывок на встроенной видеокарте.
 * Лампы занимают источники, ближайшие к камере.
 */
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, type PointLight } from "three";
import type { Vec3 } from "@game/shared";

const SLOTS = [0, 1, 2];
/** Дальше этого расстояния от камеры свет гаснет, ближе чем на FADE он в полную силу. */
const REACH = 42;
const FADE = 12;

const FIRE_COLOR = new Color("#ff9440");
const LAMP_COLOR = new Color("#ffc98a");

const fires = new Set<Vec3>();
const extraLamps = new Set<Vec3>();

/** Огонь подсвечивает всё вокруг, пока компонент на сцене. */
export function useFireLight(pos: Vec3) {
  useEffect(() => {
    fires.add(pos);
    return () => void fires.delete(pos);
  }, [pos]);
}

/** Фонарь, который загорается по ходу игры: светит, пока компонент на сцене. */
export function useLampLight(pos: Vec3) {
  useEffect(() => {
    extraLamps.add(pos);
    return () => void extraLamps.delete(pos);
  }, [pos]);
}

const distance = (a: readonly number[], x: number, y: number, z: number) =>
  Math.hypot(a[0]! - x, a[1]! - y, a[2]! - z);

export function LocalLights({ lamps }: { lamps: Vec3[] }) {
  const lights = useRef<(PointLight | null)[]>([]);
  useFrame(({ camera, clock }) => {
    const { x, y, z } = camera.position;
    const t = clock.elapsedTime;
    const nearest = [...fires, ...extraLamps, ...lamps]
      .map((pos) => ({ pos, far: distance(pos, x, y, z) }))
      .sort((a, b) => a.far - b.far);
    SLOTS.forEach((slot) => {
      const light = lights.current[slot];
      if (!light) return;
      const source = nearest[slot];
      if (!source) {
        light.intensity = 0;
        return;
      }
      const fire = fires.has(source.pos);
      const fade = Math.min(1, Math.max(0, (REACH - source.far) / FADE));
      light.position.set(source.pos[0], source.pos[1] + (fire ? 0.6 : 0), source.pos[2]);
      light.color.copy(fire ? FIRE_COLOR : LAMP_COLOR);
      light.distance = fire ? 9 : 15;
      light.intensity = fade * (fire ? 10 + Math.sin(t * 13) * 2 + Math.sin(t * 29) * 1.5 : 22);
    });
  });
  return (
    <>
      {SLOTS.map((slot) => (
        <pointLight
          key={slot}
          ref={(light) => {
            lights.current[slot] = light;
          }}
          intensity={0}
          decay={1.8}
        />
      ))}
    </>
  );
}
