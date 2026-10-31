/**
 * Игрок от первого лица: мышь (pointer lock) + WASD, гравитация, столкновения по getColliders(),
 * подъём на ступеньки. Здесь же: менеджер чанков, подсказка «E — …», зоны, отправка позиции.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import { Euler } from "three";
import type { InteractableId, NpcId, Vec3, ZoneId } from "@game/shared";
import { getColliders } from "../world/ChunkView";
import { chunkAt, isActive, wantedChunks } from "./chunkMath";
import { local } from "./local";
import { PHYS, stepBody, type Body } from "./physics";
import { sample } from "./remote";
import { getSocket, sendEvent } from "./net";
import { store, useStore } from "./store";

const EYE = 1.6;
const { WALK, RUN } = PHYS;
const SEND_MS = 66; // ~15 Гц
const NPC_TALK_RADIUS = 4;

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
  const timers = useRef({ send: 0, chunks: 0, wanted: "", zones: new Set<ZoneId>() });

  // Клавиатура
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || store.get().minigame) return;
      keys.add(e.code);
      if (e.code === "KeyE" && !e.repeat) {
        const p = store.get().prompt;
        if (p) sendEvent({ type: "interact", target: p.target as InteractableId });
        // Дверь квартиры открывается/закрывается на клиенте (вид), сценарий на сервере получает interact как раньше
        if (p?.target === "apartment_door") {
          const id = chunkAt(body.current.pos);
          store.set((st) => ({ doors: { ...st.doors, [id]: !(st.doors[id] ?? true) } }));
        }
      }
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

    const pos = local.pos;
    const curChunk = chunkAt(pos);
    const worldHere = Boolean(st.chunks[curChunk]);

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

  const afterStep = () => {
    if (!local.ready) return;
    const st = store.get();
    const pos = local.pos;
    const yaw = new Euler().setFromQuaternion(camera.quaternion, "YXZ").y;
    const { moving, running } = stepState.current;

    // --- камера + тряска ---
    camera.position.set(pos[0], pos[1] + EYE, pos[2]);
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
      getSocket()?.emit("player:move", { pos: [pos[0], pos[1], pos[2]], rotY: yaw, anim: moving ? (running ? "run" : "walk") : "idle" });
    }

    // --- менеджер чанков, подсказки, зоны: 4 раза в секунду ---
    if (now - t.chunks > 250) {
      t.chunks = now;
      const want = wantedChunks(pos, st.chunks);
      const key = want.join(",");
      if (local.resyncChunks) {
        local.resyncChunks = false;
        t.wanted = "";
      }
      if (key !== t.wanted) {
        t.wanted = key;
        getSocket()?.emit("chunk:want", { ids: want });
      }

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
            const d = Math.hypot(o.pos[0] - pos[0], o.pos[2] - pos[2]);
            if (d <= o.radius && Math.abs(o.pos[1] - pos[1]) < 2 && (!best || d < best.d)) best = { target: o.target, label: o.label, d };
          } else if (o.kind === "npc" && !moving.has(o.npcId)) {
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

      const prompt = best ? { target: best.target, label: best.label } : null;
      if (prompt?.target !== st.prompt?.target || prompt?.label !== st.prompt?.label) store.set({ prompt });
      const near = npc?.id ?? null;
      if (near !== st.nearNpc) store.set({ nearNpc: near });
    }
  };

  return (
    <PointerLockControls
      ref={controls as never}
      selector="#scene"
      pointerSpeed={sensitivity}
      onLock={() => store.set({ locked: true })}
      onUnlock={() => store.set({ locked: false })}
    />
  );
}
