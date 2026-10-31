import { describe, expect, it } from "vitest";
import { checkLeftBehind, dist, ESCORT, recordTrail, startEscort, stepEscort } from "../src/escort";
import type { Vec3 } from "@game/shared";

describe("сопровождение", () => {
  it("идёт по следу игрока и держит дистанцию", () => {
    const e = startEscort("valentina", "p1", [0, 6, 0]);
    // игрок прошёл буквой Г: вдоль x, потом вдоль z
    const path: Vec3[] = [];
    for (let x = 0.5; x <= 4; x += 0.5) path.push([x, 6, 0]);
    for (let z = 0.5; z <= 4; z += 0.5) path.push([4, 6, z]);
    for (const p of path) recordTrail(e, p);
    const player = path[path.length - 1]!;
    for (let i = 0; i < 50; i++) stepEscort(e, player, 100);
    expect(dist(e.pos, player)).toBeLessThanOrEqual(ESCORT.keepDistance + 0.01);
    expect(e.pos[0]).toBeCloseTo(4); // свернула за угол, а не срезала по диагонали
  });

  it("медленнее игрока: убежал — отстала", () => {
    const e = startEscort("valentina", "p1", [0, 0, 0]);
    let player: Vec3 = [0, 0, 0];
    for (let t = 0; t < 50; t++) {
      player = [0, 0, -(t + 1) * 0.55]; // ~5.5 м/с, бег
      recordTrail(e, player);
      stepEscort(e, player, 100);
    }
    expect(dist(e.pos, player)).toBeGreaterThan(ESCORT.leftBehindDistance);
  });

  it("left_behind не чаще раза в 5 с", () => {
    const e = startEscort("valentina", "p1", [0, 0, 0]);
    const far: Vec3 = [0, 0, -20];
    const near: Vec3 = [0, 0, -3];
    expect(checkLeftBehind(e, near, 0)).toBe(false);
    expect(checkLeftBehind(e, far, 1000)).toBe(true);
    expect(checkLeftBehind(e, far, 3000)).toBe(false);
    expect(checkLeftBehind(e, far, 6000)).toBe(true);
  });
});
