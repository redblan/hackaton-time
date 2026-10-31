/**
 * M4: outcome сценария срабатывают и когда отвечает модель, а не шаблон.
 * Тон игрока и слоты разбираются до модели; диспетчер и доклад Громову модель не зовут вовсе.
 */
import { describe, expect, it } from "vitest";
import type { NpcRequest } from "@game/shared";
import { createAi, createInMemoryStore } from "../src/index";

let llmCalls = 0;
const llm = (async () => {
  llmCalls++;
  const body = JSON.stringify({ message: { content: "Хорошо, я понял тебя." }, done: false }) + "\n" + JSON.stringify({ done: true }) + "\n";
  return new Response(body, { status: 200 });
}) as unknown as typeof fetch;

const talk = (npcId: NpcRequest["npcId"], playerMessage: string, context: Record<string, unknown> = {}): NpcRequest => ({
  npcId,
  playerId: "m4",
  event: "free_talk",
  playerMessage,
  context: { flags: ["lift_vanya", "wire"], facts: [], address: "ул. Садовая, 14", ...context },
});

describe("outcome при ответах модели (M4)", () => {
  it("Ваня: calmed / panicked, ответ — от модели", async () => {
    const ai = createAi({ memory: createInMemoryStore(), fetchImpl: llm });
    const calm = await ai.say(talk("vanya", "Спокойно, я рядом, сообщу спасателям"));
    expect(calm.source).toBe("llm");
    expect(calm.outcome).toBe("calmed");
    const rude = await ai.say(talk("vanya", "Заткнись уже"));
    expect(rude.source).toBe("llm");
    expect(rude.outcome).toBe("panicked");
  });

  it("Валентина: agreed_to_go, ответ — от модели", async () => {
    const ai = createAi({ memory: createInMemoryStore(), fetchImpl: llm });
    const r = await ai.say(talk("valentina", "Меня зовут Саша, я помогу. Возьмите кота в переноску, пойдёмте вместе"));
    expect(r.source).toBe("llm");
    expect(r.outcome).toBe("agreed_to_go");
  });

  it("диспетчер и доклад Громову: slots_complete / handover_complete без модели", async () => {
    llmCalls = 0;
    const ai = createAi({ memory: createInMemoryStore(), fetchImpl: llm });
    await ai.say({ ...talk("dispatcher", ""), event: "dispatcher_open", playerMessage: undefined });
    const call = await ai.say(talk("dispatcher", "Садовая 14, землетрясение, трое пострадавших, кровотечение. Парень в лифте, во дворе оборван провод"));
    expect(call.outcome).toBe("slots_complete");
    await ai.say({ ...talk("gromov", ""), event: "brigade_arrived", playerMessage: undefined, context: { flags: ["lift_vanya", "wire"], facts: [], tourniquetApplied: false } });
    const rep = await ai.say(talk("gromov", "Трое пострадавших, у мужчины кровотечение, прижимали рану. Парень в лифте, во дворе провод"));
    expect(rep.outcome).toBe("handover_complete");
    expect(llmCalls).toBe(0);
  });
});
