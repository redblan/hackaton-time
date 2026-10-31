import {expect,it} from 'vitest';
import {generateWorld} from './generate';

it('places facade and yard details without covering stairwells',()=>{
  const chunks=generateWorld();
  for(const chunk of chunks) {
    if(chunk.id.startsWith('e')) {
      expect(chunk.objects.filter(o=>o.id.startsWith('facade-window-'))).toHaveLength(2);
      const roof=chunk.objects.find(o=>o.id==='roof-deck');
      expect(Boolean(roof)).toBe(chunk.id.endsWith('f9'));
      if(roof?.kind==='box') expect(roof.pos[2]-roof.size[2]/2).toBeGreaterThanOrEqual(3);
    } else {
      expect(chunk.objects.filter(o=>o.id.startsWith('lamp-head-'))).toHaveLength(2);
      if(['y00','y10'].includes(chunk.id)) {
        const danger=chunk.objects.find(o=>o.kind==='zone'&&o.zone==='z_canopy_danger');
        expect(danger?.kind).toBe('zone');
        for(const crack of chunk.objects.filter(o=>o.id.startsWith('canopy-crack-'))) if(crack.kind==='box'&&danger?.kind==='zone') {
          for(const axis of [0,2]) {expect(crack.pos[axis]).toBeGreaterThan(danger.min[axis]);expect(crack.pos[axis]).toBeLessThan(danger.max[axis]);}
        }
      }
    }
  }
  expect(chunks.flatMap(c=>c.objects).filter(o=>o.id==='parked-car-body')).toHaveLength(3);
});
