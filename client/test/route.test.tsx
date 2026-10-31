import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { RouteReview } from '../src/debrief/RouteReview';
import { routeSegments } from '../src/debrief/routeGeometry';

it('renders the yard report, errors, player choice and bounded recording warning', () => {
  const markup=renderToStaticMarkup(createElement(RouteReview,{initialMode:'2d',review:{durationMs:1000,areas:[],players:[
    {id:'p',name:'Никита',points:[{at:0,pos:[1,0,-1],segment:0},{at:1000,pos:[2,0,-2],segment:0}],errors:[{at:500,pos:[1,0,-1],note:'Опасный козырёк',advice:'Обойдите'}],truncated:true},
    {id:'q',name:'Юра',points:[],errors:[],truncated:false},
  ]}}));
  expect(markup).toContain('План двора'); expect(markup).toContain('Опасный козырёк');
  expect(markup).toContain('Достигнут лимит'); expect(markup).toContain('Юра');
  expect(markup).toContain('<line'); expect(markup).toContain('type="range"');
});

it('keeps vertical floor transitions continuous but splits teleports and filters future points',()=>{
  const segments=routeSegments([
    {at:0,pos:[8,24,1],segment:0},
    {at:1000,pos:[5,22.5,1],segment:0},
    {at:2000,pos:[8,21,2],segment:0},
    {at:3000,pos:[18,0,-30],segment:1},
    {at:4000,pos:[19,0,-30],segment:1},
  ],3000);
  expect(segments.map(s=>s.length)).toEqual([3,1]);
  expect(segments[0].map(p=>p[1])).toEqual([24.18,22.68,21.18]);
  expect(segments[1][0]).toEqual([18,.18,-30]);
});

it('defaults to the 3D overview and keeps a 2D fallback available',()=>{
  const markup=renderToStaticMarkup(createElement(RouteReview,{review:{durationMs:1,areas:[],players:[{id:'p',name:'Игрок',points:[],errors:[],truncated:false}]}}));
  expect(markup).toContain('aria-pressed="true">Общий маршрут 3D');
  expect(markup).toContain('План этажа 2D');
});
