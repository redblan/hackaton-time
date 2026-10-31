import { describe, expect, it } from "vitest";
import { chunkAt, gridNeighbors, wantedChunks, movementChunksReady, supportingChunks, transitionChunks } from "../src/core/chunkMath";
import type { ChunkData } from '@game/shared';

describe("сетка чанков", () => {
  it("позиция → чанк", () => {
    expect(chunkAt([2, 18, 2])).toBe("e1f7");
    expect(chunkAt([13, 0, 5])).toBe("e2f1");
    expect(chunkAt([25, 0, -13])).toBe("y21");
    expect(chunkAt([2, 26.9, 2])).toBe("e1f9");
  });
  it("не больше 3 и текущий первым", () => {
    expect(wantedChunks([2, 18, 2], {})).toEqual(["e1f7", "e1f6", "e1f8"]);
    expect(wantedChunks([12, 0, -12], {}).length).toBe(3);
    expect(gridNeighbors("e1f1")[0]).toBe("y00");
  });
});

describe('подгрузка на переходах',()=>{
  const chunk=(id:string):ChunkData=>({id,bounds:{min:[0,0,0],max:[12,3,12]},neighbors:gridNeighbors(id),objects:[]});
  it('prefetches the balcony before crossing and retains vertical flights in the stairwell',()=>{
    for(const x of [10,11.9,12.1,14]) {
      const ids=wantedChunks([x,9,4.5],{});
      expect(ids).toContain('e1f4');expect(ids).toContain('e2f4');expect(ids).toHaveLength(3);
    }
    expect(wantedChunks([10,9,1],{})).toEqual(['e1f4','e1f3','e1f5']);
  });
  it('loads the nearest yard edges rather than always north and west',()=>{
    expect(wantedChunks([23.5,0,-23.5],{})).toEqual(['y11','y21','y12']);
    expect(wantedChunks([18,0,-1],{})).toContain('e2f1');
  });
  it('waits for the owner of a descending flight, not only the floor below',()=>{
    expect(supportingChunks([6,22.5,.8])).toEqual(['e1f8','e1f9']);
    expect(movementChunksReady([6,22.5,.8],{e1f8:chunk('e1f8')})).toBe(false);
    expect(movementChunksReady([6,22.5,.8],{e1f8:chunk('e1f8'),e1f9:chunk('e1f9')})).toBe(true);
    expect(transitionChunks([11.9,0,-11.9],[12.1,0,-12.1],{})).toContain('y11');
    expect(transitionChunks([11.9,0,-11.9],[12.1,0,-12.1],{})).toContain('y00');
  });
});
