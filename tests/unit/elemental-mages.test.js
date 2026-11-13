import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ElementalMages,elementalGifts} from '../../src/game/ElementalMages.js';
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
 const a=fixture('fire');a.g.earthMages={_threat:()=>({bomb:true})};a.step(300);assert.equal(a.v.fx,0);
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
