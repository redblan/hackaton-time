/**
 * Проверка озвучки: `npm run tts -w ai -- papa "Под стол, быстро!"` → tts-papa.wav в текущей папке.
 * Без текста — озвучит первую реплику NPC на его первое событие. Нужны PIPER_BIN и PIPER_VOICES (.env в корне).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NPC_IDS, type NpcId } from "@game/shared";
import { AI_ROOT, loadData } from "../data";
import { createTts, speakable } from "../tts";

const envFile = join(AI_ROOT, "..", ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

const npcId = (process.argv[2] ?? "papa") as NpcId;
if (!NPC_IDS.includes(npcId)) {
  console.error(`Неизвестный NPC «${npcId}». Есть: ${NPC_IDS.join(", ")}`);
  process.exit(1);
}
const data = loadData();
const card = data.cards.get(npcId);
const text = process.argv.slice(3).join(" ") || Object.values(card?.events ?? {})[0]?.templates[0] || "Проверка голоса.";
const tts = createTts({ cards: data.cards });
if (!tts.available()) {
  console.error("Piper не найден. В .env нужны пути без кириллицы:\n  PIPER_BIN=C:\\piper\\piper.exe\n  PIPER_VOICES=C:\\piper\\voices");
  process.exit(1);
}
console.log(`${card?.name ?? npcId} (${card?.voice?.name ?? "голос по умолчанию"}): «${speakable(text)}»`);
const t0 = Date.now();
const wav = await tts.speak(npcId, text);
if (!wav) {
  console.error("Озвучить не получилось — см. сообщение [tts] выше");
  process.exit(1);
}
const out = `tts-${npcId}.wav`;
writeFileSync(out, wav);
console.log(`→ ${out}, ${Math.round(wav.length / 1024)} КБ, ${Date.now() - t0} мс. Повтор той же фразы — из кеша.`);
