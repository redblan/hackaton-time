/**
 * Озвучка NPC (M20, D-70). ВЛАДЕЛЕЦ: Матвей (client/src/voice/).
 * Сервер после реплики шлёт npc:audio { npcId, wav } (Piper, только адресату) — проигрываем через AudioContext.
 * Очередь: по одной фразе; новая реплика того же NPC обрывает старую. Кнопка «звук NPC» — вкл/выкл,
 * по умолчанию вкл, выбор помнится в браузере. Нет Piper на сервере — звук просто не приходит.
 */
import { useEffect, useRef, useState } from "react";
import type { NpcId } from "@game/shared";
import { getSocket } from "../core/net";
import { useStore } from "../core/store";
import { AudioQueue } from "./audioQueue";
import "./voice.css";

const MUTE_KEY = "toltchok.npcAudioMuted";

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function NpcAudio() {
  const [muted, setMuted] = useState(readMuted);
  const connected = useStore((s) => s.connected);
  const ctx = useRef<AudioContext | null>(null);
  const queue = useRef(new AudioQueue<ArrayBuffer>());
  const source = useRef<AudioBufferSourceNode | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // Браузер разрешает звук только после действия игрока — будим AudioContext на первое нажатие
  useEffect(() => {
    const wake = () => {
      ctx.current ??= new AudioContext();
      void ctx.current.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      queue.current.clear(); stopCurrent();
      void ctx.current?.close().catch(() => {});
      ctx.current = null;
    };
  }, []);

  function stopCurrent() {
    const s = source.current;
    source.current = null;
    if (s) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* уже закончилась */
      }
    }
  }

  async function playNext() {
    const clip = queue.current.next();
    if (!clip || !ctx.current) return;
    try {
      // decodeAudioData забирает буфер — отдаём копию
      const buf = await ctx.current.decodeAudioData(clip.audio.slice(0));
      if (queue.current.playing !== clip) return; // пока декодировали, оборвали
      const s = ctx.current.createBufferSource();
      s.buffer = buf;
      s.connect(ctx.current.destination);
      s.onended = () => {
        if (source.current === s) {
          source.current = null;
          void playNext();
        }
      };
      source.current = s;
      s.start();
    } catch {
      void playNext(); // битый WAV — дальше по очереди
    }
  }

  useEffect(() => {
    const sock = getSocket();
    if (!sock) return;
    const onAudio = (p: { npcId: NpcId; wav: ArrayBuffer }) => {
      if (mutedRef.current || !ctx.current) return;
      const interrupt = queue.current.push({ npcId: p.npcId, audio: p.wav });
      if (interrupt) stopCurrent();
      // playing is set before decodeAudioData: a different NPC must wait during decoding too.
      if (!queue.current.playing || interrupt) void playNext();
    };
    sock.on("npc:audio", onAudio);
    return () => {
      sock.off("npc:audio", onAudio);
      queue.current.clear(); stopCurrent();
    };
  }, [connected]);

  function toggle() {
    const next = !muted;
    setMuted(next);
    try {
      localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    } catch {
      /* приватный режим — просто не запомним */
    }
    if (next) {
      queue.current.clear();
      stopCurrent();
    }
  }

  return (
    <button type="button" className="npc-audio" title={muted ? "Включить голоса NPC" : "Выключить голоса NPC"} onClick={toggle}>
      {muted ? "🔇 голоса NPC" : "🔊 голоса NPC"}
    </button>
  );
}
