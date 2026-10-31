import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { RouteReview } from '../src/debrief/RouteReview';

it('renders the yard report, errors, player choice and bounded recording warning', () => {
  const markup=renderToStaticMarkup(createElement(RouteReview,{review:{durationMs:1000,areas:[],players:[
    {id:'p',name:'Никита',points:[{at:0,pos:[1,0,-1],segment:0},{at:1000,pos:[2,0,-2],segment:0}],errors:[{at:500,pos:[1,0,-1],note:'Опасный козырёк',advice:'Обойдите'}],truncated:true},
    {id:'q',name:'Юра',points:[],errors:[],truncated:false},
  ]}}));
  expect(markup).toContain('План двора'); expect(markup).toContain('Опасный козырёк');
  expect(markup).toContain('Достигнут лимит'); expect(markup).toContain('Юра');
  expect(markup).toContain('<line'); expect(markup).toContain('type="range"');
});
