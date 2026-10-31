import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, SRGBColorSpace, type Group } from "three";
import { NPC_NAMES } from "./names";
import { sample } from "./remote";
import { useStore } from "./store";

const ROLE_COLORS = { inside_top: "#f97316", inside_mid: "#a855f7", outside: "#22c55e" } as const;

/** Табличка с именем — спрайт с текстурой из canvas (без шрифтов из сети и без DOM). */
function Nameplate({ name }: { name: string }) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(15,23,42,0.7)";
    g.beginPath();
    g.roundRect(0, 8, 256, 48, 16);
    g.fill();
    g.fillStyle = "#fff";
    g.font = "600 28px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(name.slice(0, 16), 128, 33);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [name]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={[0, 2.15, 0]} scale={[1.2, 0.3, 1]}>
      <spriteMaterial map={texture} depthTest={false} transparent />
    </sprite>
  );
}

function Avatar({ id, name, color }: { id: string; name: string; color: string }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const s = sample(id);
    const g = ref.current;
    if (!s || !g) return;
    g.visible = true;
    g.position.set(s.pos[0], s.pos[1], s.pos[2]);
    g.rotation.y = s.rotY;
  });
  return (
    <group ref={ref} visible={false}>
      <mesh position={[0, 0.85, 0]} castShadow>
        <capsuleGeometry args={[0.3, 1.0, 4, 10]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.5, -0.25]}>
        <boxGeometry args={[0.3, 0.12, 0.1]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <Nameplate name={name} />
    </group>
  );
}

export function RemotePlayers() {
  const others = useStore((s) => s.others);
  const npcs = useStore((s) => s.npcs);
  return (
    <>
      {npcs.map((n) => (
        <Avatar key={`npc:${n.npcId}`} id={`npc:${n.npcId}`} name={NPC_NAMES[n.npcId]} color="#60a5fa" />
      ))}
      {others.map((p) => (
        <Avatar key={p.id} id={p.id} name={p.name} color={p.role ? ROLE_COLORS[p.role] : "#94a3b8"} />
      ))}
    </>
  );
}
