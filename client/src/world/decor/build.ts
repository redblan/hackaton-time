/**
 * Конструктор low-poly геометрии: коробки и цилиндры с цветом в вершинах,
 * склеенные в ОДИН BufferGeometry → один draw call на весь декор чанка.
 * Никаких текстур и файлов: всё считается на клиенте, работает офлайн.
 */
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type Placement = { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number };

const tmpColor = new Color();

function colorize(geometry: BufferGeometry, color: string | number, shade = 1) {
  const count = geometry.attributes.position!.count;
  tmpColor.set(color).multiplyScalar(shade);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return geometry;
}

function transform(geometry: BufferGeometry, p: Placement) {
  const m = new Matrix4().compose(
    new Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0),
    new Quaternion().setFromEuler(new Euler(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0)),
    new Vector3(1, 1, 1),
  );
  return geometry.applyMatrix4(m);
}

/** Сборщик одной «модели»: вызовы добавляют части, `build()` склеивает их. */
export class Builder {
  private parts: BufferGeometry[] = [];

  /** Коробка размером w×h×d, центр в (x, y, z). */
  box(w: number, h: number, d: number, color: string | number, p: Placement = {}, shade = 1) {
    this.parts.push(transform(colorize(new BoxGeometry(w, h, d), color, shade), p));
    return this;
  }

  /** Цилиндр: радиус сверху/снизу, высота; центр в (x, y, z). */
  cylinder(rTop: number, rBottom: number, h: number, color: string | number, p: Placement = {}, segments = 8, shade = 1) {
    this.parts.push(transform(colorize(new CylinderGeometry(rTop, rBottom, h, segments), color, shade), p));
    return this;
  }

  cone(r: number, h: number, color: string | number, p: Placement = {}, segments = 8, shade = 1) {
    this.parts.push(transform(colorize(new ConeGeometry(r, h, segments), color, shade), p));
    return this;
  }

  sphere(r: number, color: string | number, p: Placement = {}, segments = 8, shade = 1) {
    this.parts.push(transform(colorize(new SphereGeometry(r, segments, Math.max(4, segments - 2)), color, shade), p));
    return this;
  }

  /** Плоскость w×h, смотрит на +z; поворачивается через ry. */
  plane(w: number, h: number, color: string | number, p: Placement = {}, shade = 1) {
    this.parts.push(transform(colorize(new PlaneGeometry(w, h), color, shade), p));
    return this;
  }

  /** Вложить готовую геометрию (например, из другого Builder) со смещением. */
  add(geometry: BufferGeometry, p: Placement = {}) {
    this.parts.push(transform(geometry.clone(), p));
    return this;
  }

  get empty() {
    return this.parts.length === 0;
  }

  build(): BufferGeometry {
    if (!this.parts.length) return new BufferGeometry();
    const merged = mergeGeometries(this.parts.map((g) => (g.index ? g.toNonIndexed() : g)));
    merged.computeBoundingSphere();
    for (const g of this.parts) g.dispose();
    this.parts = [];
    return merged;
  }
}

/** Геометрия из функции-строителя, пересобирается только при смене deps, освобождается при размонтировании. */
export function useBuilt(make: () => BufferGeometry, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(make, deps);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/** Детерминированный ГПСЧ для раскладки декора. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type LabelCell = { u0: number; v0: number; u1: number; v1: number };

/**
 * Атлас надписей: все подписи чанка (номера квартир, табло лифта, таблички) на одном canvas →
 * одна текстура, одна геометрия с UV. Ячейки 256×128, до 8 штук.
 */
export function labelAtlas(labels: { text: string; bg: string; fg: string; font?: string }[]) {
  const cols = 2;
  const rows = Math.max(1, Math.ceil(labels.length / cols));
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = rows * 128;
  const ctx = canvas.getContext("2d")!;
  const cells: LabelCell[] = [];
  labels.forEach((label, i) => {
    const cx = (i % cols) * 256;
    const cy = Math.floor(i / cols) * 128;
    ctx.fillStyle = label.bg;
    ctx.fillRect(cx, cy, 256, 128);
    ctx.fillStyle = label.fg;
    ctx.font = label.font ?? "bold 72px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label.text, cx + 128, cy + 66, 240);
    // v считаем снизу: canvas-текстуры в three перевёрнуты по умолчанию (flipY)
    cells.push({ u0: cx / 512, u1: (cx + 256) / 512, v0: 1 - (cy + 128) / canvas.height, v1: 1 - cy / canvas.height });
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, cells };
}

/** Квад w×h с UV из ячейки атласа, лицом к +z; добавляется в общий список квадов. */
export function labelQuad(w: number, h: number, cell: LabelCell, p: Placement) {
  const g = new PlaneGeometry(w, h);
  const uv = g.attributes.uv as BufferAttribute;
  const map = [
    [cell.u0, cell.v1],
    [cell.u1, cell.v1],
    [cell.u0, cell.v0],
    [cell.u1, cell.v0],
  ];
  map.forEach(([u, v], i) => uv.setXY(i, u!, v!));
  return transform(g, p);
}

export function mergeQuads(quads: BufferGeometry[]) {
  const merged = mergeGeometries(quads.map((g) => g.toNonIndexed()));
  for (const g of quads) g.dispose();
  return merged;
}
