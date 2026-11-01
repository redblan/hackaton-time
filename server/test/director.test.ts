import { describe, expect, it } from "vitest";
import type { ChunkData, StageId, WorldObject } from "@game/shared";
import { direct, initDirector } from "../src/director";

const chunk = (id: string, min: [number, number, number], objects: WorldObject[] = []): ChunkData => ({ id, bounds: { min, max: [min[0] + 12, min[1] + 3, min[2] + 12] }, neighbors: [], objects });
const crew: WorldObject[] = [
  { id: "ambulance", kind: "box", pos: [21, 1.2, -43], size: [2.5, 2.4, 5], color: "#fff" },
  { id: "gromov", kind: "npc", npcId: "gromov", pos: [18, 0, -43] },
  { id: "brigade", kind: "interactable", target: "brigade", pos: [18, 0, -43], radius: 2, label: "Бригада" },
];
const chunks: Record<string, ChunkData> = {
  e1f7: chunk("e1f7", [0, 18, 0]),
  e1f5: chunk("e1f5", [0, 12, 0]),
  e2f5: chunk("e2f5", [12, 12, 0]),
  y13: chunk("y13", [12, 0, -48], crew),
  y03: chunk("y03", [0, 0, -48]),
};
const get = (id: string) => chunks[id];
const yard = (out: ReturnType<typeof direct>) => out.patches.filter((p) => p.chunkId.startsWith("y"));
const room = (stages: StageId[], flags: string[], extra: { addressMissed?: boolean; callOk?: boolean } = {}) => ({
  flags: new Set(["home_f7", ...flags]),
  stages,
  facts: [],
  addressMissed: extra.addressMissed ?? false,
  callOk: extra.callOk ?? false,
});

describe("режиссёр мира", () => {
  it("газ: после толчка облако растёт каждые 10 с, перекрыл кран — рассеивается", () => {
    const d = initDirector();
    let added = 0;
    for (let t = 0; t <= 30; t++) added += direct(d, room(["pack"], []), t, get).patches.filter((p) => p.chunkId === "e1f7" && p.add.length).length;
    expect(added).toBe(4); // 0, 10, 20, 30
    let removed = 0;
    for (let t = 31; t <= 40; t++) removed += direct(d, room(["pack"], ["gas_off_e1f7"]), t, get).patches.filter((p) => p.remove.some((r) => r.startsWith("dir-gas"))).length;
    expect(removed).toBe(4);
    expect(d.gas).toBe(0);
  });

  it("газ не растёт, пока трясёт (этап cover)", () => {
    const d = initDirector();
    for (let t = 0; t < 30; t++) direct(d, room(["cover"], []), t, get);
    expect(d.gas).toBe(0);
  });

  it("огонь расползается после выхода из квартиры, потушили — гарь вместо огня", () => {
    const d = initDirector();
    for (let t = 0; t <= 40; t++) direct(d, room(["exit_apartment"], ["fire_f5"]), t, get);
    expect(d.fire).toBe(3); // 12, 24, 36 с
    const out = direct(d, room(["exit_apartment"], ["fire_f5", "fire_out"]), 41, get);
    const p = out.patches.find((x) => x.chunkId === "e1f5")!;
    expect(p.remove).toContain("dir-fire-0");
    expect(p.add.every((o) => o.id.startsWith("dir-soot-"))).toBe(true);
  });

  it("скорая: нет до звонка; адрес назван — у места сбора через 5 с", () => {
    const d = initDirector();
    expect(yard(direct(d, room(["yard_assess"], []), 0, get))[0]!.remove).toEqual(["ambulance", "gromov", "brigade"]);
    direct(d, room(["triage"], [], { callOk: true }), 10, get);
    expect(yard(direct(d, room(["triage"], []), 14, get))).toEqual([]);
    const here = yard(direct(d, room(["triage"], []), 15, get)).find((p) => p.chunkId === "y13");
    expect(here?.add.map((o) => o.id)).toEqual(["ambulance", "gromov", "brigade"]);
  });

  it("скорая: адрес не назван — позже и в дальнем углу двора (y03)", () => {
    const d = initDirector();
    direct(d, room(["yard_assess"], []), 0, get);
    const call = direct(d, room(["triage"], [], { addressMissed: true }), 10, get);
    expect(call.say[0]!.npcId).toBe("dispatcher");
    expect(yard(direct(d, room(["triage"], []), 20, get))).toEqual([]);
    const out = direct(d, room(["triage"], []), 35, get);
    const far = out.patches.find((p) => p.chunkId === "y03")!;
    const g = far.add.find((o) => o.id === "gromov");
    expect(g && "pos" in g ? g.pos[0] : 0).toBe(0);
    expect(out.say.some((s) => s.npcId === "gromov")).toBe(true);
  });
});
