/**
 * Переносимые предметы (G11, начало): пока только огнетушитель. E рядом — взять, E — поставить.
 * В мире стоит prop из данных (Никита); где он сейчас и кто держит — store.props (prop:move по сети).
 * В руках рисует Player (HeldItem) перед камерой.
 */
import { MeshStandardMaterial, type BufferGeometry } from "three";
import type { WorldObject } from "@game/shared";
import { useStore } from "../../core/store";
import * as P from "./props";

type Prop = Extract<WorldObject, { kind: "prop" }>;

export const isExtinguisher = (id: string) => id.endsWith("-prop-extinguisher");

let geometry: BufferGeometry | null = null;
/** Геометрия огнетушителя (decor/props), одна на все: низ на y 0 */
export const extinguisherGeometry = () => (geometry ??= P.extinguisher());
export const carryMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });

/** Огнетушитель в мире: там, где лежит по данным или куда его поставили; в чьих-то руках — не рисуем */
export function PropExtinguisher({ object }: { object: Prop }) {
  const state = useStore((s) => s.props[object.id]);
  const mine = useStore((s) => s.held === object.id);
  if (mine || state?.holder) return null;
  const [x, y, z] = state?.pos ?? object.pos;
  // pos — центр коробки; модель стоит на полу. модель выше коробки (1.15 м против 0.75) — уменьшаем целиком
  const k = object.size[1] / 1.15;
  return (
    <mesh geometry={extinguisherGeometry()} material={carryMaterial} position={[x, y - object.size[1] / 2, z]} rotation-y={state?.rotY ?? object.rotY ?? 0} scale={k} castShadow />
  );
}
