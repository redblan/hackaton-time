import { expect, it } from 'vitest';
import type { ChunkData, Vec3 } from '@game/shared';
import { generateWorld } from '../../world/src/generate';
import { getColliders } from '../src/world/ChunkView';
import { stepBody, type Body } from '../src/core/physics';
import { movementChunksReady, wantedChunks, transitionChunks } from '../src/core/chunkMath';

for(const latency of [0,18]) for(const collapse of [false,true]) it(`walks floor 9 to the yard with 3 chunks (collapse=${collapse}, delay=${latency} frames)`,()=>{
  const flags=collapse?['collapse_f4']:[];
  const all=Object.fromEntries(generateWorld().map(c=>[c.id,c]));
  const body:Body={pos:[3,24,6],vy:0,grounded:false};
  const path:Vec3[]=[[5,24,6],[5,24,3.3],[9.4,24,3.3]];
  let offset=0;
  for(let floor=9;floor>1;floor--) {
    const y=(floor-1)*3;
    if(collapse && floor===4) {
      path.push([8.4,y,3.3],[8.4,y,4.5],[20.4,y,4.5],[20.4,y,3.3],[21.4,y,3.3]);
      offset=12;
    }
    path.push([offset+9.4,y,.78],[offset+4.5,y-1.5,.78],[offset+4.5,y-1.5,2.22],[offset+9.4,y-3,2.22]);
  }
  path.push([offset+9.4,0,.78],[offset+7.5,0,.78],[offset+7.5,0,-6],[18,0,-6],[18,0,-30]);
  let maxLoaded=0;
  let cachedKey='';let colliders:ReturnType<typeof getColliders>=[];
  let loaded:Record<string,ChunkData>={};
  let frame=0,requested='';
  const responses:{due:number;ids:string[]}[]=[];
  for(const target of path) {
    let frames=0;
    while(Math.hypot(target[0]-body.pos[0],target[2]-body.pos[2])>.07 && frames++<5000) {
      frame++;
      while(responses[0]?.due<=frame) {
        const response=responses.shift()!;
        loaded=Object.fromEntries(response.ids.map(id=>[id,all[id]]));
      }
      const key=Object.keys(loaded).join(',');
      maxLoaded=Math.max(maxLoaded,Object.keys(loaded).length);
      if(cachedKey!==key) {cachedKey=key;colliders=Object.values(loaded).flatMap(c=>getColliders(c,flags));}
      const dx=target[0]-body.pos[0],dz=target[2]-body.pos[2],d=Math.hypot(dx,dz);
      const next:Vec3=[body.pos[0]+dx/d*.05,body.pos[1],body.pos[2]+dz/d*.05];
      const here=movementChunksReady(body.pos,loaded),ready=here&&movementChunksReady(next,loaded);
      const ids=ready?wantedChunks(body.pos,loaded):transitionChunks(body.pos,here?next:body.pos,loaded);
      if(requested!==ids.join(',')) {requested=ids.join(',');responses.push({due:frame+latency,ids});}
      if(!ready) {body.vy=0;continue;}
      const before=body.pos[1];
      stepBody(body,dx/d*.05,dz/d*.05,colliders,.016,{gravity:true,jump:false});
      expect(before-body.pos[1]).toBeLessThan(.5);
      expect(body.pos[1]).toBeGreaterThan(-.5);
    }
    expect(frames,`stuck before ${target}; feet=${body.pos}`).toBeLessThan(5000);
  }
  expect(maxLoaded).toBe(3);expect(body.pos[2]).toBeLessThan(-29.9);
},30000);
