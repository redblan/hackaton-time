/**
 * Визуальный стиль мира: тёплый «золотой час», мягкая рисованная мультяшность.
 * Всё процедурное: текстуры рисуются в коде, без файлов, поэтому работает офлайн и дёшево для слабых ноутов.
 */
import { CanvasTexture, Color, RepeatWrapping, type Material, type WebGLProgramParametersWithUniforms } from "three";

export const PALETTE = {
  skyTop: "#4f76b5",
  skyHorizon: "#ffb98a",
  sun: "#ffd9a8",
  fog: "#eeb68c",
  hemiSky: "#cfe2ff",
  hemiGround: "#e6ad78",
  rock: "#f2a766",
  rockDark: "#cf7440",
  sand: "#e3a866",
  grass: "#b3c25a",
  pine: "#5fa05c",
  pineLight: "#6fa35a",
  trunk: "#7a4a2b",
};

const NOISE = /* glsl */ `
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm3(vec3 p) { return 0.55 * noise3(p) + 0.3 * noise3(p * 2.1) + 0.15 * noise3(p * 4.3); }
`;

function withWorldPosition(shader: WebGLProgramParametersWithUniforms, paint: string) {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
    .replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      #ifdef USE_INSTANCING
        vWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\nvarying vec3 vWorld;\n${NOISE}`)
    .replace("#include <color_fragment>", `#include <color_fragment>\n${paint}`);
}

/** Стены, полы и мебель: мазки краски и лёгкая теплота снизу, как на рисованной текстуре. */
export function paintSurface(material: Material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPlaster = { value: plasterTexture() };
    shader.fragmentShader = `uniform sampler2D uPlaster;\n${shader.fragmentShader}`;
    withWorldPosition(
      shader,
      `vec3 faceNormal = abs(normalize(cross(dFdx(vWorld), dFdy(vWorld))));
       vec2 plasterUv = (faceNormal.y > 0.5 ? vWorld.xz : faceNormal.x > 0.5 ? vWorld.zy : vWorld.xy) / PLASTER_TILE_M;
       float plaster = texture2D(uPlaster, plasterUv, -0.7).r;
       diffuseColor.rgb *= 0.7 + 0.6 * plaster;
       diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 0.97, 0.86), 0.5);`.replace("PLASTER_TILE_M", PLASTER_TILE_M),
    );
  };
}

/** Размер тайла, м. 1024 пикселя на 1.4 м: вблизи по 1.4 мм на пиксель, стена не расплывается */
export const PLASTER_TILE_M = "1.4";
let plaster: CanvasTexture | null = null;

/** Штукатурка: мазки шпателя, крапинки и волосяные трещины. Один тайл, бесшовный, без файлов. */
export function plasterTexture() {
  if (plaster) return plaster;
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const random = seededRandom(11);
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, size, size);
  /** Рисуем со всеми сдвигами на тайл: что вышло за край, зайдёт с другой стороны */
  const wrapped = (draw: () => void) => {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.save();
        ctx.translate(dx, dy);
        draw();
        ctx.restore();
      }
    }
  };
  ctx.lineCap = "round";
  for (let i = 0; i < 420; i++) {
    const [x, y, angle, length, bend] = [random() * size, random() * size, random() * Math.PI, 60 + random() * 180, (random() - 0.5) * 100];
    const shade = random() < 0.5 ? "255,255,255" : "0,0,0";
    const alpha = 0.02 + random() * 0.04;
    const width = 3 + random() * 16;
    wrapped(() => {
      ctx.strokeStyle = `rgba(${shade},${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(angle) * length * 0.5 - Math.sin(angle) * bend, y + Math.sin(angle) * length * 0.5 + Math.cos(angle) * bend, x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      ctx.stroke();
    });
  }
  for (let i = 0; i < 90000; i++) {
    ctx.fillStyle = `rgba(${random() < 0.55 ? "0,0,0" : "255,255,255"},${0.08 + random() * 0.2})`;
    ctx.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1 + Math.floor(random() * 2), 1 + Math.floor(random() * 2));
  }
  for (let i = 0; i < 7; i++) {
    const points: [number, number][] = [[random() * size, random() * size]];
    for (let k = 0; k < 7; k++) {
      const [px, py] = points[k]!;
      points.push([px + (random() - 0.5) * 68, py + 12 + random() * 36]);
    }
    wrapped(() => {
      ctx.strokeStyle = "rgba(0,0,0,.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      points.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    });
  }
  plaster = new CanvasTexture(canvas);
  plaster.wrapS = plaster.wrapT = RepeatWrapping;
  plaster.anisotropy = 8;
  return plaster;
}

/** Скалы: горизонтальные слои песчаника, как в каньоне. */
export function paintRock(material: Material) {
  const light = new Color(PALETTE.rock);
  const dark = new Color(PALETTE.rockDark);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRockLight = { value: light };
    shader.uniforms.uRockDark = { value: dark };
    shader.fragmentShader = "uniform vec3 uRockLight;\nuniform vec3 uRockDark;\n" + shader.fragmentShader;
    withWorldPosition(
      shader,
      `float warp = fbm3(vWorld * 0.05) * 7.0;
       float layers = sin((vWorld.y + warp) * 0.75) * 0.5 + 0.5;
       float grain = fbm3(vWorld * vec3(0.25, 1.1, 0.25));
       diffuseColor.rgb = mix(uRockDark, uRockLight, smoothstep(0.15, 0.85, layers * 0.65 + grain * 0.5));`,
    );
  };
}

/** Земля вокруг двора: песок с пятнами травы. */
export function paintGround(material: Material) {
  const sand = new Color(PALETTE.sand);
  const grass = new Color(PALETTE.grass);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSand = { value: sand };
    shader.uniforms.uGrass = { value: grass };
    shader.fragmentShader = "uniform vec3 uSand;\nuniform vec3 uGrass;\n" + shader.fragmentShader;
    withWorldPosition(
      shader,
      `float patches = smoothstep(0.42, 0.58, fbm3(vWorld * vec3(0.045, 1.0, 0.045)));
       diffuseColor.rgb = mix(uSand, uGrass, patches) * (0.9 + 0.2 * fbm3(vWorld * 0.6));`,
    );
  };
}

/** Простая функция для детерминированной расстановки декора. */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
