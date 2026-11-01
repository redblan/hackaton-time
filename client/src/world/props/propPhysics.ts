/** Физика брошенного предмета: коробка, гравитация, отскок, трение. Чистые функции, без браузера. */
import type { Aabb, Vec3 } from "@game/shared";

const GRAVITY = 16;
const MAX_STEP = 1 / 120; // быстрее броска в 12 м/с стенку в 0.2 м не пролететь
const GROUND_FRICTION = 8;
const STOP_SPEED = 0.08;
const STOP_BOUNCE = 0.6;
const EPS = 0.001;
/** Ниже этого предмет упал мимо загруженных коробок: кладём на землю, а не теряем. */
const LOST_Y = -2;

export interface PropBody {
  /** Центр коробки */
  pos: Vec3;
  vel: Vec3;
  /** Половина размера */
  half: Vec3;
  /** 0..1 */
  bounce: number;
  resting: boolean;
}

const hits = (pos: Vec3, half: Vec3, box: Aabb) =>
  [0, 1, 2].every((i) => pos[i]! + half[i]! > box.min[i]! && pos[i]! - half[i]! < box.max[i]!);

/** Сдвиг по одной оси. Возвращает true, если упёрся. */
function moveAxis(body: PropBody, axis: 0 | 1 | 2, colliders: Aabb[], dt: number) {
  const { pos, vel, half } = body;
  pos[axis]! += vel[axis]! * dt;
  const box = colliders.find((c) => hits(pos, half, c));
  if (!box) return false;
  const speed = vel[axis]!;
  pos[axis] = speed > 0 ? box.min[axis]! - half[axis]! - EPS : box.max[axis]! + half[axis]! + EPS;
  vel[axis] = -speed * body.bounce;
  return true;
}

function substep(body: PropBody, colliders: Aabb[], dt: number) {
  const { vel } = body;
  vel[1]! -= GRAVITY * dt;
  const falling = vel[1]! < 0;
  moveAxis(body, 0, colliders, dt);
  moveAxis(body, 2, colliders, dt);
  const grounded = moveAxis(body, 1, colliders, dt) && falling;
  if (!grounded) return;
  if (Math.abs(vel[1]!) < STOP_BOUNCE) vel[1] = 0;
  const friction = Math.exp(-GROUND_FRICTION * dt);
  vel[0]! *= friction;
  vel[2]! *= friction;
  if (Math.hypot(vel[0]!, vel[1]!, vel[2]!) < STOP_SPEED) {
    body.vel = [0, 0, 0];
    body.resting = true;
  }
}

export function stepProp(body: PropBody, colliders: Aabb[], dt: number) {
  if (body.resting) return;
  const steps = Math.max(1, Math.ceil(dt / MAX_STEP));
  for (let i = 0; i < steps && !body.resting; i++) substep(body, colliders, dt / steps);
  if (body.pos[1] < LOST_Y) {
    body.pos[1] = body.half[1];
    body.vel = [0, 0, 0];
    body.resting = true;
  }
}

/** Скорость броска: тяжёлое летит ближе. `forward` — единичный вектор взгляда. */
export function throwVelocity(forward: Vec3, mass: number): Vec3 {
  const speed = Math.min(12, Math.max(2.5, 11 / Math.sqrt(Math.max(mass, 0.1))));
  return [forward[0] * speed, forward[1] * speed + 1.5, forward[2] * speed];
}
