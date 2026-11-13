import test from 'node:test';import assert from 'node:assert/strict';
import {RagdollBudget} from '../../src/game/RagdollBudget.js';
test('live and dead bodies all keep moving even when earlier physics exhausts the frame budget',()=>{
 let clock=0;const b=new RagdollBudget(2.5,()=>clock),seen=new Map();
 const dolls=Array.from({length:8},()=>({step(w,dt){seen.set(this,(seen.get(this)||0)+dt);clock+=10;}}));
 const active=new Map(dolls.slice(0,4).map((rag,i)=>[i,{s:{rag}}])),dead=new Map(dolls.slice(4).map((doll,i)=>[i,{doll}]));
 for(let frame=0;frame<16;frame++){b.begin(active,dead);for(const d of dolls)b.step(d,null,1/60);}
 for(const d of dolls)assert.ok(seen.get(d)>0,'no doll starves behind the first entries');
 assert.equal(seen.size,8);assert.ok([...seen.values()].every(t=>t<=16/60+.001),'no future physics time');
});
test('a sleeping body still checks destroyed support; stale budget slots do not retain unloaded dolls',()=>{
 const b=new RagdollBudget(0,()=>10);let calls=0;const d={asleep:true,step(){calls++;}};b.begin(new Map(),new Map());b.step(d,null,.02);assert.equal(calls,1);assert.equal(b.first,null);assert.equal(b.queue.length,0);
});
