/** NPC ходит по своему маршруту, а когда игрок рядом, останавливается и поворачивается к нему. */
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { Vec3 } from "@game/shared";
import { Character, type Variant } from "./Character";
import { routePoint, type Route } from "./npcRoutes";

const STOP_DISTANCE = 3.2;
const TURN_SPEED = 9;

/** Плавный поворот кратчайшим путём, независимо от частоты кадров. */
function turnTo(body: Group, target: number, delta: number) {
  const diff = Math.atan2(Math.sin(target - body.rotation.y), Math.cos(target - body.rotation.y));
  body.rotation.y += diff * (1 - Math.exp(-TURN_SPEED * delta));
}

export function NpcWalker(props: { color: string; pos: Vec3; route: Route; seed: number; variant?: Variant }) {
  const { color, pos, route, seed, variant } = props;
  const group = useRef<Group>(null);
  const time = useRef(seed);
  const [walking, setWalking] = useState(false);

  useFrame(({ camera }, delta) => {
    const body = group.current;
    if (!body) return;
    const dx = camera.position.x - body.position.x;
    const dz = camera.position.z - body.position.z;
    const near = Math.hypot(dx, dz) < STOP_DISTANCE && Math.abs(camera.position.y - pos[1]) < 2.5;
    if (near) {
      turnTo(body, Math.atan2(-dx, -dz), delta);
      if (walking) setWalking(false);
      return;
    }
    time.current += delta;
    const point = routePoint(route, time.current);
    body.position.set(pos[0] + point.x, pos[1], pos[2] + point.z);
    turnTo(body, point.rotY, delta);
    if (point.moving !== walking) setWalking(point.moving);
  });

  return (
    <group ref={group} position={pos}>
      <Character color={color} anim={walking ? "walk" : "idle"} variant={variant} />
    </group>
  );
}
