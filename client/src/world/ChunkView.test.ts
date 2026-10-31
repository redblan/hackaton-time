import { describe, expect, it } from 'vitest';
import type { ChunkData } from '@game/shared';
import { getColliders } from './ChunkView';

describe('merged world visibility contract',()=>{
  const chunk: ChunkData={id:'test',bounds:{min:[0,0,0],max:[12,3,12]},neighbors:[],objects:[
    {id:'conditional',kind:'box',pos:[2,1,2],size:[2,2,2],color:'#fff',when:'present',unless:'removed'},
    {id:'decor',kind:'box',pos:[6,1,6],size:[1,1,1],color:'#fff',collide:false},
    {id:'model',kind:'model',src:'furniture/table.glb',pos:[2,0,2],collide:false},
  ]};
  it('requires when and removes colliders on unless, retaining model-free collision boxes',()=>{
    expect(getColliders(chunk,[])).toEqual([]);
    expect(getColliders(chunk,['present'])).toEqual([{min:[1,0,1],max:[3,2,3]}]);
    expect(getColliders(chunk,['present','removed'])).toEqual([]);
    expect(getColliders(chunk,['removed'])).toEqual([]);
  });
});
