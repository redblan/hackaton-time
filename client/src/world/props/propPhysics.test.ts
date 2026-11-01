import { describe, expect, it } from "vitest";
import type { Aabb, Vec3 } from "@game/shared";
import { crowdLine } from "../crowd/behavior";
import { stepProp, throwVelocity, type PropBody } from "./propPhysics";

const FLOOR: Aabb = { min: [-20, -1, -20], max: [20, 0, 20] };
const WALL: Aabb = { min: [3, 0, -20], max: [3.2, 3, 20] };

const body = (pos: Vec3, vel: Vec3 = [0, 0, 0], bounce = 0.3): PropBody => ({ pos, vel, half: [0.1, 0.1, 0.1], bounce, resting: false });

const run = (b: PropBody, colliders: Aabb[], seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepProp(b, colliders, 1 / 60);
};

describe("stepProp", () => {
  it("падает на пол и останавливается", () => {
    const b = body([0, 2, 0]);
    run(b, [FLOOR], 3);
    expect(b.resting).toBe(true);
    expect(b.pos[1]).toBeCloseTo(0.1, 1);
  });

  it("отскакивает: упругий поднимается выше неупругого", () => {
    const peak = (bounce: number) => {
      const b = body([0, 2, 0], [0, 0, 0], bounce);
      let top = 0;
      let landed = false;
      for (let t = 0; t < 2; t += 1 / 60) {
        const before = b.vel[1];
        stepProp(b, [FLOOR], 1 / 60);
        if (before < 0 && b.vel[1] > 0) landed = true;
        if (landed) top = Math.max(top, b.pos[1]);
      }
      return top;
    };
    expect(peak(0.7)).toBeGreaterThan(peak(0.05));
  });

  it("брошенный на полу тормозит трением", () => {
    const b = body([0, 0.11, 0], [4, 0, 0], 0);
    run(b, [FLOOR], 3);
    expect(b.resting).toBe(true);
    expect(b.pos[0]).toBeLessThan(2);
  });

  it("быстрый бросок не пролетает сквозь стену", () => {
    const b = body([0, 1, 0], [12, 0, 0]);
    run(b, [FLOOR, WALL], 3);
    expect(b.pos[0]).toBeLessThan(3);
  });

  it("упавший мимо мира не теряется", () => {
    const b = body([0, 1, 0]);
    run(b, [], 3);
    expect(b.resting).toBe(true);
    expect(b.pos[1]).toBeGreaterThanOrEqual(0);
  });
});

describe("throwVelocity", () => {
  it("тяжёлое летит медленнее", () => {
    const light = throwVelocity([1, 0, 0], 0.5);
    const heavy = throwVelocity([1, 0, 0], 4.5);
    expect(light[0]).toBeGreaterThan(heavy[0]);
  });
});

describe("crowdLine", () => {
  it("спокойный человек молчит", () => {
    expect(crowdLine(3, null, 1)).toBeNull();
  });

  it("при толчке говорит и замолкает, а не кричит без остановки", () => {
    const said = Array.from({ length: 140 }, (_, i) => crowdLine(3, "quake", i / 10));
    expect(said.some(Boolean)).toBe(true);
    expect(said.some((line) => line === null)).toBe(true);
  });
});
