import { ITEMS, type ItemId, type ChunkData, type WorldObject, type Vec3, type InteractableId, type ZoneId } from '@game/shared';
import {addExterior} from './exterior';
import {addInterior} from './interior';
import {addRequestedObjects} from './requested';
import {addCrowd} from './crowdPlacements';
import {addProps} from './propPlacements';

const itemLabels: Record<ItemId, string> = {
  documents: 'Документы', phone: 'Телефон', first_aid_kit: 'Аптечка',
  water: 'Вода', flashlight: 'Фонарик', warm_clothes: 'Тёплая одежда',
  bandage: 'Бинт', laptop: 'Ноутбук', console: 'Приставка', mugs: 'Кружки',
};

function content(x: number, y: number, z: number) {
  const objects: WorldObject[] = [];
  const p = (a: number, b: number, c: number): Vec3 => [x+a,y+b,z+c];
  const box = (id: string, pos: Vec3, size: Vec3, color: string, when?: string) => objects.push({id,kind:'box',pos:p(...pos),size,color,collide:true,...(when ? {when}: {})});
  const zone = (zone: ZoneId, min: Vec3, max: Vec3, when?: string) => objects.push({id:zone,kind:'zone',zone,min:p(...min),max:p(...max),...(when ? {when}: {})});
  const interact = (target: InteractableId, pos: Vec3, label: string) => objects.push({id:target,kind:'interactable',target,pos:p(...pos),radius:1.5,label});
  const model = (id: string, src: string, pos: Vec3, scale=1, rotY=0) => objects.push({id,kind:'model',src,pos:p(...pos),scale,rotY,collide:false});
  return {objects,p,box,zone,interact,model};
}

export function floorChunk(entrance: number, floor: number): ChunkData {
  const x=(entrance-1)*12,y=(floor-1)*3;
  const {objects,p,box,zone,interact,model}=content(x,y,0);
  // Лестничная клетка по D-56: x 0..12, z 0..3. Площадка этажа x 8..12 на уровне пола.
  // Марш 1 вниз: z 0.15..1.4, от x=8 к x=5, с y до y−1.5; промежуточная площадка x 0.2..5 на y−1.5;
  // марш 2: z 1.6..2.85, от x=5 к x=8, вниз до y−3 — на площадку этажа ниже. На 1-м этаже маршей вниз нет.
  // Над любой точкой пути ≥ 2.7 м свободно (рост игрока 1.7).
  box('slab',[6,-.05,7.5],[12,.1,9],'#d9c9b0');
  const collapsed = floor===4 && entrance===1;
  if(floor===1) {
    box('landing',[6,-.05,1.5],[12,.1,3],'#d9c9b0');
    box('south-wall-w',[2,1.5,0],[4,3,.2],'#f3ddbd');
    box('south-wall-e',[10,1.5,0],[4,3,.2],'#f3ddbd');
  } else {
    box('landing',[10,-.05,1.5],[4,.1,3],'#d9c9b0');
    box('south-wall',[6,1.5,0],[12,3,.2],'#f3ddbd');
    // клетка закрыта от коридора нижнего этажа и перилами по краю над маршами (y−3..y+1)
    box('well-wall',[4,-1,2.975],[8,4,.15],'#e2d3c0');
    box('mid-landing',[2.6,-1.55,1.5],[4.8,.1,2.8],'#b8aaa0');
    box('flight-divider',[6.5,-1,1.5],[3,4,.2],'#c9c2bb');
    for(let i=0;i<10;i++) {
      // ступень: 0.3 по ходу, 0.15 вниз; коробка 0.3 высотой — снизу не видно щелей
      objects.push({id:`flight1-${i}`,kind:'box',pos:p(8-.3*(i+.5),-.15*(i+1)-.15,.775),size:[.3,.3,1.25],color:'#b8aaa0',collide:true,...(collapsed?{unless:'collapse_f4'}:{})});
      objects.push({id:`flight2-${i}`,kind:'box',pos:p(5+.3*(i+.5),-1.5-.15*(i+1)-.15,2.225),size:[.3,.3,1.25],color:'#b8aaa0',collide:true,...(collapsed?{unless:'collapse_f4'}:{})});
    }
  }
  // Над маршем 2 этого этажа обычно идёт марш верхнего этажа. Где его нет (9-й этаж; 3-й при обвале 4→3) — перила
  if(floor===9) box('top-rail',[8,.5,2.25],[.15,1,1.3],'#acb8b7');
  if(floor===3 && entrance===1) box('collapse-rail',[8,.5,2.25],[.15,1,1.3],'#acb8b7','collapse_f4');
  box('stair-west',[.1,1.5,1.5],[.2,3,3],'#f3ddbd');
  box('stair-east',[11.9,1.5,1.5],[.2,3,3],'#f3ddbd');
  box('back-wall',[6,1.5,11.9],[12,3,.2],'#f3ddbd');
  // Переходный балкон на 4-м этаже — проём в стене между подъездами (z 4..5)
  const sideWall = (id: string, wx: number, gap: boolean) => {
    if (!gap) return box(id,[wx,1.5,7.5],[.2,3,9],'#f3ddbd');
    box(`${id}-a`,[wx,1.5,3.5],[.2,3,1],'#f3ddbd');
    box(`${id}-b`,[wx,1.5,8.5],[.2,3,7],'#f3ddbd');
  };
  sideWall('side-west',.1,floor===4 && entrance===2);
  sideWall('side-east',11.9,floor===4 && entrance===1);
  box('room-divider',[6,1.5,9],[.15,3,6],'#e9cba9');
  box('hall-wall-left',[2,1.5,5],[4,3,.15],'#edcba4');
  box('hall-wall-right',[9,1.5,5],[6,3,.15],'#edcba4');
  box('table-top',[3,.9,8],[2,.16,1.2],'#bc8055');
  for(const a of [-.8,.8]) for(const b of [-.4,.4]) box(`leg-${a}-${b}`,[3+a,.45,8+b],[.12,.9,.12],'#956944');
  box('bed',[2,.35,10.5],[2,.7,1.5],'#7fa7ae');
  box('wardrobe',[.6,1.1,6.5],[.8,2.2,1.6],'#b78159');
  box('kitchen',[11.35,.5,9],[.8,1,4],'#81a99c'); // узкая тумба вдоль стены — комната просторнее
  box('lift',[10,1.25,4],[2,2.5,.25],'#9da5ad');
  model('visual:table-top','furniture/table.glb',[3,0,8]);
  model('visual:bed','furniture/bedDouble.glb',[2,0,10.5]);
  model('visual:wardrobe','furniture/bookcaseClosedDoors.glb',[.6,0,6.5]);
  model('visual:kitchen','furniture/kitchenCabinet.glb',[11.35,0,9]);
  model('visual:stove','furniture/kitchenStove.glb',[10.2,0,10.5]);
  model('visual:lift','furniture/doorwayFront.glb',[10,0,4]);
  model('visual:door','furniture/doorwayOpen.glb',[5,0,5]);
  // N3: the standing model and its collider disappear together.
  for(const object of objects) {
    if(object.id==='wardrobe'||object.id==='visual:wardrobe') object.unless='wardrobe_fallen';
  }
  objects.push({id:'wardrobe-fallen',kind:'box',pos:p(1.3,.4,6.5),size:[2.2,.8,1.6],color:'#b78159',collide:true,when:'wardrobe_fallen'});
  objects.push({id:'window-glass',kind:'box',pos:p(8,1.7,11.77),size:[2,1.5,.04],color:'#a8dce4',collide:false,unless:'window_broken'});
  for(let i=0;i<5;i++) objects.push({id:`window-shard-${i}`,kind:'box',pos:p(7.2+i*.35,.025,10.7+(i%2)*.35),size:[.25,.04,.15],rotY:i*.7,color:'#b9e5eb',collide:false,when:'window_broken'});
  objects.push({id:'window-dust',kind:'fx',fx:'dust',pos:p(8,1,11),size:.6,when:'window_broken'});
  if(floor===4) {
    // Small fragments on the edge: never block the only detour around collapse_f4.
    for(let i=0;i<3;i++) objects.push({id:`balcony-debris-${i}`,kind:'box',pos:p(entrance===1?11.6:.4,.06,4.05+i*.12),size:[.22,.12,.18],color:'#9b8d7d',rotY:i*.6,collide:false,when:'balcony_debris'});
    objects.push({id:'balcony-dust',kind:'fx',fx:'dust',pos:p(entrance===1?11.6:.4,.4,4.4),size:.5,when:'balcony_debris'});
  }
  interact('cover_table',[3,0,8],'Укрыться под столом');
  interact('cover_wall',[5,0,10],'Укрыться у внутренней стены');
  interact('cover_window',[8,0,11],'Подойти к окну');
  interact('cover_wardrobe',[1.5,0,6.5],'Встать у шкафа');
  interact('cover_run_out',[5,0,5.5],'Выбежать из квартиры');
  ITEMS.forEach((item,i)=> {
    const pos: Vec3=[6.9+(i%5)*.75,1,7+Math.floor(i/5)*.6]; // 5×2 на узком комоде у перегородки
    box(`prop-${item}`,pos,[.25,.2,.25],['laptop','console','mugs'].includes(item)?'#8b96ac':'#efc56c');
    interact(`item_${item}`,pos,itemLabels[item]);
  });
  interact('gas_valve',[10,1,10],'Перекрыть газ');
  interact('light_switch',[6.2,1.2,5.2],'Выключатель света');
  interact('apartment_door',[5,0,5],'Дверь квартиры');
  interact('elevator_call',[8.5,1,4],'Вызвать лифт');
  // Застрявший в лифте — на этаже ниже старта (1-й подъезд). Этаж выбирает сервер флагом vanya_f{N} (D-67)
  const vanyaHere = entrance===1 && floor>=5 && floor<=8;
  if(vanyaHere) objects.push({id:'elevator_shaft',kind:'interactable',target:'elevator_shaft',pos:p(10,0,3.5),radius:1.5,label:'Поговорить с человеком в лифте',when:`vanya_f${floor}`});
  if(floor===4) interact('balcony_door',[entrance===1?11.5:.5,0,4.5],'Переход в соседний подъезд');
  else box('hall-end',[entrance===1?11.9:.1,1.5,4],[.2,3,2],'#f3ddbd');
  zone('z_apartment',[.2,0,5.2],[11.8,3,11.8]);
  zone('z_hall',[0,0,3],[12,3,5]);
  zone('z_stairs',[0,-3,0],[12,3,3]);
  zone('z_elevator',[8,0,3],[11,3,4.5]);
  if(floor===4) zone('z_balcony',[entrance===1?11:0,0,4],[entrance===1?12:1,3,5]);
  zone('z_smoke',[3,0,3],[7,3,5],`fire_f${floor}`);
  // The other entrance must remain a usable detour around the damaged flight.
  if(floor===4 && entrance===1) {
    // Обвал (D-46): марши 4→3 рухнули (flight1/2 с unless), на краю провала — завал по колено.
    // z_collapse — сам провал: полез через завал → ошибка «полез по обломкам», обход — балкон в 2-й подъезд.
    box('rubble',[7.8,.3,.775],[.5,.6,1.25],'#8b817c','collapse_f4');
    box('rubble-mid',[4,-1.2,1.5],[1.6,.6,2],'#8b817c','collapse_f4');
    zone('z_collapse',[5,-1.6,.15],[8,.6,1.4],'collapse_f4');
  }
  objects.push({id:'smoke',kind:'fx',fx:'smoke',pos:p(5,1,4),size:2,when:`fire_f${floor}`});
  objects.push({id:'fire',kind:'fx',fx:'fire',pos:p(3.5,.1,4.6),size:.6,when:`fire_f${floor}`});
  if(entrance===1) {
    // в глубине кабины (двери z 3.75, задняя стенка ~4.9), лицом к дверям
    if(vanyaHere) objects.push({id:'vanya',kind:'npc',npcId:'vanya',pos:p(10,0,4.5),when:`vanya_f${floor}`});
    if(floor>=6) objects.push({id:'spawn-top',kind:'spawn',role:'inside_top',pos:p(3,0,6),rotY:Math.PI},{id:'papa',kind:'npc',npcId:'papa',pos:p(4,0,9),unless:'papa_left'});
    if(floor===3) {
      objects.push({id:'spawn-mid',kind:'spawn',role:'inside_mid',pos:p(5,0,4),rotY:Math.PI});
    }
  }
  // Соседка ждёт там, куда игрок реально дойдёт: при обвале обход идёт через 2-й подъезд.
  if(floor===3) {
    const when=`valentina_e${entrance}`;
    objects.push({id:'neighbor_door',kind:'interactable',target:'neighbor_door',pos:p(7,0,5.5),radius:1.5,label:'Постучать соседке',when});
    objects.push({id:'valentina',kind:'npc',npcId:'valentina',pos:p(7,0,6),when});
  }
  if(floor===1) zone('z_exit_door',[4,0,0],[8,3,1]);
  objects.push({id:'floor-sign',kind:'sign',pos:p(7,2,5),text:`Подъезд ${entrance} · Этаж ${floor}`});
  return {id:`e${entrance}f${floor}`,bounds:{min:[x,y,0],max:[x+12,y+3,12]},neighbors:[...(floor>1?[`e${entrance}f${floor-1}`]:[`y${entrance-1}0`]),...(floor<9?[`e${entrance}f${floor+1}`]:[]),...(floor===4?[`e${3-entrance}f${floor}`]:[])],objects};
}

export function yardChunk(col:number,row:number,address='ул. Садовая, 14'): ChunkData {
  const x=col*12,z=-(row+1)*12;
  const {objects,p,box,zone,interact,model}=content(x,0,z);
  box('ground',[6,-.1,6],[12,.2,12],'#8dab80');
  box('path',[6,.01,6],[4,.02,12],'#d7c8ac');
  zone('z_yard',[0,0,0],[12,4,12]);
  // Забор по краю мира: за ним пустота. 1.2 м — не перепрыгнуть (прыжок ~0.8 м)
  const fence = (id: string, pos: Vec3, size: Vec3) => box(id,pos,size,'#b9a27f');
  if(col===0) fence('fence-w',[.1,.6,6],[.2,1.2,12]);
  if(col===2) fence('fence-e',[11.9,.6,6],[.2,1.2,12]);
  if(row===3) fence('fence-s',[6,.6,.1],[12,1.2,.2]);
  if(row===0 && col===2) fence('fence-n',[6,.6,11.9],[12,1.2,.2]);
  if(row===0 && col<2) {
    box('canopy',[6,2.7,10],[5,.25,3],'#dbad79');
    zone('z_canopy_danger',[3,0,8],[9,3,12]);
    interact('address_plate',[8,1.7,11.8],'Прочитать адрес');
    objects.push({id:'address',kind:'sign',pos:p(8,2,11.8),text:address});
    // On the facade beside the canopy, facing the yard (-Z). Reading the plan
    // must not require entering z_canopy_danger or obstruct the exit x=4..8.
    if(col===0) {
      interact('building_plan',[1.7,1.5,11.65],'План: лестницы, переход на 4-м этаже, место сбора');
      model('evacuation-plan','signs/evacuation-e1.glb',[1.7,.8,11.82],1,Math.PI);
    }
  } else {
    box('tree-trunk',[2,1.3,3],[.4,2.6,.4],'#957353');
    box('tree-crown',[2,3.2,3],[2.5,2,2.5],'#609577');
    box('bench',[9,.5,8],[2,.2,.6],'#dcaa69');
    model('visual:tree','city/tree-large.glb',[2,0,3]);
    model('visual:bench','furniture/bench.glb',[9,0,8]);
  }
  if(col===2 && row===0) {
    box('pole',[3,2.5,6],[.25,5,.25],'#8c8c91');
    model('visual:pole','furniture/lampRoundFloor.glb',[3,0,6]);
    box('wire',[5,.1,6],[4,.08,.08],'#343a40','wire');
    zone('z_wire_danger',[1,0,2],[11,3,10],'wire');
    objects.push({id:'sparks',kind:'fx',fx:'sparks',pos:p(7,.2,6),when:'wire'});
    box('gas-pipe',[9,.7,6],[.2,1.4,3],'#d5b34c','gas');
    objects.push({id:'gas-warning',kind:'sign',pos:p(8,1.8,4),text:'Запах газа! Не приближайтесь. Сообщите в 112.',when:'gas'});
    // The shared fx union has no gas kind: smoke + when:gas identifies this visual to the renderer.
    objects.push({id:'gas-cloud',kind:'fx',fx:'smoke',pos:p(9,.2,6),size:1.5,when:'gas'});
  }
  if(col===1 && row===2) {
    zone('z_safe_area',[0,0,0],[12,4,12]);
    box('sandbox',[3,.15,4],[4,.3,4],'#efd58e');
    box('play-platform',[9,1,4],[2,.2,2],'#efb36d');
    model('visual:play-stairs','furniture/stairs.glb',[9,0,4]);
    objects.push({id:'spawn-outside',kind:'spawn',role:'outside',pos:p(6,0,6)},{id:'mihalych',kind:'npc',npcId:'mihalych',pos:p(5,0,8)});
  }
  const victims=['victim_bleeding','victim_cpr','victim_unconscious','victim_scared','neighbor_leg'] as const;
  const index=row*3+col-3;
  if(index>=0 && index<victims.length) {
    const npcId=victims[index];
    objects.push({id:npcId,kind:'npc',npcId,pos:p(8,0,5),pose:'lie'});
    objects.push({id:`interact-${npcId}`,kind:'interactable',target:npcId,pos:p(8,0,5),radius:2,label:'Помочь пострадавшему'});
  }
  if(col===1 && row===3) {
    box('ambulance',[9,1.2,5],[2.5,2.4,5],'#eee8db');
    model('visual:ambulance','cars/ambulance.glb',[9,0,5]);
    interact('brigade',[6,0,5],'Передать пострадавших бригаде');
    objects.push({id:'gromov',kind:'npc',npcId:'gromov',pos:p(6,0,5)});
  }
  const neighbors:string[]=[];
  if(row===0 && col<2) neighbors.push(`e${col+1}f1`);
  for(const [a,b] of [[col,row-1],[col,row+1],[col-1,row],[col+1,row]]) if(a>=0&&a<3&&b>=0&&b<4) neighbors.push(`y${a}${b}`);
  return {id:`y${col}${row}`,bounds:{min:[x,0,z],max:[x+12,6,z+12]},neighbors,objects};
}

export function generateWorld(address='ул. Садовая, 14'):ChunkData[] {
  return [...Array.from({length:18},(_,i)=>floorChunk(Math.floor(i/9)+1,i%9+1)),...Array.from({length:12},(_,i)=>yardChunk(Math.floor(i/4),i%4,address))].map(addExterior).map(addInterior).map(addRequestedObjects).map(addProps).map(addCrowd);
}
