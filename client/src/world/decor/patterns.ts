/**
 * Процедурные «текстуры» без файлов: обои (полоски, горошек, ромбы, цветочки),
 * кирпичная кладка и паркет. Узор считается по мировым координатам в шейдере,
 * поэтому панели любого размера сходятся без швов, а в памяти — ни одной текстуры.
 */
import { Color, MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from "three";
import type { WallpaperPattern } from "./themes";

const PATTERN_ID: Record<WallpaperPattern, number> = { plain: 0, stripes: 1, dots: 2, diamonds: 3, floral: 4 };

const COMMON = /* glsl */ `
  varying vec3 vWorldPos;
  float hashP(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

function withWorld(shader: WebGLProgramParametersWithUniforms, uniformsDecl: string, paint: string) {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;")
    .replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      #ifdef USE_INSTANCING
        vWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${COMMON}\n${uniformsDecl}`)
    .replace("#include <color_fragment>", `#include <color_fragment>\n${paint}`);
}

/** Обои: base — фон, accent — узор. Горизонталь = x + z (панели стоят вдоль одной из осей). */
export function wallpaperMaterial(base: string, accent: string, pattern: WallpaperPattern) {
  const m = new MeshStandardMaterial({ roughness: 0.92, color: "#ffffff" });
  const uBase = { value: new Color(base) };
  const uAccent = { value: new Color(accent) };
  const uPattern = { value: PATTERN_ID[pattern] };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBase = uBase;
    shader.uniforms.uAccent = uAccent;
    shader.uniforms.uPattern = uPattern;
    withWorld(
      shader,
      "uniform vec3 uBase; uniform vec3 uAccent; uniform int uPattern;",
      /* glsl */ `
      float u = vWorldPos.x + vWorldPos.z;
      float v = vWorldPos.y;
      float k = 0.0;
      if (uPattern == 1) {
        k = smoothstep(0.42, 0.5, abs(fract(u * 3.0) - 0.5)) * 0.9;
      } else if (uPattern == 2) {
        vec2 c = vec2(fract(u * 4.0), fract(v * 4.0)) - 0.5;
        k = 1.0 - smoothstep(0.1, 0.16, length(c));
      } else if (uPattern == 3) {
        vec2 c = abs(vec2(fract(u * 2.5), fract(v * 2.5)) - 0.5);
        float d = c.x + c.y;
        k = smoothstep(0.26, 0.3, d) * (1.0 - smoothstep(0.34, 0.38, d));
      } else if (uPattern == 4) {
        vec2 cell = floor(vec2(u * 2.2, v * 2.2));
        vec2 c = vec2(fract(u * 2.2), fract(v * 2.2)) - 0.5 + (vec2(hashP(cell), hashP(cell + 7.0)) - 0.5) * 0.3;
        float petals = 0.0;
        for (int i = 0; i < 5; i++) {
          float a = float(i) * 1.2566;
          petals += 1.0 - smoothstep(0.05, 0.09, length(c - vec2(cos(a), sin(a)) * 0.09));
        }
        k = clamp(petals, 0.0, 1.0) * 0.85 + (1.0 - smoothstep(0.03, 0.05, length(c))) * 0.4;
      }
      float dirt = 0.94 + 0.06 * hashP(floor(vWorldPos.xz * 3.0) + floor(v * 3.0));
      diffuseColor.rgb = mix(uBase, uAccent, k) * dirt;
      `,
    );
  };
  return m;
}

/** Кирпич/камень: кладка со смещением рядов, каждый кирпич чуть своего оттенка. */
export function brickMaterial(brick: string, mortar: string) {
  const m = new MeshStandardMaterial({ roughness: 0.95, color: "#ffffff" });
  const uBrick = { value: new Color(brick) };
  const uMortar = { value: new Color(mortar) };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBrick = uBrick;
    shader.uniforms.uMortar = uMortar;
    withWorld(
      shader,
      "uniform vec3 uBrick; uniform vec3 uMortar;",
      /* glsl */ `
      float u = vWorldPos.x + vWorldPos.z;
      float v = vWorldPos.y;
      float row = floor(v / 0.22);
      float uu = u / 0.5 + (mod(row, 2.0) < 1.0 ? 0.0 : 0.5);
      vec2 cell = vec2(floor(uu), row);
      vec2 f = vec2(fract(uu), fract(v / 0.22));
      float edge = min(min(f.x, 1.0 - f.x) * 0.5, min(f.y, 1.0 - f.y) * 0.22);
      float isMortar = 1.0 - smoothstep(0.012, 0.03, edge);
      float tone = 0.78 + 0.44 * hashP(cell);
      diffuseColor.rgb = mix(uBrick * tone, uMortar, isMortar);
      `,
    );
  };
  return m;
}

/** Паркет «ёлочкой» или доски: base/alt — два оттенка планок. */
export function parquetMaterial(base: string, alt: string, planks = true) {
  const m = new MeshStandardMaterial({ roughness: 0.75, color: "#ffffff" });
  const uBase = { value: new Color(base) };
  const uAlt = { value: new Color(alt) };
  const uPlanks = { value: planks ? 1 : 0 };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBase = uBase;
    shader.uniforms.uAlt = uAlt;
    shader.uniforms.uPlanks = uPlanks;
    withWorld(
      shader,
      "uniform vec3 uBase; uniform vec3 uAlt; uniform int uPlanks;",
      /* glsl */ `
      vec2 q = vWorldPos.xz;
      float k;
      if (uPlanks == 1) {
        float row = floor(q.x / 0.18);
        float seg = floor(q.y / 1.2 + mod(row, 3.0) * 0.33);
        k = hashP(vec2(row, seg));
        float gap = min(fract(q.x / 0.18), fract(q.y / 1.2 + mod(row, 3.0) * 0.33));
        k = mix(k, 0.0, 1.0 - smoothstep(0.02, 0.05, gap));
      } else {
        k = step(0.5, fract((floor(q.x / 0.5) + floor(q.y / 0.5)) * 0.5)) * 0.6 + 0.2 * hashP(floor(q / 0.5));
      }
      diffuseColor.rgb = mix(uBase, uAlt, k) * (0.9 + 0.1 * hashP(floor(q * 7.0)));
      `,
    );
  };
  return m;
}
