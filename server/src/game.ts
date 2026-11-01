/**
 * Склейка: сокеты ↔ комнаты ↔ сценарий Юры ↔ ИИ Матвея ↔ мир Никиты.
 * Сервер — единственный источник правды.
 */
import { randomInt, randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  AGENT_FLAGS,
  INTERACTABLES,
  MODES,
  NPC_IDS,
  ROLES,
  ZONES,
  applyPatch,
  generateRun,
  initRun,
  reduce,
  type AgentFlag,
  type AiModule,
  type ChunkData,
  type ChunkId,
  type ClientMetrics,
  type ClientToServer,
  type Effect,
  type GameEvent,
  type NpcId,
  type NpcRequest,
  type PlayerId,
  type PlayerPublic,
  type PropState,
  type ServerToClient,
  type Vec3,
  type WorldEvent,
  type WorldPatch,
} from "@game/shared";
import { planChunks, type ChunkStore } from "./chunks";
import type { Store } from "./db";
import type { Stt, Tts } from "@game/ai";
import { checkLeftBehind, recordTrail, startEscort, stepEscort } from "./escort";
import {
  canStart,
  findOpenRoom,
  fromSnapshot,
  gameNow,
  newRoom,
  pauseClock,
  pickRole,
  publicNpcs,
  resumeClock,
  toPublic,
  toSnapshot,
  type Room,
} from "./rooms";

export interface SocketData {
  playerId: PlayerId;
  name: string;
  chunks: Set<ChunkId>;
  /** Последние метрики клиента (01.11, админка) */
  metrics?: ClientMetrics & { at: number };
}
type IO = Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>;
type Sock = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

const POS_BROADCAST_MS = 100; // ~10 Гц
const TICK_MS = 1000;
const SAVE_EVERY_MS = 5000;
const ROOM_TTL_MS = 30 * 60_000;
const SAVE_ROOMS_MS = 3000;
/** Сколько ждём игроков после перезапуска сервера */
const RESTORE_MAX_AGE_MS = 3 * 60 * 60_000;
/** 15 с × 16 кГц × 2 байта + заголовок — с запасом */
const MAX_VOICE_BYTES = 520_000;
const ANIMS = new Set<PlayerPublic["anim"]>(["idle", "walk", "run", "crouch", "carry"]);

const isVec3 = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e4);
const includes = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

export class Game {
  private rooms = new Map<string, Room>();
  private roomOf = new Map<PlayerId, string>();
  private intervals: NodeJS.Timeout[] = [];

  constructor(
    private io: IO,
    private store: Store,
    private ai: AiModule,
    private chunks: ChunkStore,
    private stt?: Pick<Stt, "available" | "transcribe">,
    private tts?: Pick<Tts, "available" | "speak">,
  ) {
    this.intervals.push(
      setInterval(() => this.safe(() => this.frame(POS_BROADCAST_MS)), POS_BROADCAST_MS),
      setInterval(() => this.cleanup(), 60_000),
      setInterval(() => void this.saveRooms(), SAVE_ROOMS_MS),
    );
    io.on("connection", (s) => this.onConnection(s));
    // Агенты Матвея меняют мир: ИИ отдаёт патч, мы применяем к комнате игрока
    ai.setWorldHook?.((playerId, patch) => this.safe(() => this.patchWorld(this.roomOf.get(playerId) ?? "", patch)));
    // D-73: агент включает флаг из AGENT_FLAGS (объекты Никиты «по запросу») — один раз за прохождение
    ai.setFlagHook?.((playerId, flag) => this.agentFlag(playerId, flag));
  }

  /** Поднять незаконченные комнаты из БД (после перезапуска сервера). Игроки вернутся сами при перезаходе. */
  async restore() {
    let snaps;
    try {
      snaps = await this.store.loadRooms(RESTORE_MAX_AGE_MS);
    } catch (e) {
      console.error("[restore] комнаты не загрузились:", (e as Error).message);
      return;
    }
    for (const snap of snaps) {
      const room = fromSnapshot(snap);
      room.emptySince = Date.now();
      this.rooms.set(room.id, room);
      for (const id of room.players.keys()) this.roomOf.set(id, room.id);
      this.startTicking(room);
      console.log(`[restore] комната ${room.id} (${room.mode}), игроков ${room.players.size}, ждём перезахода`);
    }
  }

  /** Сохранить всё и остановить таймеры (тесты, выключение) */
  async dispose() {
    this.intervals.forEach(clearInterval);
    for (const room of this.rooms.values()) room.timers.forEach(clearInterval);
    await this.saveRooms();
  }

  // ---------- подключение ----------

  private onConnection(s: Sock) {
    const { playerId } = s.data;
    s.join(`p:${playerId}`);
    console.log(`[net] + ${s.data.name} (${s.id})`);

    // Перезаход: игрок уже в комнате — возвращаем его туда
    const room = this.myRoom(playerId);
    if (room) this.rejoin(s, room);

    s.on("room:join", (p) => this.safe(() => this.onJoin(s, p?.mode)));
    s.on("room:ready", (p) => this.safe(() => this.onReady(s, p?.role)));
    s.on("room:leave", () => this.safe(() => this.leave(s.data.playerId)));
    s.on("player:move", (p) => this.safe(() => this.onMove(s, p)));
    s.on("chunk:want", (p) => this.safe(() => this.onChunkWant(s, p?.ids)));
    s.on("game:event", (e) => this.safe(() => this.onGameEvent(s, e)));
    s.on("npc:talk", (p) => this.safe(() => this.onNpcTalk(s, p)));
    s.on("chat:send", (p) => this.safe(() => this.onChat(s, p?.text)));
    s.on("npc:hangup", (p) => this.safe(() => this.onHangup(s, p?.npcId)));
    s.on("voice:say", (p) => this.safe(() => this.onVoice(s, p)));
    s.on("client:metrics", (p) => this.safe(() => this.onMetrics(s, p)));
    s.on("ping", (t) => {
      if (typeof t === "number") s.emit("pong", t);
    });
    s.on("prop:move", (p) => this.safe(() => this.onPropMove(s, p)));
    s.on("disconnect", () => this.safe(() => this.onDisconnect(s)));
  }

  private onMetrics(s: Sock, p: unknown) {
    if (!p || typeof p !== "object") return;
    const m = p as Record<string, unknown>;
    const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0);
    s.data.metrics = {
      fps: Math.round(num(m.fps, 1000)),
      ping: Math.round(num(m.ping, 100_000)),
      chunks: Math.round(num(m.chunks, 100)),
      dpr: num(m.dpr, 8),
      gpu: typeof m.gpu === "string" ? m.gpu.slice(0, 120) : "",
      at: Date.now(),
    };
  }

  /** Переносимые предметы: кто несёт/бросил — тот и прав; остальным пересылаем, последнее состояние помним для перезахода */
  private onPropMove(s: Sock, p: unknown) {
    const room = this.myRoom(s.data.playerId);
    if (!room || !p || typeof p !== "object") return;
    const q = p as Record<string, unknown>;
    if (typeof q.id !== "string" || typeof q.chunkId !== "string" || !isVec3(q.pos) || typeof q.rotY !== "number") return;
    const state: PropState = {
      id: q.id.slice(0, 64),
      chunkId: q.chunkId,
      pos: q.pos,
      rotY: q.rotY,
      holder: q.holder === s.data.playerId ? s.data.playerId : null,
      ...(isVec3(q.vel) ? { vel: q.vel } : {}),
    };
    const before = room.props.get(state.id)?.holder ?? null;
    room.props.set(state.id, state);
    s.to(`r:${room.id}`).emit("prop:move", state);
    // D-73 (M23): взял / положил / бросил — сообщаем ИИ (он может ответить репликой NPC)
    const me = s.data.playerId;
    const type = !before && state.holder === me ? "prop_picked" : before === me && !state.holder ? (state.vel && Math.hypot(...state.vel) > 1 ? "prop_thrown" : "prop_dropped") : null;
    if (type) {
      const label = this.chunks.get(state.chunkId)?.objects.find((o) => o.id === state.id && o.kind === "prop");
      const name = label?.kind === "prop" ? label.label : state.id;
      void this.worldEvent(room, me, { type, playerId: me, propId: state.id, label: name, chunkId: state.chunkId, pos: state.pos });
    }
  }

  /** D-73: флаг от агента — только из AGENT_FLAGS, только включить, один раз */
  private agentFlag(playerId: PlayerId, flag: AgentFlag): boolean {
    const room = this.myRoom(playerId);
    if (!room || !(AGENT_FLAGS as readonly string[]).includes(flag) || room.flags.has(flag)) return false;
    console.log(`[ai] агент включил ${flag} (комната ${room.id})`);
    return this.setFlag(room.id, flag, true);
  }

  private worldEventAt = new Map<PlayerId, number>();
  /** D-73 (M23): событие мира → ИИ; ответ показываем игроку как реплику NPC. Не чаще раза в 8 с на игрока */
  private async worldEvent(room: Room, playerId: PlayerId, e: WorldEvent) {
    if (!this.ai.onWorldEvent) return;
    const now = Date.now();
    if (now - (this.worldEventAt.get(playerId) ?? 0) < 8000) return;
    this.worldEventAt.set(playerId, now);
    try {
      const res = await this.ai.onWorldEvent(e, this.npcContext(room, playerId) as NpcRequest["context"]);
      if (res && includes(NPC_IDS, res.npcId) && res.text.trim()) {
        const to = this.io.to(`p:${playerId}`);
        const text = res.text.trim().slice(0, 500);
        to.emit("npc:done", { npcId: res.npcId, text, source: "template" });
        this.remember(room, res.npcId, playerId, text, "world");
        if (this.tts?.available()) void this.speak(to, res.npcId, text);
      }
    } catch (err) {
      console.error("[ai] onWorldEvent упал:", err);
    }
  }

  private rejoin(s: Sock, room: Room) {
    const me = room.players.get(s.data.playerId);
    if (!me) return;
    me.online = true;
    room.emptySince = undefined;
    if (room.started && !room.finished) resumeClock(room, Date.now());
    s.join(`r:${room.id}`);
    this.emitRoomState(room);
    if (room.started) {
      s.emit("run:flags", { flags: [...room.flags] });
      s.emit("players:update", { players: this.publicPlayers(room) });
      if (room.npcs.size) s.emit("npcs:update", { npcs: publicNpcs(room) });
      if (me.lastStage) s.emit("game:effect", me.lastStage);
      if (me.openMinigame) s.emit("game:effect", me.openMinigame); // D-53
    }
  }

  private onDisconnect(s: Sock) {
    console.log(`[net] - ${s.data.name} (${s.id})`);
    const { playerId } = s.data;
    // Другая вкладка того же игрока ещё жива — ничего не делаем
    if ((this.io.sockets.adapter.rooms.get(`p:${playerId}`)?.size ?? 0) > 0) return;
    const room = this.myRoom(playerId);
    if (!room) return;
    const me = room.players.get(playerId);
    if (!room.started) {
      this.leave(playerId);
      return;
    }
    if (me) {
      me.online = false;
      void this.saveProgress(room, playerId, true);
    }
    if ([...room.players.values()].every((p) => !p.online)) {
      room.emptySince = Date.now();
      pauseClock(room, Date.now());
    }
  }

  // ---------- лобби ----------

  private onJoin(s: Sock, mode: unknown) {
    if (!includes(MODES, mode)) return;
    const { playerId, name } = s.data;
    const current = this.myRoom(playerId);
    if (current && !current.started && current.mode === mode) {
      this.emitRoomState(current);
      return;
    }
    if (current) this.leave(playerId);

    let room = findOpenRoom(this.rooms.values(), mode);
    if (!room) {
      room = newRoom(randomUUID().slice(0, 6), mode);
      this.rooms.set(room.id, room);
    }
    room.players.set(playerId, { id: playerId, name, role: null, pos: [0, 0, 0], rotY: 0, anim: "idle", online: true });
    this.roomOf.set(playerId, room.id);
    for (const sock of this.socketsOf(playerId)) sock.join(`r:${room.id}`);
    // В solo роль одна — выбираем сразу
    if (mode === "solo") pickRole(room, playerId, "inside_top");
    this.emitRoomState(room);
    this.maybeStart(room);
  }

  private onReady(s: Sock, role: unknown) {
    if (!includes(ROLES, role)) return;
    const room = this.myRoom(s.data.playerId);
    if (!room) return;
    const r = pickRole(room, s.data.playerId, role);
    if (!r.ok) s.emit("chat:msg", { from: "Система", text: r.error, at: Date.now() });
    this.emitRoomState(room);
    this.maybeStart(room);
  }

  private leave(playerId: PlayerId) {
    const room = this.myRoom(playerId);
    this.roomOf.delete(playerId);
    if (!room) return;
    room.players.delete(playerId);
    for (const sock of this.socketsOf(playerId)) {
      sock.leave(`r:${room.id}`);
      sock.data.chunks.clear();
    }
    if (room.players.size === 0) this.destroy(room);
    else this.emitRoomState(room);
  }

  private destroy(room: Room) {
    room.timers.forEach(clearInterval);
    if (room.started && !room.finished) {
      // Брошенная комната больше не восстанавливается
      room.finished = true;
      void this.store.saveRoom(toSnapshot(room, Date.now())).catch(() => {});
    }
    this.rooms.delete(room.id);
    for (const id of room.players.keys()) if (this.roomOf.get(id) === room.id) this.roomOf.delete(id);
  }

  private cleanup() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.emptySince && now - room.emptySince > ROOM_TTL_MS) {
        console.log(`[room] ${room.id} закрыта: все вышли`);
        this.destroy(room);
      }
    }
  }

  private async maybeStart(room: Room) {
    if (!canStart(room)) return;
    room.started = true;
    const players = [...room.players.values()].map((p) => ({ id: p.id, role: p.role! }));
    const profiles = await Promise.all(players.map((p) => this.store.getProfile(p.id).catch(() => undefined)));
    const config = generateRun({
      mode: room.mode,
      seed: randomInt(1, 2 ** 31),
      profiles: profiles.filter((p) => p !== undefined),
    });
    room.run = initRun(config, players);
    room.flags = new Set(config.flags);
    // D-67: застрявший в лифте — на этаже ниже старта (в мире Ваня стоит на 5–8 с флагом vanya_f{N})
    if (config.flags.includes("lift_vanya")) room.flags.add(`vanya_f${Math.max(5, Math.min(8, config.startFloor - 1))}`);
    // Папа в данных стоит в квартирах 6–9 этажей; клиент показывает его только на этаже старта
    room.flags.add(`home_f${config.startFloor}`);
    for (const p of room.players.values()) {
      const sp = this.chunks.findSpawn(p.role!, config.startFloor);
      p.pos = [sp.pos[0], sp.pos[1], sp.pos[2]];
      p.rotY = sp.rotY;
      this.ai.resetRun?.(p.id);
    }
    console.log(`[room] ${room.id} старт: ${room.mode}, этаж ${config.startFloor}, флаги ${config.flags.join(",")}`);
    this.emitRoomState(room);
    this.io.to(`r:${room.id}`).emit("run:flags", { flags: [...room.flags] });
    this.io.to(`r:${room.id}`).emit("players:update", { players: this.publicPlayers(room) });
    resumeClock(room, Date.now());
    room.dirty = true;
    this.dispatch(room, { type: "start", at: this.now(room) });
    this.startTicking(room);
  }

  private startTicking(room: Room) {
    room.timers.push(
      setInterval(() => {
        if (room.clock.runningSince !== null) this.safe(() => this.dispatch(room, { type: "tick", at: this.now(room) }));
      }, TICK_MS),
    );
  }

  // ---------- движение и мир ----------

  private onMove(s: Sock, p: { pos: unknown; rotY: unknown; anim: unknown } | undefined) {
    const room = this.myRoom(s.data.playerId);
    const me = room?.players.get(s.data.playerId);
    if (!room || !me || !p || !isVec3(p.pos) || typeof p.rotY !== "number" || !Number.isFinite(p.rotY)) return;
    me.pos = p.pos;
    me.rotY = p.rotY;
    me.anim = ANIMS.has(p.anim as PlayerPublic["anim"]) ? (p.anim as PlayerPublic["anim"]) : "idle";
    for (const e of room.npcs.values()) if (e.playerId === me.id) recordTrail(e, me.pos);
    if (room.started) room.dirty = true;
    if (room.started && Date.now() - (me.lastSavedAt ?? 0) > SAVE_EVERY_MS) void this.saveProgress(room, me.id);
  }

  /** ~10 Гц: шаг подвижных NPC, проверка left_behind, рассылка позиций */
  private frame(dtMs: number) {
    for (const room of this.rooms.values()) {
      if (!room.started || room.finished) continue;
      const running = room.clock.runningSince !== null;
      for (const e of room.npcs.values()) {
        const leader = e.playerId ? room.players.get(e.playerId) : undefined;
        if (!running || !leader?.online) continue;
        stepEscort(e, leader.pos, dtMs);
        if (checkLeftBehind(e, leader.pos, this.now(room))) {
          this.dispatch(room, { type: "dialogOutcome", at: this.now(room), playerId: leader.id, npcId: e.npcId, outcome: "left_behind" });
        }
      }
      const to = this.io.to(`r:${room.id}`);
      // volatile: устаревшую позицию не жалко потерять. NPC — обычным сообщением: два volatile подряд
      // в одном тике второе теряется (транспорт ещё занят первым)
      to.volatile.emit("players:update", { players: this.publicPlayers(room) });
      if (room.npcs.size) to.emit("npcs:update", { npcs: publicNpcs(room) });
    }
  }

  private onChunkWant(s: Sock, ids: unknown) {
    const plan = planChunks(s.data.chunks, ids, (id) => this.chunks.get(id) !== undefined);
    s.data.chunks = plan.next;
    if (plan.drop.length) s.emit("chunk:drop", { ids: plan.drop });
    const room = this.myRoom(s.data.playerId);
    for (const id of plan.send) {
      s.emit("chunk:data", { chunk: this.patched(room, this.chunks.get(id)!) });
      if (room) for (const prop of room.props.values()) if (prop.chunkId === id) s.emit("prop:move", prop);
    }
  }

  /** Чанк с наложенными патчами комнаты (агенты, админка) */
  private patched(room: Room | undefined, chunk: ChunkData): ChunkData {
    const p = room?.patches.get(chunk.id);
    if (!p) return chunk;
    return applyPatch(chunk, { chunkId: chunk.id, add: [...p.add.values()], remove: [...p.remove] });
  }

  /** Живое изменение мира комнаты: от агентов (setWorldHook) и из админки */
  patchWorld(roomId: string, patch: WorldPatch): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !this.chunks.get(patch.chunkId)) return false;
    const add = Array.isArray(patch.add) ? patch.add.filter((o) => o && typeof o === "object" && typeof o.id === "string") : [];
    const remove = Array.isArray(patch.remove) ? patch.remove.filter((id): id is string => typeof id === "string") : [];
    const cur = room.patches.get(patch.chunkId) ?? { add: new Map(), remove: new Set() };
    for (const id of remove) {
      cur.add.delete(id);
      cur.remove.add(id);
    }
    for (const o of add) {
      cur.remove.delete(o.id);
      cur.add.set(o.id, o);
    }
    room.patches.set(patch.chunkId, cur);
    this.io.to(`r:${room.id}`).emit("world:patch", { chunkId: patch.chunkId, add, remove });
    console.log(`[world] комната ${room.id}: патч ${patch.chunkId} +${add.length} −${remove.length}`);
    return true;
  }

  // ---------- сценарий ----------

  private onGameEvent(s: Sock, e: unknown) {
    const room = this.myRoom(s.data.playerId);
    if (!room?.run || room.finished || !e || typeof e !== "object") return;
    const ev = e as Record<string, unknown>;
    const base = { at: this.now(room), playerId: s.data.playerId };
    let event: GameEvent | null = null;
    if (ev.type === "interact" && includes(INTERACTABLES, ev.target)) event = { type: "interact", ...base, target: ev.target };
    else if (ev.type === "enterZone" && includes(ZONES, ev.zone)) event = { type: "enterZone", ...base, zone: ev.zone };
    else if (ev.type === "minigameResult" && ev.result && typeof ev.result === "object")
      event = { type: "minigameResult", ...base, result: ev.result as Extract<GameEvent, { type: "minigameResult" }>["result"] };
    if (!event) return;
    if (event.type === "minigameResult") {
      const me = room.players.get(event.playerId);
      if (me?.openMinigame?.game === event.result.game) me.openMinigame = undefined;
    }
    this.dispatch(room, event);
  }

  /** Прогнать событие через reduce() и исполнить эффекты. Ошибка в сценарии не роняет сервер. */
  private dispatch(room: Room, event: GameEvent) {
    if (!room.run || room.finished) return;
    let result;
    try {
      result = reduce(room.run, event);
    } catch (e) {
      console.error(`[scenario] reduce упал на ${event.type}:`, e);
      return;
    }
    room.run = result.state;
    room.dirty = true;
    this.trackEscort(room, event);
    for (const eff of result.effects) this.safe(() => this.execute(room, eff));
  }

  /**
   * Сопровождение Валентины (D-26, D-45): после `agreed_to_go` она идёт за игроком,
   * у места сбора (`z_safe_area`) останавливается.
   */
  private trackEscort(room: Room, event: GameEvent) {
    if (event.type === "dialogOutcome" && event.npcId === "valentina" && event.outcome === "agreed_to_go") {
      const cur = room.npcs.get("valentina");
      if (cur?.playerId === event.playerId) return;
      const player = room.players.get(event.playerId);
      const from = cur?.pos ?? this.chunks.findNpc("valentina", room.flags) ?? player?.pos;
      if (!from) return;
      room.npcs.set("valentina", startEscort("valentina", event.playerId, from));
      console.log(`[escort] valentina идёт за ${player?.name ?? event.playerId}`);
    }
    if (event.type === "enterZone" && event.zone === "z_safe_area") {
      for (const e of room.npcs.values()) {
        if (e.playerId === event.playerId) {
          e.playerId = null;
          e.trail = [];
        }
      }
    }
  }

  private execute(room: Room, eff: Effect) {
    const toRoom = this.io.to(`r:${room.id}`);
    switch (eff.type) {
      case "stage": {
        const p = room.players.get(eff.playerId);
        if (p) {
          p.lastStage = eff;
          p.stage = eff.stage;
          void this.saveProgress(room, p.id, true);
        }
        this.io.to(`p:${eff.playerId}`).emit("game:effect", eff);
        break;
      }
      case "npcSay":
        void this.npcSay(room, eff.toPlayerId, {
          npcId: eff.npcId,
          playerId: eff.toPlayerId,
          event: eff.event,
          context: { ...this.npcContext(room, eff.toPlayerId), ...eff.context },
        });
        break;
      case "openMinigame": {
        const p = room.players.get(eff.playerId);
        if (p) p.openMinigame = eff;
        this.io.to(`p:${eff.playerId}`).emit("game:effect", eff);
        break;
      }
      case "inventory":
        this.io.to(`p:${eff.playerId}`).emit("game:effect", eff);
        break;
      case "journal":
        this.io.to(`p:${eff.entry.playerId}`).emit("game:effect", eff);
        void this.recordSkill(eff.entry.playerId, eff.entry.skill, eff.entry.outcome === "ok");
        break;
      case "setFlag":
        room.flags.add(eff.flag);
        toRoom.emit("run:flags", { flags: [...room.flags] });
        break;
      case "quake":
        toRoom.emit("game:effect", eff);
        break;
      case "runEnd":
        void this.endRun(room, eff.summary);
        break;
    }
  }

  private npcContext(room: Room, playerId: PlayerId): NpcRequest["context"] {
    const run = room.run;
    return {
      stage: run?.stage[playerId],
      flags: [...room.flags],
      facts: run?.facts ?? [],
      address: run?.config.address,
      startFloor: run?.config.startFloor,
      mode: room.mode,
      playerName: room.players.get(playerId)?.name,
      partners: [...room.players.values()].filter((p) => p.id !== playerId).map((p) => p.name),
    };
  }

  /** D-70: озвучка догоняет текст, не блокирует ни реплику, ни outcome. Нет Piper / нечего озвучивать — молчим. */
  private async speak(to: ReturnType<IO["to"]>, npcId: NpcRequest["npcId"], text: string) {
    try {
      const wav = await this.tts!.speak(npcId, text);
      if (wav) to.emit("npc:audio", { npcId, wav: wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer });
    } catch (e) {
      console.error(`[tts] ${npcId}:`, (e as Error).message);
    }
  }

  private async npcSay(room: Room, playerId: PlayerId, req: NpcRequest) {
    const to = this.io.to(`p:${playerId}`);
    const started = Date.now();
    try {
      // D-68: итог диалога — в сценарий сразу, как ИИ его посчитал, не дожидаясь конца текста
      let sent: string | undefined;
      const sendOutcome = (outcome: string) => {
        if (sent) return;
        sent = outcome;
        this.dispatch(room, { type: "dialogOutcome", at: this.now(room), playerId, npcId: req.npcId, outcome });
      };
      const res = this.ai.sayStream
        ? await this.ai.sayStream(req, (token) => to.emit("npc:token", { npcId: req.npcId, token }), sendOutcome)
        : await this.ai.say(req);
      to.emit("npc:done", { npcId: req.npcId, text: res.text, source: res.source, ...(res.intent ? { intent: res.intent } : {}) });
      this.remember(room, req.npcId, playerId, res.text, res.source, Date.now() - started);
      if (res.outcome) sendOutcome(res.outcome);
      if (res.text && this.tts?.available()) void this.speak(to, req.npcId, res.text);
    } catch (e) {
      console.error(`[ai] ${req.npcId}/${req.event} упал:`, e);
      to.emit("npc:done", { npcId: req.npcId, text: "…", source: "template" });
    }
  }

  private onNpcTalk(s: Sock, p: { npcId: unknown; text: unknown } | undefined) {
    const room = this.myRoom(s.data.playerId);
    if (!room?.started || !p || !includes(NPC_IDS, p.npcId) || typeof p.text !== "string") return;
    const text = p.text.trim().slice(0, 500);
    if (!text) return;
    void this.npcSay(room, s.data.playerId, {
      npcId: p.npcId,
      playerId: s.data.playerId,
      event: "free_talk",
      playerMessage: text,
      context: this.npcContext(room, s.data.playerId),
    });
  }

  /** D-69: голос → текст (whisper.cpp у Матвея) → дальше как обычная реплика игрока */
  private async onVoice(s: Sock, p: { to: unknown; wav: unknown } | undefined) {
    const to = p?.to;
    if (to !== "radio" && !includes(NPC_IDS, to)) return;
    const reply = (r: { text: string } | { error: string }) => s.emit("voice:text", { to, ...r });
    const wav = p?.wav;
    const buf = Buffer.isBuffer(wav) ? wav : wav instanceof ArrayBuffer ? Buffer.from(wav) : null;
    if (!buf || buf.length < 1000) return reply({ error: "Пустая запись" });
    if (buf.length > MAX_VOICE_BYTES) return reply({ error: "Слишком длинно — до 15 секунд" });
    // D-71: рация голосом — напарники слышат запись сразу, как есть; распознавание (если есть) идёт следом текстом
    if (to === "radio") {
      const room = this.myRoom(s.data.playerId);
      if (room) s.to(`r:${room.id}`).emit("voice:chat", { from: s.data.playerId, name: s.data.name, wav: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer });
    }
    // Рация без Whisper: голос уже ушёл напарникам — пустой текст, а не ошибка (иначе клиент решит, что голоса нет, и спрячет кнопку)
    if (!this.stt?.available()) return to === "radio" ? reply({ text: "" }) : reply({ error: "Распознавание голоса на сервере не настроено" });
    let text: string;
    try {
      text = (await this.stt.transcribe(buf)).trim();
    } catch (e) {
      console.error("[voice]", (e as Error).message);
      return reply({ error: "Не получилось распознать" });
    }
    if (!text) return reply({ error: "Не расслышал, повторите" });
    reply({ text });
    if (to === "radio") this.onChat(s, text);
    else this.onNpcTalk(s, { npcId: to, text });
  }

  /** D-62: «Завершить звонок» — сценарий сам решит, что с недостающими слотами */
  private onHangup(s: Sock, npcId: unknown) {
    const room = this.myRoom(s.data.playerId);
    if (!room?.run || npcId !== "dispatcher") return;
    this.dispatch(room, { type: "dialogOutcome", at: this.now(room), playerId: s.data.playerId, npcId, outcome: "call_ended" });
  }

  private onChat(s: Sock, text: unknown) {
    const room = this.myRoom(s.data.playerId);
    if (!room || typeof text !== "string") return;
    const t = text.trim().slice(0, 300);
    if (!t) return;
    this.io.to(`r:${room.id}`).emit("chat:msg", { from: s.data.name, text: t, at: Date.now() });
    // Рация в solo (или когда напарников нет в сети): отвечает Михалыч (M8)
    const partnersOnline = [...room.players.values()].some((p) => p.id !== s.data.playerId && p.online);
    if (room.started && !room.finished && !partnersOnline) {
      void this.npcSay(room, s.data.playerId, {
        npcId: "mihalych",
        playerId: s.data.playerId,
        event: "free_talk",
        playerMessage: t,
        context: { ...this.npcContext(room, s.data.playerId), channel: "radio" },
      });
    }
  }

  private async endRun(room: Room, summary: Extract<Effect, { type: "runEnd" }>["summary"]) {
    room.finished = true;
    room.timers.forEach(clearInterval);
    room.timers = [];
    room.dirty = true;
    void this.saveRooms();
    for (const p of room.players.values()) {
      const profile = await this.store.getProfile(p.id).catch(() => null);
      if (profile) await this.store.saveProfile({ ...profile, runs: profile.runs + 1 }).catch(() => {});
      let debrief = "";
      try {
        const journal = room.run?.journal.filter((j) => j.playerId === p.id) ?? [];
        const res = await this.ai.say({
          npcId: "gromov",
          playerId: p.id,
          event: "debrief",
          context: { ...this.npcContext(room, p.id), journal, summary },
        });
        debrief = res.text;
      } catch (e) {
        console.error("[ai] разбор упал:", e);
      }
      this.io.to(`p:${p.id}`).emit("run:end", { summary, debrief });
    }
  }

  // ---------- БД ----------

  private async saveRooms() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (!room.dirty || !room.started) continue;
      room.dirty = false;
      try {
        await this.store.saveRoom(toSnapshot(room, now));
      } catch (e) {
        room.dirty = true;
        console.error("[db] комната не сохранена:", (e as Error).message);
      }
    }
  }

  private async recordSkill(playerId: PlayerId, skill: string, ok: boolean) {
    try {
      const profile = await this.store.getProfile(playerId);
      const key = skill as keyof typeof profile.skills;
      const cur = profile.skills[key] ?? { ok: 0, fail: 0 };
      profile.skills[key] = ok ? { ...cur, ok: cur.ok + 1 } : { ...cur, fail: cur.fail + 1 };
      await this.store.saveProfile(profile);
    } catch (e) {
      console.error("[db] профиль не сохранён:", (e as Error).message);
    }
  }

  private async saveProgress(room: Room, playerId: PlayerId, force = false) {
    const p = room.players.get(playerId);
    if (!p) return;
    if (!force && Date.now() - (p.lastSavedAt ?? 0) < SAVE_EVERY_MS) return;
    p.lastSavedAt = Date.now();
    try {
      await this.store.saveProgress(playerId, { roomId: room.id, stage: p.stage ?? null, pos: p.pos });
    } catch (e) {
      console.error("[db] прогресс не сохранён:", (e as Error).message);
    }
  }

  private remember(room: Room, npcId: NpcId, to: string, text: string, source: string, ms?: number) {
    room.lines.push({ at: Date.now(), npcId, to: room.players.get(to)?.name ?? to, text: text.slice(0, 300), source, ...(ms !== undefined ? { ms } : {}) });
    if (room.lines.length > 60) room.lines.splice(0, room.lines.length - 60);
  }

  // ---------- админка (01.11) ----------

  /** Снимок всего для админки: комнаты, игроки с метриками, последние реплики */
  adminState() {
    const sockets = new Map<PlayerId, Sock[]>();
    for (const s of this.io.sockets.sockets.values()) sockets.set(s.data.playerId, [...(sockets.get(s.data.playerId) ?? []), s]);
    const rooms = [...this.rooms.values()].map((room) => ({
      id: room.id,
      mode: room.mode,
      started: room.started,
      finished: room.finished,
      flags: [...room.flags],
      clockMs: gameNow(room, Date.now()),
      patches: [...room.patches.entries()].map(([chunkId, p]) => ({ chunkId, add: [...p.add.values()], remove: [...p.remove] })),
      props: [...room.props.values()],
      lines: room.lines.slice(-30),
      players: [...room.players.values()].map((p) => {
        const sock = sockets.get(p.id)?.[0];
        return {
          id: p.id,
          name: p.name,
          role: p.role,
          online: p.online,
          pos: p.pos,
          chunk: this.chunks.chunkAt(p.pos),
          stage: room.run?.stage[p.id] ?? null,
          anim: p.anim,
          chunks: sock ? [...sock.data.chunks] : [],
          metrics: sock?.data.metrics ?? null,
        };
      }),
    }));
    const lobby = [...this.io.sockets.sockets.values()]
      .filter((s) => !this.roomOf.has(s.data.playerId))
      .map((s) => ({ id: s.data.playerId, name: s.data.name, metrics: s.data.metrics ?? null }));
    return { rooms, lobby, sockets: this.io.sockets.sockets.size };
  }

  setFlag(roomId: string, flag: string, on: boolean): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !/^[a-z0-9_]{1,40}$/.test(flag)) return false;
    if (on) room.flags.add(flag);
    else room.flags.delete(flag);
    room.dirty = true;
    this.io.to(`r:${room.id}`).emit("run:flags", { flags: [...room.flags] });
    return true;
  }

  /** Админка включила флаг: сообщить ИИ (D-73, M23) — NPC может прокомментировать игрокам комнаты */
  adminFlag(roomId: string, flag: string, on: boolean): boolean {
    const room = this.rooms.get(roomId);
    const had = room?.flags.has(flag);
    if (!this.setFlag(roomId, flag, on)) return false;
    if (room && on && !had) for (const p of room.players.values()) void this.worldEvent(room, p.id, { type: "flag_set", playerId: p.id, flag, by: "admin" });
    return true;
  }

  quake(roomId: string, strength = 0.8, durationMs = 4000): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    this.io.to(`r:${room.id}`).emit("game:effect", { type: "quake", strength: Math.max(0.1, Math.min(1, strength)), durationMs: Math.max(500, Math.min(20_000, durationMs)) });
    return true;
  }

  teleport(playerId: PlayerId, pos: Vec3, rotY = 0): boolean {
    const room = this.myRoom(playerId);
    const me = room?.players.get(playerId);
    if (!me || !isVec3(pos)) return false;
    me.pos = pos;
    this.io.to(`p:${playerId}`).emit("player:teleport", { pos, rotY });
    return true;
  }

  kick(playerId: PlayerId): boolean {
    const socks = this.socketsOf(playerId);
    if (!socks.length && !this.roomOf.has(playerId)) return false;
    this.leave(playerId);
    for (const s of socks) s.disconnect(true);
    return true;
  }

  /** Сказать от имени NPC всем в комнате (или одному игроку) */
  sayAs(roomId: string, npcId: NpcId, text: string, playerId?: PlayerId): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !includes(NPC_IDS, npcId)) return false;
    const t = text.trim().slice(0, 500);
    if (!t) return false;
    const to = playerId ? this.io.to(`p:${playerId}`) : this.io.to(`r:${room.id}`);
    to.emit("npc:done", { npcId, text: t, source: "admin" });
    this.remember(room, npcId, playerId ?? "всем", t, "admin");
    if (this.tts?.available()) void this.speak(to, npcId, t);
    return true;
  }

  /** Сброс патчей комнаты (вернуть мир как был) */
  clearPatches(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const patches = [...room.patches.entries()];
    room.patches.clear();
    // вернуть исходные объекты: добавить то, что убирали, убрать то, что добавляли
    for (const [chunkId, p] of patches) {
      const base = this.chunks.get(chunkId);
      const restore = base ? base.objects.filter((o) => p.remove.has(o.id)) : [];
      this.io.to(`r:${room.id}`).emit("world:patch", { chunkId, add: restore, remove: [...p.add.keys()] });
    }
    return true;
  }

  // ---------- утилиты ----------

  /** Игровое время комнаты (D-50) — его получает сценарий в `at` */
  private now(room: Room) {
    return gameNow(room, Date.now());
  }
  /** Для F3 и автотеста: что за прохождение у игрока (адрес, флаги, этап) */
  runInfo(playerId: PlayerId) {
    const room = this.myRoom(playerId);
    if (!room?.run) return null;
    return {
      roomId: room.id,
      address: room.run.config.address,
      flags: [...room.flags],
      stage: room.run.stage[playerId] ?? null,
      finished: room.finished,
    };
  }

  private myRoom(playerId: PlayerId) {
    const id = this.roomOf.get(playerId);
    return id ? this.rooms.get(id) : undefined;
  }
  private socketsOf(playerId: PlayerId): Sock[] {
    const ids = this.io.sockets.adapter.rooms.get(`p:${playerId}`) ?? new Set<string>();
    return [...ids].map((id) => this.io.sockets.sockets.get(id)).filter((s): s is Sock => s !== undefined);
  }
  private publicPlayers(room: Room) {
    return [...room.players.values()].filter((p) => p.online).map(toPublic);
  }
  private emitRoomState(room: Room) {
    this.io.to(`r:${room.id}`).emit("room:state", {
      roomId: room.id,
      mode: room.mode,
      players: [...room.players.values()].map(toPublic),
      started: room.started,
    });
  }
  private safe(fn: () => unknown) {
    try {
      const r = fn();
      if (r instanceof Promise) r.catch((e) => console.error("[game]", e));
    } catch (e) {
      console.error("[game]", e);
    }
  }
}
