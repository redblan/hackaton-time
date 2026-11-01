/**
 * Финальная обработка кадра: контраст, насыщенность и резкость. Сцена рисуется в буфер со сглаживанием,
 * затем тонмаппинг (OutputPass) и один полноэкранный проход. Настройки — константы в шейдере.
 */
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { HalfFloatType, Vector2, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uTexel: { value: new Vector2() } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    varying vec2 vUv;
    const float SHARPEN = 0.3;
    const float CONTRAST = 0.38;
    const float SATURATION = 1.2;
    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      vec3 around = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb
        + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb
        + texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb
        + texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
      color = clamp(color + (color - around * 0.25) * SHARPEN, 0.0, 1.0);
      color = mix(color, color * color * (3.0 - 2.0 * color), CONTRAST);
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(clamp(mix(vec3(luma), color, SATURATION), 0.0, 1.0), 1.0);
    }
  `,
};

export function Grade() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  const { composer, grade } = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 2 });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new OutputPass());
    const grade = new ShaderPass(GRADE);
    composer.addPass(grade);
    return { composer, grade };
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.setPixelRatio(dpr);
    composer.setSize(size.width, size.height);
    grade.uniforms.uTexel!.value.set(1 / (size.width * dpr), 1 / (size.height * dpr));
  }, [composer, grade, size, dpr]);

  useEffect(() => () => composer.dispose(), [composer]);

  // Приоритет 1: этот проход заменяет обычную отрисовку
  useFrame((_, delta) => composer.render(delta), 1);
  return null;
}
