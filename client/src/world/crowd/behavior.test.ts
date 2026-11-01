import { describe, expect, it } from "vitest";
import type { Vec3 } from "@game/shared";
import { faceAngle, initState, routeAt, stepCrowd, type Actor, type CrowdObject } from "./behavior";

const obj = (type: CrowdObject["type"], route: Vec3[] = [], seed = 5): CrowdObject => ({ id: `c-${type}`, kind: "crowd", type, pos: [0, 0, 0], route, seed });
const run = (o: CrowdObject, actors: Actor[], seconds: number, quake = false) => {
  const s = initState(o);
  for (let t = 0; t < seconds; t += 0.05) stepCrowd(o, s, { actors, quake, dt: 0.05 }, t);
  return s;
};

describe("толпа: поведение", () => {
  it("маршрут детерминирован и замкнут: проходит через точки и возвращается к pos", () => {
    const o = obj("person", [[4, 0, 0]]);
    expect(routeAt(o, 1)).toEqual(routeAt(o, 1));
    const p = routeAt(o, 1);
    expect(p.moving).toBe(true);
    expect(p.x).toBeCloseTo(1.2);
    expect(routeAt(o, 1e6).x).toBeGreaterThanOrEqual(0);
  });

  it("без игроков человек идёт по маршруту", () => {
    const o = obj("person", [[4, 0, 0], [4, 0, 4]]);
    const s = run(o, [], 2);
    expect(Math.hypot(s.x, s.z)).toBeGreaterThan(0.5);
  });

  it("смотрит на говорящего рядом и стоит", () => {
    const o = obj("person", [[0, 0, -10]]);
    const talker: Actor = { pos: [2, 0, 0], speed: 0, speaking: true };
    const start = initState(o);
    stepCrowd(o, start, { actors: [], quake: false, dt: 0 }, 0);
    const s = run(o, [talker], 2);
    expect(Math.hypot(s.x - start.x, s.z - start.z)).toBeLessThan(0.3);
    expect(Math.abs(s.rotY - faceAngle(2 - s.x, -s.z))).toBeLessThan(0.1);
  });

  it("отходит от бегущего игрока, потом возвращается", () => {
    const o = obj("person");
    const runner: Actor = { pos: [1, 0, 0], speed: 5.5, speaking: false };
    const s = run(o, [runner], 0.5);
    expect(s.x).toBeLessThan(-0.2);
    const back = initState(o);
    Object.assign(back, { offX: s.offX, offZ: s.offZ });
    for (let t = 0; t < 5; t += 0.05) stepCrowd(o, back, { actors: [], quake: false, dt: 0.05 }, t);
    expect(Math.hypot(back.offX, back.offZ)).toBeLessThan(0.1);
  });

  it("кошка удирает от бегущего далеко, человек — на шаг", () => {
    const runner: Actor = { pos: [1.2, 0, 0], speed: 5.5, speaking: false };
    const cat = run(obj("cat"), [runner], 1);
    expect(cat.anim).toBe("run");
    expect(cat.x).toBeLessThan(-1.5);
    const walker: Actor = { pos: [1.2, 0, 0], speed: 2, speaking: false };
    expect(run(obj("cat"), [walker], 1).x).toBeCloseTo(0, 1);
  });

  it("голубь взлетает, когда подходишь ближе 2 м, и садится, когда уходишь", () => {
    const o = obj("pigeon");
    const s = run(o, [{ pos: [1.5, 0, 0], speed: 1, speaking: false }], 1.5);
    expect(s.y).toBeGreaterThan(1.5);
    for (let t = 0; t < 12; t += 0.05) stepCrowd(o, s, { actors: [], quake: false, dt: 0.05 }, t);
    expect(s.y).toBeLessThan(0.2);
  });

  it("игрок этажом выше не пугает", () => {
    const s = run(obj("pigeon"), [{ pos: [0.5, 3, 0], speed: 5.5, speaking: false }], 1);
    expect(s.y).toBeLessThan(0.1);
  });

  it("при толчке люди приседают или бегут от дома (−z)", () => {
    const results = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => run(obj("person", [], seed), [], 1, true));
    expect(results.some((s) => s.crouch)).toBe(true);
    const runners = results.filter((s) => !s.crouch);
    expect(runners.length).toBeGreaterThan(0);
    for (const s of runners) expect(s.z).toBeLessThan(-2);
  });
});
