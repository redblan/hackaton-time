/**
 * Животные толпы (G12) из примитивов через Builder: кошка, собака, голубь.
 * Каждая часть — своя геометрия (голова, хвост, ноги, крылья), чтобы двигать её отдельно.
 * Геометрии и материалы общие на все экземпляры одного типа — создаются один раз.
 * Модель смотрит на −z (как персонажи), ноги стоят на y = 0. Вершинный цвет светлый —
 * окраску даёт материал (общий на цвет).
 */
import { MeshStandardMaterial, type BufferGeometry } from "three";
import { Builder } from "../decor/build";

const FUR = "#ffffff";
const DARK = "#2a2522";
const PINK = "#d98c8c";

export interface Part {
  geometry: BufferGeometry;
  /** Точка крепления (шарнир) относительно корня модели */
  at: [number, number, number];
}

export interface AnimalModel {
  body: Part;
  head: Part;
  tail?: Part;
  /** Ноги: передняя левая, передняя правая, задняя левая, задняя правая (шарнир — у плеча) */
  legs: Part[];
  /** Крылья: левое, правое (шарнир — у плеча) */
  wings: Part[];
}

/** Четвероногое: s — масштаб, длинная морда для собаки */
function quadruped(s: number, dog: boolean): AnimalModel {
  const legH = 0.17 * s;
  const body = new Builder().box(0.17 * s, 0.15 * s, 0.42 * s, FUR, { y: legH + 0.06 * s }).build();
  const head = new Builder()
    .box(0.15 * s, 0.13 * s, 0.13 * s, FUR, {})
    .box(0.03 * s, 0.03 * s, 0.01 * s, DARK, { x: -0.04 * s, y: 0.02 * s, z: -0.066 * s })
    .box(0.03 * s, 0.03 * s, 0.01 * s, DARK, { x: 0.04 * s, y: 0.02 * s, z: -0.066 * s });
  if (dog) {
    head
      .box(0.08 * s, 0.07 * s, 0.09 * s, FUR, { y: -0.025 * s, z: -0.1 * s }, 0.9)
      .box(0.035 * s, 0.03 * s, 0.02 * s, DARK, { y: -0.005 * s, z: -0.15 * s })
      .box(0.035 * s, 0.09 * s, 0.05 * s, FUR, { x: -0.08 * s, y: 0.0, z: 0.01 * s, rz: -0.25 }, 0.8)
      .box(0.035 * s, 0.09 * s, 0.05 * s, FUR, { x: 0.08 * s, y: 0.0, z: 0.01 * s, rz: 0.25 }, 0.8);
  } else {
    head
      .cone(0.035 * s, 0.07 * s, FUR, { x: -0.045 * s, y: 0.095 * s }, 4)
      .cone(0.035 * s, 0.07 * s, FUR, { x: 0.045 * s, y: 0.095 * s }, 4)
      .box(0.025 * s, 0.018 * s, 0.01 * s, PINK, { y: -0.02 * s, z: -0.066 * s });
  }
  const tailLen = (dog ? 0.2 : 0.3) * s;
  // хвост растёт из шарнира назад-вверх (по +z), качается вокруг y
  const tail = new Builder().box(0.035 * s, 0.035 * s, tailLen, FUR, { y: 0.0, z: tailLen / 2, rx: dog ? -0.6 : -0.9 }, 0.9).build();
  const leg = new Builder().box(0.05 * s, legH, 0.05 * s, FUR, { y: -legH / 2 }, 0.85).build();
  const lx = 0.055 * s;
  const fz = -0.15 * s;
  const bz = 0.15 * s;
  const top = legH + 0.02 * s;
  return {
    body: { geometry: body, at: [0, 0, 0] },
    head: { geometry: head.build(), at: [0, legH + 0.19 * s, -0.25 * s] },
    tail: { geometry: tail, at: [0, legH + 0.1 * s, 0.21 * s] },
    legs: [
      { geometry: leg, at: [-lx, top, fz] },
      { geometry: leg, at: [lx, top, fz] },
      { geometry: leg, at: [-lx, top, bz] },
      { geometry: leg, at: [lx, top, bz] },
    ],
    wings: [],
  };
}

function pigeon(): AnimalModel {
  const body = new Builder()
    .sphere(0.085, FUR, { y: 0.11 }, 7)
    .box(0.1, 0.07, 0.16, FUR, { y: 0.11, z: 0.04 }, 0.95)
    .box(0.08, 0.02, 0.1, FUR, { y: 0.12, z: 0.14, rx: 0.3 }, 0.7) // хвост
    .box(0.012, 0.05, 0.012, "#c96a4a", { x: -0.025, y: 0.025 })
    .box(0.012, 0.05, 0.012, "#c96a4a", { x: 0.025, y: 0.025 })
    .build();
  const head = new Builder()
    .sphere(0.045, FUR, {}, 6, 0.8)
    .cone(0.014, 0.04, "#e0a050", { z: -0.05, rx: -Math.PI / 2 }, 4)
    .box(0.012, 0.012, 0.01, DARK, { x: -0.03, y: 0.01, z: -0.025 })
    .box(0.012, 0.012, 0.01, DARK, { x: 0.03, y: 0.01, z: -0.025 })
    .build();
  // крыло тянется от плеча наружу по x; левое — к −x
  const wingL = new Builder().box(0.17, 0.015, 0.12, FUR, { x: -0.085 }, 0.75).build();
  const wingR = new Builder().box(0.17, 0.015, 0.12, FUR, { x: 0.085 }, 0.75).build();
  return {
    body: { geometry: body, at: [0, 0, 0] },
    head: { geometry: head, at: [0, 0.2, -0.07] },
    legs: [],
    wings: [
      { geometry: wingL, at: [-0.045, 0.13, 0.02] },
      { geometry: wingR, at: [0.045, 0.13, 0.02] },
    ],
  };
}

export type AnimalType = "cat" | "dog" | "pigeon";

const models = new Map<AnimalType, AnimalModel>();
/** Модель типа — одна на всех (геометрии строятся при первом обращении и живут всю сессию) */
export function animalModel(type: AnimalType): AnimalModel {
  let m = models.get(type);
  if (!m) {
    m = type === "pigeon" ? pigeon() : quadruped(type === "dog" ? 1.7 : 1, type === "dog");
    models.set(type, m);
  }
  return m;
}

const DEFAULT_COLORS: Record<AnimalType, string[]> = {
  cat: ["#8a8a8a", "#d08a3c", "#3a3330", "#e8e0d4"],
  dog: ["#9a6a3c", "#d8c8a8", "#4a3a30", "#c0a070"],
  pigeon: ["#8e95a0", "#7a808c", "#a8aab0"],
};
export const animalColor = (type: AnimalType, seed: number, color?: string) =>
  color ?? DEFAULT_COLORS[type][Math.abs(Math.floor(seed)) % DEFAULT_COLORS[type].length]!;

const materials = new Map<string, MeshStandardMaterial>();
/** Материал на цвет — общий для всех животных этого цвета */
export function animalMaterial(color: string): MeshStandardMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new MeshStandardMaterial({ vertexColors: true, color, roughness: 0.9 });
    materials.set(color, m);
  }
  return m;
}
