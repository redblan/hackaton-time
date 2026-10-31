/**
 * Отрисовка чанка. ВЛАДЕЛЕЦ: Никита. ТЗ: docs/tz/nikita-world.md
 * Сейчас ЗАГЛУШКА лида с правильными сигнатурами: коробки, маркеры интерактивов и NPC.
 * Никита заменяет тело (модели через useGLTF('/assets/...'), инстансинг, fx), сигнатуры не меняем.
 */
import { Html } from "@react-three/drei";
import { isObjectActive, type Aabb, type ChunkData, type WorldObject } from "@game/shared";

const active = (o: WorldObject, flags: string[]) => isObjectActive(o, flags);

export function ChunkView(props: { chunk: ChunkData; flags: string[] }) {
  const objects = props.chunk.objects.filter((o) => active(o, props.flags));
  return (
    <group name={props.chunk.id}>
      {objects.map((o) => {
        switch (o.kind) {
          case "box":
            return (
              <mesh key={o.id} position={o.pos} rotation-y={o.rotY ?? 0} castShadow receiveShadow>
                <boxGeometry args={o.size} />
                <meshStandardMaterial color={o.color} />
              </mesh>
            );
          case "model":
            return (
              <mesh key={o.id} position={[o.pos[0], o.pos[1] + 0.5, o.pos[2]]}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="#c084fc" wireframe />
              </mesh>
            );
          case "interactable":
            return (
              <mesh key={o.id} position={[o.pos[0], o.pos[1] + 0.6, o.pos[2]]}>
                <sphereGeometry args={[0.12, 12, 12]} />
                <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.8} />
              </mesh>
            );
          case "npc":
            return (
              <group key={o.id} position={o.pos} rotation-y={o.rotY ?? 0}>
                <mesh position={[0, o.pose === "lie" ? 0.2 : 0.9, 0]} rotation-z={o.pose === "lie" ? Math.PI / 2 : 0}>
                  <capsuleGeometry args={[0.28, 1.1, 4, 8]} />
                  <meshStandardMaterial color="#60a5fa" />
                </mesh>
              </group>
            );
          case "sign":
            return (
              <Html key={o.id} position={o.pos} center distanceFactor={8} className="world-sign">
                {o.text}
              </Html>
            );
          case "fx":
            return (
              <mesh key={o.id} position={o.pos}>
                <sphereGeometry args={[o.size ?? 0.5, 12, 12]} />
                <meshStandardMaterial
                  color={o.fx === "fire" ? "#f97316" : o.fx === "sparks" ? "#fde047" : "#9ca3af"}
                  transparent
                  opacity={0.5}
                />
              </mesh>
            );
          default:
            return null; // zone, spawn — невидимые
        }
      })}
    </group>
  );
}

/** Коробки для столкновений. Объекты с `when` не из flags не сталкиваются. */
export function getColliders(chunk: ChunkData, flags: string[]): Aabb[] {
  const out: Aabb[] = [];
  for (const o of chunk.objects) {
    if (o.kind !== "box" || o.collide === false || !active(o, flags)) continue;
    const a = o.rotY ?? 0;
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    const hx = (c * o.size[0] + s * o.size[2]) / 2;
    const hz = (s * o.size[0] + c * o.size[2]) / 2;
    const hy = o.size[1] / 2;
    out.push({
      min: [o.pos[0] - hx, o.pos[1] - hy, o.pos[2] - hz],
      max: [o.pos[0] + hx, o.pos[1] + hy, o.pos[2] + hz],
    });
  }
  return out;
}
