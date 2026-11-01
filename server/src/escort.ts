/**
 * Сопровождение (D-26, D-45): NPC идёт за игроком по его следу (так он проходит лестницы и двери,
 * а не сквозь стены). Игрок ушёл дальше 8 м — `left_behind`, не чаще раза в 5 с игрового времени.
 */
import type { NpcId, PlayerId, Vec3 } from "@game/shared";

export const ESCORT = {
  /** м/с — медленнее шага игрока (3.2), бегом легко оторваться */
  speed: 2.4,
  /** На каком расстоянии от игрока останавливается */
  keepDistance: 1.5,
  leftBehindDistance: 8,
  leftBehindEveryMs: 5000,
  /** Как часто ставим точку следа, м */
  trailStep: 0.5,
  maxTrail: 600,
};

export interface Escort {
  npcId: NpcId;
  /** За кем идёт; null — сопровождение закончено, NPC стоит */
  playerId: PlayerId | null;
  pos: Vec3;
  rotY: number;
  trail: Vec3[];
  /** Игровое время последнего left_behind */
  lastLeftBehindAt: number | null;
  /** D-76: идёт сам к точке (пострадавший после помощи — к месту сбора); дошёл — стоит рядом и переминается */
  goal?: Vec3 | null;
  /** Сейчас в движении (для анимации на клиенте) */
  walking?: boolean;
  /** Куда переминается у цели и когда менять точку (мс реального времени) */
  wander?: { to: Vec3; until: number };
}

export const WALK = { speed: 1.6, wanderRadius: 1.3, wanderSpeed: 0.7 };

/** Самостоятельный поход: от точки к цели, потом неспешно ходить вокруг цели */
export function startWalk(npcId: NpcId, from: Vec3, goal: Vec3): Escort {
  return { npcId, playerId: null, pos: [...from], rotY: 0, trail: [], lastLeftBehindAt: null, goal: [...goal], walking: true };
}

export function stepWalk(e: Escort, dtMs: number, now = Date.now()) {
  if (!e.goal) return;
  const target = e.wander?.to ?? e.goal;
  const speed = e.wander ? WALK.wanderSpeed : WALK.speed;
  const dx = target[0] - e.pos[0];
  const dz = target[2] - e.pos[2];
  const d = Math.hypot(dx, dz);
  const budget = (speed * dtMs) / 1000;
  if (d > 0.05) {
    e.rotY = Math.atan2(-dx, -dz);
    const k = Math.min(1, budget / d);
    e.pos = [e.pos[0] + dx * k, target[1], e.pos[2] + dz * k];
    e.walking = true;
    return;
  }
  // у цели: постоять, потом сделать пару шагов в сторону
  e.walking = false;
  if (!e.wander || now > e.wander.until) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * WALK.wanderRadius;
    e.wander = { to: [e.goal[0] + Math.cos(a) * r, e.goal[1], e.goal[2] + Math.sin(a) * r], until: now + 4000 + Math.random() * 6000 };
  }
}


export const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function startEscort(npcId: NpcId, playerId: PlayerId, from: Vec3): Escort {
  return { npcId, playerId, pos: [...from], rotY: 0, trail: [], lastLeftBehindAt: null };
}

/** Запомнить, где прошёл игрок */
export function recordTrail(e: Escort, playerPos: Vec3) {
  const last = e.trail[e.trail.length - 1] ?? e.pos;
  if (dist(last, playerPos) < ESCORT.trailStep) return;
  e.trail.push([...playerPos]);
  if (e.trail.length > ESCORT.maxTrail) e.trail.splice(0, e.trail.length - ESCORT.maxTrail);
}

/** Сдвинуть NPC по следу за dtMs */
export function stepEscort(e: Escort, playerPos: Vec3, dtMs: number) {
  let budget = (ESCORT.speed * dtMs) / 1000;
  while (budget > 0 && e.trail.length > 0 && dist(e.pos, playerPos) > ESCORT.keepDistance) {
    const target = e.trail[0]!;
    const d = dist(e.pos, target);
    const dx = target[0] - e.pos[0];
    const dz = target[2] - e.pos[2];
    if (Math.hypot(dx, dz) > 1e-3) e.rotY = Math.atan2(-dx, -dz); // лицом по ходу (вперёд = -z)
    if (d <= budget) {
      e.pos = [...target];
      e.trail.shift();
      budget -= d;
    } else {
      const k = budget / d;
      e.pos = [e.pos[0] + dx * k, e.pos[1] + (target[1] - e.pos[1]) * k, e.pos[2] + dz * k];
      budget = 0;
    }
  }
}

/** Пора ли слать left_behind (и отметить, что послали) */
export function checkLeftBehind(e: Escort, playerPos: Vec3, gameNowMs: number): boolean {
  if (dist(e.pos, playerPos) <= ESCORT.leftBehindDistance) return false;
  if (e.lastLeftBehindAt !== null && gameNowMs - e.lastLeftBehindAt < ESCORT.leftBehindEveryMs) return false;
  e.lastLeftBehindAt = gameNowMs;
  return true;
}
