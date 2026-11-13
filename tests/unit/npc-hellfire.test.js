import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {Hellfire} from '../../src/game/Hellfire.js';
import {elementalEndurance} from '../../src/game/ElementalRules.js';
function fixture(){const v={id:'fire',x:0,y:0,z:0,yaw:Math.PI,mana:400,maxMana:400,foe:'me'},packets=[];
 const g={authority:true,localId:'me',character:{group:{position:new T.Vector3(0,2,12)}},castleLife:{byId:new Map([['fire',v]]),_playerPos:()=>({x:0,y:2,z:12})},duel:{_bodies:()=>[]},collision:{groundY:()=>0},net:{send:m=>packets.push(m)}};
 const hf=new Hellfire(g);return{v,g,hf,packets,step(n){for(let i=0;i<n;i++)hf.update(.02);}};}
test('NPC Hellfire pays 250 plus 2/s, uses ordinary host fire and synchronises the NPC identity',()=>{
 const f=fixture();assert.ok(f.hf.npcStart(f.v));assert.equal(f.v.mana,150);f.step(50);assert.ok(Math.abs(f.v.mana-148)<1e-7);assert.ok(f.hf.remote.has('fire'));assert.ok(f.packets.length>5&&f.packets.length<=12);assert.ok(f.packets.every(m=>m.by==='fire'));
 f.step(310);assert.equal(f.hf.npcs.size,0);assert.equal(f.hf.remote.size,0);assert.ok(f.hf.left.length>0,'ordinary residual fire continues');assert.equal(f.packets.at(-1).s,null);
});
test('a weak mage cannot conjure Hellfire and interruption/empty mana release it once',()=>{
 const weak=fixture();weak.v.mana=weak.v.maxMana=200;assert.equal(weak.hf.npcStart(weak.v),false);assert.equal(weak.v.mana,200);
 for(const change of [f=>f.v.stunT=1,f=>f.v.mana=0,f=>f.v.dead=true,f=>f.g.castleLife.byId.clear()]){const f=fixture();f.hf.npcStart(f.v);f.step(1);change(f);f.step(2);assert.equal(f.hf.npcs.size,0);assert.equal(f.hf.remote.size,0);assert.equal(f.packets.filter(m=>m.s===null).length,1);}
});
test('water extinguishes NPC Hellfire instead of only reporting contact',()=>{
 const f=fixture();f.hf.npcStart(f.v);f.step(20);for(let i=0;i<10&&f.hf.npcs.size;i++)f.hf.douse(()=>true,.2);assert.equal(f.hf.npcs.size,0);assert.equal(f.hf.remote.size,0);assert.equal(f.packets.at(-1).w,'water');
});
test('seeded elemental endurance includes weak, middle and strong reserves, without changing explicit ranks/mana',()=>{
 const tiers=new Set();for(let seed=0;seed<100;seed++)tiers.add(elementalEndurance({seed}).tier);assert.deepEqual([...tiers].sort(),['adept','elder','novice']);assert.ok(elementalEndurance({rank:'elder',seed:1}).mana>=360);assert.equal(elementalEndurance({mana:220,seed:1}).mana,220);
});
