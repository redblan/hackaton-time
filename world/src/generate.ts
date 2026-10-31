import { ITEMS, type ItemId, type ChunkData, type WorldObject, type Vec3, type InteractableId, type ZoneId } from '@game/shared';

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
  // Leave the southern stairwell open through the slab; two flights meet at a landing.
  box('slab',[6,-.05,7.5],[12,.1,9],'#d9c9b0');
  box('landing',[6,-.05,1.5],[4,.1,3],'#d9c9b0');
  for(let i=0;i<10;i++) {
    box(`stair-a-${i}`,[1+i*.3,-2.85+i*.15,1.5],[.3,.3,3],'#b8aaa0');
    box(`stair-b-${i}`,[8+i*.3,-1.35+i*.15,1.5],[.3,.3,3],'#b8aaa0');
  }
  box('half-landing',[6,-1.5,1.5],[4,.2,3],'#b8aaa0');
  for(const edge of [.4,11.4]) box(`stair-end-rail-${edge}`,[edge,0,1.5],[.8,3,3],'#acb8b7');
  box('back-wall',[6,1.5,11.9],[12,3,.2],'#f3ddbd');
  box('side-west',[.1,1.5,7.5],[.2,3,9],'#f3ddbd');
  box('side-east',[11.9,1.5,7.5],[.2,3,9],'#f3ddbd');
  box('room-divider',[6,1.5,9],[.15,3,6],'#e9cba9');
  box('hall-wall-left',[2,1.5,5],[4,3,.15],'#edcba4');
  box('hall-wall-right',[9,1.5,5],[6,3,.15],'#edcba4');
  box('table-top',[3,.9,8],[2,.16,1.2],'#bc8055');
  for(const a of [-.8,.8]) for(const b of [-.4,.4]) box(`leg-${a}-${b}`,[3+a,.45,8+b],[.12,.9,.12],'#956944');
  box('bed',[2,.35,10.5],[2,.7,1.5],'#7fa7ae');
  box('wardrobe',[.6,1.1,6.5],[.8,2.2,1.6],'#b78159');
  box('kitchen',[10.9,.5,9],[1.5,1,4],'#81a99c');
  box('lift',[10,1.25,4],[2,2.5,.25],'#9da5ad');
  model('visual:table-top','furniture/table.glb',[3,0,8]);
  model('visual:bed','furniture/bedDouble.glb',[2,0,10.5]);
  model('visual:wardrobe','furniture/bookcaseClosedDoors.glb',[.6,0,6.5]);
  model('visual:kitchen','furniture/kitchenCabinet.glb',[10.9,0,9]);
  model('visual:stove','furniture/kitchenStove.glb',[10.2,0,10.5]);
  model('visual:lift','furniture/doorwayFront.glb',[10,0,4]);
  model('visual:door','furniture/doorwayOpen.glb',[5,0,5]);
  model('visual:stairs-a','furniture/stairs.glb',[2.35,-3,1.5],1,Math.PI/2);
  model('visual:stairs-b','furniture/stairs.glb',[9.35,-1.5,1.5],1,Math.PI/2);
  interact('cover_table',[3,0,8],'Укрыться под столом');
  interact('cover_wall',[5,0,10],'Укрыться у внутренней стены');
  interact('cover_window',[8,0,11],'Подойти к окну');
  interact('cover_wardrobe',[1.5,0,6.5],'Встать у шкафа');
  interact('cover_run_out',[5,0,5.5],'Выбежать из квартиры');
  ITEMS.forEach((item,i)=> {
    const pos: Vec3=[7+(i%3),1,7+Math.floor(i/3)];
    box(`prop-${item}`,pos,[.25,.2,.25],['laptop','console','mugs'].includes(item)?'#8b96ac':'#efc56c');
    interact(`item_${item}`,pos,itemLabels[item]);
  });
  interact('gas_valve',[10,1,10],'Перекрыть газ');
  interact('light_switch',[6.2,1.2,5.2],'Выключатель света');
  interact('apartment_door',[5,0,5],'Дверь квартиры');
  interact('elevator_call',[8.5,1,4],'Вызвать лифт');
  interact('elevator_shaft',[10,0,3.5],'Поговорить с человеком в лифте');
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
    zone('z_collapse',[8.25,0,.5],[10.75,.8,2.5],'collapse_f4');
    box('rubble',[9.5,.4,1.5],[2.5,.8,2], '#8b817c','collapse_f4');
  }
  objects.push({id:'smoke',kind:'fx',fx:'smoke',pos:p(5,1,4),size:2,when:`fire_f${floor}`});
  if(entrance===1) {
    objects.push({id:'vanya',kind:'npc',npcId:'vanya',pos:p(10,0,4),when:'lift_vanya'});
    if(floor>=6) objects.push({id:'spawn-top',kind:'spawn',role:'inside_top',pos:p(3,0,6),rotY:Math.PI},{id:'papa',kind:'npc',npcId:'papa',pos:p(4,0,9)});
    if(floor===3) {
      interact('neighbor_door',[7,0,5.5],'Постучать соседке');
      objects.push({id:'valentina',kind:'npc',npcId:'valentina',pos:p(7,0,6),when:'neighbor_valentina'},{id:'spawn-mid',kind:'spawn',role:'inside_mid',pos:p(5,0,4),rotY:Math.PI});
    }
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
  if(row===0 && col<2) {
    box('canopy',[6,2.7,10],[5,.25,3],'#dbad79');
    zone('z_canopy_danger',[3,0,8],[9,3,12]);
    interact('address_plate',[8,1.7,11.8],'Прочитать адрес');
    objects.push({id:'address',kind:'sign',pos:p(8,2,11.8),text:address});
    interact('building_plan',[3,1.5,11.8],'Посмотреть план эвакуации');
    objects.push({id:'plan',kind:'sign',pos:p(3,2,11.8),text:'План эвакуации: спуск по лестнице. Переход в соседний подъезд — этаж 4. Место сбора — детская площадка. Лифтом не пользоваться.'});
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
  return [...Array.from({length:18},(_,i)=>floorChunk(Math.floor(i/9)+1,i%9+1)),...Array.from({length:12},(_,i)=>yardChunk(Math.floor(i/4),i%4,address))];
}
