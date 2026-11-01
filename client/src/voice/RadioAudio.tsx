/** D-71: recordings from teammates, independent of NPC mute and Whisper. */
import { useEffect, useState } from "react";
import { store } from "../core/store";
import { onVoiceChat } from "../core/net";
import { RadioPlayer } from "./radioPlayer";
import "./voice.css";

export function RadioAudio() {
  const [speaker, setSpeaker] = useState<string | null>(null);
  useEffect(() => {
    const player = new RadioPlayer(() => new AudioContext(), setSpeaker);
    const wake = () => { void player.wake(); };
    const unsubscribe = onVoiceChat(({ name, wav }) => player.push(name, wav));
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    const blur = () => player.clear();
    // Never replay a previous room's recordings after leaving or reconnecting.
    let roomId = store.get().room?.roomId;
    const unsubscribeStore = store.subscribe(() => {
      const next = store.get();
      if (!next.connected || next.room?.roomId !== roomId) {
        player.clear();
        roomId = next.room?.roomId;
      }
    });
    window.addEventListener("pagehide", blur);
    return () => {
      unsubscribe(); unsubscribeStore();
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("pagehide", blur);
      player.dispose();
    };
  }, []);
  return speaker ? <div className="radio-speaking" role="status">🔊 {speaker} → всем напарникам</div> : null;
}
