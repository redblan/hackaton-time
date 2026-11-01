/**
 * Отрисовка чанка. ВЛАДЕЛЕЦ: Никита. ТЗ: docs/tz/nikita-world.md
 * Локальные GLB, инстансинг архитектуры, частицы и таблички без внешних ресурсов.
 * Модели visual:X заменяют только вид коробок; физика остаётся в getColliders.
 */
import { Clone, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Box3, CanvasTexture, DoubleSide, SRGBColorSpace, Vector3, type InstancedMesh, type MeshStandardMaterial } from "three";
import { isObjectActive, type Aabb, type ChunkData, type WorldObject } from "@game/shared";
import { Character, npcColor, npcVariant } from "./Character";
import { NPC_ROUTES, STANDING_NPCS } from "./npcRoutes";
import { NpcWalker } from "./NpcWalker";
import { Crowd } from "./crowd/Crowd";
import { FxParticles, InteractMarker } from "./Effects";
import { Interior, parseFloorId } from "./decor/Interior";
import { isYardAnimated, YardAnimated } from "./decor/YardAnimated";
import { paintSurface } from "./style";
import { uploadStaticBoxes, type StaticBox } from './staticBoxes';

/** Модели, которые рисует декор этажа (decor/Interior) своими low-poly пропами вместо GLB. */
const OWN_MODELS = new Set(["door", "lift", "stove"]);

const active = (o: WorldObject, flags: string[]) => isObjectActive(o, flags);

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

function paintOnce(material: MeshStandardMaterial | null) {
  if (!material || material.userData.painted) return;
  material.userData.painted = true;
  paintSurface(material);
  material.needsUpdate = true;
}

export function ChunkView(props: { chunk: ChunkData; flags: string[] }) {
  const floor = parseFloorId(props.chunk.id); // этаж: декор Interior заменяет GLB двери/лифта/плиты и коробки-двери N7
  const objects = useMemo(()=>props.chunk.objects.filter(o=>active(o,props.flags)),[props.chunk,props.flags]);
  const boxes=useMemo(()=>{
    const replaced=new Set(objects.filter(o=>o.kind==='model').map(o=>o.id.replace('visual:','')));
    return objects.filter((o):o is StaticBox=>o.kind==='box'&&!replaced.has(o.id)&&!isYardAnimated(o.id)&&!(floor&&o.id.startsWith('detail-door-'))&&!(replaced.has('table-top')&&o.id.startsWith('leg-'))&&!(replaced.has('tree')&&o.id.startsWith('tree-'))&&!(replaced.has('stairs-a')&&o.id.startsWith('stair-a-'))&&!(replaced.has('stairs-b')&&o.id.startsWith('stair-b-')));
  },[objects,Boolean(floor)]);
  return (
    <group name={props.chunk.id}>
      <StaticBoxes boxes={boxes}/>
      <Crowd objects={objects} origin={props.chunk.bounds.min} />
      {objects.map((o) => {
        switch (o.kind) {
          case "box":
            return null;
          case "model":
            if (floor && OWN_MODELS.has(o.id.replace('visual:',''))) return null; // дверь, лифт, плита — в Interior
            return <Suspense key={o.id} fallback={<ModelPlaceholder object={o} objects={objects}/>}><Model object={o}/></Suspense>;
          case "interactable":
            return <InteractMarker key={o.id} object={o} />;
          case "npc": {
            const route = NPC_ROUTES[o.npcId];
            if (route) return <NpcWalker key={o.id} color={npcColor(o.npcId)} pos={o.pos} route={route} seed={o.id.length} />;
            return (
              <group key={o.id} position={o.pos} rotation-y={o.rotY ?? 0}>
                <Character color={npcColor(o.npcId)} pose={STANDING_NPCS[o.npcId] ? "stand" : o.pose} variant={npcVariant(o.npcId)} />
              </group>
            );
          }
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
export function getColliders(chunk: ChunkData, flags: string[]): Aabb[] {
  const out: Aabb[] = [];
  for (const o of chunk.objects) {
    if (o.kind !== "box" || o.collide === false || !active(o, flags)) continue;
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
  return out;
}
