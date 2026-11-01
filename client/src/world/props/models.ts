/**
 * Вид переносимых предметов (01.11): вместо одинаковых картонных коробок — low-poly модели по виду предмета
 * (аптечка, фонарь, бутылка, кружка, огнетушитель, стул, одеяла, лестница, шкафчик, ограждение).
 * Геометрия строится один раз на вид и нормируется в единичный куб: Props масштабирует её в `size` предмета,
 * пропорции моделей совпадают с пресетами Никиты (world/src/palette.ts), поэтому ничего не плющит.
 */
import { Box3, BufferGeometry, Vector3 } from "three";
import { Builder } from "../decor/build";

export const PROP_KINDS = ["first_aid_kit", "flashlight", "water", "mug", "cardboard_box", "extinguisher", "chair", "blankets", "ladder", "first_aid_cabinet", "barrier", "other"] as const;
export type PropKind = (typeof PROP_KINDS)[number];

const BY_LABEL: [RegExp, PropKind][] = [
  [/аптечк/i, "first_aid_kit"],
  [/шкафчик/i, "first_aid_cabinet"],
  [/фонар/i, "flashlight"],
  [/вод/i, "water"],
  [/кружк/i, "mug"],
  [/коробк/i, "cardboard_box"],
  [/огнетуш/i, "extinguisher"],
  [/стул/i, "chair"],
  [/одеял/i, "blankets"],
  [/лестниц/i, "ladder"],
  [/огражд/i, "barrier"],
];

/** Вид по id (`…-prop-first_aid_kit`) или по подписи */
export function propKindOf(id: string, label: string): PropKind {
  const m = /-prop-([a-z_]+)/.exec(id);
  if (m && (PROP_KINDS as readonly string[]).includes(m[1]!)) return m[1] as PropKind;
  if (/шкафчик/i.test(label)) return "first_aid_cabinet";
  for (const [re, kind] of BY_LABEL) if (re.test(label)) return kind;
  return "other";
}

const RED = "#b83c36";
const WHITE = "#f1efe6";
const METAL = "#8f979e";
const DARK = "#2c3136";

function firstAidKit(b: Builder) {
  b.box(0.5, 0.4, 0.3, RED, { y: 0.2 });
  b.box(0.5, 0.02, 0.3, "#8d2a26", { y: 0.41 });
  b.box(0.24, 0.12, 0.08, "#ded9c7", { y: 0.5 }); // ручка
  b.box(0.09, 0.24, 0.025, WHITE, { y: 0.22, z: 0.152 }); // крест
  b.box(0.24, 0.09, 0.025, WHITE, { y: 0.22, z: 0.152 });
  b.box(0.06, 0.05, 0.02, METAL, { x: 0.16, y: 0.3, z: 0.155 }); // замки
  b.box(0.06, 0.05, 0.02, METAL, { x: -0.16, y: 0.3, z: 0.155 });
}

function flashlight(b: Builder) {
  // лежит вдоль z, голова к −z
  b.cylinder(0.06, 0.06, 0.3, "#e2b64a", { y: 0.09, z: 0.05, rx: Math.PI / 2 }, 10);
  b.cylinder(0.09, 0.07, 0.12, "#354552", { y: 0.09, z: -0.15, rx: Math.PI / 2 }, 10);
  b.cylinder(0.075, 0.075, 0.01, "#fff6c4", { y: 0.09, z: -0.212, rx: Math.PI / 2 }, 10);
  b.box(0.04, 0.02, 0.06, DARK, { y: 0.155, z: 0.02 }); // кнопка
  b.cylinder(0.05, 0.05, 0.02, DARK, { y: 0.09, z: 0.205, rx: Math.PI / 2 }, 8); // крышка батареи
}

function water(b: Builder) {
  b.cylinder(0.075, 0.08, 0.3, "#74b8ca", { y: 0.15 }, 10);
  b.cylinder(0.05, 0.075, 0.06, "#8fc9d8", { y: 0.33 }, 10);
  b.cylinder(0.03, 0.03, 0.04, "#4d8fa0", { y: 0.38 }, 8);
  b.cylinder(0.035, 0.035, 0.03, "#2f6f80", { y: 0.405 }, 8); // крышка
  b.cylinder(0.082, 0.082, 0.1, "#dfeef2", { y: 0.17 }, 10); // этикетка
}

function mug(b: Builder) {
  b.cylinder(0.08, 0.07, 0.17, "#e7dfc4", { x: -0.03, y: 0.085 }, 10);
  b.cylinder(0.06, 0.06, 0.01, "#6b4a3a", { x: -0.03, y: 0.172 }, 10); // кофе
  b.box(0.03, 0.1, 0.03, "#e7dfc4", { x: 0.085, y: 0.095 }); // ручка
  b.box(0.05, 0.025, 0.03, "#e7dfc4", { x: 0.065, y: 0.14 });
  b.box(0.05, 0.025, 0.03, "#e7dfc4", { x: 0.065, y: 0.05 });
  b.box(0.1, 0.05, 0.005, "#c45a4a", { x: -0.03, y: 0.09, z: 0.072 }); // полоска
}

function cardboardBox(b: Builder) {
  b.box(0.55, 0.45, 0.5, "#ba8e5c", { y: 0.225 });
  b.box(0.1, 0.004, 0.5, "#e0c295", { y: 0.452 }); // скотч
  b.box(0.55, 0.006, 0.01, "#9c7446", { y: 0.449, z: 0 });
  b.box(0.2, 0.1, 0.004, "#6b4b36", { x: 0.1, y: 0.25, z: 0.252 }, 1.3); // маркировка
}

function extinguisher(b: Builder) {
  b.cylinder(0.12, 0.12, 0.56, "#bf4035", { y: 0.28 }, 12);
  b.cylinder(0.12, 0.1, 0.06, "#bf4035", { y: 0.59 }, 12, 0.9);
  b.cylinder(0.04, 0.04, 0.06, METAL, { y: 0.65 }, 8);
  b.box(0.16, 0.025, 0.04, DARK, { x: 0.03, y: 0.71 }); // рычаг
  b.box(0.16, 0.025, 0.04, DARK, { x: 0.03, y: 0.675 });
  b.cylinder(0.015, 0.015, 0.4, DARK, { x: -0.1, y: 0.4, rz: 0.1 }, 6); // шланг
  b.cylinder(0.03, 0.02, 0.06, DARK, { x: -0.12, y: 0.2 }, 6); // раструб
  b.box(0.12, 0.1, 0.005, WHITE, { y: 0.35, z: 0.122 }); // этикетка
  b.cylinder(0.125, 0.125, 0.03, DARK, { y: 0.015 }, 12); // подставка
}

function chair(b: Builder) {
  const wood = "#98704f";
  b.box(0.48, 0.05, 0.5, wood, { y: 0.45 });
  for (const x of [-0.2, 0.2]) for (const z of [-0.21, 0.21]) b.box(0.05, 0.45, 0.05, wood, { x, y: 0.225, z }, 0.9);
  for (const x of [-0.2, 0.2]) b.box(0.05, 0.42, 0.05, wood, { x, y: 0.69, z: -0.22 }, 0.95);
  b.box(0.48, 0.12, 0.04, wood, { y: 0.84, z: -0.22 });
  b.box(0.48, 0.06, 0.04, wood, { y: 0.66, z: -0.22 });
}

function blankets(b: Builder) {
  const colors = ["#71928e", "#9b6b6b", "#8b8f5f"];
  colors.forEach((c, i) => {
    b.box(0.8, 0.065, 0.6, c, { y: 0.033 + i * 0.066 });
    b.box(0.8, 0.012, 0.04, c, { y: 0.033 + i * 0.066, z: 0.3 }, 0.8); // сгиб
  });
}

function ladder(b: Builder) {
  for (const x of [-0.3, 0.3]) b.box(0.06, 2.6, 0.1, "#c3c6be", { x, y: 1.3 });
  for (let i = 0; i < 8; i++) b.box(0.56, 0.05, 0.05, "#a9ada5", { y: 0.25 + i * 0.3 });
}

function firstAidCabinet(b: Builder) {
  b.box(0.8, 1.6, 0.4, "#d9e0d2", { y: 0.8 });
  b.box(0.76, 1.5, 0.02, "#e9eee4", { y: 0.8, z: 0.2 }, 1.02);
  b.box(0.1, 0.4, 0.03, RED, { y: 1.05, z: 0.215 });
  b.box(0.4, 0.1, 0.03, RED, { y: 1.05, z: 0.215 });
  b.box(0.03, 0.12, 0.03, METAL, { x: 0.3, y: 0.75, z: 0.22 });
}

function barrier(b: Builder) {
  for (const x of [-0.7, 0.7]) b.box(0.08, 1, 0.3, "#5b6168", { x, y: 0.5 });
  for (const y of [0.35, 0.8]) {
    b.box(1.6, 0.14, 0.05, "#cf9d50", { y });
    for (let i = 0; i < 4; i++) b.box(0.12, 0.14, 0.055, DARK, { x: -0.6 + i * 0.4, y });
  }
}

function other(b: Builder) {
  b.box(0.3, 0.3, 0.3, "#9aa0a6", { y: 0.15 });
}

const BUILDERS: Record<PropKind, (b: Builder) => void> = {
  first_aid_kit: firstAidKit,
  flashlight,
  water,
  mug,
  cardboard_box: cardboardBox,
  extinguisher,
  chair,
  blankets,
  ladder,
  first_aid_cabinet: firstAidCabinet,
  barrier,
  other,
};

const cache = new Map<PropKind, BufferGeometry>();

/** Геометрия вида, вписанная в куб [−0.5, 0.5]³ (центр — середина габарита): Props масштабирует в `size` */
export function propGeometry(kind: PropKind): BufferGeometry {
  const cached = cache.get(kind);
  if (cached) return cached;
  const b = new Builder();
  BUILDERS[kind](b);
  const g = b.build();
  g.computeBoundingBox();
  const box = g.boundingBox ?? new Box3();
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  g.translate(-center.x, -center.y, -center.z);
  g.scale(1 / Math.max(size.x, 1e-3), 1 / Math.max(size.y, 1e-3), 1 / Math.max(size.z, 1e-3));
  g.computeBoundingSphere();
  cache.set(kind, g);
  return g;
}
