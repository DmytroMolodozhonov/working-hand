import test from 'node:test';
import assert from 'node:assert/strict';
import { figureIds } from '../../src/game/PentagramRules.js';
import { pentagramText, pentagramTextLines } from '../../src/game/PentagramText.js';
import { describeItem } from '../../src/game/ItemTypes.js';
import { wrapText } from '../../src/core/TextWrap.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { paintParchment } from '../../src/fx/ScrollArt.js';

test('every pentagram scroll describes its purpose before use, then drawing and learning; hologram type differs',()=>{
 for(const id of figureIds()){
  const t=pentagramText(id),info=describeItem({kind:'scroll',stat:'pentagram',pent:id});
  assert.ok(!t.use.includes('Условия обряда указаны'),'missing use: '+id);
  assert.ok(!/^(Встаньте|Положите|Направьте|Чтобы)/.test(info.lines[0]),id);
  assert.deepEqual(info.lines.slice(0,3),pentagramTextLines(id));
  assert.ok(info.lines[1].startsWith('Использование:'));assert.ok(info.lines[2].startsWith('Начертание:'));
  assert.ok(info.lines[2].includes('50 маны'));assert.ok(info.lines.at(-1).startsWith('Сожгите табличку'));
  assert.equal(info.theme,'pentagram');
 }
 assert.notEqual(describeItem({kind:'scroll',stat:'spell',spell:'Bombardo'}).theme,'pentagram');
 assert.equal(matchSpell('Reveal'),'Reveal');assert.equal(matchSpell('Раскрой свои секреты'),'Reveal');
});
test('full long titles fit the available width without ellipsis or dropped words',()=>{
 for(const t of ['Пентаграмма защиты от возрождения чёрного мага','Свиток «Protection House Grant»','X'.repeat(100)]){
  const lines=wrapText(t,300,s=>s.length*12);
  assert.ok(lines.every(s=>s.length*12<=300));assert.equal(lines.join('').replace(/\s/g,''),t.replace(/\s/g,''));
 }
});
test('all pentagram paper descriptions stay within the page with complete wrapped titles',()=>{
 for(const id of figureIds()){
  const info=describeItem({kind:'scroll',stat:'pentagram',pent:id}), written=[];
  const noop=()=>{};
  const ctx=new Proxy({font:'24px serif'}, {get:(t,k)=>k in t?t[k]:k==='measureText'?s=>({width:String(s).length*(parseFloat(t.font.replace(/^[^\d]*/,''))||24)*.55}):k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop:noop}):k==='fillText'?(s,x,y)=>written.push({s,x,y,font:t.font}):noop,set:(t,k,v)=>(t[k]=v,true)});
  paintParchment(ctx,1024,768,{school:'arcane',compactPicture:true,title:info.title,lines:pentagramTextLines(id).map(text=>[{text,bold:false}]),note:'Сожгите свиток, если хотите запомнить это заклинание'});
  assert.ok(written.every(t=>t.y<768),id+': text fell off page');
 }
});
