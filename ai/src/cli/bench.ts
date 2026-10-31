/**
 * Замер моделей для демо (M19): `npm run bench -w ai -- qwen2.5:3b-instruct qwen2.5:7b-instruct`
 * На 10 типичных репликах: время до первого слова, до конца ответа, длина ответа и сколько реплик
 * при текущем таймауте ушли бы в шаблон. Память — в процессе, файлы ai/memory не трогает.
 * Переменные: OLLAMA_URL, AI_TIMEOUT_MS (по умолчанию 6000 — как на сервере).
 */
import type { NpcRequest } from "@game/shared";
import { createAi, createInMemoryStore } from "../index";

const models = process.argv.slice(2).filter((a) => !a.startsWith("-"));
if (models.length === 0) models.push("qwen2.5:3b-instruct");
const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 6000);
const ctx = { flags: ["lift_vanya", "fire_f5", "wire"], facts: [], playerName: "Матвей" };

/** Реплики, которые реально будут на демо (docs/DEMO.md, раздел «ИИ») */
const CASES: { label: string; req: Omit<NpcRequest, "playerId"> }[] = [
  { label: "папа: начало толчка", req: { npcId: "papa", event: "quake_started", context: ctx } },
  { label: "папа: газ?", req: { npcId: "papa", event: "free_talk", playerMessage: "Что делать, если пахнет газом?", context: ctx } },
  { label: "папа: газ? (повтор)", req: { npcId: "papa", event: "free_talk", playerMessage: "Что делать, если пахнет газом?", context: ctx } },
  { label: "папа: сборы", req: { npcId: "papa", event: "quake_over_pack", context: ctx } },
  { label: "Ваня: грубо", req: { npcId: "vanya", event: "free_talk", playerMessage: "Заткнись уже", context: ctx } },
  { label: "Ваня: спокойно", req: { npcId: "vanya", event: "free_talk", playerMessage: "Спокойно, я рядом, сообщу спасателям", context: ctx } },
  { label: "Валентина: кот", req: { npcId: "valentina", event: "free_talk", playerMessage: "Меня зовут Матвей, возьмите кота в переноску, пойдёмте", context: ctx } },
  { label: "Михалыч: дым", req: { npcId: "mihalych", event: "smoke_ahead", context: ctx } },
  { label: "Михалыч: рация", req: { npcId: "mihalych", event: "free_talk", playerMessage: "Михалыч, куда идти?", context: { ...ctx, stage: "collapse", channel: "radio" } } },
  { label: "Михалыч: 112?", req: { npcId: "mihalych", event: "free_talk", playerMessage: "Что говорить диспетчеру 112?", context: ctx } },
];

const fmt = (ms: number) => `${(ms / 1000).toFixed(1)} с`;
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};

for (const model of models) {
  console.log(`\n=== ${model} (таймаут первого слова ${fmt(timeoutMs)}) ===`);
  // Прогрев: первая реплика грузит модель в память — её не считаем
  const warm = createAi({ memory: createInMemoryStore(), model, timeoutMs: 60_000, ollamaUrl: process.env.OLLAMA_URL });
  const t0 = Date.now();
  await warm.say({ ...CASES[0]!.req, playerId: "warmup" });
  console.log(`загрузка модели: ${fmt(Date.now() - t0)}`);

  // Таймаут большой, чтобы измерить честное время; «ушло бы в шаблон» считаем по timeoutMs
  const ai = createAi({ memory: createInMemoryStore(), model, timeoutMs: 60_000, ollamaUrl: process.env.OLLAMA_URL });
  const first: number[] = [];
  const full: number[] = [];
  let template = 0;
  let fallbackNow = 0;
  for (const c of CASES) {
    const start = Date.now();
    let firstAt = 0;
    const res = await ai.sayStream!({ ...c.req, playerId: "bench" }, () => {
      if (!firstAt) firstAt = Date.now();
    });
    const tFull = Date.now() - start;
    const tFirst = (firstAt || Date.now()) - start;
    if (res.source === "template") fallbackNow++;
    else {
      first.push(tFirst);
      full.push(tFull);
      if (tFirst > timeoutMs) template++;
    }
    console.log(
      `${c.label.padEnd(24)} ${res.source.padEnd(8)} первое слово ${fmt(tFirst).padStart(7)}  весь ответ ${fmt(tFull).padStart(7)}  ${res.outcome ? `[${res.outcome}] ` : ""}${res.text.slice(0, 70)}`,
    );
  }
  if (first.length > 0) {
    console.log(
      `ИТОГ ${model}: первое слово медиана ${fmt(pct(first, 50))}, худшее ${fmt(Math.max(...first))}; ` +
        `весь ответ медиана ${fmt(pct(full, 50))}, худшее ${fmt(Math.max(...full))}; ` +
        `при таймауте ${fmt(timeoutMs)} в шаблон ушло бы ${template} из ${first.length}` +
        (fallbackNow ? `; без модели (шаблон сразу): ${fallbackNow}` : ""),
    );
  } else {
    console.log(`ИТОГ ${model}: модель не ответила ни разу — запущена ли Ollama, скачана ли модель (ollama list)?`);
  }
}
