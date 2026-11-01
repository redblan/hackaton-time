import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import type { ChunkData } from "@game/shared";
import { Atmosphere } from "../world/Atmosphere";
import { ChunkView } from "../world/ChunkView";
import { QuakeDust } from "../world/QuakeDust";
import { Landscape } from "../world/Landscape";
import { Building } from "../world/decor/Building";
import { Hud } from "./Hud";
import { MinigameOverlay } from "./MinigameHost";
import { Player } from "./Player";
import { RemotePlayers } from "./RemotePlayers";
import { store, useStore } from "./store";

function World() {
  const chunks = useStore((s) => s.chunks);
  const flags = useStore((s) => s.flags);
  const npcs = useStore((s) => s.npcs);
  // NPC, которых двигает сервер, рисуем отдельно (RemotePlayers) — из чанков их убираем
  const visible = useMemo(() => {
    const moving = new Set<string>(npcs.map((n) => n.npcId));
    if (!moving.size) return Object.values(chunks);
    return Object.values(chunks).map(
      (c): ChunkData => ({ ...c, objects: c.objects.filter((o) => o.kind !== "npc" || !moving.has(o.npcId)) }),
    );
  }, [chunks, npcs]);
  // Силуэт всего дома: не данные мира, лимит 3/30 не занимает; сегменты загруженных чанков гаснут
  const loaded = useMemo(() => new Set(Object.keys(chunks)), [chunks]);
  return (
    <>
      <Building loaded={loaded} />
      {visible.map((c) => (
        <ChunkView key={c.id} chunk={c} flags={flags} />
      ))}
    </>
  );
}

export function Game() {
  return (
    <div className="game">
      <Canvas
        id="scene"
        shadows
        camera={{ fov: 75, near: 0.05, far: 600 }}
        dpr={[1, 2]}
        onCreated={({ gl }) => {
          // Название видеокарты — в метрики админки
          const ctx = gl.getContext() as WebGLRenderingContext;
          const info = ctx.getExtension("WEBGL_debug_renderer_info");
          store.set({ gpu: info ? String(ctx.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "" });
        }}
      >
        <Atmosphere />
        <Landscape />
        <QuakeDust />
        <World />
        <RemotePlayers />
        <Player />
      </Canvas>
      <Hud />
      <MinigameOverlay />
    </div>
  );
}
