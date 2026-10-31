import { describe,it,expect } from 'vitest';
import { INTERACTABLES, ZONES } from '@game/shared';
import { generateWorld } from './generate';
import { validateWorld } from './validate';

describe('world',()=>{
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
      expect(c.objects.find(o=>o.id==='rubble')?.when).toBe(`collapse_f${floor}`);
    }
  });
});
