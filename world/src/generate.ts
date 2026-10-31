import { ITEMS, type ChunkData, type WorldObject, type Vec3, type InteractableId, type ZoneId } from '@game/shared';

function content(x: number, y: number, z: number) {
  const objects: WorldObject[] = [];
  const p = (a: number, b: number, c: number): Vec3 => [x+a,y+b,z+c];
  const box = (id: string, pos: Vec3, size: Vec3, color: string, when?: string) => objects.push({id,kind:'box',pos:p(...pos),size,color,collide:true,...(when ? {when}: {})});
  const zone = (zone: ZoneId, min: Vec3, max: Vec3, when?: string) => objects.push({id:zone,kind:'zone',zone,min:p(...min),max:p(...max),...(when ? {when}: {})});
  const interact = (target: InteractableId, pos: Vec3, label: string) => objects.push({id:target,kind:'interactable',target,pos:p(...pos),radius:1.5,label});
  return {objects,p,box,zone,interact};
}

export function floorChunk(entrance: number, floor: number): ChunkData {
  const x=(entrance-1)*12,y=(floor-1)*3;
  const {objects,p,box,zone,interact}=content(x,y,0);
  // Leave the southern stairwell open through the slab; two flights meet at a landing.
  box('slab',[6,.05,7.5],[12,.1,9],'#d9c9b0');
  box('landing',[6,.05,1.5],[4,.1,3],'#d9c9b0');
  for(let i=0;i<10;i++) {
    box(`stair-a-${i}`,[1+i*.3,-2.85+i*.15,1.5],[.3,.3,2],'#b8aaa0');
    box(`stair-b-${i}`,[8+i*.3,-1.35+i*.15,1.5],[.3,.3,2],'#b8aaa0');
  }
  box('half-landing',[6,-1.5,1.5],[4,.2,2],'#b8aaa0');
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
  interact('cover_table',[3,0,8],'Укрыться под столом');
  interact('cover_wall',[5,0,10],'Укрыться у внутренней стены');
  interact('cover_window',[8,0,11],'Подойти к окну');
  interact('cover_wardrobe',[1.5,0,6.5],'Встать у шкафа');
  interact('cover_run_out',[5,0,5.5],'Выбежать из квартиры');
  const labels=['Документы','Телефон','Аптечка','Вода','Фонарик','Тёплая одежда','Ноутбук','Приставка','Кружки'];
  ITEMS.forEach((item,i)=> {
    const pos: Vec3=[7+(i%3),1,7+Math.floor(i/3)];
    box(`prop-${item}`,pos,[.25,.2,.25],i<6?'#efc56c':'#8b96ac');
    interact(`item_${item}`,pos,labels[i]);
  });
  interact('gas_valve',[10,1,10],'Перекрыть газ');
  interact('light_switch',[6.2,1.2,5.2],'Выключатель света');
  interact('apartment_door',[5,0,5],'Дверь квартиры');
  interact('elevator_call',[8.5,1,4],'Вызвать лифт');
  interact('elevator_shaft',[10,0,3.5],'Поговорить с человеком в лифте');
  interact('balcony_door',[entrance===1?11.5:.5,0,4.5],'Переход в соседний подъезд');
  zone('z_apartment',[.2,0,5.2],[11.8,3,11.8]);
  zone('z_hall',[0,0,3],[12,3,5]);
  zone('z_stairs',[0,-3,0],[12,3,3]);
  zone('z_elevator',[8,0,3],[11,3,4.5]);
  zone('z_balcony',[entrance===1?11:0,0,4],[entrance===1?12:1,3,5]);
  zone('z_smoke',[3,0,3],[7,3,5],`fire_f${floor}`);
  zone('z_collapse',[8,-1.5,0],[11,1,3],`collapse_f${floor}`);
  box('rubble',[9.5,.4,1.5],[2.5,.8,2], '#8b817c',`collapse_f${floor}`);
  objects.push({id:'smoke',kind:'fx',fx:'smoke',pos:p(5,1,4),size:2,when:`fire_f${floor}`});
  if(entrance===1) {
    objects.push({id:'vanya',kind:'npc',npcId:'vanya',pos:p(10,0,4),when:'lift_vanya'});
    if(floor>=6) objects.push({id:'spawn-top',kind:'spawn',role:'inside_top',pos:p(3,0,6)},{id:'papa',kind:'npc',npcId:'papa',pos:p(4,0,9)});
    if(floor===3) {
      interact('neighbor_door',[7,0,5.5],'Постучать соседке');
      objects.push({id:'valentina',kind:'npc',npcId:'valentina',pos:p(7,0,6),when:'neighbor_valentina'},{id:'spawn-mid',kind:'spawn',role:'inside_mid',pos:p(5,0,4)});
    }
  }
  if(floor===1) zone('z_exit_door',[4,0,0],[8,3,1]);
  objects.push({id:'floor-sign',kind:'sign',pos:p(7,2,5),text:`Подъезд ${entrance} · Этаж ${floor}`});
  return {id:`e${entrance}f${floor}`,bounds:{min:[x,y,0],max:[x+12,y+3,12]},neighbors:[...(floor>1?[`e${entrance}f${floor-1}`]:[`y${entrance-1}0`]),...(floor<9?[`e${entrance}f${floor+1}`]:[]),`e${3-entrance}f${floor}`],objects};
}

export function yardChunk(col:number,row:number): ChunkData {
  const x=col*12,z=-(row+1)*12;
  const {objects,p,box,zone,interact}=content(x,0,z);
  box('ground',[6,-.1,6],[12,.2,12],'#8dab80');
  box('path',[6,.01,6],[4,.02,12],'#d7c8ac');
  zone('z_yard',[0,0,0],[12,4,12]);
  if(row===0 && col<2) {
    box('canopy',[6,2.7,10],[5,.25,3],'#dbad79');
    zone('z_canopy_danger',[3,0,8],[9,3,12]);
    interact('address_plate',[8,1.7,11.8],'Прочитать адрес');
    objects.push({id:'address',kind:'sign',pos:p(8,2,11.8),text:'Учебная улица, 12'});
  } else {
    box('tree-trunk',[2,1.3,3],[.4,2.6,.4],'#957353');
    box('tree-crown',[2,3.2,3],[2.5,2,2.5],'#609577');
    box('bench',[9,.5,8],[2,.2,.6],'#dcaa69');
  }
  if(col===2 && row===0) {
    box('pole',[3,2.5,6],[.25,5,.25],'#8c8c91');
    box('wire',[5,.1,6],[4,.08,.08],'#343a40','wire');
    zone('z_wire_danger',[1,0,2],[11,3,10],'wire');
    objects.push({id:'sparks',kind:'fx',fx:'sparks',pos:p(7,.2,6),when:'wire'});
  }
  if(col===1 && row===2) {
    zone('z_safe_area',[0,0,0],[12,4,12]);
    box('sandbox',[3,.15,4],[4,.3,4],'#efd58e');
    box('play-platform',[9,1,4],[2,.2,2],'#efb36d');
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
    interact('brigade',[6,0,5],'Передать пострадавших бригаде');
    objects.push({id:'gromov',kind:'npc',npcId:'gromov',pos:p(6,0,5)});
  }
  const neighbors:string[]=[];
  if(row===0 && col<2) neighbors.push(`e${col+1}f1`);
  for(const [a,b] of [[col,row-1],[col,row+1],[col-1,row],[col+1,row]]) if(a>=0&&a<3&&b>=0&&b<4) neighbors.push(`y${a}${b}`);
  return {id:`y${col}${row}`,bounds:{min:[x,0,z],max:[x+12,6,z+12]},neighbors,objects};
}

export function generateWorld():ChunkData[] {
  return [...Array.from({length:18},(_,i)=>floorChunk(Math.floor(i/9)+1,i%9+1)),...Array.from({length:12},(_,i)=>yardChunk(Math.floor(i/4),i%4))];
}
