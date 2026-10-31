import type { RoutePoint, Vec3 } from '@game/shared';

/** Keep vertical stairs continuous; split only at actual recording gaps. */
export function routeSegments(points: RoutePoint[], time: number): Vec3[][] {
  const segments: Vec3[][] = [];
  let previous: RoutePoint | undefined;
  for (const point of points) {
    if (point.at > time) continue;
    if (!previous || previous.segment !== point.segment) segments.push([]);
    segments[segments.length - 1].push([point.pos[0], point.pos[1] + .18, point.pos[2]]);
    previous = point;
  }
  return segments;
}
