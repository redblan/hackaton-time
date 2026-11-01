/**
 * F3 / ` — что под капотом. Для жюри: подгрузка ≤ 10% мира, ИИ (llm или шаблон), память NPC об игроке.
 */
import { useEffect, useState } from "react";
import type { PlayerMemory, PlayerProfile } from "@game/shared";
import { chunkAt, MAX_CHUNKS, TOTAL_CHUNKS } from "./chunkMath";
import { local } from "./local";
import { NPC_NAMES } from "./names";
import { useStore } from "./store";

interface DebugMe {
  name: string;
  db: "postgres" | "memory";
  memory: PlayerMemory;
  profile: PlayerProfile;
}

function useFps(active: boolean) {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (!active) return;
    let frames = 0;
    let raf = 0;
    const loop = () => {
      frames++;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const t = setInterval(() => {
      setFps(frames);
      frames = 0;
    }, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, [active]);
  return fps;
}

export function DebugOverlay() {
  const open = useStore((s) => s.debug);
  const token = useStore((s) => s.auth?.token);
  const chunks = useStore((s) => s.chunks);
  const flags = useStore((s) => s.flags);
  const lines = useStore((s) => s.npcLines);
  const room = useStore((s) => s.room);
  const fps = useFps(open);
  const ping = useStore((s) => s.ping);
  const [me, setMe] = useState<DebugMe | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!open || !token) return;
    const load = () =>
      fetch("/api/debug/me", { headers: { authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? (r.json() as Promise<DebugMe>) : null))
        .then(setMe)
        .catch(() => {});
    load();
    const t = setInterval(() => {
      load();
      tick((n) => n + 1);
    }, 2000);
    return () => clearInterval(t);
  }, [open, token]);

  if (!open) return null;
  const ids = Object.keys(chunks).sort();
  const npcDone = lines.filter((l) => l.done && !l.fromPlayer);
  const llm = npcDone.filter((l) => l.source === "llm").length;
  const facts = me ? Object.entries(me.memory.toldFacts).filter(([k]) => !k.startsWith("tpl:")) : [];
  const met = me ? Object.entries(me.memory.npc) : [];
  const skills = me ? Object.entries(me.profile.skills) : [];

  return (
    <div className="debug">
      <b>Под капотом</b> · FPS {fps} · ping {ping} мс
      <div>
        Мир: загружено {ids.length}/{TOTAL_CHUNKS} ({Math.round((ids.length / TOTAL_CHUNKS) * 100)}%, лимит {MAX_CHUNKS}) — [{ids.join(", ")}]
      </div>
      <div>
        Я: {local.pos.map((v) => v.toFixed(1)).join(", ")} · чанк {chunkAt(local.pos)} · комната {room?.roomId} ({room?.mode})
      </div>
      <div>Флаги прохождения: {flags.join(", ") || "—"}</div>
      <div>
        ИИ: реплик {npcDone.length}, из них локальной моделью {llm}, шаблоном {npcDone.length - llm} · БД: {me?.db ?? "…"}
      </div>
      {me && (
        <>
          <div>
            NPC знают меня: {met.map(([id, v]) => `${NPC_NAMES[id as keyof typeof NPC_NAMES] ?? id} (встреч ${v?.met}, доверие ${v?.trust})`).join(", ") || "—"}
          </div>
          <div>Мне уже объяснили: {facts.map(([k, n]) => `${k}×${n}`).join(", ") || "—"}</div>
          <div>
            Профиль ({me.profile.runs} прохожд.): {skills.map(([k, v]) => `${k} ${v?.ok}✓/${v?.fail}✗`).join(", ") || "—"}
          </div>
        </>
      )}
    </div>
  );
}
