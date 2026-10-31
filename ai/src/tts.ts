/**
 * Озвучка NPC локально через Piper (нейросетевой TTS, без интернета).
 *
 * speak(npcId, text) → WAV (Buffer) или null, если озвучивать нечего или Piper не настроен.
 * Голос, темп — в карточке NPC (`voice` в ai/npcs/*.json), иначе DEFAULT_VOICES ниже.
 * Пути — из окружения (.env сервера, вне git; путь без кириллицы — Piper под Windows её не понимает):
 *   PIPER_BIN    — piper(.exe)
 *   PIPER_VOICES — папка с ru_RU-<голос>-medium.onnx и .onnx.json
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NpcId } from "@game/shared";
import type { NpcCard, NpcVoice } from "./types";

/** Голоса по умолчанию, пока в карточке нет своего (speed: 1 — обычно, > 1 — быстрее) */
export const DEFAULT_VOICES: Partial<Record<NpcId, NpcVoice>> = {
  papa: { name: "dmitri", speed: 1 },
  vanya: { name: "denis", speed: 1.2 },
  valentina: { name: "irina", speed: 0.85 },
  mihalych: { name: "ruslan", speed: 1 },
  dispatcher: { name: "irina", speed: 1.1 },
  gromov: { name: "dmitri", speed: 0.9 },
  victim_bleeding: { name: "ruslan", speed: 0.9 },
  victim_scared: { name: "irina", speed: 1.15 },
  neighbor_leg: { name: "ruslan", speed: 0.95 },
};
const FALLBACK: NpcVoice = { name: "dmitri", speed: 1 };

export interface TtsOptions {
  bin?: string;
  voicesDir?: string;
  /** Карточки NPC — чтобы взять голос из поля `voice` */
  cards?: Map<NpcId, NpcCard>;
  /** Сколько ждать Piper на одну фразу, по умолчанию 10 с */
  timeoutMs?: number;
  /** Подмена запуска Piper — для тестов: (bin, args, text) → WAV */
  run?: (bin: string, args: string[], text: string, timeoutMs: number) => Promise<Buffer>;
}

/**
 * Текст для озвучки: ремарки «(не отвечает)» — молча, «112» — словами, без эмодзи и разметки.
 * Пустая строка — озвучивать нечего.
 */
export function speakable(text: string): string {
  return text
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b112\b/g, "сто двенадцать")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/[*_#`«»"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Запуск Piper: текст в stdin, WAV во временный файл */
async function defaultRun(bin: string, args: string[], text: string, timeoutMs: number): Promise<Buffer> {
  const dir = join(tmpdir(), "game-tts");
  await mkdir(dir, { recursive: true });
  const out = join(dir, `${randomUUID()}.wav`);
  try {
    await new Promise<void>((resolve, reject) => {
      const p = spawn(bin, [...args, "-f", out], { windowsHide: true });
      let err = "";
      const timer = setTimeout(() => {
        p.kill();
        reject(new Error("piper: таймаут"));
      }, timeoutMs);
      p.stderr.on("data", (d) => (err = (err + String(d)).slice(-500)));
      p.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      p.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0 && existsSync(out)) resolve();
        else reject(new Error(`piper: код ${code} ${err}`));
      });
      p.stdin.end(text, "utf8");
    });
    return await readFile(out);
  } finally {
    await rm(out, { force: true });
  }
}

export function createTts(opts: TtsOptions = {}) {
  const bin = opts.bin ?? process.env.PIPER_BIN ?? "";
  const voicesDir = opts.voicesDir ?? process.env.PIPER_VOICES ?? "";
  const run = opts.run ?? defaultRun;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  /** Одинаковые фразы (шаблоны) — из кеша, мгновенно */
  const cache = new Map<string, Buffer>();
  /** Piper по одному: не отнимаем процессор у модели ИИ */
  let chain: Promise<unknown> = Promise.resolve();

  const voiceOf = (npcId: NpcId): NpcVoice => opts.cards?.get(npcId)?.voice ?? DEFAULT_VOICES[npcId] ?? FALLBACK;
  const modelPath = (v: NpcVoice) => join(voicesDir, `ru_RU-${v.name}-medium.onnx`);

  return {
    /** Настроен ли Piper: есть программа и хотя бы один голос (в тестах с подменой — всегда) */
    available(): boolean {
      return !!opts.run || (!!bin && !!voicesDir && existsSync(bin) && existsSync(modelPath(FALLBACK)));
    },

    /** Реплика NPC → WAV. null — нечего озвучивать, Piper не настроен или упал (игра идёт без звука). */
    async speak(npcId: NpcId, text: string): Promise<Buffer | null> {
      const say = speakable(text);
      if (!say || !this.available()) return null;
      const voice = voiceOf(npcId);
      const key = `${voice.name}|${voice.speed ?? 1}|${say}`;
      const hit = cache.get(key);
      if (hit) return hit;
      // length_scale: > 1 — медленнее, < 1 — быстрее
      const args = ["-m", modelPath(voice), "--length_scale", String(+(1 / (voice.speed ?? 1)).toFixed(2))];
      const job = chain.then(() => run(bin, args, say, timeoutMs));
      chain = job.catch(() => undefined);
      try {
        const wav = await job;
        if (cache.size > 200) cache.delete(cache.keys().next().value!);
        cache.set(key, wav);
        return wav;
      } catch (e) {
        console.error("[tts]", (e as Error).message);
        return null;
      }
    },
  };
}

export type Tts = ReturnType<typeof createTts>;
