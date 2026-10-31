import { useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import type { OrbitControls as Controls } from 'three-stdlib';
import type { RoutePlayer, RouteArea, Vec3 } from '@game/shared';
import { routeSegments } from './routeGeometry';

interface Props {
  player: RoutePlayer; areas: RouteArea[]; time: number; color: string;
  onFloor: (floor: number) => void; onError: (index: number) => void;
}
const cameraPosition: Vec3 = [65, 52, 68];
const target: Vec3 = [15, 9, -10];

export default function RouteScene({ player, areas, time, color, onFloor, onError }: Props) {
  const controls = useRef<Controls>(null);
  const segments = useMemo(() => routeSegments(player.points, time), [player.points, time]);
  const last = player.points.filter(p => p.at <= time).at(-1);
  return <>
    <div className="route-scene" role="region" aria-label="Трёхмерная схема маршрута">
      <Canvas camera={{ position: cameraPosition, fov: 45, near: .1, far: 500 }} dpr={[1, 1.5]} frameloop="demand">
        <color attach="background" args={['#e8f0ec']}/>
        <ambientLight intensity={1.5}/>
        <OrbitControls ref={controls} target={target} makeDefault minDistance={12} maxDistance={180} maxPolarAngle={Math.PI * .49}/>
        {Array.from({length:9}, (_,i) => {
          const y=i*3;
          return <group key={i}>
            <mesh position={[12,y-.08,6]} raycast={() => null}>
              <boxGeometry args={[24,.12,12]}/><meshBasicMaterial color={i%2 ? '#87a6b5' : '#abc3b4'} transparent opacity={.16} depthWrite={false}/>
            </mesh>
            <Line points={[[0,y,0],[24,y,0],[24,y,12],[0,y,12],[0,y,0]]} color="#91aaa0" transparent opacity={.6} lineWidth={1}/>
            <Html position={[-1.5,y,12]} center zIndexRange={[2,0]}><button className="route-floor-label" onClick={() => onFloor(i+1)}>{i+1} этаж</button></Html>
          </group>;
        })}
        <mesh position={[18,-.12,-24]} raycast={() => null}>
          <boxGeometry args={[36,.15,48]}/><meshBasicMaterial color="#bfd8bc" transparent opacity={.35} depthWrite={false}/>
        </mesh>
        <Html position={[36,0,-24]} center zIndexRange={[2,0]}><button className="route-floor-label" onClick={() => onFloor(0)}>Двор</button></Html>
        {areas.filter(a => a.kind !== 'wall' && (a.activeAt??0)<=time).map((a,i) => {
          const center=a.min.map((v,j)=>(v+a.max[j])/2) as Vec3;
          const size=a.max.map((v,j)=>Math.max(.08,v-a.min[j])) as Vec3;
          return <mesh key={i} position={center}>
            <boxGeometry args={size}/><meshBasicMaterial color={a.kind==='safe'?'#36ad64':'#e98c24'} transparent opacity={.22} depthWrite={false}/>
          </mesh>;
        })}
        {segments.map((points,i) => points.length>1 && <Line key={i} points={points} color={color} lineWidth={3} depthTest={false} renderOrder={5}/>)}
        {player.errors.map((error,i)=>error.at<=time && <mesh key={i} position={[error.pos[0],error.pos[1]+.4,error.pos[2]]} renderOrder={6}
          onClick={e=>{e.stopPropagation();if(e.delta<4)onError(i);}}>
          <sphereGeometry args={[.42,12,8]}/><meshBasicMaterial color="#d6322a" depthTest={false}/>
        </mesh>)}
        {last && <mesh position={[last.pos[0],last.pos[1]+.25,last.pos[2]]} renderOrder={7}><sphereGeometry args={[.25,12,8]}/><meshBasicMaterial color={color} depthTest={false}/></mesh>}
      </Canvas>
    </div>
    <button onClick={() => { const c=controls.current; if(c){c.object.position.set(...cameraPosition);c.target.set(...target);c.update();} }}>Вернуть общий вид</button>
    <p className="route-legend">Вращение — левая кнопка мыши · масштаб — колесо или жест двумя пальцами · перемещение — правая кнопка. Нажмите номер этажа для 2D-плана или красную точку для объяснения.</p>
  </>;
}
