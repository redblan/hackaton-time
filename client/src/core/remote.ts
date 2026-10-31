/** Буфер позиций других игроков для интерполяции (вне React — обновляется 10 раз в секунду). */
import type { PlayerPublic, Vec3 } from "@game/shared";

type Snapshot = { id: string; pos: Vec3; rotY: number; anim?: PlayerPublic["anim"] };

interface Sample {
  t: number;
  pos: Vec3;
  rotY: number;
  anim: PlayerPublic["anim"];
}

/** Рисуем с задержкой, чтобы всегда было два снимка для интерполяции. */
export const INTERP_DELAY_MS = 120;
const buffers = new Map<string, Sample[]>();

export function pushSnapshot(p: Snapshot, t = performance.now()) {
  const buf = buffers.get(p.id) ?? [];
  buf.push({ t, pos: p.pos, rotY: p.rotY, anim: p.anim ?? "idle" });
  if (buf.length > 20) buf.splice(0, buf.length - 20);
  buffers.set(p.id, buf);
}

/** Забыть игроков, которых больше нет (NPC с id `npc:*` не трогаем) */
export function forget(keep: Set<string>) {
  for (const id of buffers.keys()) if (!id.startsWith("npc:") && !keep.has(id)) buffers.delete(id);
}

const lerpAngle = (a: number, b: number, k: number) => {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * k;
};

export function sample(id: string, now = performance.now()): Sample | null {
  const buf = buffers.get(id);
  if (!buf?.length) return null;
  const t = now - INTERP_DELAY_MS;
  if (t <= buf[0]!.t) return buf[0]!;
  for (let i = buf.length - 1; i > 0; i--) {
    const a = buf[i - 1]!;
    const b = buf[i]!;
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / Math.max(1, b.t - a.t);
      return {
        t,
        pos: [a.pos[0] + (b.pos[0] - a.pos[0]) * k, a.pos[1] + (b.pos[1] - a.pos[1]) * k, a.pos[2] + (b.pos[2] - a.pos[2]) * k],
        rotY: lerpAngle(a.rotY, b.rotY, k),
        anim: b.anim,
      };
    }
  }
  return buf[buf.length - 1]!;
}
