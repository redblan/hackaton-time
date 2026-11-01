/**
 * Поведение толпы (G12): люди и животные — не агенты, всё на клиенте, без сервера.
 * Детерминированно от seed и времени: маршрут, паузы, оглядывание. Реакции на игроков:
 * смотрят на того, кто говорит рядом; отходят от бегущего; голуби взлетают; кошка удирает;
 * при толчке люди приседают или бегут от дома (в сторону −z). Коллизий нет.
 * Чистые функции и изменяемое состояние на экземпляр — без three.js, чтобы проверять тестами.
 */
import type { CrowdType, Vec3, WorldObject } from "@game/shared";

export type CrowdObject = Extract<WorldObject, { kind: "crowd" }>;

/** Игрок рядом: где стоит, как быстро движется (м/с), говорит ли сейчас */
export interface Actor {
  pos: Vec3;
  speed: number;
  speaking: boolean;
}

export interface CrowdInput {
  actors: Actor[];
  quake: boolean;
  dt: number;
}

export type Mood = "quake" | "dodge" | "talk" | null;

export interface CrowdState {
  /** Время на маршруте, с (идёт, только пока ничего не отвлекает) */
  t: number;
  /** Смещение от маршрута: отошёл, убежал, бежит от дома */
  offX: number;
  offZ: number;
  rotY: number;
  /** Поворот головы относительно корпуса, рад */
  headYaw: number;
  /** Голубь: 0 — на земле, 1 — в воздухе */
  fly: number;
  /** Сколько ещё держаться в воздухе / в бегстве, с */
  hold: number;
  anim: "idle" | "walk" | "run";
  /** Присел при толчке */
  crouch: boolean;
  /** Что сейчас происходит вокруг: по этому выбирается реплика */
  mood: Mood;
  /** Мировая позиция для рендера */
  x: number;
  y: number;
  z: number;
}

export const SPEED: Record<CrowdType, number> = { person: 1.2, cat: 0.8, dog: 1.3, pigeon: 0.35 };
/** Игрок бежит, если быстрее этого (ходьба 3.2, бег 5.5 м/с — physics.ts) */
export const RUNNING = 4.3;
const LOOK_RADIUS = 3;
const VERTICAL = 2.5;
const QUAKE_RUN = 4;
const MAX_OFFSET = 14;

const hash = (seed: number, k: number) => {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Угол поворота, при котором объект смотрит в сторону (dx, dz). rotY = 0 — взгляд на −z (как у персонажей). */
export const faceAngle = (dx: number, dz: number) => Math.atan2(-dx, -dz);

const wrap = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};
const turn = (from: number, to: number, k: number) => wrap(from + wrap(to - from) * Math.min(1, k));

export function initState(o: CrowdObject): CrowdState {
  return {
    t: hash(o.seed, 1) * 20,
    offX: 0,
    offZ: 0,
    rotY: o.rotY ?? hash(o.seed, 2) * Math.PI * 2,
    headYaw: 0,
    fly: 0,
    hold: 0,
    anim: "idle",
    crouch: false,
    mood: null,
    x: o.pos[0],
    y: o.pos[1],
    z: o.pos[2],
  };
}

/** Положение на замкнутом маршруте pos → route… → pos с паузой (1–3 с, от seed) в каждой точке */
export function routeAt(o: CrowdObject, t: number): { x: number; z: number; rotY: number; moving: boolean } {
  const pts: Vec3[] = [o.pos, ...(o.route ?? [])];
  if (pts.length < 2) return { x: o.pos[0], z: o.pos[2], rotY: o.rotY ?? 0, moving: false };
  const speed = o.speed ?? SPEED[o.type];
  const legs = pts.map((from, i) => {
    const to = pts[(i + 1) % pts.length]!;
    return { from, to, walk: Math.hypot(to[0] - from[0], to[2] - from[2]) / speed, pause: 1 + hash(o.seed, 10 + i) * 2 };
  });
  const total = legs.reduce((s, l) => s + l.walk + l.pause, 0);
  let left = ((t % total) + total) % total;
  for (const { from, to, walk, pause } of legs) {
    const rotY = faceAngle(to[0] - from[0], to[2] - from[2]);
    if (left < walk) {
      const k = left / walk;
      return { x: from[0] + (to[0] - from[0]) * k, z: from[2] + (to[2] - from[2]) * k, rotY, moving: true };
    }
    left -= walk;
    if (left < pause) return { x: to[0], z: to[2], rotY, moving: false };
    left -= pause;
  }
  return { x: o.pos[0], z: o.pos[2], rotY: 0, moving: false };
}

/** Ближайший игрок на том же уровне (по горизонтали) */
function nearest(x: number, y: number, z: number, actors: Actor[]) {
  let best: { a: Actor; d: number; dx: number; dz: number } | null = null;
  for (const a of actors) {
    if (Math.abs(a.pos[1] - y) > VERTICAL) continue;
    const dx = a.pos[0] - x;
    const dz = a.pos[2] - z;
    const d = Math.hypot(dx, dz);
    if (!best || d < best.d) best = { a, d, dx, dz };
  }
  return best;
}

/** Говорящий в радиусе взгляда (ближайший из говорящих) */
function speaker(x: number, y: number, z: number, actors: Actor[]) {
  return nearest(x, y, z, actors.filter((a) => a.speaking));
}

/** Один шаг поведения. Меняет `s` на месте (на кадр — без лишних объектов). */
const LINES: Record<NonNullable<Mood>, string[]> = {
  quake: ["Трясёт!", "Отойдите от дома!", "Держитесь!", "Осторожно!"],
  dodge: ["Не толкайтесь!", "Осторожно!", "Куда так бежите?"],
  talk: ["Что случилось?", "Вы что-то сказали?", "Нужна помощь?"],
};
/** Человек говорит SPEAK_S из каждых SPEAK_EVERY_S, у каждого своя фаза: толпа не кричит хором. */
const SPEAK_EVERY_S = 7;
const SPEAK_S = 2.5;

/** Реплика над головой или null, если человек молчит. Только шаблоны, модель здесь не участвует. */
export function crowdLine(seed: number, mood: Mood, time: number): string | null {
  if (!mood) return null;
  const clock = time + hash(seed, 5) * SPEAK_EVERY_S;
  if (clock % SPEAK_EVERY_S > SPEAK_S) return null;
  const lines = LINES[mood];
  return lines[Math.floor(hash(seed, Math.floor(clock / SPEAK_EVERY_S)) * lines.length)] ?? null;
}

export function stepCrowd(o: CrowdObject, s: CrowdState, input: CrowdInput, time: number): CrowdState {
  const { dt, actors } = input;
  const baseSpeed = o.speed ?? SPEED[o.type];
  const route = routeAt(o, s.t);
  let x = route.x + s.offX;
  let z = route.z + s.offZ;
  const y = o.pos[1];
  const near = nearest(x, y, z, actors);
  const talk = speaker(x, y, z, actors);
  let busy = false; // отвлёкся — маршрут стоит
  let moveX = 0;
  let moveZ = 0;
  let face: number | null = null;
  let anim: CrowdState["anim"] = route.moving ? "walk" : "idle";
  let dodged = false;
  s.crouch = false;

  const away = (dist: number, speed: number) => {
    if (!near || near.d < 1e-3) return;
    const k = (speed * dt) / near.d;
    moveX -= near.dx * k;
    moveZ -= near.dz * k;
    face = faceAngle(-near.dx, -near.dz);
    busy = true;
    s.hold = Math.max(s.hold, dist);
  };
  if (o.type !== "pigeon") s.hold = Math.max(0, s.hold - dt);

  if (o.type === "person" && input.quake) {
    // Толчок: половина приседает, половина бежит от дома (дом — z ∈ [0, 12], двор — z < 0)
    busy = true;
    if (hash(o.seed, 3) < 0.5) s.crouch = true;
    else {
      moveZ -= QUAKE_RUN * dt;
      face = 0;
      anim = "run";
    }
  } else if (o.type === "pigeon") {
    const scared = !!near && (near.d < 2 || (near.d < 4 && near.a.speed > RUNNING));
    if (scared) s.hold = 3;
    else s.hold = Math.max(0, s.hold - dt);
    const target = s.hold > 0 ? 1 : 0;
    s.fly += (target - s.fly) * Math.min(1, dt * (target ? 2.5 : 0.8));
    if (s.fly > 0.05) {
      busy = true;
      if (near && scared) away(0, 1.5); // отлетает чуть в сторону
    }
  } else if (near && ((near.a.speed > RUNNING && near.d < (o.type === "cat" ? 4 : 1.5)) || (o.type === "cat" && s.hold > 0 && near.d < 6))) {
    // На него бегут: кошка удирает, человек и собака отходят на шаг
    if (o.type === "cat") {
      away(1.5, 3.5); // убегает, пока не оторвётся на 6 м (1.5 с после того, как перестали гнаться)
      anim = "run";
    } else away(1, 1.6);
    if (o.type !== "cat") anim = "walk";
    dodged = true;
  }

  // Смотрит на говорящего рядом (человек — корпусом, животные — головой и корпусом)
  if (!s.crouch && face === null && talk && talk.d < LOOK_RADIUS) {
    face = faceAngle(talk.dx, talk.dz);
    busy = true;
    anim = "idle";
  }

  // Возвращается на маршрут, когда всё спокойно
  if (!busy && !input.quake) {
    const off = Math.hypot(s.offX, s.offZ);
    if (off > 0.05) {
      const k = Math.min(1, (baseSpeed * dt) / off);
      moveX -= s.offX * k;
      moveZ -= s.offZ * k;
      face = faceAngle(-s.offX, -s.offZ);
      anim = "walk";
      busy = true;
    }
  }

  s.offX += moveX;
  s.offZ += moveZ;
  const off = Math.hypot(s.offX, s.offZ);
  if (off > MAX_OFFSET) {
    s.offX *= MAX_OFFSET / off;
    s.offZ *= MAX_OFFSET / off;
  }
  if (!busy) s.t += dt;

  x = route.x + s.offX;
  z = route.z + s.offZ;
  s.rotY = turn(s.rotY, face ?? route.rotY, dt * 6);

  // Голова: на ближайшего игрока в 4 м, иначе оглядывается на остановках
  let head = 0;
  if (near && near.d < 4) head = wrap(faceAngle(near.dx, near.dz) - s.rotY);
  else if (!route.moving) head = Math.sin(time * 0.9 + o.seed) * 0.6;
  head = Math.max(-1.2, Math.min(1.2, head));
  s.headYaw += (head - s.headYaw) * Math.min(1, dt * 5);

  s.anim = s.crouch ? "idle" : anim;
  s.mood = input.quake ? "quake" : dodged ? "dodge" : talk && talk.d < LOOK_RADIUS ? "talk" : null;
  s.x = x;
  s.y = y + (o.type === "pigeon" ? s.fly * 2.4 : 0);
  s.z = z;
  return s;
}
