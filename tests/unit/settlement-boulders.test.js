import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {SettlementBoulders,earthBoulderLayout,settlementStoneGeometry} from '../../src/game/SettlementBoulders.js';
import {CollisionWorld} from '../../src/world/Collision.js';
function fixture(){const collision=new CollisionWorld();let floor=0;collision.groundAt=()=>floor;const packets=[],g={scene:new T.Scene(),collision,authority:true,net:{send:m=>packets.push(m)}},def={id:'earth-hamlet',element:'earth',rot:1,x:50,z:-30,F:0},homes=new Map([[1,{def}],[2,{def}]]),b=new SettlementBoulders(g);return{g,b,def,homes,packets,floor:y=>floor=y};}
test('garden stones have rounded layered geometry and stable rotated varied sizes',()=>{
 const g=settlementStoneGeometry();assert.ok(g.attributes.position.count>100);assert.equal(g.attributes.position.count,g.attributes.color.count);assert.equal(g.boundingBox.min.y,0);assert.equal(g.boundingBox.max.y,1);assert.ok(new Set(Array.from(g.attributes.color.array)).size>50);g.dispose();
 const f=fixture(),a=earthBoulderLayout(f.def);assert.deepEqual(a,earthBoulderLayout(f.def));assert.ok(new Set(a.map(p=>p.h)).size>3);assert.ok(a.every(p=>Math.hypot(p.x-50,p.z+30)>5));f.b.dispose();
});
test('all homes share six stones and one instanced mesh; every stone has real collision and no far-away residue',()=>{
 const f=fixture();f.b.update(.3,f.homes);assert.equal(f.b.active.size,6);assert.equal(f.b.mesh.count,6);assert.equal(f.g.collision.boxes.size,6);
 for(const r of f.b.active.values())assert.equal(f.g.collision.pointBlocked(r.x,r.y+r.h/2,r.z),true);
 f.homes.clear();f.b.update(.3,f.homes);assert.equal(f.b.mesh.count,0);assert.equal(f.g.collision.boxes.size,0);f.b.dispose();
});
test('destroyed support cannot leave a hovering stone; blast destruction persists across lifecycle and propagates once',()=>{
 const f=fixture();f.b.update(.3,f.homes);f.floor(-8);for(let i=0;i<120;i++)f.b.update(1/60,f.homes);assert.ok([...f.b.active.values()].every(r=>r.y===-8));
 const r=[...f.b.active.values()][0];f.b.blast(new T.Vector3(r.x,r.y,r.z),.5);assert.ok(f.b.broken.has(r.id));assert.ok(!f.b.active.has(r.id));assert.ok(f.packets.some(m=>m.id===r.id));
 f.homes.clear();f.b.update(.3,f.homes);f.homes.set(1,{def:f.def});f.b.update(.3,f.homes);assert.ok(!f.b.active.has(r.id));f.b.dispose();assert.equal(f.g.collision.boxes.size,0);
});
