/**
 * Оригинальный мультяшный человечек из примитивов: круглое тело, большая голова, шапка.
 * Лёгкий вариант без моделей. Когда появятся модели N5, сигнатура останется той же.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";

const SKIN = "#f4b98b";

const NPC_COLORS: Record<string, string> = {
  papa: "#3f6fa8",
  mihalych: "#7c8f4a",
  vanya: "#c95a4a",
  valentina: "#a85c94",
  gromov: "#d9682b",
  dispatcher: "#4a8a94",
};

export const npcColor = (npcId: string) => NPC_COLORS[npcId] ?? "#c9844a";

export function Character(props: { color: string; anim?: "idle" | "walk" | "run"; pose?: "stand" | "lie" | "sit" }) {
  const { color, anim = "idle", pose = "stand" } = props;
  const body = useRef<Group>(null);
  const lying = pose === "lie";
  const sitting = pose === "sit";

  useFrame(({ clock }) => {
    if (!body.current || lying) return;
    const speed = anim === "run" ? 12 : anim === "walk" ? 8 : 2;
    const height = anim === "idle" ? 0.015 : 0.05;
    body.current.position.y = Math.abs(Math.sin(clock.elapsedTime * speed)) * height;
  });

  return (
    <group
      rotation-x={lying ? -Math.PI / 2 : 0}
      position={lying ? [0, 0.3, 0.8] : sitting ? [0, -0.35, 0] : [0, 0, 0]}
    >
      <group ref={body}>
        {[-0.17, 0.17].map((x) => (
          <mesh key={x} position={[x, 0.3, 0]} castShadow>
            <capsuleGeometry args={[0.13, 0.32, 4, 8]} />
            <meshStandardMaterial color="#3f4a5e" roughness={0.8} />
          </mesh>
        ))}
        <mesh position={[0, 0.85, 0]} scale={[1, 1.05, 0.85]} castShadow>
          <sphereGeometry args={[0.42, 16, 12]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.46, 0.9, 0]} rotation-z={side * 0.3} castShadow>
            <capsuleGeometry args={[0.1, 0.34, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.85} />
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
          <meshStandardMaterial color="#6b4a33" roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
}
