import { describe, expect, it } from "vitest";
import type { NpcRequest } from "@game/shared";
import { createAi, createInMemoryStore, extractSlots, requiredSlots } from "../src/index";
import { createDispatcher } from "../src/dispatcher";

const ADDRESS = "ул. Садовая, 14";
const FLAGS = ["lift_vanya", "fire_f5", "wire"];

const open = (flags = FLAGS): NpcRequest => ({
  npcId: "dispatcher",
  playerId: "p1",
  event: "dispatcher_open",
  context: { flags, facts: [], address: ADDRESS },
});
const say = (playerMessage: string, flags = FLAGS): NpcRequest => ({
  npcId: "dispatcher",
  playerId: "p1",
  event: "free_talk",
  playerMessage,
  context: { flags, facts: [], address: ADDRESS },
});

describe("диспетчер 112", () => {
  it("вытаскивает слоты из текста", () => {
    const s = extractSlots("Улица Садовая 14, землетрясение, трое пострадавших, у одного кровотечение", ADDRESS);
    expect([...s].sort()).toEqual(["address", "condition", "victims", "what"]);
    expect(extractSlots("Садовая улица, дом 41", ADDRESS).has("address")).toBe(false);
    expect(extractSlots("только что тряхнуло", ADDRESS).has("hazard")).toBe(false);
  });

  it("обязательные слоты зависят от флагов (D-23)", () => {
    expect(requiredSlots([])).toEqual(["address", "what", "victims", "condition"]);
    expect(requiredSlots(["lift_vanya", "fire_f6", "gas"])).toEqual(["address", "what", "victims", "condition", "trapped", "fire", "hazard"]);
  });

  it("открытие звонка — без outcome", () => {
    const d = createDispatcher();
    expect(d.respond(open()).outcome).toBeUndefined();
  });

  it("без адреса → slot_missing:address", () => {
    const d = createDispatcher();
    d.respond(open());
    expect(d.respond(say("Землетрясение, трое пострадавших, кровотечение")).outcome).toBe("slot_missing:address");
  });

  it("всё сказано по частям → slots_complete", () => {
    const d = createDispatcher();
    d.respond(open());
    expect(d.respond(say("Садовая 14, землетрясение")).outcome).toBe("slot_missing:victims");
    expect(d.respond(say("Трое пострадавших, один не дышит")).outcome).toBe("slot_missing:trapped");
    expect(d.respond(say("Парень застрял в лифте, на пятом пожар")).outcome).toBe("slot_missing:hazard");
    const last = d.respond(say("Во дворе оборван провод"));
    expect(last.outcome).toBe("slots_complete");
    expect(Object.keys(last.slots ?? {}).sort()).toEqual(["address", "condition", "fire", "hazard", "trapped", "victims", "what"]);
  });

  it("без лифта и пожара их не требует", () => {
    const d = createDispatcher();
    d.respond(open(["gas"]));
    const r = d.respond(say("Садовая 14, землетрясение, двое пострадавших без сознания, во дворе пахнет газом", ["gas"]));
    expect(r.outcome).toBe("slots_complete");
  });

  it("новое прохождение — звонок с нуля", async () => {
    const ai = createAi({ memory: createInMemoryStore() });
    await ai.say(open());
    await ai.say(say("Садовая 14"));
    ai.resetRun?.("p1");
    await ai.say(open());
    expect((await ai.say(say("землетрясение"))).outcome).toBe("slot_missing:address");
  });
});
