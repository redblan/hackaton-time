/**
 * Озвучка NPC локально через Piper (нейросетевой TTS, без интернета).
 *
 * speak(npcId, text) → WAV (Buffer) или null, если озвучивать нечего или Piper не настроен.
 * Голос, темп — в карточке NPC (`voice` в ai/npcs/*.json), иначе DEFAULT_VOICES ниже.
 * Пути — из окружения (.env сервера, вне git; путь без кириллицы — Piper под Windows её не понимает):
 *   PIPER_BIN    — piper(.exe)
 *   PIPER_VOICES — папка с ru_RU-<голос>-medium.onnx и .onnx.json
 */
import { createRvc, type RvcOptions } from "./rvc";
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
  /** Disabled by default. RVC_BIN/RVC_ARGS point to an external command. */
  rvc?: RvcOptions;
  bin?: string;
  voicesDir?: string;
  /** Карточки NPC — чтобы взять голос из поля `voice` */
  cards?: Map<NpcId, NpcCard>;
  /** Сколько ждать Piper на одну фразу, по умолчанию 10 с */
  timeoutMs?: number;
  /** Waiting jobs (one additional job may be running). */
  maxQueue?: number;
  /** Drop a waiting line after this age; default 5 s. */
  maxQueueWaitMs?: number;
  /** LRU WAV cache budget; default 16 MiB. Zero disables caching. */
  maxCacheBytes?: number;
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
      let timedOut=false;
      const timer = setTimeout(() => {
        timedOut=true;
        p.kill();
        // Wait for close before allowing the next job to use the CPU / temp file.
      }, timeoutMs);
      p.stderr.on("data", (d) => (err = (err + String(d)).slice(-500)));
      p.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      p.on("close", (code) => {
        clearTimeout(timer);
        if(timedOut) reject(new Error('piper: таймаут'));
        else if (code === 0 && existsSync(out)) resolve();
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
  const rvc = createRvc(opts.rvc);
  const bin = opts.bin ?? process.env.PIPER_BIN ?? "";
  const voicesDir = opts.voicesDir ?? process.env.PIPER_VOICES ?? "";
  const run = opts.run ?? defaultRun;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxQueue=Math.max(0,Math.floor(opts.maxQueue??4));
  const maxQueueWaitMs=Math.max(0,opts.maxQueueWaitMs??5000);
  const maxCacheBytes=Math.max(0,opts.maxCacheBytes??16*1024*1024);
  /** Identical requests share a pending synthesis; cached WAVs use byte-bounded LRU. */
  const cache = new Map<string, Buffer>();
  let cacheBytes=0, running=false, synthesized=0, dropped=0;
  const pending=new Map<string,Promise<Buffer|null>>();
  type Job={key:string;expiresAt:number;start:()=>void;drop:()=>void;timer?:ReturnType<typeof setTimeout>};
  const waiting:Job[]=[];
  function pump() {
    if(running) return;
    while(waiting.length) {
      const job=waiting.shift()!;
      if(Date.now()>=job.expiresAt) {job.drop();continue;}
      job.start();return;
    }
  }
  function remember(key:string,wav:Buffer) {
    if(!maxCacheBytes || wav.length>maxCacheBytes) return;
    while(cache.size && (cacheBytes+wav.length>maxCacheBytes || cache.size>=200)) {
      const oldest=cache.keys().next().value!;
      cacheBytes-=cache.get(oldest)!.length;cache.delete(oldest);
    }
    cache.set(key,wav);cacheBytes+=wav.length;
  }

  const voiceOf = (npcId: NpcId): NpcVoice => opts.cards?.get(npcId)?.voice ?? DEFAULT_VOICES[npcId] ?? FALLBACK;
  const modelPath = (v: NpcVoice) => join(voicesDir, `ru_RU-${v.name}-medium.onnx`);

  return {
    stats:()=>({running:Number(running),waiting:waiting.length,cacheBytes,cacheEntries:cache.size,synthesized,dropped}),
    /** Настроен ли Piper: есть программа и хотя бы один голос (в тестах с подменой — всегда) */
    available(): boolean {
      return !!opts.run || (!!bin && !!voicesDir && existsSync(bin) && existsSync(modelPath(FALLBACK)));
    },

    /** Реплика NPC → WAV. null — нечего озвучивать, Piper не настроен или упал (игра идёт без звука). */
    async speak(npcId: NpcId, text: string): Promise<Buffer | null> {
      // D-70: unconscious victims cannot speak, even if a model returned unparenthesized text.
      if (npcId === "victim_cpr" || npcId === "victim_unconscious") return null;
      const say = speakable(text);
      if (!say || say.length>2000 || !this.available()) return null;
      const voice = voiceOf(npcId);
      const key = `${rvc.enabled ? npcId : "piper"}|${voice.name}|${voice.speed ?? 1}|${say}`;
      const hit = cache.get(key);
      if (hit) {cache.delete(key);cache.set(key,hit);return hit;}
      const existing=pending.get(key);
      if(existing) return existing;
      if(running && waiting.length>=maxQueue) {dropped++;return null;}
      // length_scale: > 1 — медленнее, < 1 — быстрее
      const args = ["-m", modelPath(voice), "--length_scale", String(+(1 / (voice.speed ?? 1)).toFixed(2))];
      let complete!:(wav:Buffer|null)=>void;
      const result=new Promise<Buffer|null>(resolve=>{complete=resolve;});
      pending.set(key,result);
      const job:Job={key,expiresAt:Date.now()+maxQueueWaitMs,
        drop:()=>{clearTimeout(job.timer);pending.delete(key);dropped++;complete(null);},
        start:()=>{
          clearTimeout(job.timer);running=true;
          const finish=(wav:Buffer|null)=>{pending.delete(key);running=false;pump();complete(wav);};
          void Promise.resolve().then(()=>run(bin,args,say,timeoutMs)).then(wav=>rvc.convert(npcId,wav)).then(wav=>{
            synthesized++;if(wav) remember(key,wav);finish(wav);
          },e=>{console.error('[tts]',(e as Error).message);finish(null);});
        },
      };
      if(!running) job.start();
      else {
        waiting.push(job);
        job.timer=setTimeout(()=>{
          const index=waiting.indexOf(job);
          if(index>=0) {waiting.splice(index,1);job.drop();}
        },maxQueueWaitMs);
      }
      return result;
    },
  };
}

export type Tts = ReturnType<typeof createTts>;
