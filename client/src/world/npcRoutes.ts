/**
 * Маршруты NPC, которым по сценарию не стоится на месте: папа ходит по комнате, соседка мечется
 * у двери, напуганный ребёнок и Михалыч ходят по двору. Это вид, а не логика: говорить с ними
 * можно с места в чанке, поэтому точки лежат рядом с ним. Лежачие и застрявшие не ходят.
 */
import type { NpcId } from "@game/shared";

/** Смещение [x, z] от точки NPC в чанке. Первая точка всегда [0, 0]. */
export type Route = [number, number][];

export const NPC_ROUTES: Partial<Record<NpcId, Route>> = {
  papa: [[0, 0], [1.3, 0], [1.3, -1.6], [0, -1.6]],
  valentina: [[0, 0], [1, 0], [0.4, -0.5]],
  mihalych: [[0, 0], [1.8, 0], [1.8, 1.2], [0.3, 1.2]],
  gromov: [[0, 0], [-2, 0], [-2, 1.5]],
  victim_scared: [[0, 0], [1, 0.8], [-0.8, 1], [-1, -0.6]],
};

/** Эти NPC в чанке лежат, но по сценарию ходят сами. */
export const STANDING_NPCS: Partial<Record<NpcId, true>> = { victim_scared: true };

const WALK_SPEED = 1.1;
const PAUSE_S = 1.8;

export interface RoutePoint {
  x: number;
  z: number;
  rotY: number;
  moving: boolean;
}

/** Положение на маршруте через `time` секунд: круг с паузой в каждой точке. */
export function routePoint(route: Route, time: number): RoutePoint {
  const legs = route.map((from, i) => {
    const to = route[(i + 1) % route.length]!;
    return { from, to, length: Math.hypot(to[0] - from[0], to[1] - from[1]) };
  });
  const total = legs.reduce((sum, leg) => sum + leg.length / WALK_SPEED + PAUSE_S, 0);
  let left = ((time % total) + total) % total;
  for (const { from, to, length } of legs) {
    const rotY = Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));
    const walking = length / WALK_SPEED;
    if (left < walking) {
      const k = left / walking;
      return { x: from[0] + (to[0] - from[0]) * k, z: from[1] + (to[1] - from[1]) * k, rotY, moving: true };
    }
    left -= walking;
    if (left < PAUSE_S) return { x: to[0], z: to[1], rotY, moving: false };
    left -= PAUSE_S;
  }
  return { x: 0, z: 0, rotY: 0, moving: false };
}
