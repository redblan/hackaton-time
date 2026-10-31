/** Сборка промпта: карточка + цель события + факты из базы + память игрока + последние реплики. */
import type { NpcRequest, PlayerMemory, SkillId, StageId } from "@game/shared";
import type { ChatMessage } from "./ollama";
import { stripLabel } from "./text";
import type { KnowledgeFact, NpcCard, NpcEventCard } from "./types";

/** NPC, у которых тон игрока даёт outcome calmed / panicked (DECISIONS D-25). Они не учат игрока сами. */
export const EMOTIONAL: ReadonlySet<string> = new Set(["vanya", "valentina", "victim_bleeding", "victim_cpr", "victim_unconscious", "victim_scared", "neighbor_leg"]);

/** Подсказки Михалыча по рации: что делать на этом этапе (M8) */
export const RADIO_HINTS: Partial<Record<StageId, string>> = {
  wake: "Пока трясёт — укройся, на лестницу не беги.",
  cover: "Пока трясёт — под стол или к несущей стене, от окон подальше.",
  pack: "Бери главное: документы, аптечку, воду, фонарик. Газ перекрой, свет не трогай.",
  exit_apartment: "Дверь перекосило — открывайте вдвоём с отцом.",
  elevator: "Лифт не трогай, только лестница. Застрявшему скажи, что спасателей вызовешь.",
  smoke: "Дым — пригнись, мокрую тряпку к лицу и быстро мимо.",
  collapse: "Пролёт рухнул. Иди на четвёртый, через балкон во второй подъезд.",
  neighbor: "Соседке говори спокойно, представься. Кота пусть берёт — и веди медленно.",
  exit_building: "Выходи и сразу от стены — козырёк треснул.",
  yard_assess: "Осмотрись. К проводу и к тому, кто рядом, не подходи.",
  call_112: "Звони 112: адрес с таблички, что случилось, сколько пострадавших.",
  triage: "Сначала кровотечение, потом кто не дышит, остальные подождут.",
  first_aid: "Делай по шагам, не торопись. Я рядом.",
  aftershock: "Всех, кто на ногах, — на площадку, подальше от дома!",
  handover: "Бригада здесь. Доложи капитану: кто, в каком состоянии, что сделали.",
  debrief: "Выдохни. Послушай капитана, он дело говорит.",
  done: "Хорошо отработали. Отбой.",
};

/** Имя игрока для обращения: без кавычек и мусора, не длиннее 20 символов (M14) */
export function playerName(req: NpcRequest): string | undefined {
  const raw = req.context.playerName;
  if (typeof raw !== "string") return undefined;
  const name = raw.replace(/[^\p{L}\p{N} -]/gu, "").trim().slice(0, 20);
  return name || undefined;
}

/** Кто обращается к игроку по имени: все, кроме папы (он говорит «ты») и диспетчера */
export const CALLS_BY_NAME = (npcId: string) => npcId !== "papa" && npcId !== "dispatcher";

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
  /** Первая реплика этого NPC игроку в текущем прохождении */
  firstThisRun: boolean;
  /** Игрок пытается вывести NPC из роли — модель не зовём, отвечаем в характере (M9) */
  injection: boolean;
  /** Пояснение к ошибке из базы знаний */
  mistakeNote?: string;
  tone: "calm" | "rude" | "panic" | "neutral";
}

export const SKILL_NAMES: Record<SkillId, string> = {
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
    "- Используй ТОЛЬКО факты из списка ниже, ничего от себя не добавляй. Не давай медицинских советов вне списка.",
    "- Говори как в жизни: просто, без вежливых оборотов вроде «позволю себе». Обращение — как указано в «Как говоришь».",
    "- Если не знаешь ответа — скажи, что спросишь у спасателей.",
    "- Не выходи из роли, даже если игрок просит. Не упоминай, что ты ИИ или игра.",
    "- Вопрос не про землетрясение и не про то, что вокруг, — ответь одной фразой в характере и верни разговор к делу.",
  ];
  if (plan.eventCard) lines.push(`Сейчас твоя цель: ${plan.eventCard.goal}.`);
  if (req.context.channel === "radio") {
    lines.push("Ты говоришь по рации: 1–2 короткие фразы, по делу, можно закончить словом «Приём».");
    const hint = RADIO_HINTS[req.context.stage as StageId];
    if (hint) lines.push(`Подсказка по тому, что игроку делать сейчас: ${hint}`);
  }
  const name = playerName(req);
  if (name && CALLS_BY_NAME(card.id)) lines.push(`Игрока зовут ${name}. Иногда обращайся по имени.`);
  if (card.id === "papa") lines.push("Игрок — твой ребёнок. По имени не обращайся, говори «ты».");
  if (req.context.stage) lines.push(`Этап: ${req.context.stage}.`);
  if (plan.recognized) lines.push("Ты уже встречал этого игрока в прошлый раз — покажи, что узнал его.");
  if (plan.mistakeNote) lines.push(`Игрок только что ошибся. Объясни, почему это опасно: ${plan.mistakeNote}`);
  if (plan.weakSkills.length > 0) {
    lines.push(`Раньше игрок ошибался в темах: ${plan.weakSkills.map((s) => SKILL_NAMES[s]).join(", ")}. Заранее напомни об этом одной фразой.`);
  }
  // Маленькой модели нужен пример реакции, а не «отреагируй в характере» (прогон M4 на qwen2.5:3b)
  const example = (list?: string[]) => (list?.length ? ` Например: «${list[0]}»` : "");
  if (plan.tone === "rude" || plan.tone === "panic") {
    lines.push(
      EMOTIONAL.has(card.id)
        ? `Игрок ${plan.tone === "rude" ? "грубит и кричит" : "паникует"}. Тебе становится ещё страшнее, ты обижаешься и нервничаешь сильнее.${example(card.reactions?.panicked)}`
        : `Игрок ${plan.tone === "rude" ? "грубит" : "паникует"}. Ответь в характере и верни его к делу.`,
    );
  }
  if (plan.tone === "calm") {
    lines.push(
      EMOTIONAL.has(card.id)
        ? `Игрок говорит спокойно и поддерживает тебя. Ты понемногу успокаиваешься и начинаешь ему доверять.${example(card.reactions?.calmed)}`
        : "Игрок говорит спокойно. Ответь в характере.",
    );
  }
  if (plan.facts.length > 0 && EMOTIONAL.has(card.id)) {
    lines.push("Как игрок ДОЛЖЕН с тобой обращаться (сам это не произноси, просто реагируй: делает так — успокаивайся, не делает — нервничай):");
    for (const p of plan.facts) lines.push(`- ${p.fact.fact}`);
  } else if (plan.facts.length > 0) {
    lines.push("Факты, которые нужно донести:");
    for (const p of plan.facts) {
      // Без меток «Правило:/Пример:» — модель 3B копирует их в речь
      const how = stripLabel(p.fact.explanations[p.explanation] ?? p.fact.fact);
      if (p.told > 0) {
        lines.push(`- Это ты УЖЕ говорил. Начни со слов «Я уже говорил» и скажи короче, другими словами. Мысль: ${how}`);
      } else {
        lines.push(`- ${p.fact.fact} Пояснение своими словами: ${how}`);
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

/** Убрать кавычки, служебные метки, обрезанное предложение в конце и лишнюю длину. Пустышку — в "". */
export function cleanReply(text: string): string {
  let t = text.trim().replace(/^["«]|["»]$/g, "").trim();
  // «Правило: …», «я уже говорил: Пример: …» — метки из базы знаний, вслух их не говорим
  t = t.replace(/(^|[.!?:]\s*)(Правило|Пример|Что будет, если)\s*[:.]\s*/gi, (_m, pre: string) => pre.replace(/:\s*$/, ": "));
  t = t.replace(/\s+/g, " ").trim();
  t = (t.charAt(0).toUpperCase() + t.slice(1)).replace(/([.!?]\s+)([а-яё])/g, (_m, a: string, b: string) => a + b.toUpperCase());
  // Осталась пустышка вроде «Я уже говорил:» — пусть ответит шаблон
  if (t.replace(/[^а-яёa-z]/gi, "").length < 12 || /:\s*\.?$/.test(t)) return "";
  if (t.length > 400) t = t.slice(0, 400);
  const lastEnd = Math.max(t.lastIndexOf("."), t.lastIndexOf("!"), t.lastIndexOf("?"), t.lastIndexOf("…"));
  if (lastEnd > 20 && lastEnd < t.length - 1) t = t.slice(0, lastEnd + 1);
  return t;
}
