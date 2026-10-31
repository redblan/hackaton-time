import { Canvas } from "@react-three/fiber";
import { ChunkView } from "../world/ChunkView";
import { Hud } from "./Hud";
import { MinigameOverlay } from "./MinigameHost";
import { Player } from "./Player";
import { RemotePlayers } from "./RemotePlayers";
import { useStore } from "./store";

function World() {
  const chunks = useStore((s) => s.chunks);
  const flags = useStore((s) => s.flags);
  return (
    <>
      {Object.values(chunks).map((c) => (
        <ChunkView key={c.id} chunk={c} flags={flags} />
      ))}
    </>
  );
}

export function Game() {
  return (
    <div className="game">
      <Canvas id="scene" shadows camera={{ fov: 75, near: 0.05, far: 300 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#9fc5e8"]} />
        <fog attach="fog" args={["#9fc5e8", 30, 120]} />
        <hemisphereLight args={["#ffffff", "#8d7b68", 0.9]} />
        <directionalLight position={[30, 60, -20]} intensity={1.4} castShadow />
        <World />
        <RemotePlayers />
        <Player />
      </Canvas>
      <Hud />
      <MinigameOverlay />
    </div>
  );
}
