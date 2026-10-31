/**
 * Силуэт всего дома (2 подъезда × 9 этажей): фасад с окнами, балконами, цоколем, крышей и козырьками.
 * Это не данные мира (как Landscape): считается на клиенте из раскладки, лимит 3/30 чанков не трогает.
 * Сегмент стен этажа гаснет, когда его чанк загружен и рисуется в деталях ChunkView'ом;
 * балконы, крыша, трубы и цоколь — снаружи объёма чанков, поэтому видны всегда.
 *
 * Фасад совпадает с N4 (world/src/exterior.ts): окна лестницы x 2 и 10 (1.5×1.25 на y 1.8), пояс этажа y 0.15.
 */
import { useEffect, useMemo } from "react";
import { MeshStandardMaterial } from "three";
import { paintSurface } from "../style";
import { Builder, labelAtlas, labelQuad, mergeQuads, rng, useBuilt } from "./build";
import { brickMaterial } from "./patterns";
import * as P from "./props";
import { floorTheme } from "./themes";

const WALL = "#f3ddbd";
const WALL_BACK = "#ecd3b0";
const GLASS = "#8ebac8";
const FRAME = "#f9ebd5";
const SILL = "#f6e1bd";
const BAND = "#d1a582";
const CONCRETE = "#cdbfa9";
const METAL = "#9aa3a8";

const solidMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
paintSurface(solidMaterial);
const brick = brickMaterial("#b8613f", "#d9c9b0");

/** Окно с рамой, крестовиной и подоконником; лицом к +z, всё перед плоскостью z = 0 (ставится на лицо стены). */
function windowFrame(b: Builder, w: number, h: number, p: { x: number; y: number; z: number; ry?: number }) {
  const g = new Builder();
  g.box(w, h, 0.04, GLASS, { z: 0.02 });
  for (const sx of [-w / 2 - 0.03, w / 2 + 0.03]) g.box(0.06, h + 0.12, 0.05, FRAME, { x: sx, z: 0.045 });
  g.box(w + 0.12, 0.06, 0.05, FRAME, { y: h / 2 + 0.03, z: 0.045 });
  g.box(0.06, h, 0.05, FRAME, { z: 0.045 });
  g.box(w, 0.06, 0.05, FRAME, { z: 0.045 });
  g.box(w + 0.2, 0.1, 0.3, SILL, { y: -h / 2 - 0.05, z: 0.15 });
  b.add(g.build(), p);
}

/** Стены одного этажа одного подъезда (локально: x 0..12, y 0..3). Гаснет, когда чанк загружен. */
function buildShell(entrance: number, floor: number) {
  const b = new Builder();
  const theme = floorTheme(entrance, floor);
  // перекрытие (потолок этажа ниже, пока этот чанк не загружен) — как slab/landing в данных
  b.box(12, 0.1, 9, "#d9c9b0", { x: 6, y: -0.05, z: 7.5 });
  b.box(floor === 1 ? 12 : 4, 0.1, 3, "#d9c9b0", { x: floor === 1 ? 6 : 10, y: -0.05, z: 1.5 });
  // южная стена (двор): на 1-м этаже — проём входа x 4..8
  if (floor === 1) {
    b.box(4, 3, 0.2, WALL, { x: 2, y: 1.5, z: 0 });
    b.box(4, 3, 0.2, WALL, { x: 10, y: 1.5, z: 0 });
    b.box(4, 0.5, 0.2, WALL, { x: 6, y: 2.75, z: 0 });
    b.box(4, 2.5, 0.3, "#3a3330", { x: 6, y: 1.25, z: 0.05 }); // тамбур за дверью
    b.add(P.door(theme, { width: 3.9, double: true }), { x: 6, y: 0, z: -0.1 + P.DOOR_INSET, ry: Math.PI });
    b.box(0.3, 0.12, 0.2, "#ffe3a0", { x: 6, y: 2.4, z: -0.2 }); // лампа над входом
  } else b.box(12, 3, 0.2, WALL, { x: 6, y: 1.5, z: 0 });
  if (floor === 1) for (const bx of [2, 10]) b.box(4, 0.16, 0.08, BAND, { x: bx, y: 0.15, z: -0.13 });
  else b.box(12, 0.16, 0.08, BAND, { x: 6, y: 0.15, z: -0.13 });
  for (const wx of [2, 10]) windowFrame(b, 1.5, 1.25, { x: wx, y: 1.8, z: -0.1, ry: Math.PI });
  // северная стена: окна квартиры (комната x 2.5, кухня x 8 — как внутри)
  b.box(12, 3, 0.2, WALL_BACK, { x: 6, y: 1.5, z: 11.9 });
  b.box(12, 0.16, 0.08, BAND, { x: 6, y: 0.15, z: 12.03 });
  for (const wx of [2.5, 8]) windowFrame(b, 2.0, 1.5, { x: wx, y: 1.7, z: 12.0 });
  // торцы дома
  if (entrance === 1) {
    b.box(0.2, 3, 12, WALL_BACK, { x: 0.1, y: 1.5, z: 6 });
    b.box(0.08, 0.16, 12.2, BAND, { x: -0.03, y: 0.15, z: 6 });
    for (const wz of [1.5, 8.5]) windowFrame(b, 1.3, 1.3, { x: 0.0, y: 1.75, z: wz, ry: -Math.PI / 2 });
  } else {
    b.box(0.2, 3, 12, WALL_BACK, { x: 11.9, y: 1.5, z: 6 });
    b.box(0.08, 0.16, 12.2, BAND, { x: 12.03, y: 0.15, z: 6 });
    for (const wz of [1.5, 6.5, 10]) windowFrame(b, 1.3, 1.3, { x: 12.0, y: 1.75, z: wz, ry: Math.PI / 2 });
  }
  return b.build();
}

/** Балкон на южном фасаде (над входом): плита, ограждение с крашеным щитом, дверь и окно, вещи. */
function balcony(b: Builder, entrance: number, floor: number) {
  const theme = floorTheme(entrance, floor);
  const r = rng(entrance * 31 + floor * 7);
  const x = 6;
  const z0 = -0.1;
  b.box(2.9, 0.14, 1.1, CONCRETE, { x, y: -0.02, z: z0 - 0.55 });
  b.box(2.9, 0.06, 1.1, CONCRETE, { x, y: 0.05, z: z0 - 0.55 }, 1.06);
  // ограждение: щит (цвет этажа), поручень, прутья, боковины
  b.box(2.8, 0.5, 0.04, theme.band, { x, y: 0.35, z: z0 - 1.08 });
  b.box(2.9, 0.05, 0.08, METAL, { x, y: 1.02, z: z0 - 1.08 });
  for (let i = 0; i <= 10; i++) b.box(0.03, 0.42, 0.03, METAL, { x: x - 1.4 + i * 0.28, y: 0.8, z: z0 - 1.08 });
  for (const sx of [-1.43, 1.43]) {
    b.box(0.04, 1.0, 1.0, theme.band, { x: x + sx, y: 0.55, z: z0 - 0.58 }, 0.95);
    b.box(0.06, 0.05, 1.05, METAL, { x: x + sx, y: 1.02, z: z0 - 0.58 });
  }
  // остекление на части этажей
  if (floor % 3 === 0) {
    b.box(2.9, 1.7, 0.03, GLASS, { x, y: 1.9, z: z0 - 1.09 }, 1.05);
    for (let i = 0; i <= 3; i++) b.box(0.05, 1.7, 0.05, FRAME, { x: x - 1.45 + i * 0.9667, y: 1.9, z: z0 - 1.09 });
    b.box(2.95, 0.06, 0.06, FRAME, { x, y: 2.76, z: z0 - 1.09 });
    b.box(2.95, 0.12, 1.1, CONCRETE, { x, y: 2.84, z: z0 - 0.55 });
  }
  // дверь на балкон и окно рядом (накладные, чуть перед стеной)
  b.box(0.8, 2.0, 0.06, theme.door, { x: x - 0.9, y: 1.0, z: z0 - 0.03 });
  b.box(0.6, 0.8, 0.02, GLASS, { x: x - 0.9, y: 1.45, z: z0 - 0.065 });
  b.box(0.9, 0.08, 0.06, theme.doorDark, { x: x - 0.9, y: 2.04, z: z0 - 0.04 });
  windowFrame(b, 1.2, 1.3, { x: x + 0.55, y: 1.65, z: z0, ry: Math.PI });
  // вещи: коробки / растение / бельё
  const kind = Math.floor(r() * 3);
  if (kind === 0) b.add(P.boxes(), { x: x + 1.0, y: 0.08, z: z0 - 0.6, ry: 0.4 });
  if (kind === 1) b.add(P.plant(false), { x: x + 1.1, y: 0.08, z: z0 - 0.7 });
  if (kind === 2) {
    b.box(2.4, 0.015, 0.015, "#e9e2d2", { x, y: 1.75, z: z0 - 0.6 });
    const cloth = ["#e46a6a", "#f2f0ea", "#6a9be4", "#f0d36a"];
    for (let i = 0; i < 4; i++) b.box(0.4, 0.5 + r() * 0.3, 0.02, cloth[i]!, { x: x - 0.9 + i * 0.6, y: 1.45, z: z0 - 0.6, rz: (r() - 0.5) * 0.1 });
  }
}

/** Всё, что снаружи объёма чанков: балконы, цоколь-линии, водостоки, швы панелей, крыша. Один меш на дом. */
function buildExtras() {
  const b = new Builder();
  for (const entrance of [1, 2]) {
    const x0 = (entrance - 1) * 12;
    for (let floor = 2; floor <= 9; floor++) {
      const sub = new Builder();
      balcony(sub, entrance, floor);
      b.add(sub.build(), { x: x0, y: (floor - 1) * 3, z: 0 });
    }
    // водосточная труба на углу и «швы» панелей между подъездами
    b.cylinder(0.07, 0.07, 27.4, METAL, { x: x0 + (entrance === 1 ? -0.16 : 12.16), y: 13.7, z: -0.16 }, 8);
    for (let f = 0; f < 9; f++) b.box(0.22, 0.06, 0.22, "#6f787e", { x: x0 + (entrance === 1 ? -0.16 : 12.16), y: f * 3 + 1.5, z: -0.16 });
    b.cylinder(0.08, 0.1, 0.5, "#6f787e", { x: x0 + (entrance === 1 ? -0.16 : 12.16), y: 0.25, z: -0.3, rx: -0.5 }, 8);
    // номер подъезда — табличка над козырьком (цифра — квад из атласа, см. Building)
    b.box(0.6, 0.4, 0.04, "#2e4a6b", { x: x0 + 6, y: 3.4, z: -0.13 });
  }
  b.box(0.04, 27, 0.03, "#c9b193", { x: 12, y: 13.5, z: -0.115 });
  b.box(0.04, 27, 0.03, "#c9b193", { x: 12, y: 13.5, z: 12.015 });
  // крыша: плита с парапетом, машинные отделения лифтов, антенна, вентшахты
  b.box(24.6, 0.3, 12.6, "#6b7a84", { x: 12, y: 27.15, z: 5.9 });
  b.box(24.6, 0.5, 0.25, "#d9cbb6", { x: 12, y: 27.5, z: -0.3 });
  b.box(24.6, 0.5, 0.25, "#d9cbb6", { x: 12, y: 27.5, z: 12.1 });
  b.box(0.25, 0.5, 12.6, "#d9cbb6", { x: -0.3, y: 27.5, z: 5.9 });
  b.box(0.25, 0.5, 12.6, "#d9cbb6", { x: 24.3, y: 27.5, z: 5.9 });
  for (const mx of [10, 22]) {
    b.box(2.8, 2.4, 2.6, "#e9d6ba", { x: mx, y: 28.5, z: 4 });
    b.box(3.0, 0.2, 2.8, "#6b7a84", { x: mx, y: 29.8, z: 4 });
    b.box(0.8, 1.8, 0.06, "#6f787e", { x: mx, y: 28.2, z: 2.68 });
  }
  b.cylinder(0.03, 0.03, 3.2, METAL, { x: 3, y: 28.9, z: 2 }, 6);
  for (const h of [29.4, 30.0, 30.4]) b.box(1.2 - (h - 29.4), 0.03, 0.03, METAL, { x: 3, y: h, z: 2 });
  const r = rng(99);
  for (let i = 0; i < 7; i++) b.cylinder(0.14, 0.16, 0.7, "#8e9aa2", { x: 1.5 + r() * 21, y: 27.6, z: 2.5 + r() * 8 }, 8);
  return b.build();
}

/** Цоколь: кирпичная лента по низу фасада — отдельный материал (кладка в шейдере). */
function buildPlinth() {
  const b = new Builder();
  // южная лента — с разрывами под входы (x 4..8 и 16..20)
  for (const [x1, x2] of [
    [-0.2, 4],
    [8, 16],
    [20, 24.2],
  ])
    b.box(x2! - x1!, 0.75, 0.08, "#ffffff", { x: (x1! + x2!) / 2, y: 0.37, z: -0.14 });
  b.box(0.08, 0.75, 12.4, "#ffffff", { x: -0.14, y: 0.37, z: 6 });
  b.box(0.08, 0.75, 12.4, "#ffffff", { x: 24.14, y: 0.37, z: 6 });
  b.box(24.4, 0.75, 0.08, "#ffffff", { x: 12, y: 0.37, z: 12.14 });
  return b.build();
}

/** Козырёк подъезда — как в данных двора (y{e-1}0: canopy 5×0.25×3 на (6, 2.7, 10)); гаснет, когда тот чанк загружен. */
function buildCanopy() {
  const b = new Builder();
  b.box(5, 0.25, 3, "#dbad79", { x: 6, y: 2.7, z: -2 });
  for (const sx of [-2.2, 2.2]) b.box(0.1, 0.1, 1.9, "#8b6a4a", { x: 6 + sx, y: 2.0, z: -1.6, rx: -0.75 });
  return b.build();
}

function Segment({ entrance, floor, hidden }: { entrance: number; floor: number; hidden: boolean }) {
  const geometry = useBuilt(() => buildShell(entrance, floor), [entrance, floor]);
  return <mesh geometry={geometry} material={solidMaterial} position={[(entrance - 1) * 12, (floor - 1) * 3, 0]} visible={!hidden} castShadow receiveShadow />;
}

function useEntranceLabels() {
  return useMemo(() => {
    const { texture, cells } = labelAtlas([1, 2].map((n) => ({ text: String(n), bg: "#2e4a6b", fg: "#f4f1ea", font: "bold 100px sans-serif" })));
    const geometry = mergeQuads(cells.map((cell, i) => labelQuad(0.5, 0.32, cell, { x: i * 12 + 6, y: 3.4, z: -0.155, ry: Math.PI })));
    const material = new MeshStandardMaterial({ map: texture, roughness: 0.6 });
    return { geometry, material, texture };
  }, []);
}

export function Building({ loaded }: { loaded: ReadonlySet<string> }) {
  const extras = useBuilt(buildExtras, []);
  const labels = useEntranceLabels();
  useEffect(
    () => () => {
      labels.geometry.dispose();
      labels.material.dispose();
      labels.texture.dispose();
    },
    [labels],
  );
  const plinth = useBuilt(buildPlinth, []);
  const canopy = useBuilt(buildCanopy, []);
  const segments = useMemo(() => {
    const out: { entrance: number; floor: number }[] = [];
    for (const entrance of [1, 2]) for (let floor = 1; floor <= 9; floor++) out.push({ entrance, floor });
    return out;
  }, []);
  return (
    <group name="building">
      {segments.map((s) => (
        <Segment key={`${s.entrance}-${s.floor}`} entrance={s.entrance} floor={s.floor} hidden={loaded.has(`e${s.entrance}f${s.floor}`)} />
      ))}
      <mesh geometry={extras} material={solidMaterial} castShadow receiveShadow />
      <mesh geometry={plinth} material={brick} />
      <mesh geometry={labels.geometry} material={labels.material} />
      {[1, 2].map((entrance) => (
        <mesh key={entrance} geometry={canopy} material={solidMaterial} position={[(entrance - 1) * 12, 0, 0]} visible={!loaded.has(`y${entrance - 1}0`)} castShadow />
      ))}
    </group>
  );
}
