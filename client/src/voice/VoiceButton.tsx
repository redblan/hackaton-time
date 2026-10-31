/**
 * Голос (D-69). ВЛАДЕЛЕЦ: Матвей (client/src/voice/).
 * Удерживаешь V (или кнопку микрофона мышкой) — запись, отпустил — отправка.
 * Микрофон → WAV 16 кГц моно 16 бит (wav.ts) → voice:say { to, wav } → сервер (whisper.cpp) →
 * voice:text { to, text } → текст в ленту как реплика игрока; дальше сервер ведёт его как npc:talk / рацию.
 * Нет whisper на сервере — тихое «голос недоступен», текстовый чат работает как раньше.
 * Микрофон браузер даёт только по https:// (или на localhost).
 */
import { useEffect, useRef, useState } from "react";
import type { NpcId } from "@game/shared";
import { getSocket } from "../core/net";
import { store, useStore, type State } from "../core/store";
import { concat, downsample, encodeWav, level, MAX_SECONDS, MAX_WAV_BYTES } from "./wav";
import "./voice.css";

type To = NpcId | "radio";
type Status =
  | { kind: "idle" }
  | { kind: "rec"; to: To; level: number }
  | { kind: "wait"; to: To }
  | { kind: "error"; text: string }
  | { kind: "off" };

/** Ключи реплик голоса — из своего диапазона, чтобы не пересечься с ключами HUD */
let nextVoiceKey = 1_000_000;

/**
 * Кому говорим (D-70): открыт чат — тому, с кем он открыт (chatTarget); иначе как HUD по Enter:
 * звонок 112 → рация (диспетчер); NPC рядом; последний NPC, который говорил; рация.
 */
export function voiceTarget(s: Pick<State, "chatTarget" | "stage" | "nearNpc" | "npcLines">): To {
  if (s.chatTarget) return s.chatTarget;
  if (s.stage?.stage === "call_112") return "radio";
  return s.nearNpc ?? s.npcLines.findLast((l) => !l.fromPlayer)?.npcId ?? "radio";
}

/** Сообщение сервера «голос выключен» → тихо прячем голос до конца сессии */
const isVoiceOff = (error: string) => /whisper|выключен|недоступ|не настро/i.test(error);

export function VoiceButton() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const rec = useRef<{ ctx: AudioContext; stream: MediaStream; node: ScriptProcessorNode; chunks: Float32Array[]; to: To; timer: number } | null>(null);
  const starting = useRef(false);
  const connected = useStore((s) => s.connected);
  const target = useStore((s) => voiceTarget(s));

  async function start() {
    const st = store.get();
    if (rec.current || starting.current || st.minigame || status.kind === "off") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus({ kind: "error", text: "Микрофон работает только по https://" });
      return;
    }
    starting.current = true;
    const to = voiceTarget(st);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      // ScriptProcessor устарел, но работает во всех браузерах и не требует отдельного файла воркера
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      node.onaudioprocess = (e) => {
        const ch = new Float32Array(e.inputBuffer.getChannelData(0));
        chunks.push(ch);
        setStatus({ kind: "rec", to, level: level(ch) });
      };
      src.connect(node);
      node.connect(ctx.destination);
      const timer = window.setTimeout(() => void stop(), MAX_SECONDS * 1000);
      rec.current = { ctx, stream, node, chunks, to, timer };
      setStatus({ kind: "rec", to, level: 0 });
    } catch {
      setStatus({ kind: "error", text: "Нет доступа к микрофону — разреши его в адресной строке" });
    } finally {
      starting.current = false;
    }
  }

  async function stop() {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    window.clearTimeout(r.timer);
    r.node.disconnect();
    r.stream.getTracks().forEach((t) => t.stop());
    const rate = r.ctx.sampleRate;
    await r.ctx.close();
    const samples = downsample(concat(r.chunks), rate).subarray(0, 16000 * MAX_SECONDS);
    if (samples.length < 16000 * 0.3) {
      setStatus({ kind: "idle" }); // короче 0.3 с — случайное нажатие
      return;
    }
    const wav = encodeWav(samples);
    if (wav.byteLength > MAX_WAV_BYTES) {
      setStatus({ kind: "error", text: "Слишком длинно — до 15 секунд" });
      return;
    }
    const s = getSocket();
    if (!s) {
      setStatus({ kind: "error", text: "Нет связи с сервером" });
      return;
    }
    setStatus({ kind: "wait", to: r.to });
    s.emit("voice:say", { to: r.to, wav });
  }

  // Ответ сервера: текст → в ленту как реплика игрока; ошибка → подсказка или тихое «недоступен»
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onText = (p: { to: To; text: string } | { to: To; error: string }) => {
      if ("error" in p) {
        setStatus(isVoiceOff(p.error) ? { kind: "off" } : { kind: "error", text: p.error });
        return;
      }
      setStatus({ kind: "idle" });
      if (!p.text) return;
      if (p.to === "radio") return; // рация: сервер сам разошлёт реплику в общий чат
      store.set((st) => ({
        npcLines: [...st.npcLines, { key: nextVoiceKey++, npcId: p.to as NpcId, text: `🎙 ${p.text}`, done: true, fromPlayer: true }].slice(-30),
      }));
    };
    s.on("voice:text", onText);
    return () => {
      s.off("voice:text", onText);
    };
  }, [connected]);

  // V — только когда не печатаем в чат (иначе это буква); в чате — кнопка мышкой
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "KeyV" && !e.repeat && !store.get().typing) void start();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyV") void stop();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  useEffect(() => {
    if (status.kind !== "error") return;
    const t = window.setTimeout(() => setStatus({ kind: "idle" }), 4000);
    return () => window.clearTimeout(t);
  }, [status]);

  if (status.kind === "off") return <div className="voice voice-off">голос недоступен</div>;

  const who = (to: To) => (to === "radio" ? "в рацию" : "NPC");
  return (
    <div className={`voice voice-${status.kind}`} aria-live="polite">
      <button
        type="button"
        className="voice-mic"
        title="Удерживай, чтобы сказать голосом (или клавиша V)"
        onPointerDown={(e) => {
          e.preventDefault(); // не забирать фокус у поля чата
          void start();
        }}
        onPointerUp={() => void stop()}
        onPointerLeave={() => void stop()}
      >
        🎙
      </button>
      {status.kind === "idle" && <span className="voice-hint">V — сказать голосом {who(target)}</span>}
      {status.kind === "rec" && (
        <span>
          Слушаю… <span className="voice-level" style={{ width: `${Math.round(status.level * 60)}px` }} />
        </span>
      )}
      {status.kind === "wait" && <span>Распознаю…</span>}
      {status.kind === "error" && <span className="voice-error">{status.text}</span>}
    </div>
  );
}
