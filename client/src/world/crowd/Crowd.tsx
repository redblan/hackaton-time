/**
 * Толпа чанка (G12): `kind: "crowd"` — люди (Character) и животные (animals.ts).
 * Поведение — behavior.ts, на клиенте, без сервера. Позиции и анимация пишутся в three-объекты
 * в useFrame, React перерисовывается только при смене анимации человека.
 * Дальше 25 м от камеры — не анимируем. Людей в чанке рисуем не больше MAX_PEOPLE.
 */
import { useMemo, useRef, useState } from "react";
import { useFrame, type RootState } from "@react-three/fiber";
import type { Group } from "three";
import type { Vec3, WorldObject } from "@game/shared";
import { local } from "../../core/local";
import { sample } from "../../core/remote";
import { store } from "../../core/store";
import { Character, variantFor } from "../Character";
import { animalColor, animalMaterial, animalModel, type AnimalType } from "./animals";
import { initState, stepCrowd, type Actor, type CrowdObject, type CrowdInput } from "./behavior";

const FAR = 25;
const MAX_PEOPLE = 15;
const SPEAK_MS = 3000;
const PEOPLE_COLORS = ["#5b7fa6", "#a65b5b", "#6f9a5a", "#b08a4a", "#7a6aa8", "#4a8a8a"];

// ---- игроки рядом: собираются один раз за кадр на всю толпу ----
let framesAt = -1;
let actors: Actor[] = [];
const last = new Map<string, { pos: Vec3; t: number; speed: number }>();
const heard = new Map<string, number>(); // имя → когда говорил (performance.now)
let lastChatKey = 0;
let lastLineKey = 0;
let myHeardAt = 0;
let primed = false;

function speedOf(id: string, pos: Vec3, now: number) {
  const prev = last.get(id);
  let speed = prev?.speed ?? 0;
  if (prev && now - prev.t > 30) {
    const v = Math.hypot(pos[0] - prev.pos[0], pos[2] - prev.pos[2]) / ((now - prev.t) / 1000);
    speed = speed * 0.5 + v * 0.5;
  }
  if (!prev || now - prev.t > 30) last.set(id, { pos: [pos[0], pos[1], pos[2]], t: now, speed });
  return speed;
}

function collectActors(state: RootState, now: number): Actor[] {
  const st = store.get();
  if (!primed) {
    // старые сообщения на входе в чанк не считаются «только что сказал»
    primed = true;
    lastChatKey = st.chat.at(-1)?.key ?? 0;
    lastLineKey = st.npcLines.at(-1)?.key ?? 0;
  }
  // новые сообщения: кто говорил (рация — по имени), и реплика NPC мне
  for (const m of st.chat) if (m.key > lastChatKey) heard.set(m.from, now);
  lastChatKey = st.chat.at(-1)?.key ?? lastChatKey;
  const line = st.npcLines.at(-1);
  if (line && line.key !== lastLineKey) {
    lastLineKey = line.key;
    myHeardAt = now;
  }
  const out: Actor[] = [];
  // мой игрок; в песочнице (без игрока) — камера
  const cam = state.camera.position;
  const me: Vec3 = local.ready ? local.pos : [cam.x, cam.y - 1.6, cam.z];
  out.push({ pos: me, speed: speedOf("me", me, now), speaking: st.typing || now - myHeardAt < SPEAK_MS });
  for (const p of st.others) {
    const s = sample(p.id, now);
    if (!s) continue;
    out.push({ pos: s.pos, speed: speedOf(p.id, s.pos, now), speaking: now - (heard.get(p.name) ?? -1e9) < SPEAK_MS });
  }
  return out;
}

function frameInput(state: RootState, delta: number): CrowdInput {
  const now = performance.now();
  if (framesAt !== state.clock.elapsedTime) {
    framesAt = state.clock.elapsedTime;
    actors = collectActors(state, now);
  }
  const q = store.get().quake;
  return { actors, quake: !!q && q.until > now, dt: Math.min(delta, 0.1) };
}

const farFromCamera = (state: RootState, x: number, z: number) =>
  Math.hypot(state.camera.position.x - x, state.camera.position.z - z) > FAR;

// ---- люди ----
function Person({ object }: { object: CrowdObject }) {
  const group = useRef<Group>(null);
  const s = useMemo(() => initState(object), [object]);
  const [look, setLook] = useState<{ anim: "idle" | "walk" | "run"; crouch: boolean }>({ anim: "idle", crouch: false });
  const color = object.color ?? PEOPLE_COLORS[object.seed % PEOPLE_COLORS.length]!;

  useFrame((state, delta) => {
    const g = group.current;
    if (!g || farFromCamera(state, s.x, s.z)) return;
    stepCrowd(object, s, frameInput(state, delta), state.clock.elapsedTime);
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.rotY;
    if (s.anim !== look.anim || s.crouch !== look.crouch) setLook({ anim: s.anim, crouch: s.crouch });
  });

  return (
    <group ref={group} position={object.pos}>
      <Character color={color} anim={look.anim} pose={look.crouch ? "sit" : "stand"} variant={variantFor(`crowd:${object.seed}`)} />
    </group>
  );
}

// ---- животные ----
function Animal({ object }: { object: CrowdObject }) {
  const type = object.type as AnimalType;
  const model = animalModel(type);
  const material = animalMaterial(animalColor(type, object.seed, object.color));
  const s = useMemo(() => initState(object), [object]);
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const tail = useRef<Group>(null);
  const legs = useRef<(Group | null)[]>([]);
  const wings = useRef<(Group | null)[]>([]);
  const phase = (object.seed % 97) * 0.37;

  useFrame((state, delta) => {
    const r = root.current;
    if (!r || farFromCamera(state, s.x, s.z)) return;
    const t = state.clock.elapsedTime + phase;
    stepCrowd(object, s, frameInput(state, delta), t);
    const flying = s.fly > 0.2;
    const gait = s.anim === "run" ? 16 : s.anim === "walk" ? 9 : 0;
    // корпус: позиция, поворот, подпрыгивание на ходу, голубь в полёте покачивается
    r.position.set(s.x, s.y + (gait ? Math.abs(Math.sin(t * gait)) * 0.015 : 0) + (flying ? Math.sin(t * 3) * 0.08 : 0), s.z);
    r.rotation.y = s.rotY;
    if (head.current) {
      head.current.rotation.y = s.headYaw;
      // голубь кивает на ходу и клюёт стоя
      head.current.rotation.x = type === "pigeon" && !flying ? (gait ? Math.sin(t * gait) * 0.25 : Math.max(0, Math.sin(t * 1.3 + phase)) * 0.6) : 0;
    }
    if (tail.current) {
      // собака виляет быстрее, если рядом кто-то смотрит на неё
      const wag = type === "dog" ? 9 + (Math.abs(s.headYaw) > 0.05 ? 6 : 0) : 2.2;
      tail.current.rotation.y = Math.sin(t * wag) * (type === "dog" ? 0.6 : 0.35);
    }
    legs.current.forEach((leg, i) => {
      if (!leg) return;
      const diag = i === 0 || i === 3 ? 0 : Math.PI; // шаг по диагонали
      leg.rotation.x = gait ? Math.sin(t * gait + diag) * 0.6 : 0;
    });
    wings.current.forEach((wing, i) => {
      if (!wing) return;
      const flap = flying ? Math.sin(t * 22) * 0.9 + 0.2 : -0.05;
      wing.rotation.z = i === 0 ? -flap : flap;
    });
  });

  return (
    <group ref={root} position={object.pos}>
      <mesh geometry={model.body.geometry} material={material} castShadow />
      <group ref={head} position={model.head.at}>
        <mesh geometry={model.head.geometry} material={material} />
      </group>
      {model.tail && (
        <group ref={tail} position={model.tail.at}>
          <mesh geometry={model.tail.geometry} material={material} />
        </group>
      )}
      {model.legs.map((p, i) => (
        <group key={i} ref={(g) => void (legs.current[i] = g)} position={p.at}>
          <mesh geometry={p.geometry} material={material} />
        </group>
      ))}
      {model.wings.map((p, i) => (
        <group key={i} ref={(g) => void (wings.current[i] = g)} position={p.at}>
          <mesh geometry={p.geometry} material={material} />
        </group>
      ))}
    </group>
  );
}

/** Толпа чанка. `objects` — все объекты чанка (лишние отфильтруются), `origin` — не нужен: координаты мировые. */
export function Crowd({ objects }: { objects: WorldObject[]; origin?: Vec3 }) {
  const crowd = useMemo(() => {
    const all = objects.filter((o): o is CrowdObject => o.kind === "crowd");
    const people = all.filter((o) => o.type === "person").slice(0, MAX_PEOPLE);
    return [...people, ...all.filter((o) => o.type !== "person")];
  }, [objects]);
  if (!crowd.length) return null;
  return (
    <group name="crowd">
      {crowd.map((o) => (o.type === "person" ? <Person key={o.id} object={o} /> : <Animal key={o.id} object={o} />))}
    </group>
  );
}
