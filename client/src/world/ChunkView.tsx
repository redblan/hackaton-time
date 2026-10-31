/**
 * Отрисовка чанка. ВЛАДЕЛЕЦ: Никита. ТЗ: docs/tz/nikita-world.md
 * Локальные GLB, инстансинг архитектуры, частицы и таблички без внешних ресурсов.
 * Модели visual:X заменяют только вид коробок; физика остаётся в getColliders.
 */
import { Clone, Instance, Instances, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, CanvasTexture, DoubleSide, Vector3, type Points } from "three";
import { isObjectActive, type Aabb, type ChunkData, type WorldObject } from "@game/shared";
import { Character } from "./Character";
import { paintSurface } from "./style";

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
    ctx.fillText(line,32,y);return new CanvasTexture(canvas);
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
  return <group position={object.pos} rotation-y={object.rotY??0} scale={object.scale??1}><group scale={fit.scale}><Clone object={scene} position={fit.offset} castShadow receiveShadow /></group></group>;
}

function Particles({object}:{object:Extract<WorldObject,{kind:'fx'}>}) {
  const ref=useRef<Points>(null);
  const positions=useMemo(()=>new Float32Array(48*3),[]);
  useFrame(({clock})=>{
    const t=clock.elapsedTime, spread=object.size??1;
    for(let i=0;i<48;i++) {
      const phase=(t*(object.fx==='sparks'?1.8:.3)+i/48)%1;
      positions[i*3]=Math.sin(i*17.3+t*.3)*spread*(.2+phase*.4);
      positions[i*3+1]=phase*spread*2;
      positions[i*3+2]=Math.cos(i*9.7+t*.2)*spread*(.2+phase*.4);
    }
    if(ref.current) ref.current.geometry.attributes.position.needsUpdate=true;
  });
  return <points ref={ref} position={object.pos} frustumCulled={false}><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions,3]} /></bufferGeometry><pointsMaterial color={object.fx==='fire'?'#ff963d':object.fx==='sparks'?'#ffe98a':object.fx==='dust'?'#d4b998':'#69727e'} size={object.fx==='sparks'?.05:.22} transparent opacity={.6} depthWrite={false}/></points>;
}

export function ChunkView(props: { chunk: ChunkData; flags: string[] }) {
  const objects = props.chunk.objects.filter((o) => active(o, props.flags));
  const replaced=new Set(objects.filter(o=>o.kind==='model').map(o=>o.id.replace('visual:','')));
  const boxes=objects.filter((o):o is Extract<WorldObject,{kind:'box'}>=>o.kind==='box'&&!replaced.has(o.id)&&!(replaced.has('table-top')&&o.id.startsWith('leg-'))&&!(replaced.has('tree')&&o.id.startsWith('tree-'))&&!(replaced.has('stairs-a')&&o.id.startsWith('stair-a-'))&&!(replaced.has('stairs-b')&&o.id.startsWith('stair-b-')));
  return (
    <group name={props.chunk.id}>
      <Instances key={`${props.chunk.id}:${boxes.length}`} limit={Math.max(1,boxes.length)} range={boxes.length} castShadow receiveShadow frustumCulled={false}>
        <boxGeometry /><meshStandardMaterial roughness={.85} ref={(m)=>{if(m&&!m.userData.painted){m.userData.painted=true;paintSurface(m);m.needsUpdate=true;}}}/>
        {boxes.map(o=><Instance key={o.id} position={o.pos} scale={o.size} rotation-y={o.rotY??0} color={o.color}/>)}
      </Instances>
      {objects.map((o) => {
        switch (o.kind) {
          case "box":
            return null;
          case "model":
            return <Suspense key={o.id} fallback={null}><Model object={o}/></Suspense>;
          case "interactable":
            return (
              <mesh key={o.id} position={[o.pos[0], o.pos[1] + 0.6, o.pos[2]]}>
                <sphereGeometry args={[0.12, 12, 12]} />
                <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.8} />
              </mesh>
            );
          case "npc":
            return (
              <group key={o.id} position={o.pos} rotation-y={o.rotY ?? 0}>
                <Character npcId={o.npcId} pose={o.pose} />
              </group>
            );
          case "sign":
            return <Sign key={o.id} object={o}/>;
          case "fx":
            return <Particles key={o.id} object={o}/>;
          default:
            return null; // zone, spawn — невидимые
        }
      })}
    </group>
  );
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
