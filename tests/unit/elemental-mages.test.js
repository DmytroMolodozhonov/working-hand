import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ElementalMages,elementalGifts} from '../../src/game/ElementalMages.js';
import {earthLook} from '../../src/game/EarthMagicRules.js';
import {EarthMages} from '../../src/game/EarthMages.js';
import {ELEMENTAL_TESTS,elementalTestSite,elementalLook} from '../../src/game/ElementalTestSites.js';
import {VillagerModel,villagerLook,MODES} from '../../src/entities/VillagerModel.js';
import {ELEMENTAL_MODES} from '../../src/entities/ElementalMagePose.js';
import {BLOCK} from '../../src/world/Terrain.js';
function fixture(element,mana=220){
 const casts=[],water=[],sent=[];
 const g={authority:true,localId:'me',remotes:new Map(),scene:new T.Scene(),space:{},collision:{groundAt:()=>0,lineOfSight:()=>true},terrain:{data:{landMade:()=>true,get:()=>BLOCK.AIR}},spells:{cast:(...m)=>casts.push(m)},vortex:{_addFlight:(...m)=>water.push(m)},sync:{spell:(...m)=>sent.push(m),vortex:m=>sent.push(m)},castleLife:{byId:new Map(),_playerPos:()=>({x:0,y:2,z:-16}),_sees:()=>true,_ground(){},_steer(){}}};
 const v={id:'creative-'+element+':1',entry:{element,seed:971207,mana,look:elementalLook(element,{tank:element==='water'})},x:0,y:0,z:0,yaw:0,walk:2,W:{},foe:'me',model:{setHeldTool(){}}};g.castleLife.byId.set(v.id,v);const em=new ElementalMages(g);em.init(v);return{g,v,em,casts,water,sent,step(n){for(let i=0;i<n;i++)em.think(v,1/60);}};
}
test('Creative sites have distinct stable IDs and positions; non-earth NPCs never enter the earth controller',()=>{
 const earth=new EarthMages({});for(const a of ELEMENTAL_TESTS){const s=elementalTestSite(a,4);assert.equal(s.people[0].element,a.element);const v={entry:s.people[0]};earth.init(v);assert.equal(v.earth,undefined);assert.equal(s.F,4);}
 assert.equal(new Set(ELEMENTAL_TESTS.map(a=>a.x+','+a.z)).size,3);
});
test('each discipline uses real shared spell events, pays mana and cannot cast forever',()=>{
 for(const element of ['water','air','fire']){const f=fixture(element);f.step(600);assert.ok(f.casts.length+f.water.length>0,element);assert.ok(f.v.mana<220,element);assert.ok(f.sent.length>0);assert.equal(f.v.bareHand,'advanced');assert.equal(f.v.noWand,true);}
 const f=fixture('fire',1);f.step(60);assert.equal(f.casts.length,0);assert.ok(f.v.elemental.recover);
});
test('water portable supply is finite; residents need water or the existing humidity gift',()=>{
 const f=fixture('water');f.v.gifts.hydro.h=0;for(let i=0;i<6;i++)assert.equal(f.em.waterAttack(f.v,{x:0,y:2,z:-12}),true);assert.equal(f.v.elemental.water,0);assert.equal(f.em.waterAttack(f.v,{x:0,y:2,z:-12}),false);
 f.v.entry.look.tank=false;assert.equal(f.em.waterSource(f.v,1),false);f.g.terrain.data.get=()=>BLOCK.WATER;f.v.elemental.scan=0;assert.equal(f.em.waterSource(f.v,1),true);
 f.g.terrain.data.get=()=>BLOCK.AIR;f.v.elemental.scan=0;f.v.gifts.hydro.h=1;assert.equal(f.em.waterSource(f.v,1),true);f.g.space.offEarth=true;assert.equal(f.em.waterSource(f.v,1),false);
});
test('water gifts use stable independent 25% / 10% rolls; fire never raises a shield',()=>{
 let h=0,f=0,both=0;for(let seed=0;seed<10000;seed++){const g=elementalGifts({element:'water',seed});h+=g.hydro.h;f+=g.resist.f;both+=g.hydro.h*g.resist.f;}assert.ok(h>2300&&h<2700);assert.ok(f>850&&f<1150);assert.ok(both>180&&both<330);
 const a=fixture('fire');a.g.earthMages={_threat:()=>({bomb:true})};a.step(300);assert.equal(a.v.fx&(6),0,'no shield (2) and no dome (4) — the swirl bit (8192) is his element going round him, not a shield');
});
test('all elemental poses are network modes, bend elbows/legs and remain finite',()=>{
 const signatures=[];for(const element of ['water','air','fire']){const m=new VillagerModel(Object.assign(villagerLook(13,'mage',false),elementalLook(element)));assert.ok(m.leftElbow&&m.rightElbow);assert.equal(m.toolKind,'none');for(const mode of ELEMENTAL_MODES.filter(x=>x.startsWith(element))){assert.ok(MODES.includes(mode));for(let i=0;i<40;i++)m.update(1/60,{mode});assert.ok(Number.isFinite(m.leftArm.rotation.x));}signatures.push([m.leftArm.rotation.x,m.rightArm.rotation.x,m.leftLeg.rotation.x].join(','));m.dispose();}assert.equal(new Set(signatures).size,3);
});
test('air caster can brake an existing fall and continuously pays; stunned casters cannot concentrate',()=>{
 const f=fixture('air');f.v.vy=-25;const before=f.v.mana;f.em.brake(f.v,1);assert.equal(f.v.featherFall,true);assert.equal(before-f.v.mana,11);f.em.brake(f.v,1);assert.equal(before-f.v.mana,12);f.v.stunT=1;f.em.brake(f.v,1);assert.equal(f.v.featherFall,false);
});
test('fire immunity rejects ordinary and infernal fire before damage or armour side effects',async()=>{
 const {CastleLife}=await import('../../src/game/CastleLife.js');
 const v={element:'fire',hp:32};for(const opts of [{fire:true,kind:'Inferno'},{hell:true,kind:'Hellfire'},{fire:true,hell:true,pierce:true,kind:'Lava'}])CastleLife.prototype.hit.call({game:{}},v,100,null,'other',opts);
 assert.equal(v.hp,32);
});
test('air lift is the great kind (14.11: only «Protection Maxima» keeps it off): paid by the drain, ends in a THROW if he still holds, else a plain drop',()=>{
 const f=fixture('air'),lifts=[],releases=[],thrown=[];
 f.g.levMax={npcPlayer:(v,to)=>(lifts.push([v.id,to]),true)};f.g.sync.lev=(...m)=>releases.push(m);
 f.g.levitation={lifted:{by:f.v.id},throwMe:(by,vel)=>thrown.push([by,vel]),dropMe(){thrown.push('drop');}};
 f.v.elemental.cycle=3;assert.equal(f.em.airLift(f.v,{x:0,y:2,z:-12}),true);assert.equal(lifts.length,1);assert.equal(f.v.mode,'airLift');assert.equal(f.v.elemental.liftMax,true);
 const mana=f.v.mana;f.em.think(f.v,1);assert.ok(mana-f.v.mana>0&&mana-f.v.mana<4,'the Maxima drain, not the plain hold cost');
 f.em.liftedBy(f.v.id,true);f.v.elemental.liftT=.01;f.em.think(f.v,.1);
 assert.equal(thrown.length,1);assert.equal(thrown[0][0],f.v.id);assert.ok(Math.hypot(thrown[0][1].x,thrown[0][1].z)>10,'thrown hard');assert.ok(thrown[0][1].y>0,'and up');
 assert.ok(releases.some(m=>m[4]===false&&m[6]===f.v.id&&m[7]&&Number.isFinite(m[7].x)),'the guests get the throw in the release');
 assert.equal(f.v.elemental.cycle,4);assert.equal(f.v.elemental.phase,'Sweep');
 // the foe broke free (the dome): a plain drop, no throw
 const g=fixture('air');g.g.levMax={npcPlayer:()=>true};g.g.sync.lev=()=>{};const t2=[];g.g.levitation={lifted:{by:g.v.id},throwMe:()=>t2.push('throw'),dropMe:()=>t2.push('drop')};
 g.em.airLift(g.v,{x:0,y:2,z:-12});g.em.liftedBy(g.v.id,false);g.em.think(g.v,.1);assert.deepEqual(t2,['drop']);
 // no great lift available (no mana / out of sight): no lift at all — never the ordinary Leviosa bolt the ordinary Protection could stop
 const h=fixture('air');h.g.levMax={npcPlayer:()=>false};assert.equal(h.em.airLift(h.v,{x:0,y:2,z:-12}),false);
});
test('a mana-empty air mage falls rather than receiving a free slow landing',()=>{
 const f=fixture('air');f.v.fly=true;f.v.y=10;f.v.mana=0;f.em.land(f.v,.1);assert.equal(f.v.fly,false);assert.ok(f.v.vy<0);assert.equal(f.v.y,10);
});

test('air mage at 17 metres uses a gust whose real reach can touch the opponent',()=>{
 const f=fixture('air');f.g.castleLife._playerPos=()=>({x:0,y:2,z:-17});f.step(130);
 assert.ok(f.casts.length>0);assert.ok(f.casts.every(([name])=>name==='WindMaxima'),'ordinary Wind only reaches 14 metres');
});

test('air mage uses paid body-centred Wind Impulse to repel a nearby opponent',()=>{
 for(const [distance,name,cost] of [[2,'WindImpulse',10],[7,'WindImpulseMaxima',40]]){
  const f=fixture('air');f.g.castleLife._playerPos=()=>({x:0,y:2,z:-distance});
  f.v.elemental.flightCd=99;f.em.phase(f.v,'Sweep');f.v.elemental.t=.46;
  const mana=f.v.mana;f.em.think(f.v,.01);
  const cast=f.casts.find(c=>c[0]===name);assert.ok(cast,name);assert.deepEqual(cast[1].toArray(),[0,1.5,0]);
  assert.equal(mana-f.v.mana,cost);assert.ok(f.sent.some(c=>c[0]===name));
 }
 const f=fixture('air',9);assert.equal(f.em.cast(f.v,'WindImpulse',{x:0,y:2,z:-2}),false);assert.equal(f.casts.length,0);
});

test('elemental costumes retain ordinary seeded faces, hair and beards instead of replacing everyone with a clone',()=>{
 for(const element of ['earth','water','air','fire']){
  const styles=new Set();for(let seed=1;seed<=60;seed++){
   const base=villagerLook(seed,'mage',seed%2===0),look=element==='earth'?earthLook():elementalLook(element);
   const merged={...base,...look};assert.equal(merged.hair,base.hair);assert.equal(merged.beard,base.beard);assert.equal(merged.skin,base.skin);
   styles.add([merged.hair,merged.hairColor,merged.beard].join(':'));
  }assert.ok(styles.size>10,element);
 }
});

test('peaceful elemental residents keep ordinary paths and can return to village day/night life',()=>{
 for(const e of ['water','air','fire']){const f=fixture(e);f.v.foe=null;f.v.cs={def:{kind:'hamlet'}};const path=[1,2];f.v.path=path;f.v.job='wander';f.v.seated=true;assert.equal(f.em.think(f.v,.1),false);assert.equal(f.v.path,path);assert.equal(f.v.job,'wander');assert.equal(f.v.seated,true);}
});
