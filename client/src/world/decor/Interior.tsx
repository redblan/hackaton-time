/**
 * Обжитой этаж: плинтусы, обои, паркет, покраска подъезда, перила, батареи, картины,
 * двери с номерами, лифт с табло, коридорные вещи по теме этажа. Считается на клиенте
 * из id чанка (подъезд + этаж), данные мира не трогает и лимит чанков не занимает.
 *
 * Раскладка этажа — из world/src/generate.ts (локальные координаты чанка):
 *   лестница z 0..3 (площадка x 8..12), коридор z 3.05..4.925, квартира z 5.075..11.8,
 *   проём квартиры x 4..6 на z = 5, лифт (10, 4), перегородка комнат x = 6, окна на z = 11.8.
 */
import { useEffect, useMemo } from "react";
import { DoubleSide, MeshStandardMaterial } from "three";
import type { ChunkData } from "@game/shared";
import { paintSurface } from "../style";
import { Builder, labelAtlas, labelQuad, mergeQuads, rng, useBuilt } from "./build";
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
function buildFloorDecor(entrance: number, floor: number, theme: FloorTheme) {
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
  for (const wx of [2, 10]) {
    b.box(1.5, 1.25, 0.02, "#9fcbe0", { x: wx, y: 1.8, z: 0.11 });
    b.box(1.7, 0.1, 0.25, "#f6e1bd", { x: wx, y: 1.12, z: 0.2 });
    for (const sx of [-0.78, 0.78]) b.box(0.06, 1.37, 0.05, "#f9ebd5", { x: wx + sx, y: 1.8, z: 0.125 });
    b.box(1.62, 0.06, 0.05, "#f9ebd5", { x: wx, y: 2.455, z: 0.125 });
    b.box(0.05, 1.3, 0.04, "#f9ebd5", { x: wx, y: 1.8, z: 0.13 });
    b.box(1.55, 0.05, 0.04, "#f9ebd5", { x: wx, y: 1.8, z: 0.13 });
  }
  b.add(P.radiator(7), { x: 10, y: 0.05, z: 0.3 });
  if (floor === 1) b.add(P.radiator(7), { x: 2, y: 0.05, z: 0.3 });

  // ---------- люстры (без источников света — дорого; абажур с «горящей» лампочкой) ----------
  for (const [x, z] of [
    [10, 1.5],
    [5, 4],
    [3, 8.5],
    [9, 8.5],
  ])
    b.add(P.ceilingLamp(), { x, y: CEIL, z });

  // ---------- двери ----------
  for (const d of floorDoors(entrance, floor)) {
    b.add(P.door(theme, d), { x: d.x, y: 0, z: d.z, ry: d.ry });
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
  b.add(P.elevator({ depth: 1.15 }), { x: 10, y: 0, z: LIFT_Z, ry: Math.PI });

  // ---------- вещи в коридоре по теме этажа: у парапета, лицом в коридор ----------
  theme.hallProps.forEach((kind, i) => {
    if (kind === "extinguisher") return b.add(P.extinguisher(), { x: entrance === 1 ? 11.55 : 0.45, y: 0, z: 3.6, ry: entrance === 1 ? -Math.PI / 2 : Math.PI / 2 });
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
  // комод и стол под вещи для сборов: prop-* лежат на y 0.9..1.1 в сетке x 7..9, z 7..9 (generate.ts)
  b.box(2.6, 0.86, 1.4, "#a97a4d", { x: 8, y: 0.43, z: 7.5 });
  b.box(2.7, 0.04, 1.5, "#bf8f5f", { x: 8, y: 0.88, z: 7.5 });
  for (const dx of [-0.85, 0, 0.85]) for (const y of [0.25, 0.6]) b.box(0.16, 0.03, 0.02, "#d9a441", { x: 8 + dx, y, z: 6.81 });
  for (const dx of [-0.43, 0.43]) b.box(0.015, 0.8, 0.02, "#8f6238", { x: 8 + dx, y: 0.43, z: 6.805 });
  b.box(2.6, 0.06, 1.25, "#bf8f5f", { x: 8, y: 0.87, z: 8.83 }); // стол
  for (const dx of [-1.2, 1.2]) for (const dz of [-0.5, 0.5]) b.box(0.08, 0.84, 0.08, "#8f6238", { x: 8 + dx, y: 0.42, z: 8.83 + dz });
  b.add(P.chair("#956944"), { x: 8.4, y: 0, z: 9.75, ry: Math.PI });
  b.add(P.fridge(), { x: 6.6, y: 0, z: 11.4 });
  b.add(P.stove(), { x: 10.2, y: 0, z: 11.4, ry: -Math.PI / 2 });
  b.box(0.02, 0.6, 4.2, "#e9eef0", { x: 11.8 - 0.01, y: 1.2, z: 9 }); // кухонный фартук
  b.add(P.picture(theme.pictures[2]!, 0.6, 0.45), { x: 6.075 + OFF, y: 1.75, z: 9.5, ry: Math.PI / 2 });
  // ---------- окна квартиры: комната x 2.5 (всё наше) и кухня x 8 (стекло — из данных, бьётся по флагу) ----------
  for (const wx of [2.5, 8]) {
    const zf = 11.8 - OFF;
    if (wx === 2.5) b.box(2.0, 1.5, 0.02, "#a8dce4", { x: wx, y: 1.7, z: 11.8 - 0.03 });
    for (const sx of [-1.03, 1.03]) b.box(0.06, 1.62, 0.05, "#f9ebd5", { x: wx + sx, y: 1.7, z: zf - 0.01 });
    b.box(2.12, 0.06, 0.05, "#f9ebd5", { x: wx, y: 2.48, z: zf - 0.01 });
    b.box(0.05, 1.5, 0.04, "#f9ebd5", { x: wx, y: 1.7, z: zf - 0.015 });
    b.box(2.0, 0.05, 0.04, "#f9ebd5", { x: wx, y: 1.7, z: zf - 0.015 });
    b.box(2.3, 0.06, 0.25, "#f6e1bd", { x: wx, y: 0.92, z: 11.68 });
    b.add(P.curtains(2.0, 1.7, theme.curtain), { x: wx, y: 0.8, z: 11.62 });
    b.add(P.radiator(8), { x: wx, y: 0.05, z: 11.6, ry: Math.PI });
  }

  // ---------- подъезд, 1-й этаж: двустворчатая входная дверь в проёме x 4..8, створки распахнуты наружу ----------
  if (floor === 1) {
    b.add(P.door(theme, { width: 3.9, open: -1.8, double: true }), { x: 6.0, y: 0, z: -0.1 + P.DOOR_INSET, ry: Math.PI });
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
function useLabels(entrance: number, floor: number) {
  return useMemo(() => {
    const doors = floorDoors(entrance, floor).filter((d) => d.slot !== undefined);
    const { texture, cells } = labelAtlas([
      ...doors.map((d) =>
        d.slot === 0
          ? { text: "⚡ 380 В", bg: "#f2c94c", fg: "#2a2a2a", font: "bold 56px sans-serif" }
          : { text: String(apartmentNumber(entrance, floor, d.slot!)), bg: "#d9a441", fg: "#3a2a14", font: "bold 84px sans-serif" },
      ),
      { text: String(floor), bg: "#111417", fg: "#ff6a3a", font: "bold 96px monospace" },
    ]);
    const quads = doors.map((d, i) => {
      const p = P.doorPlate(d);
      // локальные координаты двери → чанк (поворот двери ry)
      const x = d.x + p.x * Math.cos(d.ry) + p.z * Math.sin(d.ry);
      const z = d.z - p.x * Math.sin(d.ry) + p.z * Math.cos(d.ry);
      return labelQuad(0.22, 0.11, cells[i]!, { x, y: p.y, z, ry: d.ry + p.ry });
    });
    // табло лифта: корпус на y 2.56, лицо в сторону −z (лифт повёрнут на π)
    quads.push(labelQuad(0.42, 0.18, cells[doors.length]!, { x: 10, y: 2.56, z: LIFT_Z - 0.105, ry: Math.PI }));
    return { texture, geometry: mergeQuads(quads) };
  }, [entrance, floor]);
}

const solidMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
paintSurface(solidMaterial);

export function Interior({ chunk }: { chunk: ChunkData }) {
  const parsed = parseFloorId(chunk.id);
  if (!parsed) return null;
  return <FloorInterior entrance={parsed.entrance} floor={parsed.floor} origin={chunk.bounds.min} />;
}

function FloorInterior({ entrance, floor, origin }: { entrance: number; floor: number; origin: readonly number[] }) {
  const theme = useMemo(() => floorTheme(entrance, floor), [entrance, floor]);
  const solid = useBuilt(() => buildFloorDecor(entrance, floor, theme), [entrance, floor, theme]);
  const paper = useBuilt(buildWallpaper, []);
  const floors = useBuilt(buildApartmentFloor, []);
  const hall = useBuilt(() => buildHallFloor(floor), [floor]);
  const ceiling = useBuilt(buildCeiling, []);
  const labels = useLabels(entrance, floor);
  const materials = useMemo(
    () => ({
      paper: wallpaperMaterial(theme.wallpaper, theme.wallpaperAccent, theme.pattern),
      floor: parquetMaterial(theme.floor, theme.floorAlt, true),
      hall: parquetMaterial(theme.hallFloor, theme.band, false),
      label: new MeshStandardMaterial({ map: labels.texture, roughness: 0.6, side: DoubleSide }),
    }),
    [theme, labels],
  );
  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => m.dispose());
      labels.texture.dispose();
      labels.geometry.dispose();
    },
    [materials, labels],
  );
  return (
    <group position={[origin[0]!, origin[1]!, origin[2]!]} name={`interior-${entrance}-${floor}`}>
      <mesh geometry={solid} material={solidMaterial} castShadow receiveShadow />
      <mesh geometry={paper} material={materials.paper} />
      <mesh geometry={floors} material={materials.floor} receiveShadow />
      <mesh geometry={hall} material={materials.hall} receiveShadow />
      <mesh geometry={ceiling} material={solidMaterial} />
      <mesh geometry={labels.geometry} material={materials.label} />
    </group>
  );
}
