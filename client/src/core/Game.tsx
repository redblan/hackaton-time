import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import type { ChunkData } from "@game/shared";
import { Atmosphere } from "../world/Atmosphere";
import { ChunkView } from "../world/ChunkView";
import { QuakeDust } from "../world/QuakeDust";
import { Landscape } from "../world/Landscape";
import { Hud } from "./Hud";
import { MinigameOverlay } from "./MinigameHost";
import { Player } from "./Player";
import { RemotePlayers } from "./RemotePlayers";
import { useStore } from "./store";

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
  return (
    <>
      {visible.map((c) => (
        <ChunkView key={c.id} chunk={c} flags={flags} />
      ))}
    </>
  );
}

export function Game() {
  return (
    <div className="game">
      <Canvas id="scene" shadows camera={{ fov: 75, near: 0.05, far: 600 }} dpr={[1, 1.5]}>
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
