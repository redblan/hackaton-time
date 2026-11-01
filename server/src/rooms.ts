/** Чистая логика комнат (без сокетов) — чтобы её можно было тестировать. */
import { initDirector, type DirectorState } from "./director";
import type { ChunkId, Effect, Mode, NpcId, NpcPublic, PlayerId, PlayerPublic, PropState, Role, RunState, StageId, WorldObject } from "@game/shared";
import type { Escort } from "./escort";

export const ROLES_BY_MODE: Record<Mode, Role[]> = {
  solo: ["inside_top"],
  coop2: ["inside_top", "outside"],
  coop3: ["inside_top", "inside_mid", "outside"],
};

export const capacity = (mode: Mode) => ROLES_BY_MODE[mode].length;

export interface RoomPlayer extends PlayerPublic {
  online: boolean;
  /** Последний эффект stage — переотправляем при перезаходе */
  lastStage?: Extract<Effect, { type: "stage" }>;
  /** Открытая мини-игра — повторяем при перезаходе, пока нет результата (D-53) */
  openMinigame?: Extract<Effect, { type: "openMinigame" }>;
  stage?: StageId;
  lastSavedAt?: number;
}

export interface Room {
  id: string;
  mode: Mode;
  players: Map<PlayerId, RoomPlayer>;
  started: boolean;
  finished: boolean;
  run: RunState | null;
  /** Флаги мира: из генератора + setFlag */
  flags: Set<string>;
  timers: NodeJS.Timeout[];
  /** «Режиссёр» мира (director.ts): газ, огонь, скорая */
  director: DirectorState;
  emptySince?: number;
  /** Игровое время (D-50): накоплено до последней паузы + момент, с которого часы идут (null — пауза) */
  clock: { elapsedMs: number; runningSince: number | null };
  /** Подвижные NPC (сопровождение) */
  npcs: Map<NpcId, Escort>;
  /** Есть несохранённые изменения — снимок уйдёт в БД */
  dirty: boolean;
  /** Живые изменения чанков (01.11): агенты и админка. Накладываются на chunk:data и рассылаются world:patch */
  patches: Map<ChunkId, { add: Map<string, WorldObject>; remove: Set<string> }>;
  /** Последнее состояние переносимых предметов (prop:move) */
  props: Map<string, PropState>;
  /** Двери квартир по чанкам: true — открыта (по умолчанию закрыта) */
  doors: Map<ChunkId, boolean>;
  /** Последние реплики NPC комнаты — для админки */
  lines: { at: number; npcId: NpcId; to: string; text: string; source: string; ms?: number }[];
}

export function newRoom(id: string, mode: Mode): Room {
  return {
    id,
    mode,
    players: new Map(),
    started: false,
    finished: false,
    run: null,
    flags: new Set(),
    timers: [],
    director: initDirector(),
    clock: { elapsedMs: 0, runningSince: null },
    npcs: new Map(),
    dirty: false,
    patches: new Map(),
    props: new Map(),
    doors: new Map(),
    lines: [],
  };
}

/** Комната, куда посадить игрока: незапущенная, того же режима, со свободным местом. */
export function findOpenRoom(rooms: Iterable<Room>, mode: Mode): Room | undefined {
  for (const r of rooms) if (!r.started && r.mode === mode && r.players.size < capacity(mode)) return r;
  return undefined;
}

export type PickRoleResult = { ok: true } | { ok: false; error: string };

export function pickRole(room: Room, playerId: PlayerId, role: Role): PickRoleResult {
  if (room.started) return { ok: false, error: "Игра уже идёт" };
  if (!ROLES_BY_MODE[room.mode].includes(role)) return { ok: false, error: "Эта роль недоступна в этом режиме" };
  for (const p of room.players.values()) {
    if (p.id !== playerId && p.role === role) return { ok: false, error: "Роль уже занята" };
  }
  const me = room.players.get(playerId);
  if (!me) return { ok: false, error: "Вы не в комнате" };
  me.role = role;
  return { ok: true };
}

export function canStart(room: Room): boolean {
  return (
    !room.started &&
    room.players.size === capacity(room.mode) &&
    [...room.players.values()].every((p) => p.role !== null)
  );
}

export function toPublic(p: RoomPlayer): PlayerPublic {
  return { id: p.id, name: p.name, role: p.role, pos: p.pos, rotY: p.rotY, anim: p.anim };
}

// ---------- Игровое время (D-50): мс от старта прохождения, стоит, пока в комнате никого нет ----------

export function gameNow(room: Room, wall: number): number {
  const c = room.clock;
  return c.elapsedMs + (c.runningSince === null ? 0 : wall - c.runningSince);
}

export function pauseClock(room: Room, wall: number) {
  if (room.clock.runningSince === null) return;
  room.clock = { elapsedMs: gameNow(room, wall), runningSince: null };
}

export function resumeClock(room: Room, wall: number) {
  if (room.clock.runningSince !== null) return;
  room.clock = { ...room.clock, runningSince: wall };
}

// ---------- Снимок комнаты для восстановления после перезапуска сервера ----------

export interface RoomSnapshot {
  v: 1;
  id: string;
  mode: Mode;
  finished: boolean;
  run: RunState | null;
  flags: string[];
  clockMs: number;
  players: Pick<RoomPlayer, "id" | "name" | "role" | "pos" | "rotY" | "stage" | "lastStage" | "openMinigame">[];
  npcs: Escort[];
}

export function toSnapshot(room: Room, wall: number): RoomSnapshot {
  return {
    v: 1,
    id: room.id,
    mode: room.mode,
    finished: room.finished,
    run: room.run,
    flags: [...room.flags],
    clockMs: gameNow(room, wall),
    players: [...room.players.values()].map(({ id, name, role, pos, rotY, stage, lastStage, openMinigame }) => ({
      id,
      name,
      role,
      pos,
      rotY,
      stage,
      lastStage,
      openMinigame,
    })),
    npcs: [...room.npcs.values()],
  };
}

/** Комната из снимка: запущена, все офлайн, часы на паузе до первого перезахода. */
export function fromSnapshot(s: RoomSnapshot): Room {
  const room = newRoom(s.id, s.mode);
  room.started = true;
  room.finished = s.finished;
  room.run = s.run;
  room.flags = new Set(s.flags);
  room.clock = { elapsedMs: s.clockMs, runningSince: null };
  for (const p of s.players) room.players.set(p.id, { ...p, anim: "idle", online: false });
  for (const e of s.npcs) room.npcs.set(e.npcId, e);
  return room;
}

export function publicNpcs(room: Room): NpcPublic[] {
  return [...room.npcs.values()].map((e) => ({ npcId: e.npcId, pos: e.pos, rotY: e.rotY, following: e.playerId, ...(e.walking ? { walking: true } : {}) }));
}
