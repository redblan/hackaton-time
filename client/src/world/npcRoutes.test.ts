import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ChunkData, WorldObject } from "@game/shared";
import { getColliders } from "./ChunkView";
import { NPC_ROUTES, routePoint, type Route } from "./npcRoutes";

const CHUNKS_DIR = join(__dirname, "../../../world/chunks");
const BODY_RADIUS = 0.2;
const TALK_RADIUS = 4;

const chunks = readdirSync(CHUNKS_DIR)
  .filter((file) => /^(?:e[12]f[1-9]|y[0-2][0-3])\.json$/.test(file)) // palette.json — не чанк
  .map((file) => JSON.parse(readFileSync(join(CHUNKS_DIR, file), "utf8")) as ChunkData);

type Npc = Extract<WorldObject, { kind: "npc" }>;

const flagsFor = (npc: Npc) => (npc.when ? [npc.when] : []);

describe("маршруты NPC", () => {
  it("идёт по кругу, делает паузы и возвращается в начало", () => {
    const route: Route = [[0, 0], [2, 0]];
    expect(routePoint(route, 0)).toMatchObject({ x: 0, z: 0, moving: true });
    expect(routePoint(route, 1)).toMatchObject({ moving: true });
    expect(routePoint(route, 2)).toMatchObject({ x: 2, z: 0, moving: false });
    const lap = 2 * (2 / 1.1 + 1.8);
    expect(routePoint(route, lap).x).toBeCloseTo(0);
  });

  it("смотрит по ходу: вперёд это -z", () => {
    expect(routePoint([[0, 0], [0, -2]], 0.5).rotY).toBeCloseTo(0);
    expect(Math.abs(routePoint([[0, 0], [0, 2]], 0.5).rotY)).toBeCloseTo(Math.PI);
  });

  const placed = chunks.flatMap((chunk) =>
    chunk.objects
      .filter((o): o is Npc => o.kind === "npc" && o.npcId in NPC_ROUTES)
      .map((npc) => ({ chunk, npc })),
  );

  it("все маршруты есть в мире", () => {
    expect(new Set(placed.map((p) => p.npc.npcId))).toEqual(new Set(Object.keys(NPC_ROUTES)));
  });

  it.each(placed.map((p) => [`${p.chunk.id}/${p.npc.npcId}`, p] as const))("%s не идёт сквозь стены", (_, { chunk, npc }) => {
    const walls = getColliders(chunk, flagsFor(npc));
    const route = NPC_ROUTES[npc.npcId]!;
    for (let t = 0; t < 40; t += 0.1) {
      const { x, z } = routePoint(route, t);
      const px = npc.pos[0] + x;
      const pz = npc.pos[2] + z;
      const py = npc.pos[1] + 1;
      const hit = walls.find(
        (w) =>
          px > w.min[0] - BODY_RADIUS && px < w.max[0] + BODY_RADIUS &&
          pz > w.min[2] - BODY_RADIUS && pz < w.max[2] + BODY_RADIUS &&
          py > w.min[1] && py < w.max[1],
      );
      expect(hit, `(${px.toFixed(1)}, ${pz.toFixed(1)})`).toBeUndefined();
      expect(Math.hypot(x, z)).toBeLessThan(TALK_RADIUS);
    }
  });
});
