/**
 * Физика игрока: капсула как коробка R×H, столкновения с Aabb из getColliders(),
 * гравитация, подъём на ступеньки. Чистые функции — тестируются без браузера.
 */
import type { Aabb, Vec3 } from "@game/shared";

export const PHYS = {
  HEIGHT: 1.75,
  RADIUS: 0.3,
  /** Максимальная ступенька, на которую шагаем без прыжка */
  STEP: 0.45,
  WALK: 3.2,
  RUN: 5.5,
  GRAVITY: 22,
  JUMP: 6,
};

export interface Body {
  /** Ноги игрока */
  pos: Vec3;
  vy: number;
  grounded: boolean;
}

const EPS = 0.001;

export function overlaps(x: number, feet: number, z: number, b: Aabb) {
  const { RADIUS: R, HEIGHT: H } = PHYS;
  return (
    x + R > b.min[0] && x - R < b.max[0] && z + R > b.min[2] && z - R < b.max[2] && feet + H > b.min[1] && feet + EPS < b.max[1]
  );
}

/**
 * Куда встать в точке (x, z): если ноги внутри низкой коробки (пол, ступенька, дорожка) — поднимаемся на неё.
 * null — упёрлись в стену.
 */
function standAt(x: number, feet: number, z: number, cols: Aabb[]): number | null {
  let f = feet;
  for (let i = 0; i < 4; i++) {
    let top: number | null = null;
    for (const b of cols) {
      if (!overlaps(x, f, z, b)) continue;
      if (b.max[1] - f > PHYS.STEP) return null;
      top = Math.max(top ?? -Infinity, b.max[1]);
    }
    if (top === null) return f;
    f = top;
  }
  return null;
}

/** Один шаг физики. dx, dz — желаемое смещение за шаг. gravity=false — мир под ногами не загружен, висим. */
export function stepBody(body: Body, dx: number, dz: number, cols: Aabb[], dt: number, opts: { gravity: boolean; jump: boolean }) {
  const p = body.pos;
  // Появились внутри пола (спаун, телепорт) — выталкиваем наверх
  const unstuck = standAt(p[0], p[1], p[2], cols);
  if (unstuck !== null) p[1] = unstuck;

  if (dx) {
    const f = standAt(p[0] + dx, p[1], p[2], cols);
    if (f !== null && (f === p[1] || body.grounded)) {
      p[0] += dx;
      p[1] = f;
    }
  }
  if (dz) {
    const f = standAt(p[0], p[1], p[2] + dz, cols);
    if (f !== null && (f === p[1] || body.grounded)) {
      p[2] += dz;
      p[1] = f;
    }
  }

  if (!opts.gravity) {
    body.vy = 0;
    return;
  }
  if (body.grounded && opts.jump) body.vy = PHYS.JUMP;
  body.vy -= PHYS.GRAVITY * dt;
  const ny = p[1] + body.vy * dt;
  let landed: number | null = null;
  let ceiling: number | null = null;
  for (const b of cols) {
    if (!overlaps(p[0], ny, p[2], b)) continue;
    if (body.vy <= 0 && b.max[1] <= p[1] + EPS) landed = Math.max(landed ?? -Infinity, b.max[1]);
    else if (body.vy > 0) ceiling = Math.min(ceiling ?? Infinity, b.min[1] - PHYS.HEIGHT);
  }
  body.grounded = landed !== null;
  if (landed !== null) {
    p[1] = landed;
    body.vy = 0;
  } else if (ceiling !== null) {
    p[1] = ceiling;
    body.vy = 0;
  } else p[1] = ny;
}
