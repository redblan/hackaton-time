/**
 * Формат мира. ВЛАДЕЛЕЦ формата: лид. Контент по формату: Никита.
 *
 * Координаты: Y вверх, 1 единица = 1 метр.
 * Этаж N (1..9) стоит на высоте y = (N - 1) * 3.
 * Дом: подъезд 1 — x ∈ [0, 12], подъезд 2 — x ∈ [12, 24], z ∈ [0, 12].
 * Двор: сетка 3 × 4 квадрата по 12 м, x ∈ [0, 36], z ∈ [-48, 0].
 *
 * Чанк = один этаж одного подъезда (`e1f7`) или один квадрат двора (`y21`: колонка 2, ряд 1).
 * Всего 18 + 12 = 30 чанков. Клиент одновременно держит не больше 3 (≤ 10%).
 */
import type { InteractableId, NpcId, Role, ZoneId } from "./ids";

export type Vec3 = [number, number, number];
export type ChunkId = string; // `e${1|2}f${1..9}` | `y${0..2}${0..3}`

export interface ChunkData {
  id: ChunkId;
  /** Границы чанка в мировых координатах */
  bounds: { min: Vec3; max: Vec3 };
  /** Соседи в порядке приоритета подгрузки */
  neighbors: ChunkId[];
  objects: WorldObject[];
}

/**
 * `when` — флаг прохождения (RunConfig.flags + setFlag). Объект виден/работает,
 * только если флаг выставлен. Например `fire_f5`, `collapse_f4`, `lift_vanya`.
 * `unless` — наоборот: объект пропадает, когда флаг выставлен (папа ушёл: `unless: "papa_left"`).
 * Без них объект есть всегда. Проверять через `isObjectActive()`.
 */
interface Base {
  id: string;
  when?: string;
  unless?: string;
}

export type WorldObject =
  /** Стены, пол, перекрытия, простая мебель — коробки */
  | (Base & { kind: "box"; pos: Vec3; size: Vec3; color: string; rotY?: number; collide?: boolean })
  /** glTF-модель из world/assets (src = 'furniture/table.glb') */
  | (Base & { kind: "model"; src: string; pos: Vec3; rotY?: number; scale?: number; collide?: boolean })
  /** Точка взаимодействия: игрок в радиусе видит подсказку и жмёт E */
  | (Base & { kind: "interactable"; target: InteractableId; pos: Vec3; radius: number; label: string })
  /** Зона-триггер (событие enterZone) */
  | (Base & { kind: "zone"; zone: ZoneId; min: Vec3; max: Vec3 })
  /** Где стоит NPC */
  | (Base & { kind: "npc"; npcId: NpcId; pos: Vec3; rotY?: number; pose?: "stand" | "lie" | "sit" })
  /** Точка появления игрока */
  | (Base & { kind: "spawn"; role: Role; pos: Vec3; rotY?: number })
  /** Табличка с текстом (адрес дома, номер этажа) */
  | (Base & { kind: "sign"; pos: Vec3; rotY?: number; text: string })
  /** Эффект: дым, искры, пыль */
  | (Base & { kind: "fx"; fx: "smoke" | "sparks" | "dust" | "fire"; pos: Vec3; size?: number });

export interface Aabb {
  min: Vec3;
  max: Vec3;
}

/** Виден ли объект при этих флагах (`when` / `unless`). Единое правило для клиента, сервера и мира. */
export function isObjectActive(o: { when?: string; unless?: string }, flags: readonly string[] | ReadonlySet<string>): boolean {
  const has = (f: string) => ("has" in flags ? flags.has(f) : flags.includes(f));
  return (!o.when || has(o.when)) && (!o.unless || !has(o.unless));
}
