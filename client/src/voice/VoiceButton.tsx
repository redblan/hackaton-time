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
import { NPC_NAMES } from "../core/names";
import { getSocket } from "../core/net";
import { store, useStore, type State } from "../core/store";
import { concat, downsample, encodeWav, level, MAX_SECONDS, MAX_WAV_BYTES, peakOf } from "./wav";
import "./voice.css";
import { RadioAudio } from "./RadioAudio";

type To = NpcId | "radio";
type Status =
  | { kind: "idle" }
  | { kind: "rec"; to: To; level: number }
  | { kind: "wait"; to: To }
  | { kind: "error"; text: string }
  | { kind: "sent"; text: string };

/** Ключи реплик голоса — из своего диапазона, чтобы не пересечься с ключами HUD */
let nextVoiceKey = 1_000_000;

/**
 * Кому говорим (D-70): открыт чат — тому, с кем он открыт (chatTarget); иначе как HUD по Enter:
 * звонок 112 → рация (диспетчер); NPC рядом; последний NPC, который говорил; рация.
 */
export function voiceTarget(s: Pick<State, "chatTarget" | "stage" | "nearNpc" | "npcLines">): To {
  if (s.chatTarget) return s.chatTarget;
  if (s.stage?.stage === "call_112") return "dispatcher";
  return s.nearNpc ?? s.npcLines.findLast((l) => !l.fromPlayer)?.npcId ?? "radio";
}

export function VoiceButton() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const rec = useRef<{ ctx: AudioContext; stream: MediaStream; node: ScriptProcessorNode; chunks: Float32Array[]; to: To; timer: number } | null>(null);
  const starting = useRef(false);
  const held = useRef(false);
  const mounted = useRef(true);
  const connected = useStore((s) => s.connected);
  const room = useStore(s => s.room);
  const me = useStore(s => s.auth?.playerId);
  const target = useStore(s => voiceTarget(s));
  const teammates = room?.players.filter(p => p.id !== me).map(p => p.name).join(", ") || "напарников нет";
  const address = (to: To) => to === "radio" ? (room?.mode === "solo" ? "Михалыч по рации" : `всем напарникам: ${teammates}`) : NPC_NAMES[to];

  async function start() {
    const st = store.get();
    if (rec.current || starting.current || st.minigame || status.kind === "wait" || !st.connected) return;
    held.current = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus({ kind: "error", text: "Микрофон работает только по https://" });
      return;
    }
    starting.current = true;
    const to = voiceTarget(st);
    let pendingStream: MediaStream | null = null;
    let pendingContext: AudioContext | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      pendingStream = stream;
      if (!held.current || !mounted.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      const ctx = new AudioContext();
      pendingContext = ctx;
      // Контекст создан после await — браузер мог оставить его «спящим»: тогда в записи тишина
      await ctx.resume();
      if (!held.current || !mounted.current) {
        stream.getTracks().forEach(t => t.stop());
        await ctx.close(); return;
      }
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
      pendingStream?.getTracks().forEach(t => t.stop());
      if (pendingContext && pendingContext.state !== "closed") void pendingContext.close().catch(() => {});
      if (!mounted.current) return;
      setStatus({ kind: "error", text: "Нет доступа к микрофону — разреши его в адресной строке" });
    } finally {
      starting.current = false;
    }
  }

  async function stop() {
    held.current = false;
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    window.clearTimeout(r.timer);
    r.node.disconnect();
    r.stream.getTracks().forEach((t) => t.stop());
    const rate = r.ctx.sampleRate;
    await r.ctx.close();
    if (!mounted.current) return;
    const samples = downsample(concat(r.chunks), rate).subarray(0, 16000 * MAX_SECONDS);
    if (samples.length < 16000 * 0.3) {
      setStatus({ kind: "idle" }); // короче 0.3 с — случайное нажатие
      return;
    }
    if (peakOf(samples) < 0.01) {
      // Тишина (проверено вживую: громкость 0%) — whisper на ней выдумывает «титры», не шлём
      setStatus({ kind: "error", text: "Микрофон молчит — проверь, какой микрофон выбран в браузере и Windows" });
      return;
    }
    const wav = encodeWav(samples);
    if (wav.byteLength > MAX_WAV_BYTES) {
      setStatus({ kind: "error", text: "Слишком длинно — до 15 секунд" });
      return;
    }
    const s = getSocket();
    if (!s?.connected) {
      setStatus({ kind: "error", text: "Нет связи с сервером" });
      return;
    }
    setStatus({ kind: "wait", to: r.to });
    s.emit("voice:say", { to: r.to, wav });
  }

  useEffect(() => {
    if (connected) return;
    held.current = false;
    setStatus({ kind: "idle" });
    const r = rec.current; rec.current = null;
    if (r) {
      window.clearTimeout(r.timer); r.node.disconnect();
      r.stream.getTracks().forEach(t => t.stop());
      void r.ctx.close().catch(() => {});
    }
  }, [connected]);

  // Ответ сервера: текст → в ленту как реплика игрока; ошибка → подсказка или тихое «недоступен»
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onText = (p: { to: To; text: string } | { to: To; error: string }) => {
      if ("error" in p) {
        if (p.to === "radio" && p.error.startsWith("Голос отправлен")) {
          setStatus({ kind: "sent", text: p.error });
          return;
        }
        setStatus({ kind: "error", text: p.error });
        return;
      }
      setStatus(p.to === "radio" ? { kind: "sent", text: "Запись отправлена напарникам" } : { kind: "idle" });
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

  useEffect(() => {
    mounted.current = true;
    const cancel = () => { held.current = false; void stop(); };
    window.addEventListener("blur", cancel);
    return () => {
      mounted.current = false; held.current = false;
      window.removeEventListener("blur", cancel);
      const r = rec.current; rec.current = null;
      if (r) {
        window.clearTimeout(r.timer); r.node.disconnect();
        r.stream.getTracks().forEach(t => t.stop());
        void r.ctx.close().catch(() => {});
      }
    };
  }, []);

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
    if (status.kind !== "error" && status.kind !== "sent") return;
    const t = window.setTimeout(() => setStatus({ kind: "idle" }), 4000);
    return () => window.clearTimeout(t);
  }, [status]);


  return (
    <><RadioAudio /><div className={`voice voice-${status.kind}`} aria-live="polite">
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
        onPointerCancel={() => void stop()}
      >
        🎙
      </button>
      {status.kind === "idle" && <span className="voice-hint">Удерживай V → {address(target)} · отпусти, чтобы отправить</span>}
      {status.kind === "rec" && (
        <span>
          Запись → {address(status.to)}… <span className="voice-level" style={{ width: `${Math.round(status.level * 60)}px` }} />
        </span>
      )}
      {status.kind === "wait" && <span>Отправлено → {address(status.to)}{status.to !== "radio" ? " · распознаю…" : " · запись услышат после отпускания V"}</span>}
      {status.kind === "error" && <span className="voice-error">{status.text}</span>}
      {status.kind === "sent" && <span>{status.text}</span>}
    </div></>
  );
}
