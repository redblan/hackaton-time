/** M17: NPC знают напарников (context.partners, context.playerName). */
import { describe, expect, it } from "vitest";
import type { NpcRequest } from "@game/shared";
import { createAi, createInMemoryStore } from "../src/index";

const offline = (async () => {
  throw new Error("ECONNREFUSED");
}) as unknown as typeof fetch;

const ctx = (me: string, partner: string) => ({
  flags: ["wire"],
  facts: [],
  address: "ул. Садовая, 14",
  mode: "coop2",
  playerName: me,
  partners: [partner],
});
const as = (playerId: string, me: string, partner: string, npcId: NpcRequest["npcId"], event: NpcRequest["event"], playerMessage?: string): NpcRequest => ({
  npcId,
  playerId,
  event,
  playerMessage,
  context: ctx(me, partner),
});

describe("кооп: NPC знают напарников (M17)", () => {
  it("диспетчер принимает доклад от команды: слоты разных игроков складываются", async () => {
    const ai = createAi({ memory: createInMemoryStore(), fetchImpl: offline });
    await ai.say(as("b", "Юра", "Матвей", "dispatcher", "dispatcher_open"));
    const r1 = await ai.say(as("b", "Юра", "Матвей", "dispatcher", "free_talk", "Садовая 14, землетрясение"));
    expect(r1.outcome).toBe("slot_missing:victims");
    // Сказал напарник — засчитывается всей команде
    const r2 = await ai.say(as("a", "Матвей", "Юра", "dispatcher", "free_talk", "Трое пострадавших, кровотечение, во дворе оборван провод"));
    expect(r2.outcome).toBe("slots_complete");
  });

  it("доклад Громову — тоже общий на команду", async () => {
    const ai = createAi({ memory: createInMemoryStore(), fetchImpl: offline });
    await ai.say({ ...as("b", "Юра", "Матвей", "gromov", "brigade_arrived"), context: { ...ctx("Юра", "Матвей"), tourniquetApplied: false } });
    expect((await ai.say(as("b", "Юра", "Матвей", "gromov", "free_talk", "Трое пострадавших, у мужчины кровотечение"))).outcome).toBe("handover_missing:actions");
    expect((await ai.say(as("a", "Матвей", "Юра", "gromov", "free_talk", "Прижимали рану, во дворе провод"))).outcome).toBe("handover_complete");
  });

  it("Громов на разборе благодарит команду по именам", async () => {
    const ai = createAi({ memory: createInMemoryStore(), fetchImpl: offline });
    const r = await ai.say({ ...as("a", "Матвей", "Юра", "gromov", "debrief"), context: { ...ctx("Матвей", "Юра"), journal: [] } });
    expect(r.text).toContain("Спасибо команде: Юра");
  });

  it("Михалыч один раз напоминает держаться вместе с напарником; в solo — нет", async () => {
    const ai = createAi({ memory: createInMemoryStore(), fetchImpl: offline });
    expect((await ai.say(as("a", "Матвей", "Юра", "mihalych", "smoke_ahead"))).text).toContain("Юра — на связи");
    expect((await ai.say(as("a", "Матвей", "Юра", "mihalych", "smoke_ahead"))).text).not.toContain("на связи");
    const solo = await ai.say({ npcId: "mihalych", playerId: "s", event: "smoke_ahead", context: { flags: [], facts: [] } });
    expect(solo.text).not.toContain("на связи");
  });
});
