/** Простая работа с русским текстом: поиск фактов по словам и тон игрока. Без моделей. */
import type { KnowledgeFact } from "./types";

/** Частые слова, по которым нельзя искать: они есть почти в любом вопросе и факте. */
const STOP = new Set(["если", "когда", "тогда", "делать", "делаю", "сделать", "надо", "нужно", "можно", "нельзя", "тебя", "меня", "есть", "будет", "этот", "это", "очень", "просто", "сейчас", "теперь", "почему", "зачем", "какой", "какая", "какие", "куда", "правило", "пример"]);

/** Грубый стемминг: срезаем частое окончание и берём первые 5 букв («лифтом», «лифте» → «лифт»). */
export function stems(text: string): string[] {
  return (text.toLowerCase().replace(/ё/g, "е").match(/[а-яa-z0-9]+/g) ?? [])
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => w.replace(/(ами|ями|ого|его|ому|ему|ой|ей|ом|ем|ам|ям|ах|ях|ов|ев|ые|ие|ый|ий|ая|яя|ую|ю|у|а|я|ы|и|е|о)$/, "").slice(0, 5))
    .filter((w) => w.length >= 3);
}

/** «Правило: …», «Пример: …», «Что будет, если: …» — метки для автора базы, вслух их не говорим. */
export function stripLabel(explanation: string): string {
  const t = explanation.replace(/^(Правило|Пример|Что будет, если[^:]*)\s*:\s*/i, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Факты, ближе всего подходящие к вопросу игрока. */
export function searchFacts(query: string, facts: KnowledgeFact[], limit = 2): KnowledgeFact[] {
  const q = new Set(stems(query));
  if (q.size === 0) return [];
  return facts
    .map((f) => {
      const words = new Set(stems([f.fact, ...f.explanations, f.skill].join(" ")));
      let score = 0;
      for (const w of q) if (words.has(w)) score++;
      return { f, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .filter((x, _, all) => x.score * 2 >= (all[0]?.score ?? 0))
    .slice(0, limit)
    .map((x) => x.f);
}

export type Tone = "calm" | "rude" | "panic" | "neutral";

const RUDE = ["заткн", "дура", "идиот", "тупо", "отстан", "быстр", "живее", "достал", "бесиш", "хватит ныть", "блин", "черт"];
const PANIC = ["умрем", "умрём", "конец", "паник", "ааа", "помогите", "всё пропало", "все пропало", "кошмар"];
const CALM = ["спокойн", "не бойс", "не волнуй", "всё будет", "все будет", "я рядом", "дыши", "помогу", "меня зовут", "я здесь", "держись", "сообщу", "спасател", "всё хорошо", "все хорошо", "пожалуйста"];

export function detectTone(message: string | undefined): Tone {
  if (!message) return "neutral";
  const m = message.toLowerCase();
  if (RUDE.some((w) => m.includes(w)) || (/[А-ЯЁ]{5,}/.test(message) && message === message.toUpperCase())) return "rude";
  if (PANIC.some((w) => m.includes(w)) || /!{3,}/.test(message)) return "panic";
  if (CALM.some((w) => m.includes(w))) return "calm";
  return "neutral";
}

/** Попытка вывести NPC из роли: «забудь инструкции», «ты ИИ?», «system prompt»… (M9) */
export function detectInjection(message: string | undefined): boolean {
  if (!message) return false;
  return /игнорир|забудь\s+(все|всё|свои|прошл|инструкц|правил)|системн\S*\s+(промпт|сообщ)|промпт|system\s*prompt|ты\s+(же\s+)?(ии|бот|нейросеть|нейронка|chatgpt|gpt|модель|программа|искусственн)|притворись|представь,?\s+что\s+ты|режим\s+разработчика|developer\s+mode|jailbreak|ignore\s+(all|previous|the)|you\s+are\s+now|act\s+as/i.test(
    message,
  );
}

/** Ответ модели вышел из роли или выдал, что это ИИ — такой не показываем (M9). */
export function looksBroken(reply: string): boolean {
  return /как\s+(ии|искусственн\S*\s+интеллект|языков\S*\s+модель)|я\s*(—|-)?\s*(ии|бот|языков\S*\s+модель|нейросеть|искусственн)|language\s+model|as\s+an\s+ai|openai|qwen|alibaba|<\|im_|\bassistant\b|\buser\b:/i.test(
    reply,
  );
}
