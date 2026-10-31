import { describe,it,expect } from 'vitest';
import { INTERACTABLES, ZONES } from '@game/shared';
import { generateWorld } from './generate';
import { validateWorld } from './validate';

describe('world',()=>{
  it('places slab tops at floor height and closes stair side gaps',()=>{
    for(const c of generateWorld().filter(c=>c.id.startsWith('e'))) {
      for(const id of ['slab','landing']) {
        const o=c.objects.find(o=>o.id===id);
        expect(o?.kind).toBe('box');
        if(o?.kind==='box') expect(o.pos[1]+o.size[1]/2).toBeCloseTo(c.bounds.min[1]);
      }
      for(const o of c.objects.filter(o=>o.id.startsWith('stair-a-')||o.id.startsWith('stair-b-'))) {
        if(o.kind==='box') {expect(o.pos[2]-o.size[2]/2).toBe(0);expect(o.pos[2]+o.size[2]/2).toBe(3);}
      }
      for(const o of c.objects.filter(o=>o.kind==='spawn')) if(o.kind==='spawn') expect(o.rotY).toBe(Math.PI);
    }
  });
  it('generates a deterministic connected world with all gameplay targets',()=>{
    const chunks=generateWorld();
    expect(()=>validateWorld(chunks)).not.toThrow();
    expect(generateWorld()).toEqual(chunks);
    const objects=chunks.flatMap(c=>c.objects);
    expect(new Set(objects.filter(o=>o.kind==='interactable').map(o=>o.target))).toEqual(new Set(INTERACTABLES));
    expect(new Set(objects.filter(o=>o.kind==='zone').map(o=>o.zone))).toEqual(new Set(ZONES));
    const visited=new Set<string>();
    const visit=(id:string)=>{if(visited.has(id))return;visited.add(id);chunks.find(c=>c.id===id)!.neighbors.forEach(visit);};
    visit('e1f9');expect(visited.size).toBe(30);
  });
  it('rejects duplicate IDs, bad bounds and broken neighbors',()=>{
    for(const mutate of [
      (c:ReturnType<typeof generateWorld>)=>c[0].objects.push(c[0].objects[0]),
      (c:ReturnType<typeof generateWorld>)=>{c[0].bounds.min[0]=99;},
      (c:ReturnType<typeof generateWorld>)=>c[0].neighbors.push('missing'),
    ]) {const c=generateWorld();mutate(c);expect(()=>validateWorld(c)).toThrow();}
  });
  it('gates hazards on matching floor flags',()=>{
    for(const c of generateWorld().filter(c=>c.id.startsWith('e'))) {
      const floor=c.id.slice(3);
      expect(c.objects.find(o=>o.id==='z_smoke')?.when).toBe(`fire_f${floor}`);
      expect(c.objects.find(o=>o.id==='rubble')?.when).toBe(c.id==='e1f4'?'collapse_f4':undefined);
      expect(c.objects.some(o=>o.kind==='zone'&&o.zone==='z_balcony')).toBe(floor==='4');
      expect(c.neighbors.some(n=>n.startsWith(c.id.startsWith('e1')?'e2':'e1'))).toBe(floor==='4');
    }
  });
  it('keeps item labels stable when the item dictionary grows',()=>{
    const objects=generateWorld()[0].objects;
    for(const [target,label] of [['item_bandage','Бинт'],['item_laptop','Ноутбук'],['item_mugs','Кружки']]) {
      expect(objects.find(o=>o.kind==='interactable'&&o.target===target)).toMatchObject({label});
    }
    const chunks=generateWorld();
    const item=chunks[0].objects.find(o=>o.kind==='interactable');
    if(item?.kind==='interactable') item.label='';
    expect(()=>validateWorld(chunks)).toThrow('Missing interaction label');
  });
  it('provides a yard gas warning and configurable address without wire effects',()=>{
    const objects=generateWorld('Тестовая, 1').flatMap(c=>c.objects);
    expect(objects.filter(o=>o.id==='address')).toHaveLength(2);
    expect(objects.filter(o=>o.id==='address').every(o=>o.kind==='sign'&&o.text==='Тестовая, 1')).toBe(true);
    const visible=objects.filter(o=>!o.when||o.when==='gas');
    expect(visible.some(o=>o.id==='gas-warning')).toBe(true);
    expect(visible.some(o=>o.kind==='fx'&&o.fx==='sparks')).toBe(false);
  });
});
