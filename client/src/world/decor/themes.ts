/**
 * Тема этажа: каждый этаж выглядит по-своему — обои, пол, цвет дверей, панель покраски
 * на лестнице и что стоит в коридоре. Детерминировано по подъезду и этажу.
 */
import { rng } from "./build";

export type WallpaperPattern = "plain" | "stripes" | "dots" | "diamonds" | "floral";
export type HallProp = "mailboxes" | "bike" | "pram" | "plant" | "shoerack" | "boxes" | "extinguisher" | "ladder" | "bags" | "sled";

export interface FloorTheme {
  seed: number;
  /** Обои в квартире */
  wallpaper: string;
  wallpaperAccent: string;
  pattern: WallpaperPattern;
  /** Пол в квартире и в коридоре */
  floor: string;
  floorAlt: string;
  hallFloor: string;
  /** Покраска нижней части стен на лестнице и в коридоре (классика подъезда) */
  band: string;
  baseboard: string;
  /** Двери квартир */
  door: string;
  doorDark: string;
  /** Что стоит в коридоре этого этажа */
  hallProps: HallProp[];
  /** Шторы и ковёр */
  curtain: string;
  rug: string;
  /** Картины на стенах: индексы сюжетов */
  pictures: number[];
  /** Окна, в которых горит свет снаружи (ночь) */
  litWindows: boolean[];
}

const WALLPAPERS: [string, string, WallpaperPattern][] = [
  ["#f1dcc3", "#d9b08f", "stripes"],
  ["#dfe7d2", "#a9bf93", "floral"],
  ["#f3e3c4", "#cfae7a", "diamonds"],
  ["#e9d6e2", "#bc98b0", "dots"],
  ["#d8e3ea", "#9fb6c6", "stripes"],
  ["#f4e1cf", "#e0a883", "floral"],
  ["#e5e9d0", "#b8c28a", "plain"],
  ["#f0d9d0", "#cfa093", "dots"],
  ["#dce6e3", "#9cb8b1", "diamonds"],
];

const FLOORS: [string, string][] = [
  ["#b98a5c", "#a97a4d"], // паркет
  ["#c7a06f", "#b58f5f"],
  ["#8f8c84", "#7f7c74"], // линолеум серый
  ["#a86d4e", "#96603f"],
  ["#c0b193", "#ae9f82"],
  ["#9e7756", "#8c6646"],
];

const BANDS = ["#8fb0a2", "#b7c48c", "#a7b8cc", "#d2a98a", "#9fb7b0", "#c9b48a", "#b6a4c4", "#9bb59e", "#c7a8a0"];
const DOORS: [string, string][] = [
  ["#8a5a3a", "#6d4529"],
  ["#5f6f7f", "#46545f"],
  ["#a8713f", "#845528"],
  ["#6a5244", "#4f3b30"],
  ["#9a6a4a", "#7a4f33"],
  ["#4e6b5d", "#3a5146"],
];
const CURTAINS = ["#d9a066", "#8fb3c9", "#c9869a", "#a9c48d", "#e0c070", "#b08fc9"];
const RUGS = ["#a84a3e", "#4f6b8f", "#8a6a3e", "#5f7f5a", "#9b4f7a", "#c08a4a"];

const HALL_SETS: HallProp[][] = [
  ["plant", "bags"], // 1 этаж (почтовые ящики — в данных N7)
  ["bike"],
  ["plant", "shoerack"], // Валентина
  ["extinguisher", "boxes"],
  ["pram"],
  ["shoerack", "bags"],
  ["plant", "sled"],
  ["boxes", "bike"],
  ["ladder", "extinguisher"], // 9 этаж: люк на крышу
];

export function floorTheme(entrance: number, floor: number): FloorTheme {
  const seed = entrance * 100 + floor;
  const r = rng(seed);
  const i = (floor - 1 + (entrance - 1) * 4) % 9;
  const [wallpaper, wallpaperAccent, pattern] = WALLPAPERS[i]!;
  const [floorColor, floorAlt] = FLOORS[(i + entrance) % FLOORS.length]!;
  const [door, doorDark] = DOORS[(i + 2 * entrance) % DOORS.length]!;
  return {
    seed,
    wallpaper,
    wallpaperAccent,
    pattern,
    floor: floorColor,
    floorAlt,
    hallFloor: FLOORS[(i + 3) % FLOORS.length]![0],
    band: BANDS[(i + entrance * 2) % BANDS.length]!,
    baseboard: "#6b4b36",
    door,
    doorDark,
    hallProps: HALL_SETS[(floor - 1) % HALL_SETS.length]!,
    curtain: CURTAINS[(i + entrance) % CURTAINS.length]!,
    rug: RUGS[(i * 2 + entrance) % RUGS.length]!,
    pictures: [Math.floor(r() * 6), Math.floor(r() * 6), Math.floor(r() * 6)],
    litWindows: Array.from({ length: 6 }, () => r() < 0.55),
  };
}

/** Номер квартиры: по 2 на этаж, как на табличке этажа из N7 (slot 1 — игрока, 2 — соседей); slot 0 — щитовая. */
export function apartmentNumber(entrance: number, floor: number, slot: 0 | 1 | 2) {
  return (entrance - 1) * 18 + (floor - 1) * 2 + Math.max(1, slot);
}
