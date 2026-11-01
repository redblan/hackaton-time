/**
 * Обжитой этаж: плинтусы, обои, паркет, покраска подъезда, перила, батареи, картины,
 * двери с номерами, лифт с табло, коридорные вещи по теме этажа. Считается на клиенте
 * из id чанка (подъезд + этаж), данные мира не трогает и лимит чанков не занимает.
 *
 * Раскладка этажа — из world/src/generate.ts (локальные координаты чанка):
 *   лестница z 0..3 (площадка x 8..12), коридор z 3.05..4.925, квартира z 5.075..11.8,
 *   проём квартиры x 4..6 на z = 5, лифт (10, 4), перегородка комнат x = 6, окна на z = 11.8.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { STAIR_WALL, STAIR_WALL_DEPTH, STAIR_WALL_TOP, STAIR_WALL_Z } from "./stairWall";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, DoubleSide, MeshStandardMaterial, type Group } from "three";
import type { ChunkData } from "@game/shared";
import { useStore } from "../../core/store";
import { paintSurface } from "../style";
import { FloorAnimated } from "./Animated";
import { Builder, labelAtlas, labelQuad, mergeQuads, rng } from "./build";
import { ResourceCache } from './resourceCache';
import { parquetMaterial, wallpaperMaterial } from "./patterns";
import * as P from "./props";
import { apartmentNumber, floorTheme, type FloorTheme, type HallProp } from "./themes";

const BAND_H = 1.4;
const OFF = 0.015; // отступ накладных панелей от плоскости стены (против мерцания)
const CEIL = 2.9; // низ плиты верхнего этажа
const LIFT_Z = 3.75; // плоскость дверей лифта

export function parseFloorId(id: string): { entrance: number; floor: number } | null {
  const m = /^e([12])f(\d)$/.exec(id);
  return m ? { entrance: Number(m[1]), floor: Number(m[2]) } : null;
}

/**
 * Отрезок стены от (x1,z1) к (x2,z2): центр, длина и поворот так, чтобы лицо панели
 * смотрело вправо от направления обхода (нормаль = (−dz, dx)). Панель сдвигается на OFF по нормали.
 */
function face(x1: number, z1: number, x2: number, z2: number, off = OFF) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const nx = -dz / len;
  const nz = dx / len;
  return { x: (x1 + x2) / 2 + nx * off, z: (z1 + z2) / 2 + nz * off, len, ry: Math.atan2(-dz, dx) };
}

type DoorSpec = P.DoorOptions & { x: number; z: number; ry: number; open: number; slot?: 0 | 1 | 2 };

/**
 * Двери этажа — там же, где декоративные двери N7 (x 2 и 7, world/src/interior.ts; их коробки ChunkView прячет):
 * x 2 — щитовая (без номера), x 4..6 — двустворчатая дверь игрока, распахнута в квартиру, x 7 — соседи (Валентина).
 */
export function floorDoors(entrance: number, floor: number): DoorSpec[] {
  void entrance;
  void floor;
  const z = 4.925 + P.DOOR_INSET; // лицо к коридору (−z): коробка уходит в стену
  return [
    { x: 2.0, z, ry: Math.PI, open: 0, width: 1.0, slot: 0 },
    { x: 5.0, z: 5.0, ry: Math.PI, open: 1.75, width: 2.0, double: true, slot: 1 },
    { x: 7.0, z, ry: Math.PI, open: 0, width: 1.0, slot: 2 },
  ];
}

function hallProp(kind: HallProp) {
  switch (kind) {
    case "mailboxes": return P.mailboxes();
    case "bike": return P.bike();
    case "pram": return P.pram();
    case "plant": return P.plant(true);
    case "shoerack": return P.shoerack();
    case "boxes": return P.boxes();
    case "extinguisher": return P.extinguisher();
    case "ladder": return P.ladder();
    case "bags": return P.bags();
    case "sled": return P.sled();
  }
}

/** Вся «твёрдая» часть декора этажа одной геометрией (один draw call). */
function buildFloorDecor(entrance: number, floor: number, theme: FloorTheme, doorFrame: BufferGeometry, secondExit: boolean) {
  const b = new Builder();
  const random = rng(theme.seed * 7);
  const hallSkirt = "#4f4a46";

  // ---------- плинтусы: вдоль лица стены, обход такой, чтобы нормаль смотрела в комнату ----------
  const skirt = (x1: number, z1: number, x2: number, z2: number, color = theme.baseboard) => {
    const f = face(x1, z1, x2, z2, 0.02);
    b.box(f.len, 0.11, 0.035, color, { x: f.x, y: 0.055, z: f.z, ry: f.ry });
  };
  // квартира
  skirt(11.8, 11.8, 0.2, 11.8); // задняя стена
  skirt(0.2, 11.8, 0.2, 5.075); // левая
  skirt(11.8, 5.075, 11.8, 11.8); // правая
  skirt(5.925, 11.8, 5.925, 6.0); // перегородка, запад
  skirt(6.075, 6.0, 6.075, 11.8); // перегородка, восток
  skirt(6.075, 6.0, 5.925, 6.0); // торец перегородки
  skirt(0.2, 5.075, 3.95, 5.075); // стена коридора (сторона квартиры)
  skirt(6.05, 5.075, 11.8, 5.075);
  // коридор
  skirt(3.95, 4.925, 0.2, 4.925, hallSkirt);
  skirt(11.8, 4.925, 6.05, 4.925, hallSkirt);
  skirt(0.2, 3.05, 8.0, 3.05, hallSkirt); // парапет лестничной клетки
  skirt(entrance === 1 ? 11.8 : 0.2, entrance === 1 ? 3.05 : 4.925, entrance === 1 ? 11.8 : 0.2, entrance === 1 ? 4.925 : 3.05, hallSkirt);
  // площадка лестницы
  skirt(8.0, 0.1, 11.8, 0.1, hallSkirt);
  skirt(11.8, 0.1, 11.8, 2.9, hallSkirt);

  // ---------- покраска подъезда: панель снизу и тёмный поясок ----------
  const band = (x1: number, z1: number, x2: number, z2: number) => {
    const f = face(x1, z1, x2, z2);
    b.plane(f.len, BAND_H, theme.band, { x: f.x, y: BAND_H / 2 + 0.11, z: f.z, ry: f.ry });
    b.box(f.len, 0.05, 0.02, "#5a4a40", { x: f.x, y: BAND_H + 0.14, z: f.z, ry: f.ry });
  };
  // лестничная клетка: южная стена (на 1-м этаже — с проёмом входа x 4..8), торцы
  if (floor === 1) {
    band(0.2, 0.1, 3.9, 0.1);
    band(8.1, 0.1, 11.8, 0.1);
    band(0.2, 2.9, 0.2, 0.1);
    for (const part of STAIR_WALL) {
      const height = STAIR_WALL_TOP - part.bottom;
      b.box(part.width, height, STAIR_WALL_DEPTH, "#f3ddbd", { x: part.x, y: part.bottom + height / 2, z: STAIR_WALL_Z });
    }
  } else band(0.2, 0.1, 11.8, 0.1);
  band(11.8, 0.1, 11.8, 2.9);
  // коридор: стена с дверями (вырезы под наличники) и торцы
  band(1.3, 4.925, 0.2, 4.925);
  band(3.95, 4.925, 2.7, 4.925);
  band(6.3, 4.925, 6.05, 4.925);
  band(11.8, 4.925, 7.7, 4.925);
  if (entrance === 1) band(11.8, 3.05, 11.8, floor === 4 ? 4.0 : 4.925);
  else band(0.2, floor === 4 ? 4.0 : 4.925, 0.2, 3.05);
  if (floor > 1) band(0.2, 3.05, 8.0, 3.05); // парапет (1 м) — покрашен целиком
  if (floor === 1) band(8.0, 3.05, 0.2, 3.05);

  // ---------- лестница: поручни и перила ----------
  const RAIL = "#a8743f";
  const POST = "#5b6b78";
  if (floor > 1) {
    // поручень по верху перегородки между маршами (y 1) и по верху парапета коридора
    b.box(3.1, 0.07, 0.14, RAIL, { x: 6.5, y: 1.04, z: 1.5 });
    b.box(7.8, 0.07, 0.17, RAIL, { x: 4.1, y: 1.04, z: 2.975 });
    // марш 1: от (8, 0) вниз к (5, −1.5) вдоль южной стены
    b.box(3.36, 0.05, 0.05, RAIL, { x: 6.5, y: 0.2, z: 0.22, rz: 0.4636 });
    for (const x of [7.7, 6.5, 5.3]) b.box(0.04, 0.95, 0.04, POST, { x, y: -(8 - x) * 0.5 + 0.475, z: 0.22 });
    // марш 2: от (5, −1.5) вниз к (8, −3) вдоль парапета
    b.box(3.36, 0.05, 0.05, RAIL, { x: 6.5, y: -1.8, z: 2.82, rz: -0.4636 });
    for (const x of [5.3, 6.5, 7.7]) b.box(0.04, 0.95, 0.04, POST, { x, y: -1.5 - (x - 5) * 0.5 + 0.475, z: 2.82 });
  }

  // ---------- окна лестницы: внутренняя сторона фасадных окон (x 2 и 10, стекло 1.5×1.25 на y 1.8) ----------
  for (const wx of secondExit ? [2] : [2, 10]) {
    // стекло — прозрачное, в Animated.tsx (WindowGlass)
    b.box(1.7, 0.1, 0.25, "#f6e1bd", { x: wx, y: 1.12, z: 0.2 });
    for (const sx of [-0.78, 0.78]) b.box(0.06, 1.37, 0.05, "#f9ebd5", { x: wx + sx, y: 1.8, z: 0.125 });
    b.box(1.62, 0.06, 0.05, "#f9ebd5", { x: wx, y: 2.455, z: 0.125 });
    b.box(0.05, 1.3, 0.04, "#f9ebd5", { x: wx, y: 1.8, z: 0.13 });
    b.box(1.55, 0.05, 0.04, "#f9ebd5", { x: wx, y: 1.8, z: 0.13 });
  }
  if (!secondExit) b.add(P.radiator(7), { x: 10, y: 0.05, z: 0.3 });
  if (floor === 1) b.add(P.radiator(7), { x: 2, y: 0.05, z: 0.3 });

  // люстры, створки лифта, шторы, дверца холодильника и крышка плиты двигаются — они в Animated.tsx (G10)

  // ---------- двери ----------
  for (const d of floorDoors(entrance, floor)) {
    // двустворчатая дверь квартиры: коробка здесь, створки — отдельно, они открываются/закрываются (AnimatedDoor)
    if (d.double) b.add(doorFrame, { x: d.x, y: 0, z: d.z, ry: d.ry });
    else b.add(P.door(theme, d), { x: d.x, y: 0, z: d.z, ry: d.ry });
    if (d.open === 0) b.add(P.doormat(["#7a5a3a", "#4f6b8f", "#8a4a3e"][Math.floor(random() * 3)]!), { x: d.x, y: 0, z: 4.55 });
  }
  b.add(P.doormat("#8a7a6a"), { x: 5, y: 0, z: 4.55 });
  b.add(P.switchPlate(), { x: 6.2, y: 1.2, z: 5.075 + 0.01 });
  b.add(P.switchPlate(), { x: 3.2, y: 1.25, z: 4.925 - 0.01, ry: Math.PI });
  // прихожая: вешалка с крючками и зеркало на стене коридора со стороны квартиры
  b.box(0.5, 0.04, 0.04, "#6b4b36", { x: 3.5, y: 1.7, z: 5.1 });
  for (const hx of [3.35, 3.5, 3.65]) b.box(0.02, 0.08, 0.05, "#d9a441", { x: hx, y: 1.64, z: 5.12 });
  b.box(0.35, 0.9, 0.02, "#6b4b36", { x: 2.6, y: 1.5, z: 5.09 });
  b.box(0.3, 0.84, 0.01, "#cfe3ea", { x: 2.6, y: 1.5, z: 5.105 });

  // ---------- лифт: двери на z 3.75 (лицом к площадке), кабина уходит до стены коридора; Ваня стоит внутри (10, 0, 4) ----------
  b.add(P.elevator({ depth: 1.15, doors: false }), { x: 10, y: 0, z: LIFT_Z, ry: Math.PI });

  // ---------- вещи в коридоре по теме этажа: у парапета, лицом в коридор ----------
  theme.hallProps.forEach((kind, i) => {
    if (kind === "extinguisher") return; // огнетушитель теперь из данных (prop), его можно взять — decor/Carry
    if (kind === "ladder") return b.add(P.ladder(), { x: 3.3, y: 0, z: 4.72, ry: Math.PI });
    const x = 2.0 + i * 1.0 + random() * 0.2;
    b.add(hallProp(kind), { x, y: 0, z: 3.42, ry: (random() - 0.5) * 0.3 });
  });
  if (floor === 1) b.add(P.noticeBoard(), { x: 8.3, y: 1.0, z: 4.925 - 0.02, ry: Math.PI });
  b.add(P.picture((theme.pictures[0]! + 3) % 6, 0.5, 0.4), { x: 3.3, y: 1.95, z: 4.925 - 0.02, ry: Math.PI });

  // ---------- квартира: левая комната (стол, кровать, шкаф из данных) ----------
  b.add(P.rug(2.6, 2.2, theme.rug), { x: 3.2, y: 0.014, z: 8.6 });
  b.add(P.nightstand(), { x: 3.55, y: 0, z: 11.2, ry: Math.PI });
  b.add(P.chair("#956944"), { x: 2.4, y: 0, z: 7.1 });
  b.add(P.chair("#956944"), { x: 3.6, y: 0, z: 7.1 });
  if (floor % 2 === 0) b.add(P.tv(), { x: 0.55, y: 0, z: 9.0, ry: Math.PI / 2 });
  else b.add(P.plant(true), { x: 0.5, y: 0, z: 8.8 });
  b.add(P.bookshelf(), { x: 0.34, y: 1.25, z: 11.0, ry: Math.PI / 2 });
  b.add(P.plant(false), { x: 0.5, y: 0, z: 11.45 });
  b.add(P.picture(theme.pictures[0]!), { x: 4.7, y: 1.95, z: 11.8 - OFF, ry: Math.PI });
  b.add(P.picture(theme.pictures[1]!, 0.5, 0.6), { x: 5.925 - OFF, y: 1.8, z: 8.0, ry: -Math.PI / 2 });
  // ---------- правая комната / кухня ----------
  b.add(P.rug(1.6, 1.0, theme.rug), { x: 8.5, y: 0.014, z: 10.3 });
  // узкий комод под вещи для сборов: prop-* лежат на y 0.9..1.1 в сетке x 6.9..9.9, z 7..7.6 (generate.ts); середина кухни свободна
  b.box(3.5, 0.86, 1.1, "#a97a4d", { x: 8.4, y: 0.43, z: 7.3 });
  b.box(3.6, 0.04, 1.2, "#bf8f5f", { x: 8.4, y: 0.88, z: 7.3 });
  for (const dx of [-1.15, 0, 1.15]) for (const y of [0.25, 0.6]) b.box(0.16, 0.03, 0.02, "#d9a441", { x: 8.4 + dx, y, z: 6.76 });
  for (const dx of [-0.58, 0.58]) b.box(0.015, 0.8, 0.02, "#8f6238", { x: 8.4 + dx, y: 0.43, z: 6.755 });
  b.add(P.chair("#956944"), { x: 7.0, y: 0, z: 9.9, ry: Math.PI });
  b.add(P.fridge({ door: false }), { x: 6.6, y: 0, z: 11.4, ry: Math.PI }); // лицом в кухню
  b.add(P.stove({ lid: false }), { x: 10.2, y: 0, z: 11.4, ry: -Math.PI / 2 });
  b.box(0.02, 0.6, 4.2, "#e9eef0", { x: 11.8 - 0.01, y: 1.2, z: 9 }); // кухонный фартук
  b.add(P.picture(theme.pictures[2]!, 0.6, 0.45), { x: 6.075 + OFF, y: 1.75, z: 9.5, ry: Math.PI / 2 });
  // ---------- окна квартиры: комната x 2.5 (всё наше) и кухня x 8 (стекло — из данных, бьётся по флагу) ----------
  for (const wx of [2.5, 8]) {
    const zf = 11.8 - OFF;
    for (const sx of [-1.03, 1.03]) b.box(0.06, 1.62, 0.05, "#f9ebd5", { x: wx + sx, y: 1.7, z: zf - 0.01 });
    b.box(2.12, 0.06, 0.05, "#f9ebd5", { x: wx, y: 2.48, z: zf - 0.01 });
    b.box(0.05, 1.5, 0.04, "#f9ebd5", { x: wx, y: 1.7, z: zf - 0.015 });
    b.box(2.0, 0.05, 0.04, "#f9ebd5", { x: wx, y: 1.7, z: zf - 0.015 });
    b.box(2.3, 0.06, 0.25, "#f6e1bd", { x: wx, y: 0.92, z: 11.68 });
    b.add(P.curtains(2.0, 1.7, theme.curtain, { panels: false }), { x: wx, y: 0.8, z: 11.62 });
    b.add(P.radiator(8), { x: wx, y: 0.05, z: 11.6, ry: Math.PI });
  }

  // ---------- подъезд, 1-й этаж: двустворчатая входная дверь в проёме x 4..8, створки распахнуты наружу ----------
  if (floor === 1) {
    b.add(P.entranceDoor(theme), { x: 6.0, y: 0, z: -0.1 + P.DOOR_INSET, ry: Math.PI });
  }
  return b.build();
}

/** Панели обоев: отдельный материал с процедурным узором. Вырезы под окна (x 1.5..3.5 и 7..9, y 0.95..2.45). */
function buildWallpaper() {
  const b = new Builder();
  const panel = (x1: number, z1: number, x2: number, z2: number, y0: number, y1: number) => {
    const f = face(x1, z1, x2, z2);
    b.plane(f.len, y1 - y0, "#ffffff", { x: f.x, y: (y0 + y1) / 2, z: f.z, ry: f.ry });
  };
  for (const [x1, x2] of [
    [11.8, 9.0],
    [7.0, 3.5],
    [1.5, 0.2],
  ])
    panel(x1!, 11.8, x2!, 11.8, 0.11, CEIL);
  for (const [x1, x2] of [
    [9.0, 7.0],
    [3.5, 1.5],
  ]) {
    panel(x1!, 11.8, x2!, 11.8, 0.11, 0.95);
    panel(x1!, 11.8, x2!, 11.8, 2.45, CEIL);
  }
  panel(0.2, 11.8, 0.2, 5.075, 0.11, CEIL);
  panel(11.8, 5.075, 11.8, 11.8, 0.11, CEIL);
  panel(5.925, 11.8, 5.925, 6.0, 0.11, CEIL);
  panel(6.075, 6.0, 6.075, 11.8, 0.11, CEIL);
  panel(6.075, 6.0, 5.925, 6.0, 0.11, CEIL);
  panel(0.2, 5.075, 3.95, 5.075, 0.11, CEIL);
  panel(6.05, 5.075, 11.8, 5.075, 0.11, CEIL);
  return b.build();
}

function buildApartmentFloor() {
  const b = new Builder();
  b.plane(11.6, 6.725, "#ffffff", { x: 6, y: 0.012, z: 8.4375, rx: -Math.PI / 2 });
  return b.build();
}

/** Побелённый потолок квартиры и коридора (низ плиты верхнего этажа тёмный и не всегда загружен). */
function buildCeiling() {
  const b = new Builder();
  b.plane(11.6, 6.725, "#f6f1e8", { x: 6, y: CEIL - 0.012, z: 8.4375, rx: Math.PI / 2 });
  b.plane(11.6, 1.875, "#efe9df", { x: 6, y: CEIL - 0.012, z: 3.9875, rx: Math.PI / 2 });
  b.plane(3.8, 2.8, "#efe9df", { x: 10, y: CEIL - 0.012, z: 1.5, rx: Math.PI / 2 });
  return b.build();
}

function buildHallFloor(floor: number) {
  const b = new Builder();
  b.plane(11.6, 1.875, "#ffffff", { x: 6, y: 0.012, z: 3.9875, rx: -Math.PI / 2 });
  if (floor === 1) b.plane(11.6, 2.8, "#ffffff", { x: 6, y: 0.012, z: 1.5, rx: -Math.PI / 2 });
  else b.plane(3.8, 2.8, "#ffffff", { x: 10, y: 0.012, z: 1.5, rx: -Math.PI / 2 });
  return b.build();
}

/** Надписи: номера квартир на дверях и табло лифта — один атлас, одна геометрия. */
function buildLabels(entrance: number, floor: number) {
    const doors = floorDoors(entrance, floor).filter((d) => d.slot !== undefined);
    const { texture, cells } = labelAtlas([
      ...doors.map((d) =>
        d.slot === 0
          ? { text: "⚡ 380 В", bg: "#f2c94c", fg: "#2a2a2a", font: "bold 56px sans-serif" }
          : { text: String(apartmentNumber(entrance, floor, d.slot!)), bg: "#d9a441", fg: "#3a2a14", font: "bold 84px sans-serif" },
      ),
      { text: String(floor), bg: "#111417", fg: "#ff6a3a", font: "bold 96px monospace" },
    ]);
    let plate = new BufferGeometry();
    const quads: BufferGeometry[] = [];
    doors.forEach((d, i) => {
      if (d.double) {
        // табличка на подвижной створке: локально к створке (петля в нуле), ставится в AnimatedDoor
        const lw = (d.width! - 0.1) / 2 - 0.01;
        plate = labelQuad(0.22, 0.11, cells[i]!, { x: -lw * 0.5, y: 1.62, z: P.LEAF_Z + 0.075 });
        return;
      }
      const p = P.doorPlate(d);
      // локальные координаты двери → чанк (поворот двери ry)
      const x = d.x + p.x * Math.cos(d.ry) + p.z * Math.sin(d.ry);
      const z = d.z - p.x * Math.sin(d.ry) + p.z * Math.cos(d.ry);
      quads.push(labelQuad(0.22, 0.11, cells[i]!, { x, y: p.y, z, ry: d.ry + p.ry }));
    });
    // табло лифта: корпус на y 2.56, лицо в сторону −z (лифт повёрнут на π)
    quads.push(labelQuad(0.42, 0.18, cells[doors.length]!, { x: 10, y: 2.56, z: LIFT_Z - 0.105, ry: Math.PI }));
    return { texture, geometry: mergeQuads(quads), plate };
}

/** Створки двери квартиры: E на «Дверь квартиры» закрывает/открывает (store.doors по чанку), поворот с анимацией. */
function AnimatedDoor({ chunkId, parts, spec, plate, plateMaterial }: { chunkId: string; parts: ReturnType<typeof P.doorParts>; spec: DoorSpec; plate: BufferGeometry; plateMaterial: MeshStandardMaterial }) {
  const open = useStore((s) => s.doors[chunkId] ?? false);
  const initialOpen = useRef(open);
  const leaves = useRef<(Group | null)[]>([]);
  useFrame((_, dt) => {
    parts.leaves.forEach((l, i) => {
      const g = leaves.current[i];
      if (!g) return;
      const target = open ? l.s * spec.open : 0;
      g.rotation.y += (target - g.rotation.y) * Math.min(1, dt * 7);
    });
  });
  return (
    <group position={[spec.x, 0, spec.z]} rotation-y={spec.ry}>
      {parts.leaves.map((l, i) => (
        <group key={i} ref={(el) => void (leaves.current[i] = el)} position={[l.hinge, 0, 0]} rotation-y={initialOpen.current ? l.s * spec.open : 0}>
          <mesh geometry={l.geometry} material={solidMaterial} castShadow />
          {i === parts.leaves.length - 1 && <mesh geometry={plate} material={plateMaterial} />}
        </group>
      ))}
    </group>
  );
}

const solidMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
paintSurface(solidMaterial);

export function Interior({ chunk, flags = [] }: { chunk: ChunkData; flags?: readonly string[] }) {
  const parsed = parseFloorId(chunk.id);
  if (!parsed) return null;
  return <FloorInterior chunkId={chunk.id} entrance={parsed.entrance} floor={parsed.floor} origin={chunk.bounds.min} flags={flags} />;
}

export function buildFloorResources(entrance:number,floor:number,secondExit=false) {
  const theme=floorTheme(entrance,floor);
  const mainDoor=floorDoors(entrance,floor).find(d=>d.double)!;
  const parts=P.doorParts(theme,mainDoor);
  const solid=buildFloorDecor(entrance,floor,theme,parts.frame,secondExit);
  const paper=buildWallpaper(),floors=buildApartmentFloor(),hall=buildHallFloor(floor),ceiling=buildCeiling();
  const labels=buildLabels(entrance,floor);
  const materials={
      paper: wallpaperMaterial(theme.wallpaper, theme.wallpaperAccent, theme.pattern),
      floor: parquetMaterial(theme.floor, theme.floorAlt, true),
      hall: parquetMaterial(theme.hallFloor, theme.band, false),
      label: new MeshStandardMaterial({ map: labels.texture, roughness: 0.6, side: DoubleSide }),
  };
  return {mainDoor,parts,solid,paper,floors,hall,ceiling,labels,materials};
}

type FloorResources=ReturnType<typeof buildFloorResources>;
const geometries=(r:FloorResources)=>[r.solid,r.paper,r.floors,r.hall,r.ceiling,r.labels.geometry,r.labels.plate,r.parts.frame,...r.parts.leaves.map(l=>l.geometry)];
export function floorResourceBytes(r:FloorResources):number {
  const arrays=new Set<ArrayBufferLike>();
  for(const g of geometries(r)) {
    for(const a of Object.values(g.attributes)) arrays.add(a.array.buffer);
    if(g.index) arrays.add(g.index.array.buffer);
  }
  const image=r.labels.texture.image as {width:number;height:number};
  return [...arrays].reduce((sum,a)=>sum+a.byteLength,0)+Math.ceil(image.width*image.height*4*4/3);
}
export function disposeFloorResources(r:FloorResources) {
  geometries(r).forEach(g=>g.dispose());
  Object.values(r.materials).forEach(m=>m.dispose());
  r.labels.texture.dispose();
}
// Max six cached floors / ~32 MiB of buffers+label mipmaps; active floors stay pinned.
export const floorResourceCache=new ResourceCache<FloorResources>({entries:6,bytes:32*1024*1024},floorResourceBytes,disposeFloorResources);

function FloorInterior({ chunkId, entrance, floor, origin, flags }: { chunkId: string; entrance: number; floor: number; origin: readonly number[]; flags: readonly string[] }) {
  // Второй выход (`spawn_exit`, N13): на его месте в первом подъезде нет окна и радиатора
  const secondExit=entrance===1&&floor===1&&flags.includes('spawn_exit');
  const key=`${entrance}:${floor}:${secondExit}`;
  const [resource,setResource]=useState<{key:string;value:FloorResources}|null>(null);
  // Acquire at commit, not during render: StrictMode/abandoned renders must not leak leases.
  useLayoutEffect(()=>{
    const lease=floorResourceCache.acquire(key,()=>buildFloorResources(entrance,floor,secondExit));
    setResource({key,value:lease.value});
    return lease.release;
  },[key,entrance,floor,secondExit]);
  if(!resource || resource.key!==key) return null;
  const {solid,paper,floors,hall,ceiling,labels,materials,mainDoor,parts}=resource.value;
  return (
    <group dispose={null} position={[origin[0]!, origin[1]!, origin[2]!]} name={`interior-${entrance}-${floor}`}>
      <mesh geometry={solid} material={solidMaterial} castShadow receiveShadow />
      <mesh geometry={paper} material={materials.paper} />
      <mesh geometry={floors} material={materials.floor} receiveShadow />
      <mesh geometry={hall} material={materials.hall} receiveShadow />
      <mesh geometry={ceiling} material={solidMaterial} />
      <mesh geometry={labels.geometry} material={materials.label} />
      <AnimatedDoor chunkId={chunkId} parts={parts} spec={mainDoor} plate={labels.plate} plateMaterial={materials.label} />
      <FloorAnimated chunkId={chunkId} origin={origin} floor={floor} curtain={floorTheme(entrance, floor).curtain} flags={flags} />
    </group>
  );
}
