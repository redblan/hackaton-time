import { expect, it, vi } from 'vitest';
import { ResourceCache } from '../src/world/decor/resourceCache';

it('reuses resources after unmount/remount and keeps active entries alive under pressure',()=>{
  const dispose=vi.fn();
  const cache=new ResourceCache<{bytes:number}>({entries:2,bytes:10},v=>v.bytes,dispose);
  const make=vi.fn(()=>({bytes:4}));
  const a=cache.acquire('a',make);a.release();a.release();
  const again=cache.acquire('a',make);
  expect(again.value).toBe(a.value);expect(make).toHaveBeenCalledTimes(1);
  const b=cache.acquire('b',make);b.release();
  const c=cache.acquire('c',make);
  expect(dispose).toHaveBeenCalledExactlyOnceWith(b.value);
  expect(cache.stats()).toMatchObject({entries:2,bytes:8,active:2,hits:1});
  cache.clearIdle();expect(dispose).toHaveBeenCalledTimes(1);
  again.release();c.release();cache.clearIdle();
  expect(dispose).toHaveBeenCalledTimes(3);expect(cache.stats().bytes).toBe(0);
});

it('enforces byte budget and permits only temporary overflow for pinned resources',()=>{
  const dispose=vi.fn();
  const cache=new ResourceCache<number>({entries:10,bytes:6},v=>v,dispose);
  const a=cache.acquire('a',()=>4),b=cache.acquire('b',()=>4);
  expect(dispose).not.toHaveBeenCalled();expect(cache.stats().bytes).toBe(8);
  a.release();expect(dispose).toHaveBeenCalledWith(4);expect(cache.stats().bytes).toBe(4);
  b.release();
  const huge=cache.acquire('large',()=>20);expect(cache.stats().active).toBe(1);
  huge.release();expect(cache.stats()).toMatchObject({entries:0,bytes:0,active:0});
});

it('LRU evicts the least recently acquired idle item',()=>{
  const dispose=vi.fn();
  const cache=new ResourceCache<string>({entries:2,bytes:100},v=>v.length,dispose);
  cache.acquire('a',()=> 'a').release();cache.acquire('b',()=> 'b').release();
  cache.acquire('a',()=> 'should not rebuild').release();
  cache.acquire('c',()=> 'c').release();
  expect(dispose).toHaveBeenCalledExactlyOnceWith('b');
});
