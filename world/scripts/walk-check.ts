import { fileURLToPath } from "node:url";
/**
 * npm run walk — проверка мира физикой игрока: пешком (без падений > 0.5 м) от спауна 9-го этажа
 * до выхода из подъезда и детской площадки, с обвалом 4→3 и без. Гонять после правок world/.
 */
import { readFileSync, readdirSync } from "node:fs";
import { isObjectActive, type Aabb, type ChunkData, type Vec3 } from "@game/shared";
import { getColliders } from "../../client/src/world/ChunkView";
import { stepBody, type Body } from "../../client/src/core/physics";
const dir = fileURLToPath(new URL("../chunks/", import.meta.url));
const chunks: ChunkData[] = readdirSync(dir).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));
for (const FLAGS of [["lift_vanya", "neighbor_valentina", "wire"], ["lift_vanya", "neighbor_valentina", "wire", "collapse_f4", "fire_f5"], ["papa_left", "window_broken", "wardrobe_fallen", "balcony_debris", "collapse_f4", "fire_f5", "gas", "spawn_first_aid", "spawn_ladder", "spawn_blankets", "power_on", "spawn_exit"]]) {
  const cl: Aabb[] = chunks.flatMap((c) => getColliders(c, FLAGS));
  const zones: { zone: string; min: Vec3; max: Vec3; chunk: string }[] = [];
  for (const c of chunks) for (const o of c.objects) if (o.kind === "zone" && isObjectActive(o, FLAGS)) zones.push({ zone: o.zone, min: o.min, max: o.max, chunk: c.id });
  const settle = (b: Body) => { for (let i = 0; i < 60 && !(b.grounded && i > 2); i++) stepBody(b, 0, 0, cl, 0.04, { gravity: true, jump: false }); };
  const start = chunks.find((c) => c.id === "e1f9")!.objects.find((o) => o.kind === "spawn")! as { pos: Vec3 };
  const s0: Body = { pos: [...start.pos], vy: 0, grounded: false }; settle(s0);
  const key = (p: Vec3) => `${Math.round(p[0] * 4)},${Math.round(p[1] * 10)},${Math.round(p[2] * 4)}`;
  const seen = new Set([key(s0.pos)]); const q: Vec3[] = [s0.pos]; let drops = 0; const dropAt = new Map<string, number>();
  const reached = new Set<string>();
  while (q.length && seen.size < 400000) {
    const p = q.shift()!;
    for (const z of zones) if (p[0] >= z.min[0] && p[0] <= z.max[0] && p[2] >= z.min[2] && p[2] <= z.max[2] && p[1] + 0.2 >= z.min[1] && p[1] <= z.max[1]) reached.add(`${z.zone}@${z.chunk}`);
    for (const [dx, dz] of [[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]]) {
      const b: Body = { pos: [...p], vy: 0, grounded: true };
      for (let s = 0; s < 5; s++) stepBody(b, dx / 5, dz / 5, cl, 0.01, { gravity: true, jump: false });
      settle(b);
      if (p[1] - b.pos[1] > 0.5) { drops++; const k = `${Math.floor(p[0])},${Math.floor((p[1] + 0.5) / 3) + 1}эт,${Math.floor(p[2])}`; dropAt.set(k, (dropAt.get(k) ?? 0) + 1); continue; }
      if (Math.abs(b.pos[0] - p[0]) + Math.abs(b.pos[2] - p[2]) < 0.05) continue;
      const k = key(b.pos); if (seen.has(k)) continue;
      seen.add(k); q.push(b.pos);
    }
  }
  if(drops > 0 || ![...reached].some(z=>z.startsWith("z_exit_door@")) || ![...reached].some(z=>z.startsWith("z_safe_area@"))) throw new Error("Walk check failed");
  console.log(`\n=== флаги: ${FLAGS.join(",")} — достижимо пешком ${seen.size} точек, мест с падением > 0.5 м: ${drops}`);
  console.log("падения (x,этаж,z):", [...dropAt.entries()].slice(0, 12).map(([k, n]) => `${k}×${n}`).join(" "));
  for (const w of ["z_stairs", "z_balcony", "z_collapse", "z_exit_door", "z_yard", "z_safe_area"]) {
    const r = [...reached].filter((k) => k.startsWith(w + "@")).map((k) => k.split("@")[1]).sort();
    console.log(`  ${w}: ${r.join(" ") || "НЕ ДОСТИЖИМА"}`);
  }
}


