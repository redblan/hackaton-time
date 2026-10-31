import { expect, it } from 'vitest';
import { routeDistance, routeLevel, type RoutePlayer } from '@game/shared';
import { recordRoute, routeAreas } from '../src/route';
import { newRoom, toSnapshot, fromSnapshot } from '../src/rooms';

it('samples motion, captures floor changes/errors and never joins a teleport', () => {
  const p: RoutePlayer = { id:'a', name:'А', points:[], errors:[], truncated:false };
  recordRoute(p,0,[1,0,1]);
  for (let at=100;at<1000;at+=100) recordRoute(p,at,[2,0,1]);
  expect(p.points).toHaveLength(1);
  recordRoute(p,1000,[3,0,1]);
  recordRoute(p,1100,[3,3,1]);
  expect(p.points).toHaveLength(3);
  recordRoute(p,1200,[3.1,3,1],true);
  recordRoute(p,2200,[30,3,1]);
  expect(p.points.at(-1)?.segment).toBe(1);
  expect(routeDistance(p.points)).toBeCloseTo(5.1);
  expect(routeLevel([1,24,1])).toBe(9);
  expect(routeLevel([1,0,-1])).toBe(0);
  recordRoute(p,2300,[30,3,1]);
  expect(p.points).toHaveLength(5);
});

it('bounds long runs and preserves routes, error positions and results in database snapshots', () => {
  const room=newRoom('r','solo');
  const route: RoutePlayer={id:'p',name:'Никита',points:[],errors:[{at:1,pos:[1,0,1],note:'Ошибка',advice:'Совет'}],truncated:false};
  for(let i=0;i<7201;i++) recordRoute(route,i*1000,[i%10,0,1],true);
  expect(route.points).toHaveLength(7200); expect(route.truncated).toBe(true);
  room.route=[route]; room.flagTimes={balcony_debris:500};
  room.result={score:0,durationMs:1000,perPlayer:[],route:{players:room.route,areas:[],durationMs:1000}};
  const restored=fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(room,0))));
  expect(restored.route).toEqual(room.route);
  expect(restored.result).toEqual(room.result);
  expect(restored.flagTimes).toEqual(room.flagTimes);
});

it('includes only active hazards and preserves their activation time', () => {
  const areas=routeAreas([{id:'e1f4',bounds:{min:[0,9,0],max:[12,12,12]},neighbors:[],objects:[
    {id:'collapse',kind:'zone',zone:'z_collapse',min:[5,7,.1],max:[8,10,1.4],when:'collapse_f4'},
    {id:'smoke',kind:'zone',zone:'z_smoke',min:[3,9,3],max:[7,12,5],when:'fire_f4'},
  ]}],new Set(['collapse_f4']),{collapse_f4:2000});
  expect(areas).toHaveLength(1); expect(areas[0].activeAt).toBe(2000); expect(areas[0].level).toBe(4);
});
