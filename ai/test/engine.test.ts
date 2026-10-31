import { describe, expect, it } from "vitest";
import { MISTAKE_NOTES, type NpcRequest } from "@game/shared";
import { createAi, createInMemoryStore, loadData } from "../src/index";
import type { AiData } from "../src/data";

const data: AiData = {
  facts: new Map([
    [
      "cover.where",
      {
        id: "cover.where",
        skill: "cover",
        fact: "Укройся под столом, подальше от окон.",
        explanations: ["Правило: под стол.", "Пример: стол защитит.", "Что будет, если: у окна порежет стеклом."],
        mistakes: { cover_window: "У окна лопается стекло." },
        source: { title: "test", url: "https://example.org" },
      },
    ],
  ]),
  cards: new Map([
    [
      "papa",
      {
        id: "papa",
        name: "Сергей",
        role: "отец",
        personality: "собранный",
        speech: "коротко",
        recognize: ["Опять ты!"],
        events: {
          quake_started: { goal: "укрыться", facts: ["cover.where"], templates: ["Т1", "Т2", "Т3"] },
          mistake: { goal: "остановить", facts: [], templates: ["Стоп."] },
        },
      },
    ],
    [
      "vanya",
      {
        id: "vanya",
        name: "Ваня",
        role: "в лифте",
        personality: "паникует",
        speech: "сбивчиво",
        reactions: { calmed: ["Ладно, дышу."], panicked: ["Не ори!"] },
        events: { free_talk: { goal: "ответить", facts: [], templates: ["Ты тут?"] } },
      },
    ],
  ]),
};

/** fetch, которого нет: Ollama выключена */
const offline = (async () => {
  throw new Error("ECONNREFUSED");
}) as unknown as typeof fetch;

/** fetch, который отвечает стримом, как Ollama */
function ollamaReplying(text: string): typeof fetch {
  return (async () => {
    const lines = text.split(" ").map((w, i) => JSON.stringify({ message: { content: (i ? " " : "") + w }, done: false }) + "\n");
    lines.push(JSON.stringify({ done: true }) + "\n");
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const l of lines) c.enqueue(new TextEncoder().encode(l));
        c.close();
      },
    });
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
}

/** fetch, который не отвечает, пока его не отменят */
const hanging = ((_url: string, init?: RequestInit) =>
  new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;

const req = (over: Partial<NpcRequest> = {}): NpcRequest => ({
  npcId: "papa",
  playerId: "p1",
  event: "quake_started",
  context: { flags: [], facts: [] },
  ...over,
});

describe("ИИ-движок", () => {
  it("без Ollama отвечает шаблоном и не падает", async () => {
    const ai = createAi({ memory: createInMemoryStore(), data, fetchImpl: offline });
    const res = await ai.say(req());
    expect(res.source).toBe("template");
    expect(res.text).toBe("Т1");
    expect(res.factIds).toEqual(["cover.where"]);
  });

  it("берёт шаблон, который игрок ещё не слышал", async () => {
    const ai = createAi({ memory: createInMemoryStore(), data, fetchImpl: offline });
    const texts: string[] = [];
    for (let i = 0; i < 3; i++) texts.push((await ai.say(req())).text);
    expect(texts.sort()).toEqual(["Т1", "Т2", "Т3"]);
  });

  it("обновляет память: факт рассказан, вариант объяснения использован, NPC встречен", async () => {
    const memory = createInMemoryStore();
    const ai = createAi({ memory, data, fetchImpl: offline });
    await ai.say(req());
    await ai.say(req());
    const m = await memory.get("p1");
    expect(m.toldFacts["cover.where"]).toBe(2);
    expect(m.usedExplanations["cover.where"]).toEqual([0, 1]);
    expect(m.npc.papa?.met).toBe(1);
    expect(m.recent).toHaveLength(2);
  });

  it("ошибку запоминает по навыку и объясняет из базы знаний", async () => {
    const memory = createInMemoryStore();
    const ai = createAi({ memory, data, fetchImpl: offline });
    const res = await ai.say(req({ event: "mistake", context: { flags: [], facts: [], mistake: { skill: "cover", code: "cover_window" } } }));
    expect(res.text).toContain("У окна лопается стекло.");
    expect((await memory.get("p1")).mistakes.cover).toBe(1);
  });

  it("узнаёт игрока в новом прохождении", async () => {
    const ai = createAi({ memory: createInMemoryStore(), data, fetchImpl: offline });
    expect((await ai.say(req())).text).not.toContain("Опять ты!");
    ai.resetRun?.("p1");
    expect((await ai.say(req())).text).toContain("Опять ты!");
  });

  it("тон игрока даёт outcome у Вани", async () => {
    const ai = createAi({ memory: createInMemoryStore(), data, fetchImpl: offline });
    const calm = await ai.say(req({ npcId: "vanya", event: "free_talk", playerMessage: "Спокойно, я рядом, сообщу спасателям" }));
    expect(calm.outcome).toBe("calmed");
    const rude = await ai.say(req({ npcId: "vanya", event: "free_talk", playerMessage: "Заткнись уже" }));
    expect(rude.outcome).toBe("panicked");
    expect(rude.text).toContain("Не ори!");
  });

  it("Ваня не произносит учебные факты и не считает их рассказанными", async () => {
    const memory = createInMemoryStore();
    const ai = createAi({ memory, data, fetchImpl: offline });
    const res = await ai.say(req({ npcId: "vanya", event: "free_talk", playerMessage: "почему у окна опасно?" }));
    expect(res.factIds).toEqual([]);
    expect(res.text).not.toContain("Правило");
    expect((await memory.get("p1")).toldFacts["cover.where"]).toBeUndefined();
  });

  it("с Ollama отвечает моделью стримом", async () => {
    const ai = createAi({ memory: createInMemoryStore(), data, fetchImpl: ollamaReplying("Под стол, быстро!") });
    const tokens: string[] = [];
    const res = await ai.sayStream!(req(), (t) => tokens.push(t));
    expect(res.source).toBe("llm");
    expect(res.text).toBe("Под стол, быстро!");
    expect(tokens.join("")).toBe("Под стол, быстро!");
  });

  it("если модель молчит дольше таймаута — шаблон", async () => {
    const ai = createAi({ memory: createInMemoryStore(), data, fetchImpl: hanging, timeoutMs: 50 });
    const res = await ai.say(req());
    expect(res.source).toBe("template");
  });
});

describe("данные в ai/knowledge и ai/npcs", () => {
  const real = loadData();
  it("у каждого события в карточке минимум 3 шаблона", () => {
    for (const card of real.cards.values())
      for (const [ev, e] of Object.entries(card.events)) expect(e?.templates.length, `${card.id}.${ev}`).toBeGreaterThanOrEqual(3);
  });
  it("карточки ссылаются только на существующие факты", () => {
    for (const card of real.cards.values())
      for (const e of Object.values(card.events)) for (const id of e?.facts ?? []) expect(real.facts.has(id), id).toBe(true);
  });
});

describe("коды ошибок сценария (D-58)", () => {
  const real = loadData();
  const keys = new Set([...real.facts.values()].flatMap((f) => Object.keys(f.mistakes ?? {})));
  it("у каждого кода мини-игр и реплик NPC есть объяснение в базе знаний", () => {
    const npcCodes = ["cover_run_out", "cover_window", "cover_wardrobe", "gas_light_switch", "elevator_call", "z_collapse", "z_canopy_danger", "z_wire_danger"];
    for (const code of [...Object.keys(MISTAKE_NOTES), ...npcCodes]) expect(keys.has(code), code).toBe(true);
  });
});
