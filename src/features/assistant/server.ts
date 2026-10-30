import "server-only";
import { streamChat, type ChatMessage } from "@/shared/ai/llm";
import { getRequestStats } from "@/features/example/queries";
import { CATEGORY_LABEL, STATUS_META } from "@/features/example/constants";
import { demoAnswer } from "./demo-answers";

/**
 * Простейший RAG: перед ответом достаём из БД актуальные цифры и кладём в system prompt.
 * В день хакатона: заменить getContext() на данные своей темы
 * (например, найти похожие записи через ilike по словам вопроса).
 */
async function getContext() {
  const s = await getRequestStats();
  return [
    `Всего заявок: ${s.totals.total}. Открытых: ${s.totals.open}. Выполнено: ${s.totals.done}. Общий бюджет: ${s.totals.amount} ₽.`,
    `По статусам: ${s.byStatus.map((x) => `${STATUS_META[x.key].label} — ${x.value}`).join(", ")}.`,
    `По категориям: ${s.byCategory.map((x) => `${CATEGORY_LABEL[x.key]} — ${x.value}`).join(", ")}.`,
  ].join("\n");
}

export async function answer(history: ChatMessage[]) {
  const context = await getContext();
  const system: ChatMessage = {
    role: "system",
    content: `Ты — ИИ-ассистент платформы. Отвечай по-русски, кратко и по делу. Опирайся на данные ниже, не выдумывай цифры.

Данные платформы на сейчас:
${context}`,
  };
  // Последние 10 сообщений — чтобы не раздувать контекст
  return streamChat([system, ...history.slice(-10)], (q) => demoAnswer(q, context));
}
