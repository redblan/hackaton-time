import type {ChunkData, Vec3, WorldObject} from '@game/shared';

/** N4 placement only. Lighting/material rendering belongs to the client owner. */
export function addExterior(chunk: ChunkData): ChunkData {
  const objects:WorldObject[]=[...chunk.objects];
  const [x,y,z]=chunk.bounds.min;
  const box=(id:string,pos:Vec3,size:Vec3,color:string,collide=false,rotY=0)=>objects.push({id,kind:'box',pos:[x+pos[0],y+pos[1],z+pos[2]],size,color,collide,rotY});
  if(chunk.id.startsWith('e')) {
    // Facade decorations do not replace structural walls or change collision geometry.
    for(const wx of [2,10]) {
      box(`facade-window-${wx}`,[wx,1.8,-.12],[1.5,1.25,.04],'#8ebac8');
      box(`facade-sill-${wx}`,[wx,1.12,-.16],[1.7,.1,.3],'#f6e1bd');
      box(`facade-mullion-${wx}`,[wx,1.8,-.15],[.06,1.3,.05],'#f9ebd5');
      box(`facade-transom-${wx}`,[wx,1.8,-.15],[1.55,.06,.05],'#f9ebd5');
    }
    box('facade-floor-band',[6,.15,-.13],[12,.16,.08],'#d1a582');
    if(chunk.id.endsWith('f9')) {
      // D-56: never put a roof over the stairwell (z < 3).
      box('roof-deck',[6,2.92,7.5],[12,.16,9],'#63737d');
      box('roof-rim',[6,2.9,11.9],[12,.2,.2],'#d9cbb6');
    }
  } else {
    const col=Number(chunk.id[1]),row=Number(chunk.id[2]);
    // IDs are stable anchors for the renderer: lamp-head-N.pos is the light position.
    for(const [i,lx,lz] of [[0,10.5,2],[1,3,9.5]]) {
      box(`lamp-post-${i}`,[lx,1.7,lz],[.14,3.4,.14],'#4b606a',true);
      box(`lamp-head-${i}`,[lx,3.45,lz],[.5,.25,.5],'#ffe3a0');
      box(`lamp-cap-${i}`,[lx,3.62,lz],[.65,.1,.65],'#4b606a');
    }
    if(row===0&&col<2) {
      for(let i=0;i<3;i++) box(`canopy-crack-${i}`,[5.6+i*.25,2.568,10+i*.35],[.045,.012,.65],'#514b46',false,i%2?.45:-.35);
      objects.push({id:'entrance-number',kind:'sign',pos:[x+6,2.2,z+11.7],text:`Подъезд ${col+1}`});
    }
    if(col===0&&row>=1) {
      // Parked cars along the edge, clear of the central evacuation path and victims.
      box('parked-car-body',[2,1,8],[2,1.4,3.8],row===1?'#d8785b':'#79a4bb',true);
      box('parked-car-cabin',[2,1.9,8],[1.7,.6,2.1],'#aacbd2');
      for(const dx of [-1,1]) for(const dz of [-1.2,1.2]) box(`car-wheel-${dx}-${dz}`,[2+dx,.45,8+dz],[.2,.6,.6],'#343e45');
    }
    if(chunk.id==='y12') {
      for(const lx of [7.2,10.8]) box(`swing-post-${lx}`,[lx,1.4,9.5],[.15,2.8,.15],'#d89165',true);
      box('swing-beam',[9,2.8,9.5],[3.8,.15,.15],'#d89165');
      for(const lx of [8.6,9.4]) box(`swing-rope-${lx}`,[lx,1.8,9.5],[.025,1.8,.025],'#586775');
      box('swing-seat',[9,.9,9.5],[1,.12,.5],'#8fb7a0');
      objects.push({id:'assembly-sign',kind:'sign',pos:[x+6,2,z+10.5],text:'МЕСТО СБОРА'});
    }
  }
  return {...chunk,objects};
}
