/** Кооп (M17): кто в команде — из context.partners и context.playerName, которые шлёт сервер. */
import type { NpcRequest } from "@game/shared";

const clean = (n: unknown): string | undefined => {
  if (typeof n !== "string") return undefined;
  const t = n.replace(/[^\p{L}\p{N} -]/gu, "").trim().slice(0, 20);
  return t || undefined;
};

export function partnerNames(req: NpcRequest): string[] {
  const p = req.context.partners;
  return Array.isArray(p) ? p.map(clean).filter((x): x is string => !!x) : [];
}

/**
 * Ключ состояния звонка 112 и доклада бригаде: в кооп — общий на команду (слоты, названные
 * разными игроками, складываются), в solo — свой у игрока.
 */
export function teamKey(req: NpcRequest): string {
  const partners = partnerNames(req);
  const me = clean(req.context.playerName);
  if (partners.length === 0 || !me) return req.playerId;
  return `team:${[me, ...partners].sort().join("|")}`;
}
