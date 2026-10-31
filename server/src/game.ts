/**
 * Склейка: сокеты ↔ комнаты ↔ сценарий Юры ↔ ИИ Матвея ↔ мир Никиты.
 * Сервер — единственный источник правды.
 */
import { randomInt, randomUUID } from "node:crypto";
import { recordRoute, routeAreas, routeAdvice } from './route';
import type { Server, Socket } from "socket.io";
import {
  INTERACTABLES,
  MODES,
  NPC_IDS,
  ROLES,
  ZONES,
  generateRun,
  initRun,
  reduce,
  type AiModule,
  type ChunkId,
  type ClientToServer,
  type Effect,
  type GameEvent,
  type NpcRequest,
  type PlayerId,
  type PlayerPublic,
  type ServerToClient,
  type Vec3,
} from "@game/shared";
import { planChunks, type ChunkStore } from "./chunks";
import type { Store } from "./db";
import type { Stt } from "@game/ai";
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
  ) {
    this.intervals.push(
      setInterval(() => this.safe(() => this.frame(POS_BROADCAST_MS)), POS_BROADCAST_MS),
      setInterval(() => this.cleanup(), 60_000),
      setInterval(() => void this.saveRooms(), SAVE_ROOMS_MS),
    );
    io.on("connection", (s) => this.onConnection(s));
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
    s.on("disconnect", () => this.safe(() => this.onDisconnect(s)));
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
    for (const p of room.players.values()) {
      const sp = this.chunks.findSpawn(p.role!, config.startFloor);
      p.pos = [sp.pos[0], sp.pos[1], sp.pos[2]];
      p.rotY = sp.rotY;
      this.ai.resetRun?.(p.id);
      const route = { id: p.id, name: p.name, points: [], errors: [], truncated: false };
      recordRoute(route, 0, p.pos, true);
      room.route.push(route);
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
    if (room.started && !room.finished) {
      const route = room.route.find(r => r.id === me.id);
      if (route) recordRoute(route, this.now(room), me.pos);
    }
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
    for (const id of plan.send) s.emit("chunk:data", { chunk: this.chunks.get(id)! });
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
      case "journal": {
        const route = room.route.find(r => r.id === eff.entry.playerId);
        const player = room.players.get(eff.entry.playerId);
        if (route && player && eff.entry.outcome !== 'ok' && route.errors.length < 500) {
          recordRoute(route, eff.entry.at, player.pos, true);
          route.errors.push({ at: eff.entry.at, pos: [...player.pos], note: eff.entry.note, advice: routeAdvice(eff.entry.skill) });
        }
        this.io.to(`p:${eff.entry.playerId}`).emit("game:effect", eff);
        void this.recordSkill(eff.entry.playerId, eff.entry.skill, eff.entry.outcome === "ok");
        break;
      }
      case "setFlag":
        room.flagTimes[eff.flag] ??= this.now(room);
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

  private async npcSay(room: Room, playerId: PlayerId, req: NpcRequest) {
    const to = this.io.to(`p:${playerId}`);
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
      to.emit("npc:done", { npcId: req.npcId, text: res.text, source: res.source });
      if (res.outcome) sendOutcome(res.outcome);
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
    if (!this.stt?.available()) return reply({ error: "Распознавание голоса на сервере не настроено" });
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
    if (room.finished) return;
    for (const player of room.players.values()) {
      const route = room.route.find(r => r.id === player.id);
      if (route) recordRoute(route, this.now(room), player.pos, true);
    }
    summary = { ...summary, route: {
      players: structuredClone(room.route), durationMs: summary.durationMs,
      areas: routeAreas(this.chunks.ids().flatMap(id => { const c = this.chunks.get(id); return c ? [c] : []; }), room.flags, room.flagTimes),
    } };
    room.result = summary;
    room.finished = true;
    room.timers.forEach(clearInterval);
    room.timers = [];
    room.dirty = true;
    void this.saveRooms();
    for (const p of room.players.values()) {
      if (summary.route) await this.store.saveRoute(p.id, summary.route).catch(e => console.error('[route] сохранение не удалось:', e));
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
