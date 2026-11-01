/**
 * Контракт ИИ-модуля. ВЛАДЕЛЕЦ реализации: Матвей (папка ai/). Формат согласуется с лидом.
 *
 * Сервер вызывает ai.say(...) на каждый эффект npcSay и на каждое сообщение игрока NPC.
 * Всё работает локально: Ollama на ноуте-сервере, без интернета.
 * Если модель недоступна или отвечает дольше таймаута — ответ из шаблонов.
 */
import type { NpcEvent, NpcId, PlayerId, SkillId, StageId } from "./ids";
import type { ChunkId, Vec3, WorldPatch } from "./world";

export interface NpcRequest {
  npcId: NpcId;
  playerId: PlayerId;
  /** Почему NPC говорит. `free_talk` — игрок сам написал (тогда есть playerMessage). */
  event: NpcEvent;
  playerMessage?: string;
  context: {
    stage?: StageId;
    /** Флаги прохождения (что есть в мире: fire_f5, lift_vanya...) */
    flags: string[];
    /** Что игроки уже узнали (RunState.facts) */
    facts: string[];
    /** Для event = mistake: код ошибки и навык */
    mistake?: { skill: SkillId; code: string };
    /** Любые данные этапа: адрес дома, этаж, имя партнёра... */
    [key: string]: unknown;
  };
}

export interface NpcResponse {
  text: string;
  /** Какие факты из базы знаний прозвучали (для памяти и для разбора) */
  factIds: string[];
  /**
   * Итог для сценария, если он есть — значение `DialogOutcome` из ids.ts: `calmed`, `panicked`,
   * `agreed_to_go`, `slots_complete`, `slot_missing:address`, `handover_missing:fire`...
   * Сервер превратит в dialogOutcome.
   */
  outcome?: string;
  /** Откуда ответ — для отладки и для жюри */
  source: "llm" | "template";
  /** Для диспетчера 112: что уже собрано */
  slots?: Record<string, string>;
  /** D-73 (M21/M25): какое намерение игрока распознано — сервер шлёт в npc:done, клиент показывает в F3 */
  intent?: AgentIntent;
}

/** D-73: распознанное намерение игрока. `id` — свободная строка (`bring_first_aid`, `call_lift`…), `none` — не распознано */
export interface AgentIntent {
  id: string;
  /** Правило (ключевые слова, M21) или модель (M25) */
  source: "rule" | "llm";
  /** Сколько заняло распознавание, мс */
  ms: number;
}

/**
 * D-73: флаги, которые агент может включить сам (объекты Никиты, N13). Только включить, не выключить;
 * сервер применяет один раз за прохождение и рассылает `run:flags`. Прочие флаги — отказ (false).
 */
export const AGENT_FLAGS = ["spawn_first_aid", "spawn_ladder", "spawn_blankets", "spawn_exit", "power_on"] as const;
export type AgentFlag = (typeof AGENT_FLAGS)[number];

/** D-73 (M23): что случилось в мире — сервер сообщает ИИ, ИИ может ответить репликой NPC */
export type WorldEvent =
  | {
      /** picked — взял в руки; dropped — положил; thrown — бросил (была скорость) */
      type: "prop_picked" | "prop_dropped" | "prop_thrown";
      playerId: PlayerId;
      propId: string;
      /** Подпись предмета из данных: «Аптечка», «Огнетушитель» */
      label: string;
      chunkId: ChunkId;
      pos: Vec3;
    }
  | { type: "flag_set"; playerId: PlayerId; flag: string; by: "agent" | "admin" };

/** Память игрока между прохождениями. Хранится на сервере (сначала JSON, потом БД). */
export interface PlayerMemory {
  playerId: PlayerId;
  /** factId → сколько раз уже рассказали */
  toldFacts: Record<string, number>;
  /** factId → какие варианты объяснения уже использованы (индексы explanations) */
  usedExplanations: Record<string, number[]>;
  /** Ошибки по навыкам за всё время */
  mistakes: Partial<Record<SkillId, number>>;
  /** Отношение NPC к игроку */
  npc: Partial<Record<NpcId, { met: number; trust: number }>>;
  /** Последние реплики (для контекста LLM), не больше 20 */
  recent: { npcId: NpcId; from: "player" | "npc"; text: string; at: number }[];
}

export interface MemoryStore {
  get(playerId: PlayerId): Promise<PlayerMemory>;
  save(memory: PlayerMemory): Promise<void>;
}

export interface AiModule {
  say(req: NpcRequest): Promise<NpcResponse>;
  /**
   * Стриминг для чата: onToken вызывается по мере генерации, в конце — полный ответ.
   * onOutcome (D-68): вызвать НЕ БОЛЬШЕ ОДНОГО РАЗА, как только итог известен (до генерации текста),
   * — сервер сразу отдаст его сценарию. Тогда `outcome` в ответе должен совпадать; повторно он не отправится.
   */
  sayStream?(req: NpcRequest, onToken: (t: string) => void, onOutcome?: (outcome: string) => void): Promise<NpcResponse>;
  /** Сброс состояния диалога в начале нового прохождения (например, слоты диспетчера) */
  resetRun?(playerId: PlayerId): void;
  /** Админка (01.11, M22): карточки персонажей — что можно менять на лету */
  getCharacters?(): CharacterCard[];
  /** Применяется к следующей реплике. Вернуть обновлённую карточку */
  setCharacter?(npcId: NpcId, patch: Partial<Omit<CharacterCard, "npcId" | "name">>): CharacterCard | null;
  /** Метрики ИИ для админки */
  getStats?(): AiStats;
  /**
   * Агент меняет мир (01.11, M21): ИИ зовёт `patch` в ответ на намерение игрока («принеси аптечку»),
   * сервер применяет к комнате и рассылает `world:patch`. Сервер передаёт эту функцию через `setWorldHook`.
   */
  setWorldHook?(hook: (playerId: PlayerId, patch: WorldPatch) => void): void;
  /** D-73 (M21): агент включает флаг из AGENT_FLAGS. Хук вернёт false, если флаг не разрешён или уже включён */
  setFlagHook?(hook: (playerId: PlayerId, flag: AgentFlag) => boolean): void;
  /**
   * D-73 (M23): событие мира. Вернуть реплику — сервер покажет её игроку как ответ NPC (с озвучкой), null — промолчать.
   * Сервер зовёт не чаще раза в 8 с на игрока; context — как в NpcRequest.
   */
  onWorldEvent?(e: WorldEvent, context: NpcRequest["context"]): Promise<{ npcId: NpcId; text: string } | null>;
}

/** Поведение агента, которое можно редактировать из админки */
export interface CharacterCard {
  npcId: NpcId;
  name: string;
  /** Короткое описание характера (идёт в промпт) */
  traits: string;
  /** Настроение: спокоен / встревожен / паника / раздражён — свободная строка, идёт в промпт */
  mood: string;
  temperature: number;
  /** Отвечать только заготовками, модель не звать */
  templatesOnly: boolean;
  /** Можно ли выдумывать за пределами базы фактов (по умолчанию нет) */
  factsOnly: boolean;
}

export interface AiStats {
  model: string;
  available: boolean;
  /** Запросов в очереди и в работе */
  queued: number;
  inFlight: number;
  /** Последняя и средняя задержка модели, мс */
  lastMs: number;
  avgMs: number;
  /** Сколько ответов дала модель и сколько — шаблоны */
  llm: number;
  template: number;
}

export interface AiOptions {
  /** По умолчанию http://127.0.0.1:11434 */
  ollamaUrl?: string;
  /** Например qwen2.5:7b-instruct */
  model?: string;
  /** Таймаут LLM, после него — шаблон. По умолчанию 6000 мс */
  timeoutMs?: number;
  memory: MemoryStore;
}
