/**
 * Стена над входом 1-го этажа. Проём x 4..8 высотой во весь этаж, а марш со 2-го этажа идёт вдоль
 * него: со ступенек были видны двор и можно было шагнуть наружу. Стена повторяет линию марша,
 * под ним остаётся проход. Координаты локальные для чанка этажа.
 */
const TOP = 3;
const STEP_RUN = 0.3;
const STEP_RISE = 0.15;
const STEP_THICKNESS = 0.3;
const MID_LANDING_BOTTOM = 1.2;
/** Выше этого проходит игрок. Пока ступень выше, щели не видно: стена начинается за ней. */
const HEAD_CLEARANCE = 1.75;

export const STAIR_WALL_Z = 0.05;
export const STAIR_WALL_DEPTH = 0.2;

export interface StairWallPart {
  x: number;
  width: number;
  bottom: number;
}

export const STAIR_WALL: StairWallPart[] = [
  { x: 4.5, width: 1, bottom: MID_LANDING_BOTTOM },
  ...Array.from({ length: 10 }, (_, i) => ({
    x: 8 - STEP_RUN * (i + 0.5),
    width: STEP_RUN,
    bottom: Math.max(TOP - STEP_RISE * (i + 1) - STEP_THICKNESS, i < 8 ? HEAD_CLEARANCE : 0),
  })),
];

export const STAIR_WALL_TOP = TOP;
