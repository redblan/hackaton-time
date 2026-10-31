/**
 * Голос (D-69): зажал V — говоришь NPC рядом (или в рацию, если рядом никого), отпустил — отправка.
 * Запись → WAV 16 кГц моно → voice:say → сервер (whisper.cpp) → voice:text → дальше как текст игрока.
 * Микрофон браузер даёт только по HTTPS или на localhost. Нет голоса на сервере — подсказка, игра не ломается.
 */
import { useEffect, useRef, useState } from "react";
import type { NpcId } from "@game/shared";
import { getSocket } from "../core/net";
import { store, useStore } from "../core/store";
import { concat, downsample, encodeWav, level } from "./wav";
import "./voice.css";

const MAX_MS = 15_000;
type To = NpcId | "radio";
type State = { kind: "idle" } | { kind: "rec"; to: To; level: number } | { kind: "wait"; to: To } | { kind: "error"; text: string };

// Ключи реплик голоса — из своего диапазона, чтобы не пересечься с ключами HUD
let nextVoiceKey = 1_000_000;

export function VoiceButton() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const rec = useRef<{ ctx: AudioContext; stream: MediaStream; node: ScriptProcessorNode; chunks: Float32Array[]; to: To; timer: number } | null>(null);
  const nearNpc = useStore((s) => s.nearNpc);

  async function start() {
    if (rec.current || store.get().typing || store.get().minigame) return;
    const to: To = store.get().nearNpc ?? "radio";
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ kind: "error", text: "Микрофон доступен только по https:// или на localhost" });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      // ScriptProcessor устарел, но работает везде и не требует отдельного файла воркера
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      node.onaudioprocess = (e) => {
        const ch = new Float32Array(e.inputBuffer.getChannelData(0));
        chunks.push(ch);
        setState({ kind: "rec", to, level: level(ch) });
      };
      src.connect(node);
      node.connect(ctx.destination);
      const timer = window.setTimeout(() => void stop(), MAX_MS);
      rec.current = { ctx, stream, node, chunks, to, timer };
      setState({ kind: "rec", to, level: 0 });
    } catch {
      setState({ kind: "error", text: "Нет доступа к микрофону — разреши его в адресной строке" });
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
    const samples = downsample(concat(r.chunks), rate);
    if (samples.length < 16000 * 0.3) {
      setState({ kind: "idle" }); // короче 0.3 с — случайное нажатие
      return;
    }
    setState({ kind: "wait", to: r.to });
    getSocket()?.emit("voice:say", { to: r.to, wav: encodeWav(samples) });
  }

  // Распознанный текст: в ленту как реплика игрока (NPC) — сервер уже передал его дальше
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onText = (p: { to: To; text: string } | { to: To; error: string }) => {
      if ("error" in p) {
        setState({ kind: "error", text: p.error });
        return;
      }
      setState({ kind: "idle" });
      if (p.to !== "radio" && p.text) {
        store.set((st) => ({
          npcLines: [...st.npcLines, { key: nextVoiceKey++, npcId: p.to as NpcId, text: `🎙 ${p.text}`, done: true, fromPlayer: true }].slice(-30),
        }));
      }
    };
    s.on("voice:text", onText);
    return () => {
      s.off("voice:text", onText);
    };
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "KeyV" && !e.repeat) void start();
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
  }, []);

  useEffect(() => {
    if (state.kind !== "error") return;
    const t = window.setTimeout(() => setState({ kind: "idle" }), 4000);
    return () => window.clearTimeout(t);
  }, [state]);

  const who = (to: To) => (to === "radio" ? "в рацию" : "рядом стоящему");
  return (
    <div className={`voice voice-${state.kind}`} aria-live="polite">
      {state.kind === "idle" && <span className="voice-hint">V — сказать голосом {nearNpc ? "NPC рядом" : "в рацию"}</span>}
      {state.kind === "rec" && (
        <span>
          🎙 Говори {who(state.to)}… <span className="voice-level" style={{ width: `${Math.round(state.level * 60)}px` }} />
        </span>
      )}
      {state.kind === "wait" && <span>Распознаю…</span>}
      {state.kind === "error" && <span className="voice-error">{state.text}</span>}
    </div>
  );
}
