import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { routeDistance, routeLevel, type RouteReview as Review } from '@game/shared';
import './route.css';

const colors = ['#2563eb', '#7c3aed', '#08916f'];
const RouteScene = lazy(() => import('./RouteScene'));
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">3D недоступно в этом браузере. Выберите «План этажа 2D» для просмотра маршрута.</p> : this.props.children; }
}
export function RouteReview({ review, initialMode = '3d' }: { review: Review; initialMode?: '2d' | '3d' }) {
  const [mode, setMode] = useState(initialMode);
  const [playerId, setPlayerId] = useState(review.players[0]?.id ?? '');
  const [level, setLevel] = useState(0);
  const [time, setTime] = useState(review.durationMs);
  const [selected, setSelected] = useState<number | null>(null);
  const player = review.players.find(p => p.id === playerId);
  if (!player) return <p>Маршрут не записан для этого прохождения.</p>;
  const color = colors[review.players.indexOf(player) % colors.length];
  const point2d = (pos: number[]) => [pos[0], -pos[2]];
  const areas = review.areas.filter(a => a.level === level && (a.activeAt ?? 0) <= time);
  const points = player.points.filter(p => p.at <= time);
  const error = selected === null ? null : player.errors[selected];
  return <section className="route-review" aria-label="Разбор маршрута">
    <h2>Ваш маршрут</h2>
    <div className="row" aria-label="Вид схемы">
      <button aria-pressed={mode==='3d'} onClick={()=>setMode('3d')}>Общий маршрут 3D</button>
      <button aria-pressed={mode==='2d'} onClick={()=>setMode('2d')}>План этажа 2D</button>
    </div>
    <div className="row">
      <label>Игрок <select value={playerId} onChange={e => { setPlayerId(e.target.value); setSelected(null); }}>
        {review.players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <label>Участок <select value={level} onChange={e => { setLevel(Number(e.target.value)); setSelected(null); setMode('2d'); }}>
        <option value={0}>Двор</option>{Array.from({ length: 9 }, (_,i) => <option key={i} value={i+1}>Этаж {i+1}</option>)}
      </select></label>
    </div>
    <p>Записанный путь: ≈{Math.round(routeDistance(player.points))} м · ошибок и пропусков: {player.errors.length}</p>
    {player.truncated && <p>Достигнут лимит записи: часть пути не сохранена.</p>}
    <label>Время: {Math.round(time/1000)} с <input type="range" min={0} max={Math.max(1, review.durationMs)} value={time} onChange={e => { setTime(Number(e.target.value)); setSelected(null); }} /></label>
    {mode === '3d' ? <SceneBoundary><Suspense fallback={<p>Загружаем 3D-схему…</p>}>
      <RouteScene player={player} areas={review.areas} time={time} color={color}
        onFloor={floor=>{setLevel(floor);setMode('2d');setSelected(null);}}
        onError={index=>setSelected(index)}/>
    </Suspense></SceneBoundary> : <svg viewBox={level === 0 ? '-1 -2 38 52' : '-1 -13 26 15'} role="img" aria-label={level === 0 ? 'План двора и путь игрока' : `План этажа ${level} и путь игрока`}>
      <defs><marker id="route-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill={color}/></marker></defs>
      <rect x={0} y={level === 0 ? 0 : -12} width={level === 0 ? 36 : 24} height={level === 0 ? 48 : 12} fill="#f5f4e9" stroke="#9ba59e" strokeWidth=".08"/>
      {level > 0 && <><text x="2" y="-12.3" fontSize=".6">Подъезд 1</text><text x="14" y="-12.3" fontSize=".6">Подъезд 2</text></>}
      {areas.map((a,i) => <rect key={i} x={a.min[0]} y={-a.max[2]} width={a.max[0]-a.min[0]} height={a.max[2]-a.min[2]} fill={a.kind === 'wall' ? '#62726c' : a.kind === 'safe' ? '#75ce87' : '#fbb24c'} fillOpacity={a.kind === 'wall' ? 1 : .45}>
        <title>{a.label}</title>
      </rect>)}
      {points.map((p,i) => {
        const previous = points[i-1];
        if (!previous || p.segment !== previous.segment || routeLevel(p.pos) !== level || routeLevel(previous.pos) !== level) return null;
        const [x1,y1]=point2d(previous.pos), [x2,y2]=point2d(p.pos);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth=".16" markerEnd={i % 5 === 0 ? 'url(#route-arrow)' : undefined}/>;
      })}
      {points.filter((p,i) => routeLevel(p.pos) === level && (i === 0 || routeLevel(points[i-1].pos) !== level || p.segment !== points[i-1].segment)).map((p,i) => <circle key={`start-${i}`} cx={p.pos[0]} cy={-p.pos[2]} r=".25" fill={color}><title>Начало участка маршрута</title></circle>)}
      {points.at(-1) && routeLevel(points.at(-1)!.pos) === level && <circle cx={points.at(-1)!.pos[0]} cy={-points.at(-1)!.pos[2]} r=".3" fill="white" stroke={color} strokeWidth=".12"><title>Последняя позиция к выбранному времени</title></circle>}
      {player.errors.map((e,i) => routeLevel(e.pos) === level && e.at <= time && <g key={i} role="button" tabIndex={0} aria-label={e.note} onClick={() => setSelected(i)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(i); } }}>
        <circle cx={e.pos[0]} cy={-e.pos[2]} r=".45" fill="#cf342c" stroke="white" strokeWidth=".08"/><title>{e.note}</title>
      </g>)}
    </svg>}
    <p className="route-legend">Цветная линия — путь · оранжевый — опасность · красный — ошибка или пропуск · зелёный — место сбора. {mode==='3d'?'Площадки этажей прозрачные, стены скрыты.':'Схема сверху, в метрах.'}</p>
    {error && <div className="route-error"><b>{Math.round(error.at/1000)} с — {error.note}</b><p>{error.advice}</p></div>}
    <details><summary>Все ошибки и пропуски ({player.errors.length})</summary><ol>{player.errors.map((e,i) => <li key={i}><button onClick={() => { setLevel(routeLevel(e.pos)); setMode('2d'); setTime(Math.min(review.durationMs,e.at)); setSelected(i); }}>{Math.round(e.at/1000)} с · {e.note}</button></li>)}</ol></details>
    <p className="route-legend">Путь записан с интервалами. Место ошибки — положение игрока при записи в журнал; оно не всегда совпадает с источником опасности. В 3D путь между этажами непрерывен; разрывы означают перерыв записи или скачок позиции. В 2D показан только выбранный этаж.</p>
  </section>;
}
