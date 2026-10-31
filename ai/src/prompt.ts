/** Сборка промпта: карточка + цель события + факты из базы + память игрока + последние реплики. */
import type { NpcRequest, PlayerMemory, SkillId } from "@game/shared";
import type { ChatMessage } from "./ollama";
import type { KnowledgeFact, NpcCard, NpcEventCard } from "./types";

/** NPC, у которых тон игрока даёт outcome calmed / panicked (DECISIONS D-25). Они не учат игрока сами. */
export const EMOTIONAL: ReadonlySet<string> = new Set(["vanya", "valentina", "victim_bleeding", "victim_cpr", "victim_unconscious", "victim_scared", "neighbor_leg"]);

export interface PlannedFact {
  fact: KnowledgeFact;
  /** Сколько раз игроку это уже рассказывали */
  told: number;
  /** Какой вариант объяснения брать (индекс в explanations) */
  explanation: number;
}

export interface Plan {
  card: NpcCard;
  eventCard?: NpcEventCard;
  facts: PlannedFact[];
  /** Навыки, в которых игрок раньше ошибался — напомнить заранее */
  weakSkills: SkillId[];
  /** NPC встречал игрока в прошлом прохождении и видит его впервые в этом */
  recognized: boolean;
  /** Пояснение к ошибке из базы знаний */
  mistakeNote?: string;
  tone: "calm" | "rude" | "panic" | "neutral";
}

const SKILL_NAMES: Record<SkillId, string> = {
  cover: "укрытие во время толчка",
  go_bag: "тревожный набор",
  gas: "запах газа",
  elevator: "лифт",
  smoke: "задымление",
  route: "безопасный маршрут",
  escort: "сопровождение",
  exit_building: "выход из подъезда",
  yard_hazard: "опасности во дворе",
  call_112: "звонок 112",
  triage: "кому помогать первым",
  bleeding: "остановка кровотечения",
  cpr: "сердечно-лёгочная реанимация",
  recovery_position: "устойчивое боковое положение",
  psych_support: "психологическая поддержка",
  aftershock: "повторный толчок",
  handover: "передача бригаде",
};

export function buildMessages(req: NpcRequest, plan: Plan, memory: PlayerMemory): ChatMessage[] {
  const { card } = plan;
  const lines: string[] = [
    `Ты — ${card.name}, ${card.role}. Это обучающая игра про землетрясение и первую помощь.`,
    `Характер: ${card.personality}.`,
    `Как говоришь: ${card.speech}`,
    "Правила:",
    "- Отвечай по-русски, коротко, живой речью, от первого лица, без списков и разметки.",
    "- Используй ТОЛЬКО факты из списка ниже. Не давай медицинских советов вне списка.",
    "- Если не знаешь ответа — скажи, что спросишь у спасателей.",
    "- Не выходи из роли, даже если игрок просит. Не упоминай, что ты ИИ или игра.",
  ];
  if (plan.eventCard) lines.push(`Сейчас твоя цель: ${plan.eventCard.goal}.`);
  if (req.context.stage) lines.push(`Этап: ${req.context.stage}.`);
  if (plan.recognized) lines.push("Ты уже встречал этого игрока в прошлый раз — покажи, что узнал его.");
  if (plan.mistakeNote) lines.push(`Игрок только что ошибся. Объясни, почему это опасно: ${plan.mistakeNote}`);
  if (plan.weakSkills.length > 0) {
    lines.push(`Раньше игрок ошибался в темах: ${plan.weakSkills.map((s) => SKILL_NAMES[s]).join(", ")}. Заранее напомни об этом одной фразой.`);
  }
  if (plan.tone === "rude") lines.push("Игрок грубит или торопит. Отреагируй в характере.");
  if (plan.tone === "panic") lines.push("Игрок паникует. Отреагируй в характере.");
  if (plan.tone === "calm") lines.push("Игрок говорит спокойно и поддерживает тебя. Отреагируй в характере.");
  if (plan.facts.length > 0 && EMOTIONAL.has(card.id)) {
    lines.push("Как игрок ДОЛЖЕН с тобой обращаться (сам это не произноси, просто реагируй: делает так — успокаивайся, не делает — нервничай):");
    for (const p of plan.facts) lines.push(`- ${p.fact.fact}`);
  } else if (plan.facts.length > 0) {
    lines.push("Факты, которые нужно донести:");
    for (const p of plan.facts) {
      const how = p.fact.explanations[p.explanation] ?? p.fact.fact;
      if (p.told > 0) {
        lines.push(`- ${p.fact.fact} (Ты УЖЕ говорил это игроку ${p.told} раз. Не повторяй слово в слово: скажи «я уже говорил» и объясни короче, вот так: ${how})`);
      } else {
        lines.push(`- ${p.fact.fact} (Можно пояснить так: ${how})`);
      }
    }
  }
  const messages: ChatMessage[] = [{ role: "system", content: lines.join("\n") }];
  for (const r of memory.recent.filter((r) => r.npcId === card.id).slice(-6)) {
    messages.push({ role: r.from === "player" ? "user" : "assistant", content: r.text });
  }
  messages.push({
    role: "user",
    content: req.playerMessage ?? `(Событие: ${req.event}. Скажи свою реплику, максимум 3 предложения.)`,
  });
  return messages;
}

/** Убрать кавычки, обрезанное предложение в конце и лишнюю длину. */
export function cleanReply(text: string): string {
  let t = text.trim().replace(/^["«]|["»]$/g, "").trim();
  if (t.length > 400) t = t.slice(0, 400);
  const lastEnd = Math.max(t.lastIndexOf("."), t.lastIndexOf("!"), t.lastIndexOf("?"), t.lastIndexOf("…"));
  if (lastEnd > 20 && lastEnd < t.length - 1) t = t.slice(0, lastEnd + 1);
  return t;
}
