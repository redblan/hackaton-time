/**
 * Контракт сценария. ВЛАДЕЛЕЦ реализации: Юра. Формат согласуется с лидом.
 *
 * Сценарий — ЧИСТЫЙ редьюсер: (state, event) → (state, effects).
 * Без сети, без таймеров, без Date.now(): время приходит в событии (`at`, мс).
 * Сервер хранит state и исполняет effects (рассылает игрокам, зовёт ИИ, пишет в БД).
 */
import type {
  InteractableId,
  ItemId,
  MinigameId,
  Mode,
  NpcEvent,
  NpcId,
  PlayerId,
  Role,
  SkillId,
  StageId,
  ZoneId,
} from "../ids";

// ---------- Профиль игрока (хранится в БД, нужен генератору и разбору) ----------

export interface PlayerProfile {
  playerId: PlayerId;
  runs: number;
  /** Сколько раз навык сделан правильно / с ошибкой за всё время */
  skills: Partial<Record<SkillId, { ok: number; fail: number }>>;
}

// ---------- Конфиг прохождения (генератор) ----------

export type VictimKind = "bleeding" | "cpr" | "unconscious" | "scared" | "light_injury";

export interface RunConfig {
  seed: number;
  mode: Mode;
  /** Этаж старта игрока inside_top (6..9) */
  startFloor: number;
  /**
   * Флаги для мира и сценария: `fire_f5`, `collapse_f4` (пролёт между 4 и 3),
   * `lift_vanya`, `neighbor_valentina`, `wire`, `gas`, `aftershock`.
   */
  flags: string[];
  victims: VictimKind[];
  address: string;
  /** Через сколько мс после выхода во двор повторный толчок, null — не будет */
  aftershockAfterMs: number | null;
}

export interface GenerateRunInput {
  mode: Mode;
  profiles: PlayerProfile[];
  seed: number;
}

// ---------- Состояние ----------

export interface JournalEntry {
  at: number;
  playerId: PlayerId;
  stage: StageId;
  skill: SkillId;
  outcome: "ok" | "mistake" | "missed";
  /** Коротко, по-русски: что именно сделал. Читает наставник на разборе. */
  note: string;
}

export interface RunState {
  config: RunConfig;
  players: { id: PlayerId; role: Role }[];
  stage: Record<PlayerId, StageId>;
  inventory: Record<PlayerId, ItemId[]>;
  /** Что игроки уже узнали/сделали: `saw_vanya`, `saw_fire`, `told_112_address`... */
  facts: string[];
  victims: Record<string, { kind: VictimKind; state: "untreated" | "in_progress" | "stable" }>;
  journal: JournalEntry[];
  startedAt: number;
  /** Таймеры сценария (D-40): имя → момент старта, мс игрового времени. В facts таймеры не храним */
  timers: Record<string, number>;
  finished: boolean;
}

// ---------- События (вход редьюсера) ----------

export interface MinigameResult {
  game: MinigameId;
  skill: SkillId;
  ok: boolean;
  /** Коды ошибок, например `tourniquet_no_time`, `cpr_too_slow` */
  mistakes: string[];
  timeMs: number;
  /** Доп. данные игры: выбранные предметы, записанное время жгута и т.п. */
  data?: Record<string, unknown>;
}

export type GameEvent =
  | { type: "start"; at: number }
  | { type: "enterZone"; at: number; playerId: PlayerId; zone: ZoneId }
  | { type: "interact"; at: number; playerId: PlayerId; target: InteractableId }
  | { type: "minigameResult"; at: number; playerId: PlayerId; result: MinigameResult }
  /** Итог разговора от ИИ-модуля, см. `DialogOutcome` в ids.ts: `calmed`, `slots_complete`, `slot_missing:address`... */
  | { type: "dialogOutcome"; at: number; playerId: PlayerId; npcId: NpcId; outcome: string }
  /** Сервер шлёт раз в секунду — для таймеров (толчок, повторный толчок, лимиты этапов) */
  | { type: "tick"; at: number };

// ---------- Эффекты (выход редьюсера) ----------

export interface RunSummary {
  score: number;
  durationMs: number;
  perPlayer: {
    playerId: PlayerId;
    /** Очки этого игрока (общий score — по команде) */
    score: number;
    ok: SkillId[];
    mistakes: { skill: SkillId; note: string }[];
  }[];
}

export type Effect =
  /** Игрок перешёл на этап; hint — короткая подсказка в HUD */
  | { type: "stage"; playerId: PlayerId; stage: StageId; hint: string }
  /** Попросить ИИ сказать реплику (сервер вызывает ai.say) */
  | { type: "npcSay"; npcId: NpcId; toPlayerId: PlayerId; event: NpcEvent; context?: Record<string, unknown> }
  /** Открыть мини-игру у игрока */
  | { type: "openMinigame"; playerId: PlayerId; game: MinigameId; params?: Record<string, unknown> }
  /** Землетрясение: тряска камеры, звук, пыль */
  | { type: "quake"; strength: number; durationMs: number }
  /** Включить флаг в мире (например, обрушить пролёт после толчка) */
  | { type: "setFlag"; flag: string }
  /** Положить/забрать предмет */
  | { type: "inventory"; playerId: PlayerId; items: ItemId[] }
  | { type: "journal"; entry: JournalEntry }
  | { type: "runEnd"; summary: RunSummary };

export interface ReduceResult {
  state: RunState;
  effects: Effect[];
}
