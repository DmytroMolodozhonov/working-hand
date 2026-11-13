import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {SpellManager,matchSpell} from '../../src/fx/SpellManager.js';
import {SPELL_COST} from '../../src/game/SpellCosts.js';
import {BLOCK} from '../../src/world/Terrain.js';
import {SCROLL_WEIGHTS} from '../../src/game/ItemTypes.js';
import {fireballBody} from '../../src/game/FireballRules.js';
function manager(hooks={}){const blasts=[],ignites=[],wood=[],sm=new SpellManager(new T.Scene(),{glow:{spawn(){}},lightFlash(){},castBurst(){}},{players:()=>[],zombies:()=>[],explode:p=>blasts.push(p.clone()),fireballBody:p=>(ignites.push(p.clone()),true),fireballWood:p=>(wood.push(p.clone()),true),...hooks});return {sm,blasts,ignites,wood,cast(){sm.cast('Fireball',new T.Vector3(0,2,0),new T.Vector3(1,0,0),'right','caster');return sm.spells.at(-1);}};}
test('Fireball is its own scroll spell, never confused with Fire Maxima or casual discussion',()=>{
 for(const s of ['Fireball','fire ball','фаербол','файербол','файрбол'])assert.equal(matchSpell(s),'Fireball');
 assert.equal(matchSpell('fireball maxima'),null);assert.equal(matchSpell('я говорил про файербол'),null);assert.equal(SPELL_COST.Fireball,7);assert.ok(SCROLL_WEIGHTS.some(([s,w])=>s==='Fireball'&&w>0));
});
test('body contact ignites once, no blast even at onEnd and no Cardilon bomb/capture metadata',()=>{
 const f=manager({bodyOnWay:()=>new T.Vector3(1,2,0)}),task=f.cast();assert.equal(task.bomb,null);assert.equal(task.capture,null);task.onUpdate(task,.05);task.onEnd(task);
 assert.equal(f.ignites.length,1);assert.equal(f.blasts.length,0);assert.equal(f.wood.length,0);
});
test('expiry fizzles; a water layer extinguishes even across a long low-FPS step',()=>{
 const f=manager();let t=f.cast();t.onEnd(t);assert.equal(f.blasts.length+f.ignites.length+f.wood.length,0);
 const w=manager({terrain:()=>({get:x=>x===2?BLOCK.WATER:BLOCK.AIR})});t=w.cast();t.onUpdate(t,.2);t.onEnd(t);assert.equal(t.life,0);assert.equal(w.blasts.length+w.ignites.length+w.wood.length,0);
});
test('a physical shield extinguishes it; an exposed local victim receives ignition without an explosion',()=>{
 const body={a:new T.Vector3(2,0,0),b:new T.Vector3(2,4,0),r:.5},player={local:true,id:'victim',center:()=>new T.Vector3(2,2,0),body:()=>body,blocks:()=>true,hit(){}};
 let n=0;const f=manager({players:()=>[player],fireballPlayer:()=>{n++;return true;}}),t=f.cast();t.onUpdate(t,.2);t.onEnd(t);assert.equal(n,0);assert.equal(f.blasts.length,0);
 player.blocks=()=>false;const t2=f.cast();t2.onUpdate(t2,.2);t2.onEnd(t2);assert.equal(n,1);assert.equal(f.blasts.length,0);
});
test('impact chooses one actual creature capsule and never somebody far away',()=>{
 const b={kind:'v',id:'mage',a:new T.Vector3(0,0,0),b:new T.Vector3(0,3,0),r:.7};assert.equal(fireballBody([b],new T.Vector3(.4,2,0)),b);assert.equal(fireballBody([b],new T.Vector3(2,2,0)),null);
});
test('a grounded Fireball keeps burning briefly, fades, and never leaves unsupported or unbounded flames',()=>{
 const f=manager({fireballGround:p=>new T.Vector3(p.x,0,p.z)});f.sm._fireballEmber(new T.Vector3(0,0,0),'caster');assert.equal(f.sm._fireballEmbers.size,1);
 f.sm.update(1);assert.equal(f.sm._fireballEmbers.size,1,'not extinguished on impact');assert.equal(f.sm.fireballGroundAt(0,0,0).by,'caster');f.sm.update(3);assert.equal(f.sm._fireballEmbers.size,0);
 for(let i=0;i<40;i++)f.sm._fireballEmber(new T.Vector3(i,0,0),'caster');assert.equal(f.sm._fireballEmbers.size,24);
 f.sm.hooks.fireballGround=()=>null;f.sm.update(.2);f.sm.update(.4);assert.equal(f.sm._fireballEmbers.size,0,'lost support / water extinguishes the residue');
});
