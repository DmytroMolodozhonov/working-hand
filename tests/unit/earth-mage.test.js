import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {EARTH,EARTH_SHELL,earthLook,earthSlot,earthBlockHit} from '../../src/game/EarthMagicRules.js';
import {EarthMages} from '../../src/game/EarthMages.js';
import {GroundVortex,newSwarm} from '../../src/game/GroundVortex.js';
import {BLOCK} from '../../src/world/Terrain.js';
import {VillagerModel,villagerLook} from '../../src/entities/VillagerModel.js';
import {Combat} from '../../src/game/Combat.js';

function fixture(){
 const edits=new Map(),sent=[];
 const data={lush:true,landMade:()=>true,get:(x,L,z)=>edits.get(`${x},${L},${z}`)??(L<=1?BLOCK.STONE:BLOCK.AIR),set:(x,L,z,b)=>edits.set(`${x},${L},${z}`,b),topLayer:()=>1,floorBelow:()=>1,faceColor:()=>0x888877};
 const v={id:'creative-earth:1',entry:{element:'earth'},x:0,y:.5,z:0,yaw:0,W:{},walk:2,model:{setHeldTool(){},group:new T.Group()}};
 const g={authority:true,localId:'me',scene:new T.Scene(),terrain:{data},character:{group:new T.Group()},remotes:new Map(),collision:{groundY:()=>.5},
 builder:{_sendEdits:()=>{}},sync:{groundVortex:m=>sent.push(m)},castleLife:{byId:new Map([[v.id,v]]),_isPlayer:()=>true,_playerPos:()=>g.character.group.position,_sees:()=>true,_say(){},_ground(){},_steer(){}}};
 g.character.group.position.set(0,2.45,-18);g.groundVortex=new GroundVortex(g);g.earthMages=new EarthMages(g);g.earthMages.init(v);v.foe='me';
 return {g,v,edits,sent,step(n){for(let i=0;i<n;i++){g.earthMages.think(v,1/60);g.earthMages.update(1/60);g.groundVortex.update(1/60);}}};
}

test('earth mage uses real earth, a separate category, mana and bare hands',()=>{
 const f=fixture();f.step(150);const s=f.g.earthMages.swarms.get(f.v.id);
 assert.equal(f.v.rank,'elemental');assert.equal(f.v.bareHand,'advanced');assert.equal(f.v.bareMaster,true);assert.equal(f.v.noWand,true);
 assert.ok(s.n>=12);assert.ok(f.v.mana<EARTH.MANA-EARTH.START);assert.equal(f.g.terrain.data.get(0,1,0),BLOCK.STONE,'no hole under caster');
 for(const b of s.B)if(b)assert.equal(f.g.terrain.data.get(b.cx,b.cy+1,b.cz),BLOCK.AIR,'stones came out of real cells');
});

test('wall tiles meet exactly and a cocoon is a closed voxel shell without overlapping cells',()=>{
 const positions=Array.from({length:25},(_,i)=>earthSlot(i,'wall',0,0,{}));
 assert.equal(Math.abs(positions[0].x-positions[1].x),1);
 for(let col=0;col<5;col++){
  const p=positions[col],t=earthBlockHit({x:p.x+.5,y:p.y,z:-10},{x:p.x+.5,y:p.y,z:0},p);assert.notEqual(t,null,'no slit between neighbours');
 }
 const set=new Set(EARTH_SHELL.map(p=>p.join(',')));assert.equal(set.size,EARTH_SHELL.length);assert.ok(EARTH_SHELL.length<=EARTH.MAX);
 for(const dir of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
  const from={x:dir[0]*10,y:.1+dir[1]*10,z:dir[2]*10},to={x:0,y:.1,z:0};
  assert.ok(EARTH_SHELL.some(([x,y,z])=>earthBlockHit(from,to,{x,y,z})!==null),'cocoon covers all six sides');
 }
});

test('same stones sharpen and fly; shield collisions destroy real stones, death releases survivors',()=>{
 const f=fixture();f.step(150);const em=f.g.earthMages,s=em.swarms.get(f.v.id),first=s.B.find(Boolean);
 em._phase(f.v,s,'blade');f.step(60);assert.equal(s.B.find(Boolean),first);assert.equal(first.blade,true);
 em._phase(f.v,s,'wall');for(let i=0;i<120;i++)em.update(1/60);
 const b=s.B.find(Boolean),hit=em.segmentHit(new T.Vector3(b.pos.x,b.pos.y,-15),new T.Vector3(0,b.pos.y,0),'me');assert.ok(hit);
 const before=s.n;em.take(hit,'Stupefy');assert.ok(s.n<before);assert.ok(f.sent.some(m=>m.ev==='hit'));
 f.v.dead=true;em.update(1/60);assert.equal(em.swarms.size,0);assert.ok(f.g.groundVortex.falls.length>0);
});

test('sharp stone damage is exactly triple before ordinary armour and shield checks',()=>{
 let amount=0,blocked=false;
 const c={enabled:true,dead:false,shieldFactor:()=>0,game:{armor:{guard:()=>blocked}},damage:n=>amount=n};
 Combat.prototype.hitBySpell.call(c,'GroundVortex',new T.Vector3(),'earth',null,1);const base=amount;
 Combat.prototype.hitBySpell.call(c,'GroundVortex',new T.Vector3(),'earth',null,3);assert.equal(amount,base*3);
 blocked=true;amount=0;Combat.prototype.hitBySpell.call(c,'GroundVortex',new T.Vector3(),'earth',null,3);assert.equal(amount,0);
});

test('elbows and whole-body poses are distinct, a wand never appears',()=>{
 const model=new VillagerModel(Object.assign(villagerLook(13,'mage',false),earthLook()));
 assert.equal(model.toolKind,'none');assert.ok(model.leftElbow&&model.rightElbow);
 const poses=[];
 for(const phase of ['Lift','Orbit','Wall','Cocoon','Blade','Throw']){model.earthPoseT=.75;model.update(.4,{mode:'earth'+phase,speed:0});poses.push(JSON.stringify([model._p.aLX,model._p.aRX,model._p.eL,model._p.hy]));}
 assert.equal(new Set(poses).size,6);model.dispose();
});

test('save restores held earth to its original empty cells exactly once',()=>{
 const f=fixture();f.step(100);const em=f.g.earthMages,cells=em.snapshot();assert.ok(cells.length>0);
 em.restore(cells);for(const [x,L,z,t] of cells)assert.equal(f.g.terrain.data.get(x,L,z),t);
 const n=f.edits.size;em.restore(cells);assert.equal(f.edits.size,n);
});

test('Breakthrough uses a prepared real wall, costs mana and waits for the earth push gesture',()=>{
 const f=fixture();f.step(1);const em=f.g.earthMages,s=em.swarms.get(f.v.id);
 em._phase(f.v,s,'orbit');f.v.earth.wallCd=0;
 let grown=0;
 f.g.breakthrough={prepare:()=>({o:new T.Vector3(),d:new T.Vector3(0,0,-1),plan:{cells:[[0,1,0,BLOCK.STONE]]}}),grow:()=>grown++};
 f.g.sync.spell=()=>{};
 f.g.spells={spells:[{life:1,bomb:{p:new T.Vector3(0,2,-20),v:new T.Vector3(0,0,20),by:'me'}}]};
 const before=f.v.mana;em.think(f.v,.01);assert.equal(f.v.earth.phase,'wall');assert.equal(grown,0);
 em.think(f.v,.66);assert.equal(grown,1);assert.ok(f.v.mana<before-9);assert.ok(f.v.castAtPlayers.has('me'));
});

test('weak mage can stitch a genuine cave passage between himself and his pursuer, never an open field',async()=>{
 const {Stitching}=await import('../../src/game/Stitching.js');
 const f=fixture(),g=f.g,v=f.v,data=g.terrain.data;
 const baseGet=data.get;
 data.get=(x,L,z)=>f.edits.get(`${x},${L},${z}`)??(Math.abs(x)<=3&&L>=2&&L<=6?BLOCK.AIR:BLOCK.STONE);
 data.raycast=()=>({x:0,y:6,z:0});g.fx={spark(){},lightFlash(){}};g.spells={spells:[]};g.sync.spell=()=>{};
 g.stitching=new Stitching(g);
 const before=v.mana;assert.equal(g.earthMages._stitch(v,g.character.group.position),true);assert.equal(v.mana,before-7);
 assert.equal(g.spells.spells.length,1);
 const task=g.spells.spells[0];for(let i=0;i<420;i++)task.onUpdate(task,1/60);
 assert.ok([...f.edits.values()].some(t=>t===BLOCK.STONE),'host must write actual closing stones for an NPC cast');task.onEnd();
 v.earth.stitchCd=0;data.get=baseGet;data.raycast=()=>null;
 assert.equal(g.earthMages._stitch(v,g.character.group.position),false);
});

test('earth volleys compensate gravity and can actually reach a standing player at range',()=>{
 const f=fixture();f.g.character.group.position.z=-28;f.step(180);
 let hits=0;f.g.combat={dead:false,center:out=>out.copy(f.g.character.group.position).add(new T.Vector3(0,.6,0)),hitBySpell:()=>{hits++;return true;}};
 const em=f.g.earthMages,s=em.swarms.get(f.v.id);em._phase(f.v,s,'throw');f.step(130);
 assert.ok(hits>0,'a volley must reach the body, not fall harmlessly short');
});

test('a shortage of stones never leaves the caster waiting forever for a full volley',()=>{
 const f=fixture();f.step(90);const em=f.g.earthMages,s=em.swarms.get(f.v.id),keep=s.B.find(Boolean);
 s.B=s.B.map(b=>b===keep?b:null);s.n=1;s.plan=[];
 f.g.terrain.data.get=()=>BLOCK.BEDROCK;em._phase(f.v,s,'orbit');
 f.step(100);assert.ok(f.sent.some(m=>m.ev==='volley'),'one remaining stone is enough to attack');
});

test('an exhausted mage actually recovers enough mana to restart instead of oscillating at the start cost',()=>{
 const f=fixture();f.g.terrain.data.raycast=()=>null;f.v.mana=17;
 f.step(2900);assert.ok(f.sent.some(m=>m.ev==='volley'),'rest must end with a real attack');
 assert.ok(f.v.mana>=0&&f.v.mana<=f.v.maxMana);
});

test('blocked sight at short range requests collision steering right up to the obstruction',()=>{
 const f=fixture();let moved=0,stop;
 f.g.castleLife._sees=()=>false;f.g.castleLife._steer=(v,x,z,s,dt,r)=>{moved++;stop=r;};
 f.step(150);assert.ok(moved>0);assert.equal(stop,0,'a ranged stop distance must not freeze the mage behind cover');
});

test('a sustained battle uses multiple strike patterns and keeps transient collections bounded',()=>{
 const f=fixture();f.step(1800);
 const phases=new Set(f.sent.filter(m=>m.ev==='earth').map(m=>m.phase));
 for(const phase of ['punch','kick','sweep','hammer'])assert.ok(phases.has(phase),phase);
 assert.ok(f.sent.filter(m=>m.ev==='volley').length>=8);
 assert.ok(f.g.groundVortex.flights.length<60);assert.ok(f.g.groundVortex.falls.length<120);
});

test('each new attack has a different whole-body silhouette and movement through the strike',()=>{
 const model=new VillagerModel(Object.assign(villagerLook(14,'mage',false),earthLook())),poses=[];
 for(const mode of ['earthPunch','earthKick','earthSweep','earthHammer']){
  const frame=u=>{model.earthPoseT=u;for(let i=0;i<20;i++)model.update(1/60,{mode,speed:0});return [model._p.hy,model._p.aLX,model._p.aRX,model._p.lR,model._p.kR];};
  const a=frame(.15),b=frame(.65);assert.notDeepEqual(a,b);poses.push(JSON.stringify(b));
 }
 assert.equal(new Set(poses).size,4);model.dispose();
});

test('orbit leaves a visible open strike lane: the mage has no invisible blanket shield',()=>{
 const f=fixture();f.step(100);const em=f.g.earthMages,s=em.swarms.get(f.v.id);em._phase(f.v,s,'orbit');
 for(let i=0;i<120;i++){f.g.groundVortex._t+=1/60;em.update(1/60);}
 assert.ok(!em.segmentHit(new T.Vector3(0,f.v.y+2.4,-30),new T.Vector3(0,f.v.y+2.4,0),'me'));
});

test('late guests reproduce overhead throws from the same actual launch points and velocities',()=>{
 const f=fixture();f.step(100);const em=f.g.earthMages,s=em.swarms.get(f.v.id);em._phase(f.v,s,'hammer');
 f.sent.length=0;em.think(f.v,.96);
 const event=f.sent.find(m=>m.ev==='volley'),state=f.sent.find(m=>m.ev==='earth');assert.ok(event?.origins.length);
 const guest=fixture();guest.g.authority=false;guest.g.earthMages.onNet(state);guest.g.earthMages.onNet(event);
 const a=f.g.groundVortex.flights,b=guest.g.groundVortex.flights;assert.equal(b.length,a.length);
 for(let i=0;i<a.length;i++){assert.ok(a[i].pos.distanceTo(b[i].pos)<1e-6);assert.ok(a[i].vel.distanceTo(b[i].vel)<1e-6);}
});

test('the rooted earth stance spreads the legs outward instead of crossing the knees',()=>{
 const model=new VillagerModel(Object.assign(villagerLook(16,'mage',false),earthLook()));model.earthPoseT=.7;
 for(let i=0;i<20;i++)model.update(1/60,{mode:'earthHammer',speed:0});model.group.updateMatrixWorld(true);
 const left=model.leftKnee.getWorldPosition(new T.Vector3()),right=model.rightKnee.getWorldPosition(new T.Vector3());
 assert.ok(left.x<-.3&&right.x>.3);model.dispose();
});
