import { describe, expect, it } from "vitest";
import type { NpcRequest, WorldPatch } from "@game/shared";
import { actionPatch } from "../src/worldActions";
import { createAi, createInMemoryStore } from "../src/index";
const req: NpcRequest = { npcId: "papa", playerId: "test", event: "free_talk", playerMessage: "Принеси аптечку", context: { flags: [], facts: [], startFloor: 9 } };
describe("M21 real world patches", () => {
  it.each([6,7,8,9])("reveals existing first-aid objects on floor %s", floor => {
    const action = actionPatch("first_aid", {...req,context:{...req.context,startFloor:floor}})!;
    expect(action.patch.chunkId).toBe(`e1f${floor}`); expect(action.patch.add.length).toBeGreaterThan(0);
    expect(action.patch.add.every(o => !o.when)).toBe(true);
  });
  it("requires a known floor and the correct NPC; no light/lift workaround", () => {
    expect(actionPatch("first_aid", {...req,context:{flags:[],facts:[]}})).toBeNull();
    expect(actionPatch("first_aid", {...req,npcId:"vanya"})).toBeNull();
    expect(actionPatch("light",req)).toBeNull(); expect(actionPatch("elevator",req)).toBeNull();
  });
  it("reveals ladder and supplies using world data", () => {
    expect(actionPatch("ladder", {...req,npcId:"mihalych"})!.patch.chunkId).toBe("y00");
    expect(actionPatch("water", {...req,npcId:"gromov"})!.patch.chunkId).toBe("y12");
    expect(actionPatch("blankets", {...req,npcId:"gromov"})!.patch.add.length).toBeGreaterThan(0);
  });
  it("delivers a patch before confirming and reuses ids on repeat", async () => {
    const ai = createAi({memory:createInMemoryStore()}); const patches: WorldPatch[]=[];
    ai.setWorldHook!( (_id,patch)=>patches.push(patch) );
    const first=await ai.say(req); await ai.say(req);
    expect(first.text).toContain("Аптечка"); expect(first.source).toBe("template");
    expect(patches).toHaveLength(2); expect(patches[0]).toEqual(patches[1]);
  });
  it("does not claim success if the hook fails", async () => {
    const ai=createAi({memory:createInMemoryStore()}); ai.setWorldHook!(()=>{throw Error("failed");});
    expect((await ai.say(req)).text).toContain("не получилось");
  });
});
