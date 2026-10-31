import {expect,it} from 'vitest';
import {isObjectActive} from '@game/shared';
import {generateWorld} from './generate';

it('switches each N3 state through the shared visibility contract',()=>{
  const chunks=generateWorld(), floor=chunks.find(c=>c.id==='e1f7')!;
  const visible=(flags:string[])=>floor.objects.filter(o=>isObjectActive(o,flags)).map(o=>o.id);
  expect(visible([])).toContain('papa');
  expect(visible(['papa_left'])).not.toContain('papa');
  expect(visible([])).toContain('window-glass');
  expect(visible(['window_broken'])).not.toContain('window-glass');
  expect(visible(['window_broken'])).toContain('window-shard-0');
  expect(visible([])).not.toContain('wardrobe-fallen');
  expect(visible(['wardrobe_fallen'])).toContain('wardrobe-fallen');
  for(const id of ['wardrobe','visual:wardrobe']) expect(visible(['wardrobe_fallen'])).not.toContain(id);
  for(const chunk of chunks.filter(c=>c.id.startsWith('e'))) {
    const flag=`fire_f${chunk.id.slice(3)}`;
    for(const id of ['fire','smoke']) {
      const object=chunk.objects.find(o=>o.id===id)!;
      expect(isObjectActive(object,[])).toBe(false);
      expect(isObjectActive(object,[flag])).toBe(true);
      expect(isObjectActive(object,['fire_f99'])).toBe(false);
    }
  }
  const balcony=chunks.flatMap(c=>c.objects.filter(o=>o.when==='balcony_debris').map(o=>({chunk:c.id,object:o})));
  expect(new Set(balcony.map(o=>o.chunk))).toEqual(new Set(['e1f4','e2f4']));
  for(const {object} of balcony) {
    expect(isObjectActive(object,[])).toBe(false);
    expect(isObjectActive(object,['balcony_debris'])).toBe(true);
    if(object.kind==='box') expect(object.collide).toBe(false);
  }
  const cloud=chunks.find(c=>c.id==='y20')!.objects.find(o=>o.id==='gas-cloud')!;
  expect(isObjectActive(cloud,['wire'])).toBe(false);
  expect(isObjectActive(cloud,['gas'])).toBe(true);
});
