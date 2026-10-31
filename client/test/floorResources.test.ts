import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { buildFloorResources, floorResourceBytes, floorResourceCache } from '../src/world/decor/Interior';

beforeAll(()=>vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})})}));
afterAll(()=>{floorResourceCache.clearIdle();vi.unstubAllGlobals();});

it('reuses the complete real floor bundle across remounts, including doors/materials/labels',()=>{
  floorResourceCache.clearIdle();
  const make=vi.fn(()=>buildFloorResources(1,4));
  const a=floorResourceCache.acquire('test:1:4',make);
  const dispose=vi.fn();a.value.solid.addEventListener('dispose',dispose);
  expect(floorResourceBytes(a.value)).toBeGreaterThan(0);
  const door=a.value.parts.leaves[0].geometry;
  a.release();
  const b=floorResourceCache.acquire('test:1:4',make);
  const secondScene=floorResourceCache.acquire('test:1:4',make);
  expect(b.value).toBe(a.value);expect(b.value.parts.leaves[0].geometry).toBe(door);
  expect(make).toHaveBeenCalledTimes(1);
  b.release();floorResourceCache.clearIdle();expect(dispose).not.toHaveBeenCalled();
  secondScene.release();floorResourceCache.clearIdle();expect(dispose).toHaveBeenCalledTimes(1);
});

it('keeps bounded memory while visiting every floor of both entrances',()=>{
  floorResourceCache.clearIdle();
  for(const entrance of [1,2]) for(let floor=1;floor<=9;floor++) {
    const lease=floorResourceCache.acquire(`test:${entrance}:${floor}`,()=>buildFloorResources(entrance,floor));
    const position=lease.value.solid.attributes.position;
    expect(position.count).toBeGreaterThan(0);
    expect(lease.value.parts.leaves).toHaveLength(2);
    lease.release();
    expect(floorResourceCache.stats().entries).toBeLessThanOrEqual(6);
    expect(floorResourceCache.stats().bytes).toBeLessThanOrEqual(32*1024*1024);
  }
});
