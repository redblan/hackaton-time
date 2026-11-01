/**
 * Подвижное во дворе (G10): качели на площадке (y12, объекты Никиты swing-*).
 * Статичные swing-seat и swing-rope-* ChunkView прячет, здесь — свои: верёвки и сиденье
 * на шарнире под перекладиной swing-beam. Качаются сами, при толчке — сильнее.
 * Коллизии остаются из данных (getColliders), тут только вид.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshStandardMaterial, type Group } from "three";
import type { WorldObject } from "@game/shared";
import { paintSurface } from "../style";
import { quakeLevel } from "./Animated";
import { Builder, useBuilt } from "./build";

type Box = Extract<WorldObject, { kind: "box" }>;

/** Эти коробки рисует YardAnimated, а не общий инстансинг чанка */
export const isYardAnimated = (id: string) => id === "swing-seat" || id.startsWith("swing-rope-");

const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
paintSurface(material);

function Swing({ beam, seat, ropes }: { beam: Box; seat: Box; ropes: Box[] }) {
  const pivotY = beam.pos[1] - beam.size[1] / 2;
  const geometry = useBuilt(() => {
    const b = new Builder();
    const len = pivotY - seat.pos[1];
    // всё — относительно шарнира: верёвки вниз, сиденье на конце
    for (const r of ropes) b.box(r.size[0], len, r.size[2], r.color, { x: r.pos[0] - beam.pos[0], y: -len / 2, z: r.pos[2] - beam.pos[2] });
    b.box(seat.size[0], seat.size[1], seat.size[2], seat.color, { x: seat.pos[0] - beam.pos[0], y: -len, z: seat.pos[2] - beam.pos[2] });
    return b.build();
  }, [beam, seat, ropes, pivotY]);
  const pivot = useRef<Group>(null);
  const phase = useRef(0);
  const amp = useRef(0.3);

  useFrame((_, dt) => {
    const g = pivot.current;
    if (!g) return;
    const q = Math.min(1, quakeLevel());
    // при толчке раскачивается сильнее, потом плавно возвращается к обычной амплитуде
    amp.current += (0.3 + q * 0.4 - amp.current) * Math.min(1, dt * (q > 0 ? 2 : 0.3));
    phase.current += dt * (1.7 + q * 1.5);
    g.rotation.x = amp.current * Math.sin(phase.current);
  });

  return (
    <group ref={pivot} position={[beam.pos[0], pivotY, beam.pos[2]]}>
      <mesh geometry={geometry} material={material} castShadow />
    </group>
  );
}

export function YardAnimated({ objects }: { objects: WorldObject[] }) {
  const parts = useMemo(() => {
    const boxes = objects.filter((o): o is Box => o.kind === "box");
    const beam = boxes.find((o) => o.id === "swing-beam");
    const seat = boxes.find((o) => o.id === "swing-seat");
    const ropes = boxes.filter((o) => o.id.startsWith("swing-rope-"));
    return beam && seat ? { beam, seat, ropes } : null;
  }, [objects]);
  return parts ? <Swing {...parts} /> : null;
}
