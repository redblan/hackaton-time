/**
 * Отрисовка чанка. ВЛАДЕЛЕЦ: Никита. ТЗ: docs/tz/nikita-world.md
 * Локальные GLB, инстансинг архитектуры, частицы и таблички без внешних ресурсов.
 * Модели visual:X заменяют только вид коробок; физика остаётся в getColliders.
 */
import { useThree } from "@react-three/fiber";
import { Clone, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Box3, CanvasTexture, DoubleSide, SRGBColorSpace, Vector3, type Group, type InstancedMesh, type MeshStandardMaterial } from "three";
import { isObjectActive, type Aabb, type ChunkData, type Vec3, type WorldObject } from "@game/shared";
import { useStore } from "../core/store";
import { Character, npcColor, npcVariant } from "./Character";
import { NPC_ROUTES, STANDING_NPCS } from "./npcRoutes";
import { NpcWalker } from "./NpcWalker";
import { Crowd } from "./crowd/Crowd";
import { FxParticles } from "./Effects";
import { useLampLight } from "./LocalLights";
import { Interior, parseFloorId } from "./decor/Interior";
import { PropExtinguisher, isExtinguisher } from "./decor/Carry";
import { STAIR_WALL, STAIR_WALL_DEPTH, STAIR_WALL_TOP, STAIR_WALL_Z } from "./decor/stairWall";
import { isYardAnimated, YardAnimated } from "./decor/YardAnimated";
import { paintSurface } from "./style";
import { uploadStaticBoxes, type StaticBox } from './staticBoxes';

/** Модели, которые рисует декор этажа (decor/Interior) своими low-poly пропами вместо GLB. */
const OWN_MODELS = new Set(["door", "lift", "stove"]);

const active = (o: WorldObject, flags: string[]) => isObjectActive(o, flags);

/** Папа в данных стоит в квартирах 6–9 этажей; виден только на этаже старта (флаг сервера home_fN). */
export function npcHere(o: WorldObject, chunkId: string, flags: readonly string[]): boolean {
  if (o.kind !== "npc" || o.npcId !== "papa" || !flags.some((f) => f.startsWith("home_f"))) return true;
  const floor = parseFloorId(chunkId)?.floor;
  return floor !== undefined && flags.includes(`home_f${floor}`);
}

/**
 * Внешние стены этажа в данных сплошные. Рисуем их с проёмами под окна (стекло — в decor/Animated),
 * столкновения остаются по целой коробке (getColliders).
 */
const WINDOW_HOLES: Record<string, { x: number; w: number; y0: number; y1: number }[]> = {
  "back-wall": [
    { x: 2.5, w: 2.0, y0: 0.95, y1: 2.45 },
    { x: 8, w: 2.0, y0: 0.95, y1: 2.45 },
  ],
  "south-wall": [
    { x: 2, w: 1.5, y0: 1.175, y1: 2.425 },
    { x: 10, w: 1.5, y0: 1.175, y1: 2.425 },
  ],
};
function withWindowHoles(o: StaticBox, origin: Vec3): StaticBox[] {
  const holes = WINDOW_HOLES[o.id];
  if (!holes || o.rotY) return [o];
  const x0 = o.pos[0] - o.size[0] / 2;
  const x1 = o.pos[0] + o.size[0] / 2;
  const yb = o.pos[1] - o.size[1] / 2;
  const yt = o.pos[1] + o.size[1] / 2;
  const part = (id: string, ax: number, bx: number, ay: number, by: number): StaticBox => ({
    ...o,
    id: `${o.id}:${id}`,
    pos: [(ax + bx) / 2, (ay + by) / 2, o.pos[2]],
    size: [bx - ax, by - ay, o.size[2]],
  });
  const out: StaticBox[] = [];
  let x = x0;
  holes.forEach((h, i) => {
    const hx0 = origin[0] + h.x - h.w / 2;
    const hx1 = origin[0] + h.x + h.w / 2;
    if (hx0 > x) out.push(part(`col${i}`, x, hx0, yb, yt));
    out.push(part(`below${i}`, hx0, hx1, yb, origin[1] + h.y0));
    out.push(part(`above${i}`, hx0, hx1, origin[1] + h.y1, yt));
    x = hx1;
  });
  if (x < x1) out.push(part("end", x, x1, yb, yt));
  return out;
}

function Sign({object}:{object:Extract<WorldObject,{kind:'sign'}>}) {
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff2cf';ctx.fillRect(0,0,1024,256);
    ctx.fillStyle='#283a48';ctx.font='bold 32px sans-serif';
    let line='', y=50;
    for(const word of object.text.split(' ')) {
      if(ctx.measureText(line+word).width>940){ctx.fillText(line,32,y);y+=42;line='';}
      line+=word+' ';
    }
    ctx.fillText(line,32,y);const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture;
  },[object.text]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <mesh position={object.pos} rotation-y={object.rotY??0}><planeGeometry args={[2.4,.6]}/><meshBasicMaterial map={texture} side={DoubleSide}/></mesh>;
}

const dimensions: Record<string, [number, number, number]> = {
  'table-top':[2,.98,1.2], bed:[2,.7,1.5], wardrobe:[.8,2.2,1.6],
  kitchen:[1.5,1,4], stove:[.8,1,.8], lift:[2,2.5,.25], door:[2,2.5,.2],
  'stairs-a':[3,1.5,3], 'stairs-b':[3,1.5,3], tree:[2.5,4.2,2.5],
  bench:[2,.7,.6], pole:[.5,5,.5], 'play-stairs':[2,1.1,2], ambulance:[2.5,2.4,5],
};

function Model({ object }: { object: Extract<WorldObject,{kind:'model'}> }) {
  // No decoder CDN: selected assets are plain, self-contained GLB files.
  const {scene}=useGLTF(`/assets/${object.src}`,false,false);
  const fit=useMemo(()=>{
    const bounds=new Box3().setFromObject(scene), size=bounds.getSize(new Vector3());
    const target=dimensions[object.id.replace('visual:','')];
    const scale: [number,number,number]=target?target.map((n,i)=>n/Math.max(size.getComponent(i),.001)) as [number,number,number]:[1,1,1];
    return {scale,offset:[-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2] as [number,number,number]};
  },[scene,object.id]);
  return <group dispose={null} position={object.pos} rotation-y={object.rotY??0} scale={object.scale??1}><group scale={fit.scale}><Clone object={scene} position={fit.offset} castShadow receiveShadow /></group></group>;
}

function ModelPlaceholder({object,objects}:{object:Extract<WorldObject,{kind:'model'}>;objects:WorldObject[]}) {
  const box=objects.find(o=>o.kind==='box' && o.id===object.id.replace('visual:',''));
  return box?.kind==='box' ? <mesh position={box.pos} rotation-y={box.rotY??0}>
    <boxGeometry args={box.size}/><meshStandardMaterial color={box.color}/>
  </mesh> : null;
}

/** Свет фонаря, который включили по ходу игры (`power_on`, N13). */
function LampGlow({pos}:{pos:Vec3}) {
  useLampLight(pos);
  return null;
}

/** Шкаф: пока я сижу внутри (core/hide.ts), у меня он не рисуется — стенки изнутри закрывают обзор; щель рисует HUD */
function Wardrobe({ object, objects }: { object: Extract<WorldObject, { kind: "model" }>; objects: WorldObject[] }) {
  const inside = useStore((s) => s.hide?.kind === "wardrobe");
  if (inside) return null;
  return <Suspense fallback={<ModelPlaceholder object={object} objects={objects} />}><Model object={object} /></Suspense>;
}

function paintOnce(material: MeshStandardMaterial | null) {
  if (!material || material.userData.painted) return;
  material.userData.painted = true;
  paintSurface(material);
  material.needsUpdate = true;
}

/** Дольше чанк не прячем: лучше короткий рывок, чем дом без стен. */
const REVEAL_LIMIT_MS = 1000;

/**
 * Чанк появляется, когда его шейдеры готовы: синхронная сборка стоит секунды зависания.
 * Не gl.compileAsync: если материал пересоздан во время ожидания (сменились флаги), он падает
 * внутри таймера, промис не завершается никогда, и чанк остаётся невидимым.
 */
function useCompiledReveal() {
  const group = useRef<Group>(null);
  const get = useThree(s=>s.get);
  useEffect(()=>{
    const node=group.current;
    if(!node) return;
    const {gl,camera,scene}=get();
    const materials=gl.compile(node,camera,scene);
    const deadline=performance.now()+REVEAL_LIMIT_MS;
    let frame=0;
    const check=()=>{
      for(const material of materials) {
        const {currentProgram}=gl.properties.get(material) as {currentProgram?:{isReady():boolean}};
        if(!currentProgram||currentProgram.isReady()) materials.delete(material);
      }
      if(materials.size===0||performance.now()>deadline) node.visible=true;
      else frame=requestAnimationFrame(check);
    };
    node.visible=false;
    check();
    return ()=>cancelAnimationFrame(frame);
  },[get]);
  return group;
}

export function ChunkView(props: { chunk: ChunkData; flags: string[] }) {
  const root = useCompiledReveal();
  const floor = parseFloorId(props.chunk.id); // этаж: декор Interior заменяет GLB двери/лифта/плиты и коробки-двери N7
  const objects = useMemo(()=>props.chunk.objects.filter(o=>active(o,props.flags)&&npcHere(o,props.chunk.id,props.flags)&&!(props.flags.includes('fire_out')&&o.kind==='fx'&&(o.fx==='fire'||o.fx==='smoke'))),[props.chunk,props.flags]);
  const boxes=useMemo(()=>{
    const replaced=new Set(objects.filter(o=>o.kind==='model').map(o=>o.id.replace('visual:','')));
    return objects.filter((o):o is StaticBox=>o.kind==='box'&&!replaced.has(o.id)&&!isYardAnimated(o.id)&&!(floor&&(o.id==='window-glass'||o.id.startsWith('facade-window-')))&&!(floor&&o.id.startsWith('detail-door-'))&&!(replaced.has('table-top')&&o.id.startsWith('leg-'))&&!(replaced.has('tree')&&o.id.startsWith('tree-'))&&!(replaced.has('stairs-a')&&o.id.startsWith('stair-a-'))&&!(replaced.has('stairs-b')&&o.id.startsWith('stair-b-'))).flatMap(o=>floor?withWindowHoles(o,props.chunk.bounds.min):[o]);
  },[objects,Boolean(floor)]);
  return (
    <group ref={root} name={props.chunk.id}>
      <StaticBoxes boxes={boxes}/>
      <Crowd objects={objects} origin={props.chunk.bounds.min} />
      {objects.map(o=>o.id==='requested-lamp-on'&&o.kind==='box'?<LampGlow key={o.id} pos={o.pos}/>:null)}
      {objects.map((o) => {
        switch (o.kind) {
          case "box":
            return null;
          case "model":
            if (floor && OWN_MODELS.has(o.id.replace('visual:',''))) return null; // дверь, лифт, плита — в Interior
            if (o.id === "visual:wardrobe") return <Wardrobe key={o.id} object={o} objects={objects} />;
            return <Suspense key={o.id} fallback={<ModelPlaceholder object={o} objects={objects}/>}><Model object={o}/></Suspense>;
          case "npc": {
            const route = NPC_ROUTES[o.npcId];
            if (route) return <NpcWalker key={o.id} color={npcColor(o.npcId)} pos={o.pos} route={route} seed={o.id.length} />;
            return (
              <group key={o.id} position={o.pos} rotation-y={o.rotY ?? 0}>
                <Character color={npcColor(o.npcId)} pose={STANDING_NPCS[o.npcId] ? "stand" : o.pose} variant={npcVariant(o.npcId)} />
              </group>
            );
          }
          case "prop":
            return isExtinguisher(o.id) ? <PropExtinguisher key={o.id} object={o} /> : null; // пока берём в руки только огнетушитель
          case "sign":
            return <Sign key={o.id} object={o}/>;
          case "fx":
            return <FxParticles key={o.id} object={o}/>;
          default:
            return null; // zone, spawn — невидимые
        }
      })}
      {floor && <Interior chunk={props.chunk} flags={props.flags} />}
      {!floor && <YardAnimated objects={objects} />}
    </group>
  );
}

function StaticBoxes({boxes}:{boxes:StaticBox[]}) {
  const mesh=useRef<InstancedMesh>(null);
  useLayoutEffect(()=>{if(mesh.current) uploadStaticBoxes(mesh.current,boxes);},[boxes]);
  return <instancedMesh ref={mesh} args={[undefined,undefined,Math.max(1,boxes.length)]} castShadow receiveShadow>
    <boxGeometry/><meshStandardMaterial ref={paintOnce} roughness={.85}/>
  </instancedMesh>;
}

/** Коробки для столкновений. Объекты с `when` не из flags не сталкиваются. */
export function getColliders(chunk: ChunkData, flags: string[], doors?: Record<string, boolean>): Aabb[] {
  const out: Aabb[] = [];
  // Коробка «lift» из данных — стенка сразу за дверями лифта: без неё в открытый лифт можно зайти.
  // Боковых стенок кабины не ставим: за лифтом (z 4.1..4.9) проход, по нему идёт обход через балкон 4-го этажа.
  const floor = parseFloorId(chunk.id);
  for (const o of chunk.objects) {
    if (o.kind !== "box" || o.collide === false || !active(o, flags)) continue;
    if (floor && o.id === "lift") continue;
    const a = o.rotY ?? 0;
    const c = Math.abs(Math.cos(a));
    const s = Math.abs(Math.sin(a));
    const hx = (c * o.size[0] + s * o.size[2]) / 2;
    const hz = (s * o.size[0] + c * o.size[2]) / 2;
    const hy = o.size[1] / 2;
    out.push({
      min: [o.pos[0] - hx, o.pos[1] - hy, o.pos[2] - hz],
      max: [o.pos[0] + hx, o.pos[1] + hy, o.pos[2] + hz],
    });
  }
  // Дверь квартиры: в данных проём открыт, закрытая створка держит игрока. Без `doors` — проём свободен
  if (doors && !doors[chunk.id] && parseFloorId(chunk.id)) {
    const [x, y, z] = chunk.bounds.min;
    out.push({ min: [x + 4, y, z + 4.95], max: [x + 6, y + 2.5, z + 5.05] });
  }
  if (parseFloorId(chunk.id)?.floor === 1) {
    const [x, y, z] = chunk.bounds.min;
    for (const part of STAIR_WALL) {
      out.push({
        min: [x + part.x - part.width / 2, y + part.bottom, z + STAIR_WALL_Z - STAIR_WALL_DEPTH / 2],
        max: [x + part.x + part.width / 2, y + STAIR_WALL_TOP, z + STAIR_WALL_Z + STAIR_WALL_DEPTH / 2],
      });
    }
  }
  return out;
}
