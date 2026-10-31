/**
 * Интеграция на настоящих сокетах: вход → solo → сопровождение Валентины → left_behind (D-26)
 * → «перезапуск сервера» (новый Game на том же хранилище) → перезаход в ту же комнату.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Server } from "socket.io";
import { io as ioc, type Socket } from "socket.io-client";
import type { AiModule, ChunkData, ClientToServer, GameEvent, NpcPublic, ServerToClient } from "@game/shared";

const seen: GameEvent[] = [];
vi.mock("@game/shared", async (orig) => {
  const mod = await orig<typeof import("@game/shared")>();
  return {
    ...mod,
    reduce: (state: Parameters<typeof mod.reduce>[0], event: GameEvent) => {
      seen.push(event);
      return mod.reduce(state, event);
    },
  };
});

const { login } = await import("../src/auth");
const { ChunkStore } = await import("../src/chunks");
const { MemStore } = await import("../src/db");
const { Game } = await import("../src/game");

const dir = mkdtempSync(join(tmpdir(), "chunks-"));
const chunk: ChunkData = {
  id: "e1f3",
  bounds: { min: [0, 6, 0], max: [12, 9, 12] },
  neighbors: [],
  objects: [
    { id: "spawn", kind: "spawn", role: "inside_top", pos: [2, 6, 2] },
    { id: "val", kind: "npc", npcId: "valentina", pos: [3, 6, 2] },
  ],
};
writeFileSync(join(dir, "e1f3.json"), JSON.stringify(chunk));

/** ИИ-заглушка: Валентина на любую реплику соглашается идти */
const ai: AiModule = {
  async say(req) {
    return {
      text: "Иду, иду",
      factIds: [],
      source: "template",
      outcome: req.npcId === "valentina" && req.event === "free_talk" ? "agreed_to_go" : undefined,
    };
  },
};

type C = Socket<ServerToClient, ClientToServer>;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (cond: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("не дождались");
    await wait(20);
  }
};

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});

async function boot(store: InstanceType<typeof MemStore>) {
  const http: HttpServer = createServer();
  const io = new Server(http);
  io.use(async (s, next) => {
    const p = await store.getSession(String(s.handshake.auth.token));
    if (!p) return next(new Error("unauthorized"));
    s.data = { playerId: p.id, name: p.name, chunks: new Set() };
    next();
  });
  const game = new Game(io as never, store, ai, new ChunkStore(dir, false));
  await game.restore();
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const stop = async () => {
    await game.dispose();
    io.close();
    await new Promise((r) => http.close(r));
  };
  return { url, stop };
}

function client(url: string, token: string) {
  const c: C = ioc(url, { auth: { token }, transports: ["websocket"] });
  const log = { npcs: [] as NpcPublic[][], rooms: [] as { roomId: string; started: boolean }[], done: [] as string[] };
  c.on("npcs:update", (p) => log.npcs.push(p.npcs));
  c.on("room:state", (p) => log.rooms.push(p));
  c.on("npc:done", (p) => log.done.push(p.text));
  c.onAny((ev) => process.env.DEBUG_NET && console.log("<-", ev));
  cleanup.push(() => void c.disconnect());
  return { c, log };
}

describe("сервер целиком", () => {
  it("сопровождение, left_behind и восстановление после перезапуска", async () => {
    const store = new MemStore();
    const r = await login(store, "Тестер", "pw");
    if (!r.ok) throw new Error(r.error);

    let srv = await boot(store);
    const a = client(srv.url, r.token);
    a.c.emit("room:join", { mode: "solo" });
    await until(() => a.log.rooms.some((x) => x.started));
    const roomId = a.log.rooms.at(-1)!.roomId;

    // Уговорили Валентину → она идёт за игроком
    a.c.emit("npc:talk", { npcId: "valentina", text: "Пойдёмте со мной" });
    await until(() => a.log.npcs.at(-1)?.[0]?.following === r.playerId);
    expect(a.log.npcs.at(-1)![0]!.pos).toEqual([3, 6, 2]); // стартует с места из чанка

    // Отошёл на 2 м — идёт следом; убежал на 20 м — left_behind ровно один раз за 5 с
    a.c.emit("player:move", { pos: [2, 6, 5], rotY: 0, anim: "walk" });
    await wait(400);
    expect(seen.filter((e) => e.type === "dialogOutcome" && e.outcome === "left_behind")).toHaveLength(0);
    a.c.emit("player:move", { pos: [2, 6, 30], rotY: 0, anim: "run" });
    await until(() => seen.some((e) => e.type === "dialogOutcome" && e.outcome === "left_behind"));
    await wait(600);
    const lb = seen.filter((e) => e.type === "dialogOutcome" && e.outcome === "left_behind");
    expect(lb).toHaveLength(1);
    expect(lb[0]).toMatchObject({ npcId: "valentina", playerId: r.playerId });

    // Перезапуск сервера: снимок в хранилище, новый Game поднимает комнату
    const valBefore = a.log.npcs.at(-1)![0]!.pos;
    a.c.disconnect();
    await srv.stop();
    srv = await boot(store);
    cleanup.push(srv.stop);

    const b = client(srv.url, r.token);
    await until(() => b.log.rooms.length > 0 && b.log.npcs.length > 0);
    expect(b.log.rooms[0]).toMatchObject({ roomId, started: true });
    expect(b.log.npcs[0]![0]!.following).toBe(r.playerId);
    expect(b.log.npcs[0]![0]!.pos[2]).toBeCloseTo(valBefore[2], 0);
  }, 15_000);
});
