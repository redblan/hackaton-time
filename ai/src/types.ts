/**
 * Внутренние форматы ИИ-модуля: база знаний и карточки NPC.
 * Контракт с сервером — в shared/src/ai.ts, здесь только то, что лежит в ai/knowledge и ai/npcs.
 */
import type { NpcEvent, NpcId, SkillId } from "@game/shared";

/** Один факт из ai/knowledge/<тема>.json */
export interface KnowledgeFact {
  id: string;
  skill: SkillId;
  /** Короткая формулировка, её NPC говорит при первом знакомстве с темой */
  fact: string;
  /** 2–3 способа объяснить: правило, пример, «что будет, если…» */
  explanations: string[];
  /** Код ошибки сценария → почему это опасно */
  mistakes?: Record<string, string>;
  /** Официальный источник. Без url факт считается непроверенным. */
  source: { title: string; url: string };
}

export interface NpcEventCard {
  /** Чего NPC добивается этой репликой */
  goal: string;
  /** id фактов из базы знаний, которые надо донести */
  facts: string[];
  /** Готовые реплики на случай, если модель недоступна. Минимум 3. */
  templates: string[];
}

/** Голос озвучки (Piper): ru_RU-<name>-medium.onnx, speed > 1 — быстрее */
export interface NpcVoice {
  name: "irina" | "denis" | "dmitri" | "ruslan";
  speed?: number;
}

/** Карточка персонажа ai/npcs/<npcId>.json */
export interface NpcCard {
  id: NpcId;
  name: string;
  role: string;
  personality: string;
  speech: string;
  /** Темы, о которых NPC может говорить в свободном разговоре */
  skills?: SkillId[];
  /** Голос озвучки; нет — берётся DEFAULT_VOICES из tts.ts */
  voice?: NpcVoice;
  /** Фразы, если NPC встречал игрока в прошлом прохождении */
  recognize?: string[];
  /** Реакции на тон игрока (Ваня, Валентина, напуганный пострадавший) */
  reactions?: { calmed?: string[]; panicked?: string[] };
  events: Partial<Record<NpcEvent, NpcEventCard>>;
}
