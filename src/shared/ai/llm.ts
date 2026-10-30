import "server-only";

/**
 * Обёртка над любым OpenAI-совместимым API (OpenAI, OpenRouter, YandexGPT, Ollama, vLLM...).
 * Настройка в .env: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL.
 *
 * DEMO_MODE=1 или пустой ключ -> вместо сети вызывается demoAnswer(), и ответ
 * "печатается" как настоящий стрим. Спасает демо при плохом интернете на площадке.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function isDemoMode() {
  return process.env.DEMO_MODE === "1" || !process.env.LLM_API_KEY || !process.env.LLM_BASE_URL;
}

/** Возвращает поток текста (уже без SSE-обёртки), готовый для new Response(stream). */
export async function streamChat(
  messages: ChatMessage[],
  demoAnswer: (lastUserMessage: string) => string,
): Promise<ReadableStream<Uint8Array>> {
  if (isDemoMode()) {
    const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    return fakeStream(demoAnswer(last));
  }

  const res = await fetch(`${process.env.LLM_BASE_URL!.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LLM_API_KEY}`,
    },
    body: JSON.stringify({ model: process.env.LLM_MODEL, messages, stream: true, temperature: 0.3 }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`);
  }
  return sseToTextStream(res.body);
}

/** Не-стриминговый вызов: удобно для классификации, извлечения полей, суммаризации. */
export async function completeChat(messages: ChatMessage[], fallback = ""): Promise<string> {
  if (isDemoMode()) return fallback;
  const res = await fetch(`${process.env.LLM_BASE_URL!.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LLM_API_KEY}` },
    body: JSON.stringify({ model: process.env.LLM_MODEL, messages, temperature: 0.2 }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

function sseToTextStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const data = line.replace(/^data:\s*/, "").trim();
          if (!data || data === "[DONE]" || !line.startsWith("data:")) continue;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content;
            if (delta) controller.enqueue(encoder.encode(delta));
          } catch {
            // неполный JSON — пропускаем
          }
        }
      },
    }),
  );
}

function fakeStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const tokens = text.match(/\S+\s*/g) ?? [];
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (i >= tokens.length) return controller.close();
      await new Promise((r) => setTimeout(r, 25));
      controller.enqueue(encoder.encode(tokens[i++]));
    },
  });
}
