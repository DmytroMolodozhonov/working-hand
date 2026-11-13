import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {AirMageObjects} from '../../src/game/AirMageObjects.js';
import {Weapon} from '../../src/entities/Weapon.js';
function fixture(){
 const scene=new T.Scene(),v={id:'air',x:0,y:0,z:0,mana:200,foe:'me',elemental:{}};
 const weapon=new Weapon(scene,'sword',{headless:true,position:new T.Vector3(2,1,0),id:'sword'});
 const L={item:{uid:'apple',kind:'apple'},model:new T.Group(),vel:new T.Vector3(),rest:true};L.model.position.set(-2,1,0);
 const messages=[],hurts=[],foe={x:0,y:2,z:12};
 const g={authority:true,localId:'me',items:{loose:new Map([['apple',L]])},weapons:{weapons:[weapon]},net:{send:m=>messages.push(m)},collision:{groundAt:()=>0,pointBlocked:()=>false,lineOfSight:()=>true},castleLife:{byId:new Map([['air',v]]),_playerPos:()=>foe,_sees:()=>true},duel:{_bodies:()=>[{kind:'p',id:'me',a:new T.Vector3(0,1,12),b:new T.Vector3(0,3,12),r:.6}]},combat:{enabled:true,shieldFactor:()=>0,damage:(...args)=>hurts.push(args)}};
 const objects=new AirMageObjects(g);return{g,v,L,weapon,messages,hurts,objects,step(n){for(let i=0;i<n;i++)objects.update(1/60);}};
}
test('air mage lifts existing items and a real physical sword, pays normal cost/drain, hits once per object and releases',()=>{
 const f=fixture();assert.equal(f.objects.start(f.v),true);assert.equal(f.v.mana,150);assert.equal(f.weapon.holder.airMage,'air');assert.equal(f.L.lev,true);
 f.step(120);assert.ok(f.v.mana<146);assert.ok(f.weapon.position.y>1.5);assert.equal(f.g.weapons.weapons.length,1);
 f.step(360);assert.equal(f.hurts.length,2);assert.ok(f.hurts.every(([d,by])=>d<=10&&by==='air'));assert.equal(f.weapon.holder,null);assert.equal(f.L.lev,false);assert.equal(f.objects.active.size,0);
 f.weapon.dispose();
});
test('stun, missing caster, lost foe and exhausted mana release to normal item/weapon physics',()=>{
 for(const change of [f=>f.v.stunT=1,f=>f.g.castleLife.byId.clear(),f=>f.v.foe=null,f=>f.v.mana=0]){
  const f=fixture();f.objects.start(f.v);change(f);f.step(1);assert.equal(f.weapon.drive,null);assert.equal(f.weapon.sleeping,false);assert.equal(f.L.lev,false);assert.equal(f.objects.active.size,0);f.weapon.dispose();
 }
});
test('no conjured ammunition, no unpaid items, divine weapons or stolen player weapons',()=>{
 const f=fixture();f.L.item.shop={paid:false};f.weapon.godGift=true;assert.equal(f.objects.start(f.v),false);assert.equal(f.v.mana,200);
 f.weapon.godGift=false;f.weapon.attach({side:'left'});assert.equal(f.objects.start(f.v),false);assert.equal(f.v.mana,200);f.weapon.dispose();
});
test('only real held object bounds block a spell; own spells and empty space pass; a blast releases all nearby objects',()=>{
 const f=fixture();f.objects.start(f.v);f.step(120);const p=f.weapon.position.clone(),a=p.clone().add(new T.Vector3(0,0,-3)),b=p.clone().add(new T.Vector3(0,0,3));
 const hit=f.objects.segmentHit(a,b,'other');assert.ok(hit&&hit.t>=0&&hit.t<=1);assert.equal(f.objects.segmentHit(a,b,'air'),null);assert.equal(f.objects.segmentHit(new T.Vector3(30,2,0),new T.Vector3(30,2,5)),null);
 assert.equal(f.objects.take(hit,'Jolt'),true);assert.equal(f.weapon.holder,null);f.objects.blast(new T.Vector3(0,2,0),10);assert.equal(f.L.lev,false);f.weapon.dispose();
});
test('recipient checks Protection and armour damage entry; duplicate packets cannot hit twice; metadata works before poses arrive',()=>{
 const f=fixture(),m={t:'aobjhit',id:'one',to:'me',by:'air',damage:9,from:[0,2,-2],vel:[0,0,5]};
 f.g.authority=false;f.g.combat.shieldFactor=()=>1;let blocks=0;f.g.combat._blocked=()=>{blocks++;return true;};f.objects.onNet(m);f.objects.onNet(m);assert.equal(blocks,1);assert.equal(f.hurts.length,0);
 f.g.combat.shieldFactor=()=>0;f.objects.onNet({...m,id:'two'});assert.deepEqual(f.hurts,[[9,'air','thrown']]);
 f.objects.onNet({t:'aobj',by:'air',token:'hold',ids:[['w','sword']]});const p=f.weapon.position;assert.ok(f.objects.segmentHit(p.clone().add(new T.Vector3(0,0,-2)),p.clone().add(new T.Vector3(0,0,2)),'other'));
 f.objects.onNet({t:'aobj',by:'air',ids:[]});assert.equal(f.objects.remote.size,0);f.weapon.dispose();
});
