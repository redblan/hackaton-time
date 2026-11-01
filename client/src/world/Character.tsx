/**
 * Жители ITHappy при локальной установке; KayKit (CC0, N5) — запасной набор.
 * На каждый экземпляр свой скелет и микшер, неизменяемые материалы переиспользуются.
 * Положением управляет клиент или сервер, здесь только вид и анимация.
 */
import { Suspense, useEffect, useMemo, useRef } from "react";
import { useAnimations, useGLTF } from "@react-three/drei";
import { Box3, Color, Vector3, type Group, type Material, type Mesh, type MeshStandardMaterial } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ResidentModel, residentModelUrl } from './ResidentModel';
import { residentFor, type Resident } from './characterPresets';

const MODELS = {
  mage: "/assets/characters/mage.glb",
  rogue: "/assets/characters/rogue.glb",
  knight: "/assets/characters/knight.glb",
  barbarian: "/assets/characters/barbarian.glb",
};

type LegacyVariant = keyof typeof MODELS;
export type Variant = LegacyVariant | Resident;
const VARIANTS = Object.keys(MODELS) as LegacyVariant[];

/** Кто как выглядит: у каждого NPC своя фигура, а не только цвет. */
const NPC_VARIANTS: Record<string, LegacyVariant> = {
  papa: "knight", // мужская фигура (rogue — женская)
  mihalych: "barbarian",
  vanya: "mage",
  valentina: "mage",
  gromov: "knight",
  dispatcher: "knight",
  victim_bleeding: "barbarian", // «у мужчины кровотечение»
  victim_cpr: "barbarian",
  victim_unconscious: "knight",
  victim_scared: "mage",
  neighbor_leg: "barbarian",
};
type Anim = "idle" | "walk" | "run";
type Pose = "stand" | "lie" | "sit";

const GAME_HEIGHT = 1.7;
const BODY_PARTS = /_(Arm|Body|Head|Leg)/;
/** Доля цвета в оттенке: текстура умножается на него, чистый цвет сделал бы модель тёмной. */
const TINT = 0.3;

const CLIPS: Record<Anim, string> = { idle: "Idle", walk: "Walking_A", run: "Running_A" };
const POSE_CLIPS: Partial<Record<Pose, string>> = { lie: "Lie_Idle", sit: "Sit_Floor_Idle" };

const NPC_COLORS: Record<string, string> = {
  papa: "#3f6fa8",
  mihalych: "#7c8f4a",
  vanya: "#c95a4a",
  valentina: "#a85c94",
  gromov: "#d9682b",
  dispatcher: "#4a8a94",
};

export const npcColor = (npcId: string) => NPC_COLORS[npcId] ?? "#c9844a";
export const npcVariant = (npcId: string): Variant => residentModelUrl ? residentFor(npcId) : NPC_VARIANTS[npcId] ?? variantFor(npcId);

/** Модель по строке (цвет или id игрока): один и тот же человек всегда выглядит одинаково. */
export function variantFor(key: string): Variant {
  if (residentModelUrl) return residentFor(key);
  const sum = [...key].reduce((total, char) => total + char.charCodeAt(0), 0);
  return VARIANTS[sum % VARIANTS.length]!;
}

/**
 * Один материал на текстуру и цвет, навсегда: цветов мало, а с последним персонажем
 * three удалил бы шейдер и собирал бы его заново на следующем этаже, это полсекунды зависания.
 */
const tinted = new Map<string, MeshStandardMaterial>();

function tintMaterial(material: Material, color: Color) {
  const key = `${material.uuid}:${color.getHexString()}`;
  let copy = tinted.get(key);
  if (!copy) {
    copy = material.clone() as MeshStandardMaterial;
    copy.color = new Color("#ffffff").lerp(color, TINT);
    tinted.set(key, copy);
  }
  return copy;
}

function Model({ color, anim, pose, variant }: { color: string; anim: Anim; pose: Pose; variant: LegacyVariant }) {
  const root = useRef<Group>(null);
  const { scene, animations } = useGLTF(MODELS[variant], false, false);
  const { actions } = useAnimations(animations, root);

  const { body, scale, offset } = useMemo(() => {
    const body = cloneSkeleton(scene);
    const tint = new Color(color);
    // Шляпы, плащи и оружие фэнтезийных костюмов жильцам дома не нужны.
    const extras: Mesh[] = [];
    body.traverse((node) => {
      if ((node as Mesh).isMesh && !BODY_PARTS.test(node.name)) extras.push(node as Mesh);
    });
    extras.forEach((mesh) => mesh.removeFromParent());
    body.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => tintMaterial(m, tint))
        : tintMaterial(mesh.material, tint);
    });
    const box = new Box3().setFromObject(body);
    const size = box.getSize(new Vector3());
    const scale = GAME_HEIGHT / Math.max(size.y, 0.001);
    return { body, scale, offset: -box.min.y * scale };
  }, [scene, color]);

  const clip = POSE_CLIPS[pose] ?? CLIPS[anim];
  useEffect(() => {
    const action = actions[clip];
    if (!action) return;
    action.reset().fadeIn(0.2).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [actions, clip]);

  return (
    // Модели смотрят на +z, а в игре rotY = 0 это взгляд на -z.
    <group ref={root} rotation-y={Math.PI} position-y={offset} scale={scale}>
      <primitive object={body} />
    </group>
  );
}

export function Character(props: { color: string; anim?: Anim; pose?: Pose; variant?: Variant }) {
  const { color, anim = "idle", pose = "stand", variant } = props;
  const selected = variant ?? variantFor(color);
  const resident = !(selected in MODELS) && residentModelUrl;
  const fallback = selected in MODELS ? selected as LegacyVariant : VARIANTS[0]!;
  return (
    <Suspense fallback={null}>
      {resident
        ? <ResidentModel key={`${selected}:${pose}`} variant={selected as Resident} anim={anim} pose={pose} />
        : <Model color={color} anim={anim} pose={pose} variant={fallback} />}
    </Suspense>
  );
}

if (residentModelUrl) useGLTF.preload(residentModelUrl, false, false);
else for (const url of Object.values(MODELS)) useGLTF.preload(url, false, false);
