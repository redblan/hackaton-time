/**
 * Свет и небо: вечернее низкое солнце, рисованные облака, туман в цвет горизонта.
 * Тень одна, от солнца, и следует за камерой: так она стоит одинаково на любом ноуте.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { ACESFilmicToneMapping, BackSide, Color, Vector3, type DirectionalLight, type Mesh, type Object3D } from "three";
import { Props } from "./props/Props";
import { RenderStats } from "./RenderStats";
import { WorldNews } from "./WorldNews";
import { PALETTE } from "./style";

const SUN_DIRECTION = new Vector3(-0.7, 0.26, -0.66).normalize();
const SHADOW_RANGE = 34;
/** Карта теней перерисовывается реже кадра: на встроенной видеокарте это треть времени кадра. */
const SHADOW_INTERVAL = 1 / 12;
/** Шаг следования за камерой: иначе края теней дрожат при каждом шаге игрока. */
const SHADOW_SNAP = 2;

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uTop, uHorizon, uSun, uDirection;
  uniform float uTime;
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 color = mix(uHorizon, uTop, pow(h, 0.55));
    float sun = max(dot(dir, uDirection), 0.0);
    color += uSun * (pow(sun, 6.0) * 0.35 + pow(sun, 180.0) * 1.2);
    if (dir.y > 0.01) {
      vec2 uv = dir.xz / (dir.y + 0.18) * 1.4 + vec2(uTime * 0.004, 0.0);
      float cloud = smoothstep(0.5, 0.74, fbm(uv));
      vec3 cloudColor = mix(vec3(1.0, 0.86, 0.72), vec3(1.0, 0.98, 0.94), smoothstep(0.55, 0.85, fbm(uv + 0.25)));
      color = mix(color, cloudColor, cloud * smoothstep(0.02, 0.2, dir.y) * 0.9);
    }
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

function Sky() {
  const ref = useRef<Mesh>(null);
  const uniforms = useMemo(
    () => ({
      uTop: { value: new Color(PALETTE.skyTop) },
      uHorizon: { value: new Color(PALETTE.skyHorizon) },
      uSun: { value: new Color(PALETTE.sun) },
      uDirection: { value: SUN_DIRECTION },
      uTime: { value: 0 },
    }),
    [],
  );
  useFrame(({ camera, clock }) => {
    ref.current?.position.copy(camera.position);
    uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    // Небо рисуется последним из непрозрачного: за стенами и домом оно не тратит ни пикселя.
    <mesh ref={ref} frustumCulled={false} renderOrder={1}>
      <sphereGeometry args={[280, 32, 16]} />
      <shaderMaterial
        vertexShader={SKY_VERTEX}
        fragmentShader={SKY_FRAGMENT}
        uniforms={uniforms}
        side={BackSide}
        depthWrite={false}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function Sun() {
  const light = useRef<DirectionalLight>(null);
  const target = useRef<Object3D>(null);
  const wait = useRef(0);
  const { scene, gl } = useThree();
  useEffect(() => {
    if (!light.current || !target.current) return;
    light.current.target = target.current;
  }, [scene]);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  useFrame(({ camera }, delta) => {
    if (!light.current || !target.current) return;
    wait.current -= delta;
    if (wait.current > 0) return;
    wait.current = SHADOW_INTERVAL;
    const snap = (value: number) => Math.round(value / SHADOW_SNAP) * SHADOW_SNAP;
    target.current.position.set(snap(camera.position.x), snap(camera.position.y), snap(camera.position.z));
    light.current.position.copy(target.current.position).addScaledVector(SUN_DIRECTION, 70);
    gl.shadowMap.needsUpdate = true;
  });
  return (
    <>
      <object3D ref={target} />
      <directionalLight
        ref={light}
        color="#ffb877"
        intensity={2.6}
        castShadow
        shadow-mapSize={[1536, 1536]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={5}
        shadow-camera-left={-SHADOW_RANGE}
        shadow-camera-right={SHADOW_RANGE}
        shadow-camera-top={SHADOW_RANGE}
        shadow-camera-bottom={-SHADOW_RANGE}
        shadow-camera-near={5}
        shadow-camera-far={160}
      />
    </>
  );
}

/** Слабый ноутбук один раз снижает разрешение. Переключать чаще нельзя: каждая смена сама даёт рывок. */
function AdaptiveResolution() {
  const setDpr = useThree((s) => s.setDpr);
  return <PerformanceMonitor onDecline={() => setDpr(1)} />;
}

export function Atmosphere() {
  const { gl } = useThree();
  useEffect(() => {
    gl.toneMapping = ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
  }, [gl]);
  return (
    <>
      <RenderStats />
      <AdaptiveResolution />
      <Props />
      <WorldNews />
      <color attach="background" args={[PALETTE.fog]} />
      <fog attach="fog" args={[PALETTE.fog, 60, 240]} />
      <hemisphereLight args={[PALETTE.hemiSky, PALETTE.hemiGround, 1.6]} />
      <Sky />
      <Sun />
    </>
  );
}
