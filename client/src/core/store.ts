/** Состояние клиента: маленький стор на useSyncExternalStore (без лишних зависимостей). */
import { useSyncExternalStore } from "react";
import type { ChunkData, ChunkId, ItemId, MinigameId, Mode, NpcId, NpcPublic, PlayerPublic, RunSummary, StageId } from "@game/shared";

export interface Auth {
  token: string;
  playerId: string;
  name: string;
}
export interface RoomState {
  roomId: string;
  mode: Mode;
  players: PlayerPublic[];
  started: boolean;
}
export interface NpcLine {
  key: number;
  npcId: NpcId;
  text: string;
  done: boolean;
  source?: "llm" | "template";
  /** Реплика игрока (то, что он написал NPC) */
  fromPlayer?: boolean;
}
export interface ChatMsg {
  key: number;
  from: string;
  text: string;
  at: number;
}
export interface Prompt {
  target: string;
  label: string;
}

export interface State {
  auth: Auth | null;
  connected: boolean;
  netError: string | null;
  room: RoomState | null;
  /** Другие игроки (без меня). Позиции для интерполяции — в remote.ts */
  others: { id: string; name: string; role: PlayerPublic["role"] }[];
  chunks: Record<ChunkId, ChunkData>;
  /** Подвижные NPC (без позиций — они в remote.ts под id `npc:<npcId>`) */
  npcs: Pick<NpcPublic, "npcId" | "following">[];
  flags: string[];
  stage: { stage: StageId; hint: string } | null;
  inventory: ItemId[];
  npcLines: NpcLine[];
  chat: ChatMsg[];
  prompt: Prompt | null;
  nearNpc: NpcId | null;
  minigame: { game: MinigameId; params?: Record<string, unknown>; key: number } | null;
  runEnd: { summary: RunSummary; debrief: string } | null;
  locked: boolean;
  typing: boolean;
  /**
   * Идёт толчок: до какого момента (performance.now()) и сила 0..1.
   * Для мира (Никита): `useStore((s) => s.quake)` — пыль, качание люстр, дрожание объектов.
   */
  quake: { until: number; strength: number } | null;
  /** Окно помощи (F1 / H) и отладка для жюри (F3 / `) */
  help: boolean;
  debug: boolean;
  /** Чувствительность мыши, множитель */
  sensitivity: number;
  /** Дверь квартиры по чанкам: false — закрыта (E на «Дверь квартиры»). По умолчанию открыта. Только вид, без коллизий. */
  doors: Record<string, boolean>;
}

const initial: State = {
  auth: null,
  connected: false,
  netError: null,
  room: null,
  others: [],
  chunks: {},
  npcs: [],
  flags: [],
  stage: null,
  inventory: [],
  npcLines: [],
  chat: [],
  prompt: null,
  nearNpc: null,
  minigame: null,
  runEnd: null,
  locked: false,
  typing: false,
  quake: null,
  help: false,
  debug: false,
  sensitivity: readSensitivity(),
  doors: {},
};

function readSensitivity() {
  try {
    const v = Number(localStorage.getItem("toltchok.sensitivity"));
    return v > 0.1 && v < 5 ? v : 1;
  } catch {
    return 1;
  }
}

export function setSensitivity(v: number) {
  store.set({ sensitivity: v });
  try {
    localStorage.setItem("toltchok.sensitivity", String(v));
  } catch {
    /* ignore */
  }
}

let state: State = initial;
const listeners = new Set<() => void>();

export const store = {
  get: () => state,
  set(patch: Partial<State> | ((s: State) => Partial<State>)) {
    state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
    listeners.forEach((l) => l());
  },
  /** Сбросить всё, кроме входа */
  resetGame() {
    store.set({ ...initial, auth: state.auth, connected: state.connected, sensitivity: state.sensitivity });
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(state));
}

let seq = 0;
export const nextKey = () => ++seq;

// Отладка в dev: window.__store.get() в консоли браузера
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __store: typeof store }).__store = store;
