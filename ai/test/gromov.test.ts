import { describe, expect, it } from "vitest";
import type { JournalEntry, NpcRequest } from "@game/shared";
import { createAi, createInMemoryStore, extractHandover, requiredHandover } from "../src/index";

const FLAGS = ["lift_vanya", "wire"];
const arrive = (tourniquetApplied = true): NpcRequest => ({
  npcId: "gromov",
  playerId: "p1",
  event: "brigade_arrived",
  context: { flags: FLAGS, facts: [], tourniquetApplied },
});
const say = (playerMessage: string): NpcRequest => ({
  npcId: "gromov",
  playerId: "p1",
  event: "free_talk",
  playerMessage,
  context: { flags: FLAGS, facts: [] },
});
const entry = (skill: JournalEntry["skill"], outcome: JournalEntry["outcome"], note: string): JournalEntry => ({
  at: 0,
  playerId: "p1",
  stage: "first_aid",
  skill,
  outcome,
  note,
});

describe("Громов: передача бригаде (D-24)", () => {
  it("пункты из текста и обязательные по флагам", () => {
    expect([...extractHandover("Трое пострадавших, у мужчины кровотечение, наложил жгут в 14:20")].sort()).toEqual(
      ["actions", "condition", "tourniquet_time", "victims"],
    );
    expect(requiredHandover([], false)).toEqual(["victims", "condition", "actions"]);
  });

  it("без времени жгута → handover_missing:tourniquet_time, потом handover_complete", async () => {
    const ai = createAi({ memory: createInMemoryStore() });
    expect((await ai.say(arrive())).outcome).toBeUndefined();
    const r1 = await ai.say(say("Трое пострадавших: мужчина с кровотечением, женщина не дышит. Наложил жгут, делал СЛР. Парень в лифте, во дворе оборван провод"));
    expect(r1.outcome).toBe("handover_missing:tourniquet_time");
    const r2 = await ai.say(say("Жгут в 14:20"));
    expect(r2.outcome).toBe("handover_complete");
    // После доклада Громов говорит обычным разговором, без outcome
    expect((await ai.say(say("А что дальше?"))).outcome).toBeUndefined();
  });

  it("жгута не было — время не требует", async () => {
    const ai = createAi({ memory: createInMemoryStore() });
    await ai.say(arrive(false));
    const r = await ai.say(say("Двое пострадавших, один без сознания, уложили на бок. Парень в лифте, провод во дворе"));
    expect(r.outcome).toBe("handover_complete");
  });
});

describe("Громов: разбор по журналу", () => {
  const journal = [
    entry("cover", "ok", "Укрылся под столом"),
    entry("gas", "mistake", "Потянулся к выключателю при запахе газа"),
    entry("bleeding", "mistake", "Не записал время наложения жгута"),
  ];
  const debrief = (): NpcRequest => ({ npcId: "gromov", playerId: "p1", event: "debrief", context: { flags: [], facts: [], journal } });

  it("сначала что получилось, потом самая опасная ошибка; запоминает ошибки один раз за прохождение", async () => {
    const memory = createInMemoryStore();
    const ai = createAi({ memory });
    const r = await ai.say(debrief());
    expect(r.text.indexOf("укрытие")).toBeLessThan(r.text.indexOf("остановка кровотечения"));
    expect(r.text).toContain("не записал время");
    await ai.say(debrief());
    const m = await memory.get("p1");
    expect(m.mistakes.bleeding).toBe(1);
    expect(m.mistakes.gas).toBe(1);
  });

  it("в следующем прохождении объясняет ту же ошибку другими словами", async () => {
    const ai = createAi({ memory: createInMemoryStore() });
    const first = await ai.say(debrief());
    ai.resetRun?.("p1");
    const second = await ai.say(debrief());
    expect(second.text).toContain("Опять");
    expect(second.text).not.toBe(first.text);
  });
});
