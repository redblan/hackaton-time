import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { Character } from './Character';
import { RESIDENTS, type Resident } from './characterPresets';
import { residentModelUrl } from './ResidentModel';

function Preview() {
  const [anim, setAnim] = useState<'idle' | 'walk' | 'run'>('idle');
  const [pose, setPose] = useState<'stand' | 'lie' | 'sit'>('stand');
  const [selected, setSelected] = useState<Resident | 'all'>('all');
  return <><header><p>Жители разных возрастов — {residentModelUrl ? 'ITHappy' : 'KayKit (установите локальный набор)'}</p>
    <select aria-label="Анимация" value={anim} onChange={e => setAnim(e.target.value as typeof anim)}><option value="idle">Ожидание</option><option value="walk">Ходьба</option><option value="run">Бег</option></select>
    <select aria-label="Поза" value={pose} onChange={e => setPose(e.target.value as typeof pose)}><option value="stand">Стоят</option><option value="sit">Сидят</option><option value="lie">Лежат</option></select>
    <select aria-label="Образ" value={selected} onChange={e => setSelected(e.target.value as typeof selected)}><option value="all">Все жители</option>{(Object.keys(RESIDENTS) as Resident[]).map(id => <option key={id} value={id}>{RESIDENTS[id].label}</option>)}</select>
    <p>Вращение — мышью, приближение — колёсиком.</p></header>
    <Canvas key={selected} shadows camera={{ position: selected === 'all' ? [0, 2.8, 9] : [0, 1.6, 3.5], fov: 45 }}>
      <color attach="background" args={['#233744']} /><ambientLight intensity={1.4} />
      <directionalLight position={[4, 8, 5]} intensity={2.4} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-8} shadow-camera-right={8} />
      {(Object.keys(RESIDENTS) as Resident[]).filter(id => selected === 'all' || id === selected).map((variant, i) => <group key={variant} position={selected === 'all' ? [(i % 4 - 1.5) * 2.25, 0, Math.floor(i / 4) * -3.5] : [0, 0, 0]} rotation-y={Math.PI}>
        <Character color="#8294a2" variant={variant} anim={anim} pose={pose} />
        <Html position={[0, 2.05, 0]} center style={{ whiteSpace: 'nowrap', fontSize: 14, background: '#142630cc', padding: '4px 7px', borderRadius: 5 }}>{RESIDENTS[variant].label}</Html>
      </group>)}
      <mesh rotation-x={-Math.PI / 2} receiveShadow><planeGeometry args={[80, 80]} /><meshStandardMaterial color="#728275" /></mesh>
      <OrbitControls target={[0, 0.9, selected === 'all' ? -1 : 0]} />
    </Canvas></>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
