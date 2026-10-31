/** Мой персонаж: изменяемое состояние вне React (меняется каждый кадр). */
import type { Vec3 } from "@game/shared";

export const local = {
  pos: [0, 0, 0] as Vec3,
  rotY: 0,
  /** Позиция пришла с сервера (спаун/восстановление) — контроллер должен телепортироваться */
  teleport: false,
  ready: false,
};

export function teleport(pos: Vec3, rotY: number) {
  local.pos = [pos[0], pos[1], pos[2]];
  local.rotY = rotY;
  local.teleport = true;
  local.ready = true;
}
