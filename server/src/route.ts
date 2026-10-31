import { isObjectActive, routeLevel, type ChunkData, type RouteArea, type RoutePlayer, type Vec3 } from '@game/shared';

export function recordRoute(route: RoutePlayer, at: number, pos: Vec3, force = false) {
  const last = route.points.at(-1);
  const distance = last ? Math.hypot(...pos.map((v, i) => v - last.pos[i])) : 0;
  if (last && at < last.at) return;
  if (last && !force && routeLevel(last.pos) === routeLevel(pos) && (at - last.at < 1000 || distance < .25)) return;
  if (last && at === last.at && distance === 0) return;
  if (route.points.length >= 7200) { route.truncated = true; return; }
  route.points.push({ at, pos: [...pos], segment: last ? last.segment + (distance > 12 || at - last.at > 10000 ? 1 : 0) : 0 });
}

const labels: Record<string, string> = {
  z_smoke: 'Дым', z_collapse: 'Обвал', z_canopy_danger: 'Повреждённый козырёк',
  z_wire_danger: 'Оборванный провод', z_elevator: 'Лифт', z_safe_area: 'Место сбора',
};
export function routeAreas(chunks: ChunkData[], flags: Set<string>, since: Record<string, number>): RouteArea[] {
  return chunks.flatMap(chunk => chunk.objects.flatMap((o): RouteArea[] => {
    const level = chunk.id.startsWith('e') ? Number(chunk.id.slice(3)) : 0;
    if (o.kind === 'zone' && labels[o.zone] && isObjectActive(o, flags)) {
      return [{ level, min: o.min, max: o.max, label: labels[o.zone], kind: o.zone === 'z_safe_area' ? 'safe' : 'hazard', activeAt: o.when ? since[o.when] ?? 0 : 0 }];
    }
    if (o.kind === 'fx' && o.id === 'gas-cloud' && isObjectActive(o, flags)) {
      return [{ level, min: [o.pos[0]-2,0,o.pos[2]-2], max: [o.pos[0]+2,3,o.pos[2]+2], label: 'Газ', kind: 'hazard', activeAt: since.gas ?? 0 }];
    }
    if (o.kind !== 'box' || o.collide === false || !/wall|stair-west|stair-east/.test(o.id)) return [];
    return [{ level, min: o.pos.map((v,i) => v-o.size[i]/2) as Vec3, max: o.pos.map((v,i) => v+o.size[i]/2) as Vec3, kind: 'wall', label: 'Стена' }];
  }));
}

export function routeAdvice(skill: string): string {
  const advice: Record<string, string> = {
    cover: 'Выбирайте укрытие под прочным столом или у внутренней стены, вдали от окон и шкафов.',
    route: 'При завале используйте переход на 4-м этаже в соседний подъезд.',
    exit: 'Обходите повреждённый козырёк и выходите к месту сбора.',
    elevator: 'Для эвакуации используйте лестницу. О застрявших людях сообщите спасателям.',
    gas: 'При запахе газа избегайте выключателей и источников огня; сообщите об опасности.',
    smoke: 'Выбирайте безопасный маршрут и следуйте подсказкам о защите от дыма.',
    escort: 'Держитесь рядом с сопровождаемым человеком и ведите его к месту сбора.',
  };
  return advice[skill] ?? 'Повторите этот навык по разбору и инструкциям мини-игры.';
}
