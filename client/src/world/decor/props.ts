/**
 * Библиотека low-poly моделей в нашем мультяшном стиле: дверь, лифт, плита, тумбочка,
 * батарея, картины, велосипед, коляска, почтовые ящики… Всё из примитивов с цветом в вершинах.
 * Каждая модель: низ на y = 0, центр в (0, 0), «лицо» смотрит на +z.
 */
import type { BufferGeometry } from "three";
import { Builder, type Placement } from "./build";
import type { FloorTheme } from "./themes";

const METAL = "#b9bec4";
const METAL_DARK = "#7f868d";
const BRASS = "#d9a441";
const WHITE = "#f2efe8";
const BLACK = "#2a2d31";
/** Смещение полотна двери от центра коробки к лицевой стороне (см. door). */
export const LEAF_Z = 0.035;
/** На сколько сдвинуть центр двери от плоскости стены внутрь, чтобы полотно было заподлицо со стеной. */
export const DOOR_INSET = 0.055;

export interface DoorOptions {
  /** Угол открытия (рад). Положительный — полотно уходит за плоскость двери (в −z локально). */
  open?: number;
  /** Ширина проёма по коробке. */
  width?: number;
  /** Двустворчатая: две створки в одной коробке, табличка — на правой. */
  double?: boolean;
}

const DOOR_H = 2.1;

/** Коробка с наличником и порогом на проём шириной w. */
function doorFrame(b: Builder, frame: string, w: number) {
  const h = DOOR_H;
  b.box(0.08, h, 0.14, frame, { x: -w / 2, y: h / 2 });
  b.box(0.08, h, 0.14, frame, { x: w / 2, y: h / 2 });
  b.box(w + 0.08, 0.08, 0.14, frame, { y: h - 0.04 });
  b.box(0.12, h + 0.08, 0.04, frame, { x: -w / 2 - 0.06, y: h / 2 + 0.04, z: 0.08 }, 1.08);
  b.box(0.12, h + 0.08, 0.04, frame, { x: w / 2 + 0.06, y: h / 2 + 0.04, z: 0.08 }, 1.08);
  b.box(w + 0.32, 0.12, 0.04, frame, { y: h + 0.02, z: 0.08 }, 1.08);
  b.box(w, 0.02, 0.2, frame, { y: 0.01 }, 0.8);
}

/**
 * Полотно шириной lw с шестью филёнками и ручкой; петля в локальном нуле, полотно уходит в s·x.
 * Сдвинуто к лицевой стороне (z = LEAF_Z): коробка утоплена в стену, а филёнки выступают из её плоскости.
 */
function doorLeaf(theme: FloorTheme, lw: number, s: 1 | -1) {
  const h = DOOR_H;
  const leaf = new Builder();
  leaf.box(lw, h - 0.06, 0.05, theme.door, { x: (s * lw) / 2, y: (h - 0.06) / 2 + 0.03, z: LEAF_Z });
  const rows: [number, number][] = [
    [0.33, 0.42],
    [0.98, 0.62],
    [1.61, 0.42],
  ];
  for (const cx of [lw * 0.28, lw * 0.72])
    for (const [cy, ph] of rows) {
      leaf.box(lw * 0.32, ph, 0.02, theme.door, { x: s * cx, y: cy, z: LEAF_Z + 0.03 }, 1.12);
      leaf.box(lw * 0.26, ph - 0.08, 0.015, theme.door, { x: s * cx, y: cy, z: LEAF_Z + 0.045 }, 0.9);
    }
  for (const z of [0.07, -0.07]) {
    leaf.cylinder(0.018, 0.018, 0.06, BRASS, { x: s * (lw - 0.12), y: 1.05, z: LEAF_Z + z, rx: Math.PI / 2 }, 6);
    leaf.sphere(0.035, BRASS, { x: s * (lw - 0.12), y: 1.05, z: LEAF_Z + z * 1.4 }, 8);
  }
  return leaf.build();
}

/** Створки: петля (x), направление полотна (s) и ширина полотна для одинарной/двустворчатой двери. */
function doorLeaves(opts: DoorOptions) {
  const w = opts.width ?? 1.0;
  if (!opts.double) return [{ hinge: -w / 2 + 0.04, s: 1 as const, lw: w - 0.1 }];
  const lw = (w - 0.1) / 2 - 0.01;
  return [
    { hinge: -w / 2 + 0.04, s: 1 as const, lw },
    { hinge: w / 2 - 0.04, s: -1 as const, lw },
  ];
}

/** Части двери для анимации: коробка отдельно, створки с петлёй в локальном нуле (поворот ry = s·угол). */
export function doorParts(theme: FloorTheme, opts: DoorOptions = {}) {
  const b = new Builder();
  doorFrame(b, theme.doorDark, opts.width ?? 1.0);
  return { frame: b.build(), leaves: doorLeaves(opts).map((l) => ({ ...l, geometry: doorLeaf(theme, l.lw, l.s) })) };
}

/** Дверь квартиры: коробка с наличником, полотно с шестью филёнками, ручка. Лицо — +z. */
export function door(theme: FloorTheme, opts: DoorOptions = {}): BufferGeometry {
  const b = new Builder();
  doorFrame(b, theme.doorDark, opts.width ?? 1.0);
  for (const l of doorLeaves(opts)) b.add(doorLeaf(theme, l.lw, l.s), { x: l.hinge, ry: l.s * (opts.open ?? 0) });
  return b.build();
}

/** Где на полотне (у двустворчатой — на правом) окажется табличка с номером: локально к двери, до её поворота ry. */
export function doorPlate(opts: DoorOptions = {}) {
  const leaves = doorLeaves(opts);
  const l = leaves[leaves.length - 1]!;
  const a = l.s * (opts.open ?? 0);
  const px = l.s * l.lw * 0.5;
  const pz = LEAF_Z + 0.075;
  return { x: l.hinge + px * Math.cos(a) + pz * Math.sin(a), y: 1.62, z: -px * Math.sin(a) + pz * Math.cos(a), ry: a };
}

/**
 * Лифт: кабина глубиной `depth` за порталом (пол, стены, потолок, поручень, лампа), створки раздвинуты
 * на `gap` — внутри видно человека. Лицо (двери) на z = 0, кабина уходит в −z.
 */
export function elevator(opts: { depth?: number; gap?: number; doors?: boolean } = {}): BufferGeometry {
  const b = new Builder();
  const w = 1.3;
  const h = 2.3;
  const depth = opts.depth ?? 1.2;
  const gap = opts.gap ?? 0.55;
  // портал
  b.box(0.12, h + 0.1, 0.3, METAL_DARK, { x: -w / 2 - 0.06, y: (h + 0.1) / 2 });
  b.box(0.12, h + 0.1, 0.3, METAL_DARK, { x: w / 2 + 0.06, y: (h + 0.1) / 2 });
  b.box(w + 0.24, 0.14, 0.3, METAL_DARK, { y: h + 0.03 });
  b.box(w + 0.3, 0.04, 0.4, METAL_DARK, { y: 0.02 });
  // створки, раздвинутые на gap (застряли)
  const lw = w / 2 - 0.02;
  if (opts.doors !== false) for (const s of [-1, 1]) b.box(lw, h - 0.04, 0.06, METAL, { x: s * (lw / 2 + gap / 2), y: h / 2 }, s < 0 ? 1 : 0.92);
  // кабина: пол, стены, потолок, задняя стенка с поручнем и зеркалом, лампа
  const cab = "#b9b1a4";
  b.box(w, 0.04, depth, "#6f6a62", { y: 0.02, z: -depth / 2 });
  b.box(w + 0.1, 0.06, depth, cab, { y: h - 0.03, z: -depth / 2 }, 0.9);
  for (const s of [-1, 1]) b.box(0.05, h, depth, cab, { x: s * (w / 2 + 0.025), y: h / 2, z: -depth / 2 });
  b.box(w + 0.1, h, 0.05, cab, { y: h / 2, z: -depth + 0.025 });
  b.box(w - 0.3, 0.9, 0.01, "#cfe3ea", { y: 1.45, z: -depth + 0.055 });
  b.box(w - 0.2, 0.04, 0.04, METAL, { y: 0.95, z: -depth + 0.07 });
  b.box(0.4, 0.03, 0.25, "#fff2c8", { y: h - 0.07, z: -depth / 2 });
  // табло (сама цифра — квад из атласа над дверью, см. Interior)
  b.box(0.5, 0.22, 0.08, BLACK, { y: h + 0.26, z: 0.06 });
  // кнопочная панель
  b.box(0.14, 0.3, 0.04, METAL, { x: w / 2 + 0.3, y: 1.15, z: 0.02 });
  b.cylinder(0.025, 0.025, 0.02, "#ffd36a", { x: w / 2 + 0.3, y: 1.22, z: 0.05, rx: Math.PI / 2 }, 8);
  b.cylinder(0.025, 0.025, 0.02, "#ffd36a", { x: w / 2 + 0.3, y: 1.08, z: 0.05, rx: Math.PI / 2 }, 8);
  // корпус шахты вокруг кабины, чуть темнее стены
  b.box(w + 0.24, h + 0.1, depth + 0.1, "#c9c3b7", { y: (h + 0.1) / 2, z: -depth / 2 - 0.1 });
  return b.build();
}

/** Газовая плита: белый корпус, 4 конфорки с решёткой, духовка, ручки, откинутая крышка. */
export function stove(opts: { lid?: boolean } = {}): BufferGeometry {
  const b = new Builder();
  b.box(0.6, 0.82, 0.6, WHITE, { y: 0.45 });
  b.box(0.62, 0.03, 0.62, "#dcd9d2", { y: 0.875 });
  b.box(0.6, 0.06, 0.6, "#dcd9d2", { y: 0.07 }, 0.9);
  // духовка: окно и ручка
  b.box(0.42, 0.26, 0.02, BLACK, { y: 0.4, z: 0.3 });
  b.box(0.5, 0.025, 0.03, METAL, { y: 0.62, z: 0.32 });
  // ручки конфорок
  for (let i = 0; i < 5; i++) b.cylinder(0.02, 0.02, 0.03, "#d7d3cb", { x: -0.22 + i * 0.11, y: 0.78, z: 0.31, rx: Math.PI / 2 }, 8, 0.95);
  // конфорки и решётка
  for (const x of [-0.15, 0.15])
    for (const z of [-0.15, 0.15]) {
      b.cylinder(0.07, 0.07, 0.015, BLACK, { x, y: 0.9, z }, 10);
      b.cylinder(0.035, 0.035, 0.01, "#555a60", { x, y: 0.912, z }, 8);
    }
  for (const x of [-0.29, 0, 0.29]) b.box(0.015, 0.012, 0.6, BLACK, { x, y: 0.9 });
  for (const z of [-0.29, 0, 0.29]) b.box(0.6, 0.012, 0.015, BLACK, { y: 0.9, z });
  // откинутая крышка-щиток
  if (opts.lid !== false) b.box(0.6, 0.58, 0.02, "#d9ddd8", { y: 1.19, z: -0.3, rx: -0.12 });
  return b.build();
}

/** Тумбочка: два ящика с ручками. */
export function nightstand(): BufferGeometry {
  const b = new Builder();
  const wood = "#c9a06a";
  b.box(0.5, 0.52, 0.42, wood, { y: 0.31 });
  b.box(0.54, 0.04, 0.46, wood, { y: 0.59 }, 1.1);
  b.box(0.46, 0.05, 0.38, wood, { y: 0.025 }, 0.8);
  for (const y of [0.2, 0.44]) {
    b.box(0.42, 0.18, 0.02, wood, { y, z: 0.215 }, 0.92);
    b.box(0.14, 0.025, 0.02, METAL, { y, z: 0.235 });
  }
  return b.build();
}

/** Холодильник. */
export function fridge(opts: { door?: boolean } = {}): BufferGeometry {
  const b = new Builder();
  if (opts.door === false) {
    // корпус без дверцы: дверца — fridgeDoor(), открывается отдельно
    b.box(0.65, 1.75, 0.6, WHITE, { y: 0.875, z: -0.025 });
    b.box(0.57, 1.6, 0.01, "#e9eef0", { y: 0.9, z: 0.276 }, 0.95); // внутренность
    for (const y of [0.55, 0.95, 1.35]) b.box(0.55, 0.015, 0.45, "#dfe6ea", { y, z: 0.05 });
    b.box(0.12, 0.2, 0.1, "#d9824a", { x: -0.12, y: 1.06, z: 0.12 });
    b.box(0.1, 0.12, 0.1, "#e8d26a", { x: 0.1, y: 0.62, z: 0.12 });
  } else {
    b.box(0.65, 1.75, 0.65, WHITE, { y: 0.875 });
    b.box(0.6, 0.02, 0.02, "#d2cfc8", { y: 1.2, z: 0.33 });
    b.box(0.03, 0.5, 0.03, METAL, { x: 0.25, y: 1.45, z: 0.34 });
    b.box(0.03, 0.8, 0.03, METAL, { x: 0.25, y: 0.75, z: 0.34 });
  }
  b.box(0.6, 0.05, 0.55, "#2f3236", { y: 0.03 });
  return b.build();
}

/** Дверца холодильника: петля в нуле (левый край, у корпуса), дверца вдоль +x, смотрит на +z. */
export function fridgeDoor(): BufferGeometry {
  return new Builder()
    .box(0.65, 1.68, 0.05, WHITE, { x: 0.325, y: 0.9, z: 0.025 })
    .box(0.6, 0.02, 0.02, "#d2cfc8", { x: 0.325, y: 1.2, z: 0.055 })
    .box(0.03, 0.5, 0.03, METAL, { x: 0.575, y: 1.45, z: 0.065 })
    .box(0.03, 0.8, 0.03, METAL, { x: 0.575, y: 0.75, z: 0.065 })
    .build();
}

/** Створка лифта: центр в нуле по x, низ на y 0. */
export function elevatorLeaf(): BufferGeometry {
  return new Builder().box(1.3 / 2 - 0.02, 2.3 - 0.04, 0.06, METAL, { y: 2.3 / 2 }).build();
}

/** Крышка-щиток плиты: петля в нуле (задний край плиты), крышка вверх по y. */
export function stoveLid(): BufferGeometry {
  return new Builder().box(0.6, 0.58, 0.02, "#d9ddd8", { y: 0.29 }).build();
}

/** Батарея под окном: секции, две трубы. */
export function radiator(sections = 8): BufferGeometry {
  const b = new Builder();
  const w = sections * 0.1;
  for (let i = 0; i < sections; i++) b.box(0.07, 0.55, 0.11, WHITE, { x: -w / 2 + 0.05 + i * 0.1, y: 0.42 }, 0.95);
  b.box(w, 0.04, 0.06, WHITE, { y: 0.68 });
  b.box(w, 0.04, 0.06, WHITE, { y: 0.16 });
  b.cylinder(0.018, 0.018, 0.2, METAL, { x: w / 2 + 0.03, y: 0.1 }, 6);
  b.cylinder(0.018, 0.018, 0.4, METAL, { x: -w / 2 - 0.03, y: 0.5 }, 6);
  return b.build();
}

/** Картина в раме: шесть сюжетов из простых фигур. Лицом к +z. */
export function picture(subject: number, w = 0.7, h = 0.5): BufferGeometry {
  const b = new Builder();
  const frame = ["#6b4b36", "#2f3236", "#c9a06a", "#8a7a6a", "#3f4f6a", "#a0522d"][subject % 6]!;
  b.box(w + 0.08, 0.04, 0.04, frame, { y: h / 2 + 0.02 });
  b.box(w + 0.08, 0.04, 0.04, frame, { y: -h / 2 - 0.02 });
  b.box(0.04, h, 0.04, frame, { x: -w / 2 - 0.02 });
  b.box(0.04, h, 0.04, frame, { x: w / 2 + 0.02 });
  const art = (color: string, pw: number, ph: number, p: Placement, shade = 1) => b.box(pw, ph, 0.012, color, { ...p, z: (p.z ?? 0) + 0.006 }, shade);
  switch (subject % 6) {
    case 0: // закат над морем
      art("#f6c177", w, h, {});
      art("#e8793f", w, h * 0.45, { y: -h * 0.27 });
      b.sphere(h * 0.18, "#fff1b0", { y: h * 0.15, z: 0.012 }, 10);
      art("#3f6f9f", w, h * 0.3, { y: -h * 0.35, z: 0.004 });
      break;
    case 1: // горы
      art("#bfe0f0", w, h, {});
      b.cone(w * 0.32, h * 0.8, "#6a7f93", { x: -w * 0.2, y: -h * 0.1, z: 0.012, rx: Math.PI / 2 }, 4);
      b.cone(w * 0.26, h * 0.62, "#8aa0b3", { x: w * 0.22, y: -h * 0.2, z: 0.016, rx: Math.PI / 2 }, 4);
      art("#5d8f55", w, h * 0.22, { y: -h * 0.39, z: 0.008 });
      break;
    case 2: // цветы в вазе
      art("#f3e6d2", w, h, {});
      art("#7fa7ae", w * 0.22, h * 0.4, { y: -h * 0.25, z: 0.004 });
      for (const [x, y, c] of [
        [-0.12, 0.12, "#e85d75"],
        [0, 0.2, "#f2b640"],
        [0.12, 0.1, "#d85cbf"],
      ] as const)
        b.sphere(h * 0.13, c, { x: x * w * 1.6, y: y * h * 1.6, z: 0.014 }, 8);
      break;
    case 3: // городок
      art("#9ccbe8", w, h, {});
      for (let i = 0; i < 5; i++) art(["#e9b08a", "#d97c62", "#f2d58a", "#a9c2d6", "#e3a06a"][i]!, w * 0.17, h * (0.3 + (i % 3) * 0.15), { x: -w * 0.4 + i * w * 0.2, y: -h * 0.2 + h * (0.15 + (i % 3) * 0.075), z: 0.004 });
      break;
    case 4: // абстракция
      art("#f6efe5", w, h, {});
      b.sphere(h * 0.3, "#e85d3a", { x: -w * 0.15, y: h * 0.05, z: 0.012 }, 10);
      art("#2f4f8f", w * 0.35, h * 0.5, { x: w * 0.25, y: -h * 0.15, z: 0.004 });
      art("#f2b640", w * 0.6, h * 0.08, { y: -h * 0.35, z: 0.008 });
      break;
    default: // кораблик
      art("#8fc3e8", w, h, {});
      art("#2f6a9f", w, h * 0.35, { y: -h * 0.32, z: 0.004 });
      art("#8a4b2d", w * 0.45, h * 0.14, { y: -h * 0.1, z: 0.008 });
      b.cone(w * 0.16, h * 0.5, "#fff6e0", { y: h * 0.2, z: 0.014, rx: Math.PI / 2 }, 3);
  }
  return b.build();
}

/** Люстра на шнуре: абажур-конус и лампочка. */
export function ceilingLamp(): BufferGeometry {
  const b = new Builder();
  b.cylinder(0.01, 0.01, 0.5, BLACK, { y: -0.25 }, 4);
  b.cone(0.22, 0.2, "#f3c98b", { y: -0.55, rx: Math.PI }, 10);
  b.sphere(0.07, "#fff4cf", { y: -0.66 }, 8);
  return b.build();
}

/** Перила: стойки, поручень и средняя планка, вдоль +x от начала. */
export function railing(length: number, color = "#5b6b78", rail = "#a8743f"): BufferGeometry {
  const b = new Builder();
  const posts = Math.max(2, Math.round(length / 0.9) + 1);
  for (let i = 0; i < posts; i++) b.box(0.04, 0.95, 0.04, color, { x: (i / (posts - 1)) * length, y: 0.475 });
  b.box(length + 0.04, 0.06, 0.08, rail, { x: length / 2, y: 0.98 });
  b.box(length, 0.025, 0.025, color, { x: length / 2, y: 0.5 });
  return b.build();
}

/** Растение в горшке. */
export function plant(tall = false): BufferGeometry {
  const b = new Builder();
  b.cylinder(0.16, 0.12, 0.28, "#b5673f", { y: 0.14 }, 8);
  b.cylinder(0.14, 0.14, 0.03, "#5a3b2a", { y: 0.29 }, 8);
  const h = tall ? 1.1 : 0.6;
  b.cylinder(0.025, 0.035, h, "#4e7a3a", { y: 0.28 + h / 2 }, 5);
  const leaves = tall ? 7 : 5;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2;
    b.cone(0.09, 0.42, "#5fa05c", { x: Math.cos(a) * 0.16, y: 0.3 + h * (0.45 + 0.5 * (i % 2)), z: Math.sin(a) * 0.16, rx: Math.cos(a) * 0.9, rz: -Math.sin(a) * 0.9 }, 4, 0.9 + (i % 3) * 0.1);
  }
  return b.build();
}

/** Велосипед у стены (стоит вдоль +x). */
export function bike(): BufferGeometry {
  const b = new Builder();
  const tube = "#d94f3d";
  for (const x of [-0.5, 0.5]) {
    b.cylinder(0.33, 0.33, 0.03, BLACK, { x, y: 0.33, rx: Math.PI / 2 }, 14);
    b.cylinder(0.27, 0.27, 0.035, "#c9ccd1", { x, y: 0.33, rx: Math.PI / 2 }, 14);
  }
  b.box(0.7, 0.035, 0.035, tube, { y: 0.66, rz: 0.12 });
  b.box(0.55, 0.035, 0.035, tube, { x: -0.12, y: 0.5, rz: -0.9 });
  b.box(0.6, 0.035, 0.035, tube, { x: 0.25, y: 0.5, rz: 0.9 });
  b.box(0.25, 0.1, 0.06, "#3a3a3a", { x: -0.3, y: 0.85 });
  b.box(0.04, 0.04, 0.5, "#3a3a3a", { x: 0.42, y: 0.9 });
  b.cylinder(0.08, 0.08, 0.03, "#3a3a3a", { y: 0.33, rx: Math.PI / 2 }, 8);
  return b.build();
}

/** Детская коляска. */
export function pram(): BufferGeometry {
  const b = new Builder();
  b.box(0.75, 0.3, 0.45, "#6a8fc9", { y: 0.62 });
  b.sphere(0.26, "#4f6fa8", { x: -0.2, y: 0.78, z: 0 }, 10);
  for (const x of [-0.28, 0.28]) for (const z of [-0.22, 0.22]) b.cylinder(0.12, 0.12, 0.04, BLACK, { x, y: 0.12, z, rx: Math.PI / 2 }, 10);
  for (const x of [-0.28, 0.28]) b.box(0.03, 0.4, 0.03, METAL, { x, y: 0.32 });
  b.box(0.03, 0.03, 0.5, METAL, { x: 0.52, y: 1.0 });
  b.box(0.35, 0.03, 0.03, METAL, { x: 0.38, y: 0.92, rz: 0.5 });
  return b.build();
}

/** Почтовые ящики: блок 3×3. */
export function mailboxes(): BufferGeometry {
  const b = new Builder();
  b.box(1.0, 0.95, 0.22, "#6f7f8a", { y: 0.475 });
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      b.box(0.28, 0.26, 0.02, "#8fa0ab", { x: -0.32 + c * 0.32, y: 0.2 + r * 0.3, z: 0.115 }, 1 - r * 0.05);
      b.box(0.16, 0.02, 0.01, BLACK, { x: -0.32 + c * 0.32, y: 0.28 + r * 0.3, z: 0.13 });
    }
  return b.build();
}

/** Полка с обувью. */
export function shoerack(): BufferGeometry {
  const b = new Builder();
  b.box(0.8, 0.03, 0.3, "#9a7a5a", { y: 0.12 });
  b.box(0.8, 0.03, 0.3, "#9a7a5a", { y: 0.4 });
  for (const x of [-0.37, 0.37]) b.box(0.04, 0.42, 0.3, "#9a7a5a", { x, y: 0.21 });
  const shoes = ["#2f3236", "#a04a3a", "#f2efe8", "#4a6a9f"];
  for (let i = 0; i < 4; i++) b.box(0.1, 0.07, 0.22, shoes[i]!, { x: -0.28 + i * 0.18, y: (i < 2 ? 0.13 : 0.41) + 0.035, z: 0.02 });
  return b.build();
}

/** Стопка картонных коробок. */
export function boxes(): BufferGeometry {
  const b = new Builder();
  b.box(0.6, 0.4, 0.5, "#c9a06a", { y: 0.2 });
  b.box(0.45, 0.35, 0.4, "#d4ad78", { x: 0.05, y: 0.575, ry: 0.3 });
  b.box(0.6, 0.015, 0.06, "#8f7a5a", { y: 0.405 });
  return b.build();
}

/** Огнетушитель на кронштейне. Лицом к +z, крепится к стене сзади. */
export function extinguisher(): BufferGeometry {
  const b = new Builder();
  b.box(0.2, 0.06, 0.1, METAL_DARK, { y: 0.9, z: -0.05 });
  b.cylinder(0.08, 0.08, 0.5, "#d33a2f", { y: 0.75 }, 10);
  b.sphere(0.08, "#d33a2f", { y: 1.0 }, 10);
  b.cylinder(0.03, 0.03, 0.1, BLACK, { y: 1.1 }, 6);
  b.box(0.12, 0.03, 0.03, BLACK, { x: 0.04, y: 1.14 });
  b.cylinder(0.015, 0.015, 0.35, BLACK, { x: 0.1, y: 0.85, rz: 0.2 }, 5);
  return b.build();
}

/** Лестница-стремянка к люку на крышу (прислонена к стене, стена за ней). */
export function ladder(): BufferGeometry {
  const b = new Builder();
  const h = 2.6;
  for (const x of [-0.2, 0.2]) b.box(0.05, h, 0.05, METAL_DARK, { x, y: h / 2, z: 0.15, rx: -0.18 });
  for (let i = 0; i < 8; i++) b.box(0.4, 0.035, 0.035, METAL, { y: 0.3 + i * 0.3, z: 0.15 + (0.3 + i * 0.3 - h / 2) * 0.18, rx: -0.18 });
  return b.build();
}

/** Мешки у стены. */
export function bags(): BufferGeometry {
  const b = new Builder();
  b.sphere(0.3, "#3b3f46", { y: 0.27, z: 0.05 }, 8);
  b.sphere(0.24, "#4a4f57", { x: 0.42, y: 0.22, z: -0.05 }, 8);
  b.box(0.1, 0.08, 0.1, "#3b3f46", { y: 0.58, z: 0.05 });
  return b.build();
}

/** Санки. */
export function sled(): BufferGeometry {
  const b = new Builder();
  for (const z of [-0.18, 0.18]) {
    b.box(0.9, 0.03, 0.03, METAL, { y: 0.015, z });
    b.box(0.03, 0.2, 0.03, METAL, { x: -0.3, y: 0.11, z });
    b.box(0.03, 0.2, 0.03, METAL, { x: 0.3, y: 0.11, z });
  }
  for (let i = 0; i < 5; i++) b.box(0.07, 0.025, 0.42, "#d9a066", { x: -0.3 + i * 0.15, y: 0.22 });
  return b.build();
}

/** Шторы: карниз и два собранных полотна по бокам окна шириной w. */
export function curtains(w: number, h: number, color: string, opts: { panels?: boolean } = {}): BufferGeometry {
  const b = new Builder();
  b.cylinder(0.02, 0.02, w + 0.5, "#6b4b36", { y: h + 0.12, rz: Math.PI / 2 }, 6);
  if (opts.panels !== false) for (const s of [-1, 1]) {
    const x0 = (s * (w + 0.15)) / 2;
    for (let i = 0; i < 4; i++) b.box(0.07, h + 0.1, 0.06 + (i % 2) * 0.04, color, { x: x0 + s * (i - 1.5) * 0.06, y: h / 2 + 0.05, z: 0.02 }, 0.92 + (i % 2) * 0.12);
  }
  return b.build();
}

/** Одна штора (4 складки), подвешена в нуле — верх у карниза, висит вниз по −y. s: −1 левая, 1 правая. */
export function curtainPanel(h: number, color: string, s: -1 | 1): BufferGeometry {
  const b = new Builder();
  for (let i = 0; i < 4; i++) b.box(0.07, h + 0.1, 0.06 + (i % 2) * 0.04, color, { x: s * (i - 1.5) * 0.06, y: -(h + 0.1) / 2, z: 0.02 }, 0.92 + (i % 2) * 0.12);
  return b.build();
}

/** Ковёр с каймой. */
export function rug(w: number, d: number, color: string): BufferGeometry {
  const b = new Builder();
  b.box(w, 0.016, d, color, { y: 0.008 });
  b.box(w - 0.3, 0.004, d - 0.3, color, { y: 0.018 }, 1.25);
  b.box(w - 0.6, 0.004, d - 0.6, color, { y: 0.02 }, 0.85);
  return b.build();
}

/** Книжная полка на стене, с книгами. */
export function bookshelf(): BufferGeometry {
  const b = new Builder();
  const wood = "#8a5a3a";
  for (const y of [0, 0.36, 0.72]) b.box(1.1, 0.03, 0.24, wood, { y });
  for (const x of [-0.55, 0.55]) b.box(0.03, 0.75, 0.24, wood, { x, y: 0.36 });
  const palette = ["#c94f3d", "#3f6f9f", "#e0b14a", "#5a8f5a", "#8a4f8a", "#e07a3f", "#4a4f57"];
  for (const shelf of [0, 0.36]) {
    let x = -0.5;
    let i = 0;
    while (x < 0.45) {
      const bw = 0.05 + ((i * 7 + shelf * 10) % 4) * 0.015;
      const bh = 0.22 + ((i * 3) % 3) * 0.04;
      b.box(bw, bh, 0.18, palette[(i + shelf * 3) % palette.length]!, { x: x + bw / 2, y: shelf + bh / 2 + 0.015, z: 0.01 });
      x += bw + 0.01;
      i++;
    }
  }
  return b.build();
}

/** Стул. */
export function chair(color = "#956944"): BufferGeometry {
  const b = new Builder();
  b.box(0.42, 0.04, 0.42, color, { y: 0.45 });
  for (const x of [-0.18, 0.18]) for (const z of [-0.18, 0.18]) b.box(0.04, 0.45, 0.04, color, { x, y: 0.225, z }, 0.85);
  b.box(0.42, 0.45, 0.04, color, { y: 0.68, z: -0.19 });
  return b.build();
}

/** Телевизор на тумбе. */
export function tv(): BufferGeometry {
  const b = new Builder();
  b.box(1.0, 0.45, 0.4, "#6b4b36", { y: 0.225 });
  b.box(0.9, 0.52, 0.04, BLACK, { y: 0.74 });
  b.box(0.82, 0.44, 0.01, "#2b4f7a", { y: 0.74, z: 0.025 }, 1.1);
  b.box(0.3, 0.04, 0.2, BLACK, { y: 0.47 });
  return b.build();
}

/** Настенный выключатель и розетка — мелочь, которая делает стену живой. */
export function switchPlate(): BufferGeometry {
  const b = new Builder();
  b.box(0.09, 0.09, 0.02, WHITE, {});
  b.box(0.05, 0.05, 0.012, "#dedbd4", { z: 0.015 });
  return b.build();
}

/** Дверной коврик у двери. */
export function doormat(color = "#7a5a3a"): BufferGeometry {
  const b = new Builder();
  b.box(0.7, 0.015, 0.45, color, { y: 0.008 });
  return b.build();
}

/** Доска объявлений (лицом к +z). */
export function noticeBoard(): BufferGeometry {
  const b = new Builder();
  b.box(0.9, 0.65, 0.03, "#8a6a4a", { y: 0.325 });
  b.box(0.82, 0.57, 0.015, "#c9b89a", { y: 0.325, z: 0.02 });
  const papers = ["#fff6e0", "#e8f0ff", "#fff0b0", "#f0ffe8"];
  for (let i = 0; i < 4; i++) b.box(0.22, 0.28, 0.006, papers[i]!, { x: -0.3 + (i % 3) * 0.3, y: 0.4 - Math.floor(i / 3) * 0.26 - (i % 2) * 0.06, z: 0.03, rz: (i % 2 ? 1 : -1) * 0.06 });
  return b.build();
}
