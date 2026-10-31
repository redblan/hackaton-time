/**
 * Проверка распознавания речи (M12): `npm run stt -w ai -- запись.wav`
 * Нужны WHISPER_BIN и WHISPER_MODEL — в окружении или в .env в корне репы.
 * Запись: WAV 16 кГц, моно, 16 бит (например, Audacity → Экспорт → WAV, 16000 Гц, моно).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createStt, SttError } from "../stt";
import { AI_ROOT } from "../data";

// Подхватываем .env из корня репы — так же, как сервер
const envFile = join(AI_ROOT, "..", ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
}

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error("Укажи WAV-файл: npm run stt -w ai -- запись.wav");
  process.exit(1);
}
const stt = createStt();
if (!stt.available()) {
  console.error(`Whisper не найден. В .env нужны пути:\n  WHISPER_BIN=${process.env.WHISPER_BIN ?? "C:\\Хакатон\\whisper\\whisper-cli.exe"}\n  WHISPER_MODEL=${process.env.WHISPER_MODEL ?? "C:\\Хакатон\\whisper\\ggml-base.bin"}`);
  process.exit(1);
}
const t0 = Date.now();
try {
  const text = await stt.transcribe(readFileSync(file));
  console.log(`«${text}»\n[${Date.now() - t0} мс]`);
} catch (e) {
  console.error(e instanceof SttError ? `Ошибка: ${e.message}` : e);
  process.exit(1);
}
