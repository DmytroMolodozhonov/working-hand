import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {VillagerModel,villagerLook,MODES} from '../../src/entities/VillagerModel.js';
import {elementalLook} from '../../src/game/ElementalTestSites.js';
import {ElementalMages} from '../../src/game/ElementalMages.js';
import {Duel,firstTouched} from '../../src/game/Duel.js';
const model=()=>new VillagerModel({...villagerLook(41,'mage',false),...elementalLook('fire')});
test('handstand plants its hands below the head and lifts the feet, then returns upright',()=>{
 const m=model();assert.ok(MODES.includes('fireVault'));m.elementPoseT=.72;
 for(let i=0;i<35;i++)m.update(1/60,{mode:'fireVault',speed:0});m.group.updateMatrixWorld(true);
 const point=(n,y=0)=>{n.updateWorldMatrix(true,false);return n.localToWorld(new T.Vector3(0,y,0));};
 const hand=point(m.rightElbow,-.6),head=point(m.head),foot=point(m.rightKnee,-.95);
 assert.ok(hand.y<head.y&&head.y<foot.y,JSON.stringify({hand,head,foot}));assert.ok(Math.abs(hand.y+1.95)<.2,'hands touch ground');
 m.update(1/60,{mode:'fireChamber'});assert.equal(m.pelvis.rotation.z,0);m.dispose();
});
test('two real foot Fireballs pay twice and cannot repeat the same release or spend absent mana',()=>{
 const m=model(),casts=[],g={spells:{cast:(...args)=>casts.push(args)},castleLife:{_playerPos:()=>new T.Vector3(0,2,-12),_sees:()=>true,_steer(){},_ground(){}},collision:{lineOfSight:()=>true}},em=new ElementalMages(g);
 const v={id:'fire',element:'fire',entry:{seed:4},x:0,y:0,z:0,yaw:0,walk:2,mana:30,maxMana:30,model:m,elemental:{phase:'Vault',t:.63,shots:0,flightCd:1,cycle:3},foe:'me'};
 m.elementPoseT=.65;for(let i=0;i<35;i++)m.update(1/60,{mode:'fireVault'});
 em.think(v,.02);em.think(v,.01);assert.equal(casts.length,1);em.think(v,.25);assert.equal(casts.length,2);assert.equal(v.mana,16);
 assert.ok(casts.every(c=>c[0]==='Fireball'&&c[4]==='fire'));assert.ok(casts.every(c=>c[1].y>1),'fire leaves raised feet');
 em.interrupt(v);assert.equal(v.elemental.phase,'Chamber');assert.equal(v.castT,0);
 v.mana=0;em.phase(v,'Vault');em.think(v,.7);assert.equal(casts.length,2);m.dispose();
});
test('the inverted visible torso remains hittable, even after moving without another render',()=>{
 const m=model();m.elementPoseT=.72;for(let i=0;i<35;i++)m.update(1/60,{mode:'fireVault'});
 const v={model:m,element:'fire',mode:'fireVault'},entry={a:new T.Vector3(),b:new T.Vector3()};
 m.group.position.set(120,10,-90);Duel.prototype._villagerBody.call({},v,entry);
 assert.ok(entry.a.distanceTo(entry.b)<4);const mid=entry.a.clone().add(entry.b).multiplyScalar(.5);
 assert.ok(firstTouched(mid.clone().add(new T.Vector3(0,0,-10)),mid.clone().add(new T.Vector3(0,0,10)),[entry]));
 assert.ok(mid.distanceTo(m.group.position)<5);m.dispose();
});
