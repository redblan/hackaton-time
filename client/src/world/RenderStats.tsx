/** Счётчики кадра для F3 и `npm run perf`. Считают и проход теней, поэтому autoReset выключен. */
import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Object3D } from "three";
import { local, teleport } from "../core/local";
import { store } from "../core/store";

export const renderStats = { calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 };

/** Сцена для отладочных замеров: сколько объектов обновляется каждый кадр. */
export const sceneRef: { current: Object3D | null } = { current: null };

// Для scripts/perf.mjs: в обычной игре этого объекта нет
if (import.meta.env.DEV || location.search.includes("perf")) {
  Object.assign(window, { __perf: { store, local, teleport, renderStats, sceneRef } });
}

export function RenderStats() {
  const gl = useThree((s) => s.gl);
  sceneRef.current = useThree((s) => s.scene);
  Object.assign(sceneRef, { gl });
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame(() => {
    const { render, memory, programs } = gl.info;
    renderStats.calls = render.calls;
    renderStats.triangles = render.triangles;
    renderStats.geometries = memory.geometries;
    renderStats.textures = memory.textures;
    renderStats.programs = programs?.length ?? 0;
    gl.info.reset();
  });
  return null;
}
