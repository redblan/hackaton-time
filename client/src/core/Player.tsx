/**
 * Игрок от первого лица: мышь (pointer lock) + WASD, гравитация, столкновения по getColliders(),
 * подъём на ступеньки. Здесь же: менеджер чанков, подсказка «E — …», зоны, отправка позиции.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import { Euler, Vector3, type Group } from "three";
import type { Aabb, InteractableId, NpcId, Vec3, ZoneId } from "@game/shared";
import { Character, variantFor } from "../world/Character";
import { getColliders, npcHere } from "../world/ChunkView";
import { carryMaterial, extinguisherGeometry, isExtinguisher } from "../world/decor/Carry";
import { chunkAt, isActive, wantedChunks, movementChunksReady, transitionChunks } from "./chunkMath";
import { HIDE_MS, HIDE_TARGETS, hidePose } from "./hide";
import { local, teleport } from "./local";
import { PHYS, stepBody, type Body } from "./physics";
import { sample } from "./remote";
import { getSocket, sendEvent } from "./net";
import { store, useStore } from "./store";

const EYE = 1.6;
const THIRD_DIST = 3.2;

/** Точка внутри какой-нибудь коробки столкновений (с запасом 0.2 м, чтобы камера не резала стену) */
function insideAny(p: Vector3, cols: Aabb[]) {
  for (const c of cols) {
    if (p.x > c.min[0] - 0.2 && p.x < c.max[0] + 0.2 && p.y > c.min[1] - 0.2 && p.y < c.max[1] + 0.2 && p.z > c.min[2] - 0.2 && p.z < c.max[2] + 0.2) return true;
  }
  return false;
}
const { WALK, RUN } = PHYS;
const SEND_MS = 66; // ~15 Гц
const NPC_TALK_RADIUS = 4;
/**
 * Что сейчас можно делать на E (решение Егора 01.11): двери, люди, выключатель и огнетушитель.
 * + укрытия (с анимацией, core/hide.ts), газ и вызов лифта. Вещи и план дома пока выключены — вернуть: добавить сюда.
 */
const ALLOWED_INTERACTS = new Set<string>([
  "apartment_door",
  "neighbor_door",
  "elevator_call",
  "gas_valve",
  "cover_table",
  "cover_wall",
  "cover_wardrobe",
  "cover_window",
  "cover_run_out",
  "balcony_door",
  "elevator_shaft",
  "light_switch",
  "victim_bleeding",
  "victim_scared",
  "victim_cpr",
  "victim_unconscious",
  "neighbor_leg",
  "brigade",
]);
const PICK_RADIUS = 1.3;

/** Взять огнетушитель / поставить перед собой (положение — всем через prop:move) */
function carry(target: string, pos: Vec3, yaw: number) {
  const st = store.get();
  const me = st.auth?.playerId ?? null;
  if (target.startsWith("pick:")) {
    const id = target.slice(5);
    const chunkId = chunkAt(pos);
    const prop = { id, chunkId, pos: [pos[0], pos[1] + 1, pos[2]] as Vec3, rotY: yaw, holder: me };
    store.set((s) => ({ held: id, props: { ...s.props, [id]: prop } }));
    getSocket()?.emit("prop:move", prop);
  } else if (target === "drop" && st.held) {
    const id = st.held;
    // ставим на пол в 0.6 м перед собой; pos предмета — центр коробки 0.75 м
    const at: Vec3 = [pos[0] - Math.sin(yaw) * 0.6, pos[1] + 0.375, pos[2] - Math.cos(yaw) * 0.6];
    const prop = { id, chunkId: chunkAt(at), pos: at, rotY: yaw, holder: null };
    store.set((s) => ({ held: null, props: { ...s.props, [id]: prop } }));
    getSocket()?.emit("prop:move", prop);
  }
}

const keys = new Set<string>();
const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

export function Player() {
  const chunks = useStore((s) => s.chunks);
  const sensitivity = useStore((s) => s.sensitivity);
  const flags = useStore((s) => s.flags);
  const controls = useRef<{ lock: () => void; unlock: () => void; isLocked: boolean } | null>(null);
  const { camera } = useThree();

  const colliders = useMemo(() => Object.values(chunks).flatMap((c) => getColliders(c, flags)), [chunks, flags]);
  const body = useRef<Body>({ pos: local.pos, vy: 0, grounded: false });
  const lastSafe = useRef<Vec3 | null>(null);
  const waitingAt = useRef<Vec3 | null>(null);
  const timers = useRef({ send: 0, chunks: 0, wanted: "", zones: new Set<ZoneId>() });

  // Клавиатура
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || store.get().minigame) return;
      keys.add(e.code);
      if (e.code === "KeyE" && !e.repeat) {
        const p = store.get().prompt;
        const hidden = store.get().hide;
        if (hidden) {
          // вылезти: обратно на место, откуда залезли
          if (!hidden.out) store.set({ hide: { ...hidden, out: true, since: performance.now() } });
          return;
        }
        if (p && HIDE_TARGETS[p.target]) {
          sendEvent({ type: "interact", target: p.target as InteractableId });
          const pos = body.current.pos;
          const chunk = store.get().chunks[chunkAt(pos)];
          const spot = chunk?.objects.find((o) => o.kind === "interactable" && o.target === p.target);
          const at = spot?.kind === "interactable" ? spot.pos : pos;
          if (chunk) store.set({ hide: { ...hidePose(HIDE_TARGETS[p.target]!, chunk, store.get().flags, pos, at), since: performance.now() } });
          return;
        }
        if (p && (p.target.startsWith("pick:") || p.target === "drop")) {
          carry(p.target, body.current.pos, local.rotY);
          return;
        }
        if (p) sendEvent({ type: "interact", target: p.target as InteractableId });
        // Дверь квартиры и свет — на клиенте (вид), сценарий на сервере получает interact как раньше
        const id = chunkAt(body.current.pos);
        if (p?.target === "apartment_door") store.set((st) => ({ doors: { ...st.doors, [id]: !(st.doors[id] ?? false) } }));
        if (p?.target === "light_switch") store.set((st) => ({ lights: { ...st.lights, [id]: !(st.lights[id] ?? true) } }));
      }
      if (e.code === "KeyC" && !e.repeat && !store.get().typing) store.set((st) => ({ thirdPerson: !st.thirdPerson }));
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const blur = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      keys.clear();
    };
  }, []);

  // Мини-игра или ввод текста — отпускаем мышь
  const busy = useStore((s) => Boolean(s.minigame || s.typing || s.runEnd || s.help));
  useEffect(() => {
    if (busy) {
      controls.current?.unlock();
      keys.clear();
    }
  }, [busy]);

  useFrame((_, rawDt) => {
    // На слабом FPS — несколько подшагов, чтобы не проходить сквозь тонкие стены
    const total = Math.min(rawDt, 0.25);
    const steps = Math.max(1, Math.ceil(total / 0.04));
    for (let i = 0; i < steps; i++) step(total / steps);
    afterStep();
  });

  const step = (dt: number) => {
    const st = store.get();

    if (local.teleport) {
      local.teleport = false;
      body.current = { pos: local.pos, vy: 0, grounded: false };
      camera.rotation.set(0, local.rotY, 0, "YXZ");
    }
    if (!local.ready) return;
    if (st.hide) {
      // спрятался: не ходим; тело — в укрытии (для напарников), по окончании «вылезания» — обратно
      const h = st.hide;
      const done = performance.now() - h.since >= HIDE_MS;
      if (h.out && done) {
        store.set({ hide: null });
        teleport(h.from, local.rotY);
      } else if (!h.out) local.pos = [h.body[0], h.body[1], h.body[2]];
      stepState.current.moving = false;
      return;
    }

    const pos = local.pos;
    const worldHere = movementChunksReady(pos,st.chunks);

    // --- движение ---
    const euler = new Euler().setFromQuaternion(camera.quaternion, "YXZ");
    const yaw = euler.y;
    let fx = 0;
    let fz = 0;
    if (!busy) {
      if (keys.has("KeyW") || keys.has("ArrowUp")) fz -= 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) fz += 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) fx -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) fx += 1;
    }
    const len = Math.hypot(fx, fz) || 1;
    const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? RUN : WALK;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const dx = ((fx * cos + fz * sin) / len) * speed * dt;
    const dz = ((-fx * sin + fz * cos) / len) * speed * dt;
    const moving = fx !== 0 || fz !== 0;

    const b = body.current;
    b.pos = pos;
    const next:Vec3=[pos[0]+dx,pos[1],pos[2]+dz];
    if(!worldHere || !movementChunksReady(next,st.chunks)) {
      waitingAt.current=!worldHere ? [...pos] : next;
      b.vy=0;
      stepState.current.moving=false;
      return;
    }
    waitingAt.current=null;
    stepBody(b, dx, dz, colliders, dt, { gravity: worldHere, jump: keys.has("Space") && !busy });
    if (worldHere) {
      if (b.grounded) lastSafe.current = [pos[0], pos[1], pos[2]];
      if (pos[1] < -30) {
        const back = lastSafe.current ?? [pos[0], 0, pos[2]];
        pos[0] = back[0];
        pos[1] = back[1] + 0.5;
        pos[2] = back[2];
        b.vy = 0;
      }
    }

    stepState.current.moving = moving;
    stepState.current.running = speed === RUN;
  };

  const stepState = useRef({ moving: false, running: false });
  const avatar = useRef<Group>(null);
  const heldRef = useRef<Group>(null);
  const held = useStore((s) => s.held);
  const [selfAnim, setSelfAnim] = useState<"idle" | "walk" | "run">("idle");

  const afterStep = () => {
    if (!local.ready) return;
    const st = store.get();
    const pos = local.pos;
    const yaw = new Euler().setFromQuaternion(camera.quaternion, "YXZ").y;
    const { moving, running } = stepState.current;

    // --- камера + тряска ---
    camera.position.set(pos[0], pos[1] + EYE, pos[2]);
    const hd = st.hide;
    if (hd) {
      // залезаем / вылезаем: камера плавно между «стою» и «в укрытии»
      const k = Math.min(1, (performance.now() - hd.since) / HIDE_MS);
      const e = k * k * (3 - 2 * k);
      const stand = [hd.from[0], hd.from[1] + EYE, hd.from[2]];
      const a = hd.out ? hd.eye : stand;
      const b = hd.out ? stand : hd.eye;
      camera.position.set(a[0]! + (b[0]! - a[0]!) * e, a[1]! + (b[1]! - a[1]!) * e, a[2]! + (b[2]! - a[2]!) * e);
      if (hd.yaw !== null && !hd.out && k < 1) {
        const cur = new Euler().setFromQuaternion(camera.quaternion, "YXZ");
        let d = hd.yaw - cur.y;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        camera.rotation.set(cur.x, cur.y + d * Math.min(1, e * 1.2), 0, "YXZ");
      }
    }
    if (st.thirdPerson) {
      // от третьего лица: камера за спиной и чуть выше; подтягиваем, если упёрлась в стену
      const dir = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const eye = new Vector3(pos[0], pos[1] + EYE + 0.5, pos[2]);
      let d = THIRD_DIST;
      for (; d > 0.5; d -= 0.2) {
        const c = eye.clone().addScaledVector(dir, -d);
        if (!insideAny(c, colliders)) break;
      }
      camera.position.copy(eye.addScaledVector(dir, -d));
    }
    const me = avatar.current;
    if (me) {
      me.visible = st.thirdPerson && !st.hide;
      me.position.set(pos[0], pos[1], pos[2]);
      me.rotation.y = yaw;
      const next = moving ? (running ? "run" : "walk") : "idle";
      if (next !== selfAnim) setSelfAnim(next);
    }
    // огнетушитель в руках: справа внизу перед камерой
    const h = heldRef.current;
    if (h) {
      h.position.set(0.32, -0.62, -0.6).applyQuaternion(camera.quaternion).add(camera.position);
      h.rotation.set(0, yaw + 0.3, 0);
    }
    const q = st.quake;
    if (q) {
      const now = performance.now();
      if (now > q.until) store.set({ quake: null });
      else {
        const a = 0.06 * q.strength;
        camera.position.x += (Math.random() - 0.5) * a;
        camera.position.y += (Math.random() - 0.5) * a;
        camera.position.z += (Math.random() - 0.5) * a;
      }
    }
    local.rotY = yaw;

    const t = timers.current;
    const now = performance.now();

    // --- позиция на сервер ~15 Гц ---
    if (now - t.send > SEND_MS) {
      t.send = now;
      const anim = st.hide && !st.hide.out && st.hide.kind !== "wardrobe" ? "crouch" : moving ? (running ? "run" : "walk") : "idle";
      getSocket()?.emit("player:move", { pos: [pos[0], pos[1], pos[2]], rotY: yaw, anim });
    }

    // Request missing support immediately, even while standing still at a seam.
    const want = waitingAt.current ? transitionChunks(pos,waitingAt.current,st.chunks) : wantedChunks(pos,st.chunks);
    const key = want.join(',');
    if(local.resyncChunks) {local.resyncChunks=false;t.wanted='';}
    if(key!==t.wanted) {t.wanted=key;getSocket()?.emit('chunk:want',{ids:want});}

    // --- подсказки, зоны: 4 раза в секунду ---
    if (now - t.chunks > 250) {
      t.chunks = now;

      let best: { target: string; label: string; d: number } | null = null;
      let npc: { id: NpcId; d: number } | null = null;
      const inZones = new Set<ZoneId>();
      const moving = new Set(st.npcs.map((n) => n.npcId));
      for (const n of st.npcs) {
        const s = sample(`npc:${n.npcId}`);
        if (!s) continue;
        const d = Math.hypot(s.pos[0] - pos[0], s.pos[1] - pos[1], s.pos[2] - pos[2]);
        if (d <= NPC_TALK_RADIUS && (!npc || d < npc.d)) npc = { id: n.npcId, d };
      }
      for (const c of Object.values(st.chunks)) {
        for (const o of c.objects) {
          if (!isActive(o, st.flags)) continue;
          if (o.kind === "interactable") {
            if (!ALLOWED_INTERACTS.has(o.target)) continue;
            const d = Math.hypot(o.pos[0] - pos[0], o.pos[2] - pos[2]);
            if (d <= o.radius && Math.abs(o.pos[1] - pos[1]) < 2 && (!best || d < best.d)) best = { target: o.target, label: o.label, d };
          } else if (o.kind === "prop" && isExtinguisher(o.id) && !st.held) {
            const ps = st.props[o.id];
            if (ps?.holder) continue;
            const at = ps?.pos ?? o.pos;
            const d = Math.hypot(at[0] - pos[0], at[2] - pos[2]);
            if (d <= PICK_RADIUS && Math.abs(at[1] - pos[1]) < 2 && (!best || d < best.d)) best = { target: `pick:${o.id}`, label: "Взять огнетушитель", d };
          } else if (o.kind === "npc" && !moving.has(o.npcId) && npcHere(o, c.id, st.flags)) {
            const d = Math.hypot(o.pos[0] - pos[0], o.pos[1] - pos[1], o.pos[2] - pos[2]);
            if (d <= NPC_TALK_RADIUS && (!npc || d < npc.d)) npc = { id: o.npcId, d };
          } else if (o.kind === "zone") {
            const inside =
              pos[0] >= o.min[0] && pos[0] <= o.max[0] && pos[1] + 0.1 >= o.min[1] && pos[1] <= o.max[1] && pos[2] >= o.min[2] && pos[2] <= o.max[2];
            if (inside) inZones.add(o.zone);
          }
        }
      }
      for (const z of inZones) if (!t.zones.has(z)) sendEvent({ type: "enterZone", zone: z });
      t.zones = inZones;

      if (!best && st.held) best = { target: "drop", label: "Поставить огнетушитель", d: 0 };
      if (st.hide) best = { target: "unhide", label: st.hide.kind === "wardrobe" ? "Вылезти из шкафа" : "Выбраться из укрытия", d: 0 };
      const prompt = best ? { target: best.target, label: best.label } : null;
      if (prompt?.target !== st.prompt?.target || prompt?.label !== st.prompt?.label) store.set({ prompt });
      const near = npc?.id ?? null;
      if (near !== st.nearNpc) store.set({ nearNpc: near });
    }
  };

  return (
    <>
      {held && (
        <group ref={heldRef}>
          <mesh geometry={extinguisherGeometry()} material={carryMaterial} scale={0.6} />
        </group>
      )}
      <group ref={avatar} visible={false}>
        <Character color="#4a7fb5" anim={selfAnim} variant={variantFor(store.get().auth?.playerId ?? "me")} />
      </group>
      <PointerLockControls
      ref={controls as never}
      selector="#scene"
      pointerSpeed={sensitivity}
      onLock={() => store.set({ locked: true })}
      onUnlock={() => store.set({ locked: false })}
    />
    </>
  );
}
