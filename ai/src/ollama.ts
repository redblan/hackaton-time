/** Вызов локальной Ollama по HTTP, стримом. Без SDK — только fetch. */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaCall {
  url: string;
  model: string;
  messages: ChatMessage[];
  /** Сколько ждать первый токен. Не дождались — ошибка, вызывающий берёт шаблон. */
  timeoutMs: number;
  onToken?: (t: string) => void;
  fetchImpl?: typeof fetch;
}

/**
 * Возвращает текст ответа. Бросает ошибку, если модель не ответила до таймаута.
 * Если модель начала отвечать, но тянет дольше 3 × timeoutMs, отдаём то, что успело прийти.
 */
export async function ollamaChat(call: OllamaCall): Promise<string> {
  const ctrl = new AbortController();
  let gotToken = false;
  let text = "";
  const firstTokenTimer = setTimeout(() => {
    if (!gotToken) ctrl.abort();
  }, call.timeoutMs);
  const totalTimer = setTimeout(() => ctrl.abort(), call.timeoutMs * 3);
  try {
    const res = await (call.fetchImpl ?? fetch)(`${call.url}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: call.model,
        messages: call.messages,
        stream: true,
        options: { num_predict: 120, temperature: 0.6 },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) throw new Error(`ollama: HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string };
        if (chunk.error) throw new Error(`ollama: ${chunk.error}`);
        const t = chunk.message?.content ?? "";
        if (t) {
          gotToken = true;
          text += t;
          call.onToken?.(t);
        }
      }
    }
    return text;
  } catch (err) {
    if (gotToken && text.trim()) return text;
    throw err;
  } finally {
    clearTimeout(firstTokenTimer);
    clearTimeout(totalTimer);
  }
}
