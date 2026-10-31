/** Чистая логика комнат (без сокетов) — чтобы её можно было тестировать. */
import type { Mode, PlayerId, PlayerPublic, Role, RunState, StageId, Effect } from "@game/shared";

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
  emptySince?: number;
  /** Игровое время (D-50): накоплено до последней паузы + момент, с которого часы идут (null — пауза) */
  clock: { elapsedMs: number; runningSince: number | null };
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
    clock: { elapsedMs: 0, runningSince: null },
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
