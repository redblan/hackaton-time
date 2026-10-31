import { describe, expect, it } from "vitest";
import type { NpcRequest } from "@game/shared";
import { createAi, createInMemoryStore, createLlmQueue, QueueSkip } from "../src/index";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Задача, которую завершаем вручную */
function deferred() {
  let resolve!: (v: string) => void;
  const promise = new Promise<string>((r) => (resolve = r));
  return { promise, resolve };
}
const reason = (e: unknown) => (e instanceof QueueSkip ? e.reason : String(e));

describe("очередь к модели (M10)", () => {
  it("по одному: второй ждёт, пока закончит первый", async () => {
    const q = createLlmQueue({ concurrency: 1, maxQueue: 3 });
    const a = deferred();
    const order: string[] = [];
    const p1 = q.run("p1", 1000, () => a.promise.then((v) => (order.push(v), v)));
    const p2 = q.run("p2", 1000, async () => (order.push("b"), "b"));
    expect(q.stats()).toMatchObject({ running: 1, waiting: 1 });
    a.resolve("a");
    await Promise.all([p1, p2]);
    expect(order).toEqual(["a", "b"]);
    expect(q.stats()).toMatchObject({ running: 0, waiting: 0, done: 2 });
  });

  it("очередь полна — сразу отказ", async () => {
    const q = createLlmQueue({ concurrency: 1, maxQueue: 1 });
    const a = deferred();
    void q.run("p1", 1000, () => a.promise);
    const waiting = q.run("p2", 1000, async () => "ok");
    await expect(q.run("p3", 1000, async () => "no")).rejects.toSatisfy((e) => reason(e) === "full");
    a.resolve("a");
    await expect(waiting).resolves.toBe("ok");
  });

  it("не дождался места до срока — отказ в срок, а не когда освободится", async () => {
    const q = createLlmQueue({ concurrency: 1, maxQueue: 3 });
    const a = deferred();
    void q.run("p1", 1000, () => a.promise);
    const t0 = Date.now();
    await expect(q.run("p2", 50, async () => "late")).rejects.toSatisfy((e) => reason(e) === "deadline");
    expect(Date.now() - t0).toBeLessThan(500);
    a.resolve("a");
  });

  it("у игрока ждёт один запрос: новый вытесняет старый", async () => {
    const q = createLlmQueue({ concurrency: 1, maxQueue: 3 });
    const a = deferred();
    void q.run("p1", 1000, () => a.promise);
    const old = q.run("p2", 1000, async () => "старый");
    const fresh = q.run("p2", 1000, async () => "новый");
    await expect(old).rejects.toSatisfy((e) => reason(e) === "replaced");
    a.resolve("a");
    await expect(fresh).resolves.toBe("новый");
  });

  it("задача получает остаток срока", async () => {
    const q = createLlmQueue({ concurrency: 1 });
    const a = deferred();
    void q.run("p1", 1000, () => a.promise);
    const got = q.run("p2", 500, async (remaining) => remaining);
    await sleep(100);
    a.resolve("a");
    const remaining = await got;
    expect(remaining).toBeLessThanOrEqual(420);
    expect(remaining).toBeGreaterThan(0);
  });
});

describe("3 игрока одновременно, модель медленная", () => {
  /** Ollama, которая отвечает за `ms` и по одному */
  function slowOllama(ms: number): typeof fetch {
    return (async (_u: string, init?: RequestInit) => {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        init?.signal?.addEventListener("abort", () => (clearTimeout(t), reject(new Error("aborted"))));
      });
      const body = JSON.stringify({ message: { content: "Под стол, быстро!" }, done: false }) + "\n" + JSON.stringify({ done: true }) + "\n";
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
  }
  const req = (playerId: string): NpcRequest => ({ npcId: "papa", playerId, event: "quake_started", context: { flags: [], facts: [] } });

  it("никто не ждёт дольше таймаута: первый — модель, остальные — шаблон", async () => {
    const ai = createAi({ memory: createInMemoryStore(), fetchImpl: slowOllama(120), timeoutMs: 200 });
    const t0 = Date.now();
    const res = await Promise.all(["a", "b", "c"].map((p) => ai.say(req(p))));
    const took = Date.now() - t0;
    expect(res[0]!.source).toBe("llm");
    expect(res.filter((r) => r.source === "template").length).toBeGreaterThanOrEqual(1);
    expect(res.every((r) => r.text.length > 0)).toBe(true);
    expect(took).toBeLessThan(600);
    expect(ai.llmStats()).toMatchObject({ running: 0, waiting: 0 });
  });
});
