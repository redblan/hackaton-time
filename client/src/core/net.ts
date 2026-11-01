/** Сеть: вход по HTTP, дальше Socket.IO с токеном. Все события сервера складываются в стор. */
import { io, type Socket } from "socket.io-client";
import { applyPatch, type ClientToServer, type ServerToClient } from "@game/shared";
import { local, teleport } from "./local";
import { playQuake } from "./sound";
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

/** Вход (mode = "login") или регистрация ("register"). Возвращает текст ошибки или null */
export async function login(name: string, password: string, mode: "login" | "register" = "login"): Promise<string | null> {
  try {
    const res = await fetch(mode === "register" ? "/api/register" : "/api/login", {
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

/** Выйти из комнаты в лобби */
export function leaveRoom() {
  socket?.emit("room:leave");
  document.exitPointerLock?.();
  store.resetGame();
}

type VoiceChat = Parameters<ServerToClient["voice:chat"]>[0];
const voiceChatListeners = new Set<(p: VoiceChat) => void>();
/** D-71: голос напарника по рации (WAV 16 кГц). Подписка переживает переподключение сокета. Возвращает отписку */
export function onVoiceChat(fn: (p: VoiceChat) => void) {
  voiceChatListeners.add(fn);
  return () => voiceChatListeners.delete(fn);
}

let metricsTimer: ReturnType<typeof setInterval> | null = null;
let fpsFrames = 0;
let fpsRaf = 0;
function startMetrics(s: GameSocket) {
  if (metricsTimer) clearInterval(metricsTimer);
  cancelAnimationFrame(fpsRaf);
  const loop = () => {
    fpsFrames++;
    fpsRaf = requestAnimationFrame(loop);
  };
  fpsRaf = requestAnimationFrame(loop);
  let last = performance.now();
  metricsTimer = setInterval(() => {
    const now = performance.now();
    const fps = Math.round((fpsFrames * 1000) / Math.max(1, now - last));
    fpsFrames = 0;
    last = now;
    store.set({ fps });
    if (!s.connected) return;
    s.emit("ping", now);
    const st = store.get();
    s.emit("client:metrics", { fps, ping: st.ping, chunks: Object.keys(st.chunks).length, dpr: window.devicePixelRatio, gpu: st.gpu });
  }, 2000);
}

export function logout() {
  const token = store.get().auth?.token;
  if (token) void fetch("/api/logout", { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => {});
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
  // Только WebSocket (wss:// под HTTPS), без HTTP long-polling (D-66)
  const s: GameSocket = io({ auth: { token: auth.token }, transports: ["websocket"] });
  socket = s;

  s.on("connect", () => {
    local.resyncChunks = true;
    store.set({ connected: true, netError: null });
  });
  // Метрики для админки (01.11): ping/pong и раз в 2 с — fps, ping, чанки, dpr, видеокарта
  s.on("pong", (t) => store.set({ ping: Math.round(performance.now() - t) }));
  startMetrics(s);
  s.on("world:patch", (patch) =>
    store.set((st) => {
      const cur = st.chunks[patch.chunkId];
      return cur ? { chunks: { ...st.chunks, [patch.chunkId]: applyPatch(cur, patch) } } : {};
    }),
  );
  s.on("prop:move", (p) => store.set((st) => ({ props: { ...st.props, [p.id]: p } })));
  s.on("door:set", ({ chunkId, open }) => store.set((st) => ({ doors: { ...st.doors, [chunkId]: open } })));
  s.on("voice:chat", (p) => voiceChatListeners.forEach((fn) => fn(p)));
  s.on("player:teleport", ({ pos, rotY }) => teleport(pos, rotY ?? local.rotY));
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
    for (const n of npcs) pushSnapshot({ id: `npc:${n.npcId}`, pos: n.pos, rotY: n.rotY, anim: n.following || n.walking ? "walk" : "idle" });
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
        // Повтор после перезахода (D-53): та же игра уже открыта — не перезапускаем
        if (store.get().minigame?.game === e.game) break;
        document.exitPointerLock?.();
        store.set({ minigame: { game: e.game, params: e.params, key: nextKey() } });
        break;
      case "quake":
        store.set({ quake: { until: performance.now() + e.durationMs, strength: e.strength } });
        playQuake(e.strength, e.durationMs);
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
  s.on("npc:done", ({ npcId, text, source, intent }) =>
    store.set((st) => {
      const lines = [...st.npcLines];
      const i = lines.findLastIndex((l) => l.npcId === npcId && !l.done && !l.fromPlayer);
      const line = { npcId, text, done: true, source, ...(intent ? { intent } : {}) };
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
