/**
 * Переносимые предметы (G11): E взять и положить, ЛКМ бросить. Предмет может уйти из своего чанка,
 * поэтому они живут здесь, а не в ChunkView. Все рисуются одним инстансом: вид пока коробка цвета `color`.
 * Кто несёт или бросил, тот считает физику и шлёт `prop:move`; остальные плавно идут за ним.
 * Огнетушитель носит Player (decor/Carry), здесь только тушение огня, пока он в руках.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { CanvasTexture, Object3D, SRGBColorSpace, Vector3, type InstancedMesh } from "three";
import type { PropState, Vec3, WorldObject } from "@game/shared";
import { chunkAt, isActive } from "../../core/chunkMath";
import { local } from "../../core/local";
import { getSocket } from "../../core/net";
import { store, useStore } from "../../core/store";
import { getColliders } from "../ChunkView";
import { isExtinguisher } from "../decor/Carry";
import { FxParticles } from "../Effects";
import { stepProp, throwVelocity, type PropBody } from "./propPhysics";

type PropObject = Extract<WorldObject, { kind: "prop" }>;

interface Live {
  id: string;
  label: string;
  mass: number;
  size: Vec3;
  rotY: number;
  body: PropBody;
  /** Куда идти вслед за чужим предметом */
  target: Vec3 | null;
  holder: string | null;
  /** Брошен мной: считаю физику */
  flying: boolean;
}

const CAPACITY = 256;
const REACH = 1.8;
const SEND_MS = 100;
const FIRE_RADIUS = 2.6;
const EXTINGUISH_S = 1.5;
const FOLLOW_SPEED = 12;
const DEFAULT_SIZE: Vec3 = [0.3, 0.3, 0.3];

let cardboardMap: CanvasTexture | null = null;

/** Картон: бежевая основа, гофра и полоса скотча. Один на все коробки. */
function cardboard() {
  if (cardboardMap) return cardboardMap;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#d2b48c";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "rgba(120,86,50,.1)";
  for (let y = 0; y < 256; y += 6) ctx.fillRect(0, y, 256, 2);
  ctx.fillStyle = "rgba(232,212,176,.75)";
  ctx.fillRect(106, 0, 44, 256);
  ctx.strokeStyle = "rgba(96,68,40,.55)";
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, 256, 256);
  cardboardMap = new CanvasTexture(canvas);
  cardboardMap.colorSpace = SRGBColorSpace;
  return cardboardMap;
}

const box = new Object3D();
const forward = new Vector3();

function toLive(o: PropObject): Live {
  return {
    id: o.id,
    label: o.label,
    mass: o.mass ?? 1,
    size: o.size,
    rotY: o.rotY ?? 0,
    body: {
      pos: [o.pos[0], o.pos[1], o.pos[2]],
      vel: [0, 0, 0],
      half: [o.size[0] / 2, o.size[1] / 2, o.size[2] / 2],
      bounce: o.bounce ?? 0.1,
      resting: true,
    },
    target: null,
    holder: null,
    flying: false,
  };
}

function send(prop: Live, holder: string | null, vel?: Vec3) {
  const { pos } = prop.body;
  const state: PropState = { id: prop.id, chunkId: chunkAt(pos), pos: [pos[0], pos[1], pos[2]], rotY: prop.rotY, holder };
  getSocket()?.emit("prop:move", vel ? { ...state, vel } : state);
}

function nearestProp(props: Iterable<Live>) {
  const [x, y, z] = local.pos;
  let best: Live | null = null;
  let bestDistance: number = REACH;
  for (const prop of props) {
    if (prop.holder) continue;
    const [px, py, pz] = prop.body.pos;
    const distance = Math.hypot(px - x, pz - z);
    if (distance < bestDistance && py > y - 0.5 && py < y + 2) {
      best = prop;
      bestDistance = distance;
    }
  }
  return best;
}

const flagFires = () => {
  const { chunks, flags } = store.get();
  if (flags.includes("fire_out")) return [];
  return Object.values(chunks).flatMap((c) => c.objects.filter((o) => o.kind === "fx" && o.fx === "fire" && isActive(o, flags)));
};

export function Props() {
  const chunks = useStore((s) => s.chunks);
  const flags = useStore((s) => s.flags);
  const remote = useStore((s) => s.props);
  const playerId = useStore((s) => s.auth?.playerId ?? null);
  const camera = useThree((s) => s.camera);
  const mesh = useRef<InstancedMesh>(null);
  const live = useRef(new Map<string, Live>());
  const carried = useRef<Live | null>(null);
  const sentAt = useRef(0);
  const spraying = useRef(0);
  const [spray, setSpray] = useState<Vec3 | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const doors = useStore((s) => s.doors);
  const colliders = useMemo(() => Object.values(chunks).flatMap((c) => getColliders(c, flags, doors)), [chunks, flags, doors]);

  // Предметы из чанков. Убранные патчем исчезают, чужой чанк не трогает предмет, который несут
  useEffect(() => {
    const seen = new Set<string>();
    for (const chunk of Object.values(chunks)) {
      for (const o of chunk.objects) {
        if (o.kind !== "prop" || isExtinguisher(o.id) || !isActive(o, flags)) continue;
        seen.add(o.id);
        if (!live.current.has(o.id)) live.current.set(o.id, toLive(o));
      }
    }
    for (const [id, prop] of live.current) {
      const home = Object.values(chunks).some((c) => c.objects.some((o) => o.id === id));
      if (home && !seen.has(id) && !prop.holder) live.current.delete(id);
    }
  }, [chunks, flags]);

  // Чужие предметы по сети
  useEffect(() => {
    for (const state of Object.values(remote)) {
      if (state.holder === playerId || carried.current?.id === state.id || isExtinguisher(state.id)) continue;
      let prop = live.current.get(state.id);
      if (!prop) {
        prop = toLive({ id: state.id, kind: "prop", pos: state.pos, size: DEFAULT_SIZE, label: "Предмет" });
        live.current.set(state.id, prop);
      }
      prop.target = state.pos;
      prop.rotY = state.rotY;
      prop.holder = state.holder;
      prop.flying = false;
    }
  }, [remote, playerId]);

  const release = (vel: Vec3) => {
    const prop = carried.current;
    if (!prop) return;
    carried.current = null;
    prop.holder = null;
    prop.flying = true;
    prop.body.vel = vel;
    prop.body.resting = false;
    send(prop, null, vel);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const st = store.get();
      if (e.code !== "KeyE" || e.repeat || st.minigame || st.typing) return;
      if (carried.current) {
        e.stopImmediatePropagation(); // иначе Player заодно нажмёт на интерактив рядом
        release([0, 0, 0]);
        return;
      }
      if (st.prompt || !local.ready) return;
      const prop = nearestProp(live.current.values());
      if (!prop) return;
      carried.current = prop;
      prop.holder = store.get().auth?.playerId ?? "me";
      prop.flying = false;
      prop.target = null;
      send(prop, prop.holder);
    };
    const mouse = (e: MouseEvent) => {
      const prop = carried.current;
      if (e.button !== 0 || !prop || !store.get().locked) return;
      camera.getWorldDirection(forward);
      release(throwVelocity([forward.x, forward.y, forward.z], prop.mass));
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("mousedown", mouse);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("mousedown", mouse);
    };
  }, [camera]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const now = performance.now();
    const due = now - sentAt.current > SEND_MS;
    if (due) sentAt.current = now;
    const held = carried.current;

    if (held) {
      camera.getWorldDirection(forward);
      const { pos } = held.body;
      pos[0] = camera.position.x + forward.x * 0.75;
      pos[1] = camera.position.y + forward.y * 0.75 - 0.35;
      pos[2] = camera.position.z + forward.z * 0.75;
      held.rotY = local.rotY;
      if (due) send(held, held.holder);
    }

    let index = 0;
    const loaded = store.get().chunks;
    for (const prop of live.current.values()) {
      if (prop.flying) {
        stepProp(prop.body, colliders, delta);
        if (prop.body.resting) {
          prop.flying = false;
          send(prop, null);
        } else if (due) send(prop, null, prop.body.vel);
      } else if (prop.target) {
        const k = 1 - Math.exp(-FOLLOW_SPEED * delta);
        prop.body.pos = prop.body.pos.map((value, i) => value + (prop.target![i]! - value) * k) as Vec3;
      }
      if (index >= CAPACITY) continue;
      const shown = Boolean(loaded[chunkAt(prop.body.pos)]);
      box.position.set(...prop.body.pos);
      box.rotation.y = prop.rotY;
      box.scale.set(shown ? prop.size[0] : 0, shown ? prop.size[1] : 0, shown ? prop.size[2] : 0);
      box.updateMatrix();
      mesh.current?.setMatrixAt(index, box.matrix);
      index++;
    }
    const markers = mesh.current;
    if (markers) {
      markers.count = index;
      markers.instanceMatrix.needsUpdate = true;
    }

    // Огнетушитель: поднёс к огню и подержал
    let fire: Vec3 | null = null;
    const inHands = store.get().held;
    if (inHands && isExtinguisher(inHands)) {
      const [x, y, z] = local.pos;
      for (const o of flagFires()) {
        if (o.kind === "fx" && Math.hypot(o.pos[0] - x, o.pos[1] - y, o.pos[2] - z) < FIRE_RADIUS) fire = o.pos;
      }
    }
    spraying.current = fire ? spraying.current + delta : 0;
    if (fire && spraying.current >= EXTINGUISH_S) {
      spraying.current = 0;
      fire = null;
      // TODO(G13): пока только у этого игрока. Комнате флаг поставит сценарий, когда Егор добавит событие
      store.set((st) => ({ flags: [...st.flags, "fire_out"] }));
    }
    if (fire !== spray) setSpray(fire);

    if (!due) return;
    const st = store.get();
    const near = held || st.prompt || !local.ready ? null : nearestProp(live.current.values());
    const text = fire ? "Тушим огонь…" : held ? `E — положить · ЛКМ — бросить: ${held.label}` : near ? `E — взять: ${near.label}` : null;
    if (text !== hint) setHint(text);
  });

  return (
    <>
      <instancedMesh ref={mesh} args={[undefined, undefined, CAPACITY]} frustumCulled={false} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial map={cardboard()} roughness={0.85} />
      </instancedMesh>
      {spray && <FxParticles object={{ id: "extinguisher-spray", kind: "fx", fx: "dust", pos: spray, size: 1.4 }} />}
      {hint && (
        <Html fullscreen zIndexRange={[6, 0]} style={{ pointerEvents: "none" }}>
          <div style={{ position: "absolute", left: "50%", bottom: "16%", transform: "translateX(-50%)", padding: "8px 16px", borderRadius: 10, background: "rgba(16,24,32,.78)", color: "#fff", font: "600 16px sans-serif", whiteSpace: "nowrap" }}>
            {hint}
          </div>
        </Html>
      )}
    </>
  );
}
