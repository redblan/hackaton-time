/**
 * Контракт ИИ-модуля. ВЛАДЕЛЕЦ реализации: Матвей (папка ai/). Формат согласуется с лидом.
 *
 * Сервер вызывает ai.say(...) на каждый эффект npcSay и на каждое сообщение игрока NPC.
 * Всё работает локально: Ollama на ноуте-сервере, без интернета.
 * Если модель недоступна или отвечает дольше таймаута — ответ из шаблонов.
 */
import type { NpcEvent, NpcId, PlayerId, SkillId, StageId } from "./ids";

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
}

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
