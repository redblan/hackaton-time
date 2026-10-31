/** Оригинальный мультяшный человечек из примитивов: круглое тело, большая голова, шапка. */
const SKIN = "#f4b98b";

const OUTFITS: Record<string, { coat: string; legs: string; hat: string }> = {
  papa: { coat: "#3f6fa8", legs: "#3a3f55", hat: "#3a3f55" },
  mihalych: { coat: "#7c8f4a", legs: "#4a3c30", hat: "#c0562f" },
  vanya: { coat: "#c95a4a", legs: "#34485e", hat: "#f0c75e" },
  valentina: { coat: "#a85c94", legs: "#5a4560", hat: "#e7dcc8" },
  gromov: { coat: "#d9682b", legs: "#2f3a4a", hat: "#d9682b" },
  dispatcher: { coat: "#4a8a94", legs: "#2f3a4a", hat: "#4a8a94" },
};
const DEFAULT_OUTFIT = { coat: "#c9844a", legs: "#3f4a5e", hat: "#8a5a3a" };

export function Character({ npcId, pose = "stand" }: { npcId?: string; pose?: string }) {
  const outfit = (npcId && OUTFITS[npcId]) || DEFAULT_OUTFIT;
  const lying = pose === "lie";
  return (
    <group rotation-x={lying ? -Math.PI / 2 : 0} position={lying ? [0, 0.3, 0.8] : [0, 0, 0]}>
      {[-0.17, 0.17].map((x) => (
        <mesh key={x} position={[x, 0.3, 0]} castShadow>
          <capsuleGeometry args={[0.13, 0.32, 4, 8]} />
          <meshStandardMaterial color={outfit.legs} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 0.85, 0]} scale={[1, 1.05, 0.85]} castShadow>
        <sphereGeometry args={[0.42, 16, 12]} />
        <meshStandardMaterial color={outfit.coat} roughness={0.85} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.46, 0.9, 0]} rotation-z={side * 0.3} castShadow>
          <capsuleGeometry args={[0.1, 0.34, 4, 8]} />
          <meshStandardMaterial color={outfit.coat} roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 1.46, 0]} castShadow>
        <sphereGeometry args={[0.32, 16, 14]} />
        <meshStandardMaterial color={SKIN} roughness={0.7} />
      </mesh>
      {[-0.11, 0.11].map((x) => (
        <mesh key={x} position={[x, 1.5, -0.29]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color="#2a2030" />
        </mesh>
      ))}
      <mesh position={[0, 1.42, -0.32]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#e8a177" />
      </mesh>
      <mesh position={[0, 1.66, 0]} scale={[1, 0.6, 1]} castShadow>
        <sphereGeometry args={[0.33, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={outfit.hat} roughness={0.8} />
      </mesh>
    </group>
  );
}
