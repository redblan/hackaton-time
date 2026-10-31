/** Сеть: вход по HTTP, дальше Socket.IO с токеном. Все события сервера складываются в стор. */
import { io, type Socket } from "socket.io-client";
import type { ClientToServer, ServerToClient } from "@game/shared";
import { local, teleport } from "./local";
import { forget, pushSnapshot } from "./remote";
import { nextKey, store, type Auth } from "./store";

const AUTH_KEY = "toltchok.auth";
export type GameSocket = Socket<ServerToClient, ClientToServer>;
let socket: GameSocket | null = null;

export const getSocket = () => socket;

type ClientEvent = Parameters<ClientToServer["game:event"]>[0];
type WithoutMeta<T> = T extends unknown ? Omit<T, "at" | "playerId"> : never;

/** Игровое событие на сервер. at и playerId сервер всё равно ставит сам. */
export function sendEvent(e: WithoutMeta<ClientEvent>) {
  const playerId = store.get().auth?.playerId ?? "";
  socket?.emit("game:event", { ...e, at: Date.now(), playerId } as ClientEvent);
}

export function savedAuth(): Auth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as Auth) : null;
  } catch {
    return null;
  }
}

export async function login(name: string, password: string): Promise<string | null> {
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    const body = (await res.json()) as { token?: string; playerId?: string; name?: string; error?: string };
    if (!res.ok || !body.token) return body.error ?? "Не удалось войти";
    const auth: Auth = { token: body.token, playerId: body.playerId!, name: body.name! };
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    } catch {
      /* приватный режим — просто не запомним */
    }
    connect(auth);
    return null;
  } catch {
    return "Сервер недоступен";
  }
}

export function logout() {
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
  socket?.disconnect();
  socket = null;
  store.resetGame();
  store.set({ auth: null, connected: false });
}

export function connect(auth: Auth) {
  socket?.disconnect();
  store.set({ auth, netError: null });
  const s: GameSocket = io({ auth: { token: auth.token } });
  socket = s;

  s.on("connect", () => {
    local.resyncChunks = true;
    store.set({ connected: true, netError: null });
  });
  s.on("disconnect", () => store.set({ connected: false }));
  s.on("connect_error", (e) => {
    if (e.message === "unauthorized") logout();
    else store.set({ netError: "Нет связи с сервером, переподключаюсь…" });
  });

  s.on("room:state", (room) => {
    const prev = store.get().room;
    if (room.started && !(prev?.started && prev.roomId === room.roomId)) {
      // Новый старт или перезаход: позицию возьмём из ближайшего players:update
      local.ready = false;
    }
    store.set({ room });
  });

  s.on("players:update", ({ players }) => {
    const me = auth.playerId;
    const others = players.filter((p) => p.id !== me);
    for (const p of others) pushSnapshot(p);
    forget(new Set(others.map((p) => p.id)));
    const mine = players.find((p) => p.id === me);
    if (mine && !local.ready) teleport(mine.pos, mine.rotY);
    const cur = store.get().others;
    const sig = (l: { id: string; name: string; role: unknown }[]) => l.map((p) => `${p.id}:${p.name}:${p.role}`).join("|");
    if (sig(cur) !== sig(others)) store.set({ others: others.map(({ id, name, role }) => ({ id, name, role })) });
  });

  s.on("npcs:update", ({ npcs }) => {
    for (const n of npcs) pushSnapshot({ id: `npc:${n.npcId}`, pos: n.pos, rotY: n.rotY, anim: n.following ? "walk" : "idle" });
    const sig = (l: { npcId: string; following: string | null }[]) => l.map((n) => `${n.npcId}:${n.following}`).join("|");
    if (sig(npcs) !== sig(store.get().npcs)) store.set({ npcs: npcs.map(({ npcId, following }) => ({ npcId, following })) });
  });

  s.on("chunk:data", ({ chunk }) => store.set((st) => ({ chunks: { ...st.chunks, [chunk.id]: chunk } })));
  s.on("chunk:drop", ({ ids }) =>
    store.set((st) => {
      const chunks = { ...st.chunks };
      for (const id of ids) delete chunks[id];
      return { chunks };
    }),
  );
  s.on("run:flags", ({ flags }) => store.set({ flags }));

  s.on("game:effect", (e) => {
    switch (e.type) {
      case "stage":
        store.set({ stage: { stage: e.stage, hint: e.hint } });
        break;
      case "openMinigame":
        document.exitPointerLock?.();
        store.set({ minigame: { game: e.game, params: e.params, key: nextKey() } });
        break;
      case "quake":
        store.set({ quake: { until: performance.now() + e.durationMs, strength: e.strength } });
        break;
      case "inventory":
        store.set({ inventory: e.items });
        break;
      case "journal":
        if (e.entry.outcome !== "ok") {
          store.set((st) => ({
            chat: [...st.chat, { key: nextKey(), from: "Журнал", text: e.entry.note, at: e.entry.at }].slice(-50),
          }));
        }
        break;
      default:
        break;
    }
  });

  s.on("npc:token", ({ npcId, token }) =>
    store.set((st) => {
      const lines = [...st.npcLines];
      const i = lines.findLastIndex((l) => l.npcId === npcId && !l.done && !l.fromPlayer);
      if (i >= 0) lines[i] = { ...lines[i]!, text: lines[i]!.text + token };
      else lines.push({ key: nextKey(), npcId, text: token, done: false });
      return { npcLines: lines.slice(-30) };
    }),
  );
  s.on("npc:done", ({ npcId, text, source }) =>
    store.set((st) => {
      const lines = [...st.npcLines];
      const i = lines.findLastIndex((l) => l.npcId === npcId && !l.done && !l.fromPlayer);
      const line = { npcId, text, done: true, source };
      if (i >= 0) lines[i] = { ...lines[i]!, ...line };
      else lines.push({ key: nextKey(), ...line });
      return { npcLines: lines.slice(-30) };
    }),
  );
  s.on("chat:msg", (m) => store.set((st) => ({ chat: [...st.chat, { key: nextKey(), ...m }].slice(-50) })));
  s.on("run:end", (p) => {
    document.exitPointerLock?.();
    store.set({ runEnd: p });
  });
}
