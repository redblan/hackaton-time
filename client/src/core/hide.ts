/**
 * Укрытия при толчке: E на «Укрыться под столом / у стены / Встать у шкафа» — игрок реально прячется.
 * Камера плавно уходит под стол / приседает у стены / залезает в шкаф (там видно только щель между дверцами — Hud).
 * Пока спрятан — не ходит; E — вылезти. Сценарий получает interact как раньше (за шкаф — ошибка в разборе).
 * Позиция для напарников — место укрытия: в шкафу аватар внутри закрытого шкафа, его не видно.
 */
import type { ChunkData, Vec3 } from "@game/shared";
import { isActive } from "./chunkMath";

export type HideKind = "table" | "wall" | "wardrobe";

export interface Hide {
  kind: HideKind;
  /** Где стоял до укрытия — туда вернёмся */
  from: Vec3;
  /** Где тело в укрытии (уходит на сервер) */
  body: Vec3;
  /** Где камера в укрытии */
  eye: Vec3;
  /** Куда смотреть (null — как смотрел) */
  yaw: number | null;
}

export const HIDE_TARGETS: Record<string, HideKind> = { cover_table: "table", cover_wall: "wall", cover_wardrobe: "wardrobe" };
/** Сколько длится залезание / вылезание, мс */
export const HIDE_MS = 700;

const box = (chunk: ChunkData, id: string, flags: string[]) => {
  const o = chunk.objects.find((x) => x.id === id && x.kind === "box" && isActive(x, flags));
  return o?.kind === "box" ? o : null;
};

/** Поза укрытия по данным чанка. Шкаф упал (wardrobe_fallen) — в шкаф не залезть, просто присесть рядом */
export function hidePose(kind: HideKind, chunk: ChunkData, flags: string[], me: Vec3, at: Vec3): Hide {
  const y = me[1];
  const from: Vec3 = [me[0], me[1], me[2]];
  if (kind === "table") {
    const top = box(chunk, "table-top", flags);
    const [x, , z] = top?.pos ?? at;
    return { kind, from, body: [x, y, z], eye: [x, y + 0.55, z], yaw: null };
  }
  if (kind === "wardrobe") {
    const w = box(chunk, "wardrobe", flags);
    if (w) {
      // лицом к комнате: от центра шкафа к точке «Встать у шкафа»
      const yaw = Math.atan2(-(at[0] - w.pos[0]), -(at[2] - w.pos[2]));
      return { kind, from, body: [w.pos[0], y, w.pos[2]], eye: [w.pos[0], y + 1.5, w.pos[2]], yaw };
    }
  }
  // у внутренней стены (и у упавшего шкафа): присесть, сгруппироваться
  return { kind: kind === "wardrobe" ? "wall" : kind, from, body: [at[0], y, at[2]], eye: [at[0], y + 0.8, at[2]], yaw: null };
}
