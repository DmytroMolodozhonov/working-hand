import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {stepAirMageWings} from '../../src/game/AirMageWings.js';
import {ElementalMages} from '../../src/game/ElementalMages.js';
import {VillagerModel,villagerLook} from '../../src/entities/VillagerModel.js';
import {elementalLook} from '../../src/game/ElementalTestSites.js';
import {wizardRoster} from '../../src/game/WizardAI.js';
import {EarthMages} from '../../src/game/EarthMages.js';
function fixture(){
 const v={id:'winged',element:'air',entry:{seed:12,element:'air',look:{wings:true}},x:0,y:0,z:0,yaw:0,mana:100,maxMana:100,walk:2,elemental:{flightCd:0},model:{setHeldTool(){}}};
 const g={authority:true,terrain:{data:{landMade:()=>true}},collision:{groundAt:()=>0},castleLife:{_airFree:()=>true,_steer(v,x,z,speed,dt){const dx=x-v.x,dz=z-v.z,d=Math.hypot(dx,dz);v.x+=dx/d*speed*dt;v.z+=dz/d*speed*dt;v.speed=speed;}}};
 const foe={x:0,y:2,z:-12};return{g,v,foe,step(n,land=false){for(let i=0;i<n;i++)stepAirMageWings(g,v,foe,1/60,land);}};
}
test('physical wings require a real run-up, take off with strokes, descend and land without Flight mana',()=>{
 const f=fixture();f.step(60);assert.equal(f.v.fly,undefined,'a short run is not enough');f.step(120);assert.equal(f.v.fly,true);assert.ok(f.v.y>0);assert.equal(f.v.mana,100);
 f.step(1200,true);assert.equal(f.v.fly,false);assert.equal(f.v.y,0);assert.equal(f.v.mana,100);
});
test('blocked ground cannot fake the run-up, and wing flight never crosses a solid air boundary',()=>{
 const a=fixture();a.g.castleLife._steer=v=>{v.speed=99;};a.step(300);assert.equal(a.v.fly,undefined);assert.equal(a.v.elemental.wings.air,false);
 const b=fixture();b.g.castleLife._airFree=(x,z,y)=>Math.abs(x)<12&&Math.abs(z)<12&&y<3;b.step(600);
 assert.ok(Math.abs(b.v.x)<12&&Math.abs(b.v.z)<12&&b.v.y<3);assert.ok(b.v.y>=0);
});
test('winged air mages do not know Flight; stun stops wing control and the wing model follows the ordinary NPC',()=>{
 const f=fixture(),em=new ElementalMages(f.g);em.init(f.v);assert.equal(f.v.knowsFlight,false);assert.equal(f.v.elemental.winged,true);
 f.v.elemental.wings={air:true,launch:false};f.v.fly=true;f.v.stunT=1;f.v.vy=-10;em.brake(f.v,.1);assert.equal(f.v.fly,false);assert.equal(f.v.elemental.wings.air,false);
 const m=new VillagerModel({...villagerLook(8,'mage',false),...elementalLook('air',{wings:true})});
 assert.equal(m._airWings.mounts.length,2);for(let i=0;i<30;i++)m.update(1/60,{mode:'airFlight',speed:8});
 assert.ok(m._airWings.mounts.every(w=>w.visible));m.update(1/60,{mode:'dead'});m.dispose();
});
test('deterministic road wizards include all disciplines; only travelling water mages carry a tank',()=>{
 const counts={};for(let i=0;i<1200;i++){
  const d={id:'ww'+i,kind:'wander',houses:[],stalls:[]},e=wizardRoster(d,1);assert.deepEqual(e,wizardRoster(d,1));
  if(!e.element)continue;counts[e.element]=(counts[e.element]||0)+1;assert.equal(e.role,'wanderer');
  if(e.element!=='earth')assert.equal(e.look.tank,e.element==='water');
 }
 for(const e of ['earth','water','air','fire'])assert.ok(counts[e]>60&&counts[e]<140,JSON.stringify(counts));
});
test('peaceful elemental travellers retain their road controller and path',()=>{
 for(const element of ['earth','water','air','fire']){
  const f=fixture();f.v.entry.element=element;f.v.entry.look={tank:element==='water'};f.v.cs={def:{kind:'wander'}};f.v.job='road';f.v.foe=null;f.v.path=[1,2];
  const em=element==='earth'?new EarthMages(f.g):new ElementalMages(f.g);em.init(f.v);const path=f.v.path;
  assert.equal(em.think(f.v,.1),false);assert.equal(f.v.job,'road');assert.equal(f.v.path,path);
 }
});
