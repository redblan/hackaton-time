/**
 * Распознавание речи локально через whisper.cpp (M12, суперфича D-04). Без интернета.
 *
 * Вход — WAV, 16 кГц, моно, 16 бит (родной формат whisper.cpp; webm без ffmpeg не прочитать).
 * Пути — из окружения (.env на сервере, вне git):
 *   WHISPER_BIN   — whisper-cli(.exe) из релиза whisper.cpp (в старых версиях main.exe)
 *   WHISPER_MODEL — ggml-base.bin
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SttOptions {
  bin?: string;
  model?: string;
  /** Язык распознавания, по умолчанию ru */
  language?: string;
  /** Сколько ждать whisper, по умолчанию 15 с */
  timeoutMs?: number;
  /** Подмена запуска процесса — для тестов */
  run?: (bin: string, args: string[], timeoutMs: number) => Promise<string>;
}

export class SttError extends Error {}

/** Проверка заголовка WAV: RIFF/WAVE, PCM 16 бит, моно, 16 кГц */
export function checkWav(audio: Buffer): void {
  if (audio.length < 44 || audio.toString("ascii", 0, 4) !== "RIFF" || audio.toString("ascii", 8, 12) !== "WAVE") {
    throw new SttError("нужен WAV (RIFF/WAVE)");
  }
  // Ищем блок fmt — он не всегда сразу после заголовка
  let off = 12;
  while (off + 8 <= audio.length) {
    const id = audio.toString("ascii", off, off + 4);
    const size = audio.readUInt32LE(off + 4);
    if (id === "fmt ") {
      const format = audio.readUInt16LE(off + 8);
      const channels = audio.readUInt16LE(off + 10);
      const rate = audio.readUInt32LE(off + 12);
      const bits = audio.readUInt16LE(off + 22);
      if (format !== 1 || channels !== 1 || rate !== 16000 || bits !== 16) {
        throw new SttError(`нужен PCM 16 кГц моно 16 бит, пришло: формат ${format}, каналов ${channels}, ${rate} Гц, ${bits} бит`);
      }
      return;
    }
    off += 8 + size + (size % 2);
  }
  throw new SttError("в WAV нет блока fmt");
}

const defaultRun = (bin: string, args: string[], timeoutMs: number) =>
  new Promise<string>((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      if (err) reject(new SttError(`whisper: ${err.message}${stderr ? ` — ${String(stderr).slice(-300)}` : ""}`));
      else resolve(String(stdout));
    });
  });

const HALLUCINATIONS =
  /субтитр|продолжение следует|спасибо за просмотр|подписывайтесь|ставьте лайк|dimatorzok|редактор субтитров|корректор|до новых встреч|^\s*(спасибо|пока)[.!]?\s*$/i;

/** Вывод whisper-cli без меток времени → одна строка текста */
export function cleanTranscript(stdout: string): string {
  return stdout
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\[[^\]]*\]\s*/, "").trim())
    .filter((l) => l && !/^\[(BLANK_AUDIO|музыка|Музыка)\]$/i.test(l) && !/^\(.*\)$/.test(l))
    // Известные галлюцинации whisper на тишине/шуме (русская модель «дописывает» титры видео)
    .filter((l) => !HALLUCINATIONS.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createStt(opts: SttOptions = {}) {
  const bin = opts.bin ?? process.env.WHISPER_BIN ?? "";
  const model = opts.model ?? process.env.WHISPER_MODEL ?? "";
  const run = opts.run ?? defaultRun;
  const timeoutMs = opts.timeoutMs ?? 15_000;

  return {
    /** Готово ли распознавание: заданы пути и файлы на месте (для подмены в тестах — всегда true) */
    available(): boolean {
      return !!opts.run || (!!bin && !!model && existsSync(bin) && existsSync(model));
    },

    /** Речь → текст. Бросает SttError, если формат не тот или whisper не отработал. */
    async transcribe(audio: Buffer): Promise<string> {
      checkWav(audio);
      if (!opts.run && (!bin || !model)) throw new SttError("не заданы WHISPER_BIN и WHISPER_MODEL");
      const dir = join(tmpdir(), "game-stt");
      await mkdir(dir, { recursive: true });
      const file = join(dir, `${randomUUID()}.wav`);
      await writeFile(file, audio);
      try {
        // -nt: без меток времени, -np: без служебного вывода, -l ru: русский
        const out = await run(bin, ["-m", model, "-f", file, "-l", opts.language ?? "ru", "-nt", "-np"], timeoutMs);
        return cleanTranscript(out);
      } finally {
        await rm(file, { force: true });
      }
    },
  };
}

export type Stt = ReturnType<typeof createStt>;
