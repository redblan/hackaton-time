import { describe, expect, it } from "vitest";
import { createAi, createInMemoryStore } from "../src/index";
import type { NpcRequest } from "@game/shared";
const req: NpcRequest = { npcId: "papa", playerId: "test", event: "free_talk", playerMessage: "Что делать?", context: { flags: [], facts: [] } };
describe("M22/M26 live character controls", () => {
  it("updates next prompt and temperature without mutating returned cards", async () => {
    let body: { messages: { content: string }[]; options: { temperature: number } } | undefined;
    const ai = createAi({ memory: createInMemoryStore(), fetchImpl: (async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ message: { content: "Держись подальше от окон." } }) + "\n");
    }) as typeof fetch });
    ai.setCharacter!("papa", { traits: "сдержанный", mood: "встревожен", temperature: 0.7 });
    const cards = ai.getCharacters!(); cards[0]!.mood = "corrupted";
    expect(ai.getCharacters!().find(c => c.npcId === "papa")?.mood).toBe("встревожен");
    expect((await ai.say(req)).source).toBe("llm");
    expect(body!.messages[0]!.content).toContain("сдержанный. Настроение: встревожен");
    expect(body!.options.temperature).toBe(0.7);
    expect(ai.getStats!()).toMatchObject({ llm: 1, template: 0, available: true, queued: 0, inFlight: 0 });
  });
  it("templatesOnly prevents model calls and keeps knowledge restrictions", async () => {
    let calls = 0;
    const ai = createAi({ memory: createInMemoryStore(), fetchImpl: (async () => { calls++; throw Error("offline"); }) as typeof fetch });
    ai.setCharacter!("papa", { templatesOnly: true, factsOnly: false, temperature: Infinity });
    expect((await ai.say(req)).source).toBe("template"); expect(calls).toBe(0);
    expect(ai.getCharacters!().find(c => c.npcId === "papa")).toMatchObject({ factsOnly: true, temperature: 0.3 });
    expect(ai.getStats!()).toMatchObject({ llm: 0, template: 1, inFlight: 0 });
  });
  it("clamps temperature, ignores foreign fields, and reports model failure", async () => {
    const ai = createAi({ memory: createInMemoryStore(), fetchImpl: (async () => { throw Error("offline"); }) as typeof fetch });
    expect(ai.setCharacter!("papa", { temperature: 20 })?.temperature).toBe(2);
    expect(ai.setCharacter!("missing" as "papa", {})).toBeNull();
    await ai.say(req);
    expect(ai.getStats!()).toMatchObject({ available: false, template: 1, inFlight: 0 });
  });
});

describe("D-70 unconscious NPCs", () => {
  it.each(["victim_cpr", "victim_unconscious"] as const)("%s never speaks or reports a calming outcome", async npcId => {
    let calls = 0;
    const ai = createAi({ memory: createInMemoryStore(), fetchImpl: (async () => { calls++; throw Error("must not call"); }) as typeof fetch });
    const response = await ai.say({ ...req, npcId, playerMessage: "Спокойно, я рядом" });
    expect(response.source).toBe("template"); expect(response.text).toMatch(/^\(.*\)$/);
    expect(response.outcome).toBeUndefined(); expect(calls).toBe(0);
  });
});
