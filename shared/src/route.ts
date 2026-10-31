import type { Vec3 } from './world';

/** Game time in milliseconds, coordinates in metres. */
export interface RoutePoint { at: number; pos: Vec3; segment: number }
export interface RouteError { at: number; pos: Vec3; note: string; advice: string }
export interface RoutePlayer { id: string; name: string; points: RoutePoint[]; errors: RouteError[]; truncated: boolean }
export interface RouteArea {
  level: number; min: Vec3; max: Vec3; label: string; kind: 'wall' | 'hazard' | 'safe';
  activeAt?: number;
}
export interface RouteReview {
  players: RoutePlayer[];
  areas: RouteArea[];
  durationMs: number;
}

export function routeLevel(pos: Vec3): number {
  return pos[2] < 0 ? 0 : Math.max(1, Math.min(9, Math.floor((pos[1] + .15) / 3) + 1));
}

/** Sampled distance; discontinuities/reconnections never count as walking. */
export function routeDistance(points: RoutePoint[]): number {
  return points.reduce((sum, p, i) => {
    const prev = points[i - 1];
    return sum + (prev && prev.segment === p.segment ? Math.hypot(...p.pos.map((v, j) => v - prev.pos[j])) : 0);
  }, 0);
}
