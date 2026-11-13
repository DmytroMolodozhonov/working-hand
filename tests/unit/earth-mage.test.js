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
 f.step(1200);assert.ok(f.sent.some(m=>m.ev==='volley'),'rest must end with a real attack within twenty seconds');
 assert.ok(f.v.mana>=0&&f.v.mana<=f.v.maxMana);
});

test('blocked sight at short range requests collision steering right up to the obstruction',()=>{
 const f=fixture();let moved=0,stop;
 f.g.castleLife._sees=()=>false;f.g.castleLife._steer=(v,x,z,s,dt,r)=>{moved++;stop=r;};
 f.step(150);assert.ok(moved>0);assert.equal(stop,0,'a ranged stop distance must not freeze the mage behind cover');
});

test('a minimum-capacity novice releases a paid stone and can repeat after recovery',()=>{
 const f=fixture();f.v.mana=f.v.maxMana=25;f.g.terrain.data.raycast=()=>null;
 f.step(150);assert.ok(f.sent.some(m=>m.ev==='volley'),'25 mana must fund an actual attack');
 const first=f.sent.filter(m=>m.ev==='volley').length;
 f.step(1800);assert.ok(f.sent.filter(m=>m.ev==='volley').length>first,'recovery must allow another paid attack');
 assert.ok(f.v.mana>=0&&f.v.mana<=25);
});

test('recovering at range keeps moving through the collision pilot and changes side when blocked',()=>{
 const f=fixture();f.v.mana=0;f.g.character.group.position.z=-25;
 const requests=[];f.g.castleLife._steer=(v,x,z)=>{requests.push({x,z});v.foe=null;};
 f.step(100);assert.equal(requests.length,100);assert.equal(f.v.foe,'me');
 assert.ok(requests.some(p=>p.x>0)&&requests.some(p=>p.x<0),'a blocked riverbank sidestep must try the other side');
 assert.ok(f.v.mana<2,'movement cannot bypass real mana regeneration');
});

test('an unthreatened orbit repositions but the release gesture remains rooted',()=>{
 const f=fixture();f.step(100);const em=f.g.earthMages,s=em.swarms.get(f.v.id);let moves=0;
 f.g.castleLife._steer=()=>moves++;em._phase(f.v,s,'orbit');em.think(f.v,.1);assert.equal(moves,1);
 em._phase(f.v,s,'punch');em.think(f.v,.1);assert.equal(moves,1);
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

test('a physically checked projectile does not re-test another line through a chest rock',async()=>{
 const {CastleLife}=await import('../../src/game/CastleLife.js'),{Duel}=await import('../../src/game/Duel.js');
 let queries=0;const v={element:'earth',dead:false,fx:0,wizard:true},L={game:{earthMages:{segmentHit:()=>{queries++;return {};},take:()=>true}}};
 assert.equal(CastleLife.prototype.wardOff.call(L,v,new T.Vector3(), 'AvadaKedavra',0,true),false);assert.equal(queries,0);
 assert.equal(CastleLife.prototype.wardOff.call(L,v,new T.Vector3(), 'AvadaKedavra'),true,'non-projectile rays still query real stones');
 let options;const d={_creature:()=>v,_end(){},_partOf:()=>null,applyToCreature:(s,c,by,o,p,opts)=>options=opts};
 Duel.prototype._arriveAtCreature.call(d,{tk:'v',tid:'earth',spell:'AvadaKedavra',by:'me',earthChecked:true});assert.equal(options.earthChecked,true);
});

test('low-health earth mage eventually returns to fighting and always faces the foe during retreat',()=>{
 const f=fixture();f.g.terrain.data.raycast=()=>null;f.v.hp=5;
 f.step(2600);assert.ok(f.sent.some(m=>m.ev==='volley'),'low health cannot lock him into fleeing forever');
});

test('formal tiers vary mana, never the repertoire, and a novice can recover to his own maximum',async()=>{
 const {elementalEndurance}=await import('../../src/game/ElementalRules.js');
 const novice=elementalEndurance({rank:'novice',seed:14}),strong=elementalEndurance({rank:'teacher',seed:14});assert.ok(novice.mana<strong.mana);
 const f=fixture();f.v.maxMana=45;f.v.mana=17;f.g.terrain.data.raycast=()=>null;f.step(2000);
 assert.ok(f.sent.some(m=>m.ev==='volley'),'a low-capacity mage must not wait for an unreachable 60 mana');
});

test('an explosion destroys the floating wall even when its stones shield the mage from that blast',()=>{
 const f=fixture();f.step(100);const em=f.g.earthMages,s=em.swarms.get(f.v.id);em._phase(f.v,s,'wall');
 for(let i=0;i<120;i++)em.update(1/60);
 const p=new T.Vector3(0,f.v.y+2.4,-3.8);assert.ok(em.blocksBlast(p,new T.Vector3(0,f.v.y+2.4,0),'me'));
 const n=s.n;em.blast(p,4);assert.ok(s.n<n-10);assert.ok(f.sent.some(m=>m.ev==='hit'));
});

test('flying stones reflect at ordinary, maximal and divine Protection surfaces before reaching the body',()=>{
 for(const type of [1,2])for(const gods of [false,true]){
  const f=fixture(),g=f.g;let paid=0,hurt=0;
  g.combat={dead:false,shield:{type,left:5,gods,side:'right'},center:o=>o.set(0,3,-18),shieldAt:(side,o)=>o.set(0,3,-20),shieldDir:(side,o)=>o.set(0,0,-1),_blocked:()=>{paid++;return true;},hitBySpell:()=>hurt++};
  const rock={t:BLOCK.STONE,tm:{s:1}},flight={b:rock,pos:new T.Vector3(0,3,-25),last:new T.Vector3(),vel:new T.Vector3(0,0,600),age:0,by:f.v.id,mine:false};
  g.groundVortex.flights.push(flight);g.groundVortex._updateFlights(.02);
  assert.ok(flight.vel.z<0,`type ${type}, gods ${gods}`);assert.equal(paid,1);assert.equal(hurt,0);
 }
});

test('a fast stone cannot skip a single water layer at low frame rate',()=>{
 const f=fixture(),g=f.g;g.terrain.data.get=(x,L,z)=>z===-20?BLOCK.WATER:BLOCK.AIR;
 g.groundVortex.flights.push({b:{t:BLOCK.STONE,tm:{s:1}},pos:new T.Vector3(0,3,-25),last:new T.Vector3(),vel:new T.Vector3(0,0,600),age:0,by:f.v.id,mine:false});
 g.groundVortex._updateFlights(.02);assert.equal(g.groundVortex.flights.length,0);
});

test('earth Maxima takes its slab beside the opponent, transfers above the original target and releases after preparation',async()=>{
 const {LevitationMaxima}=await import('../../src/game/LevitationMaxima.js');
 const v={id:'earth',x:0,y:0,z:0,mana:200},foe={x:20,y:0,z:0},lifts=new Map();let source;
 const c={auth:true,_npcSeq:0,lifts,game:{terrain:{data:{landMade:()=>true,floorBelow:()=>1}},castleLife:{byId:new Map([[v.id,v]])}},
  begin(id,by,side,desc){source=desc.c;this.lifts.set(id,{id,by,phase:'loosen',base:new T.Vector3(source[0],0,source[2]),pos:new T.Vector3(),sway:new T.Vector3(),members:[],bodies:[]});return true;},
  end(id){lifts.get(id).phase='fall';},_tearOut(L){L.phase='carry';}};
 const id=LevitationMaxima.prototype.npcEarth.call(c,v,foe);assert.ok(id);assert.ok(Math.hypot(source[0]-foe.x,source[2]-foe.z)<=4.1);assert.equal(v.mana,150);
 const slab=lifts.get(id);foe.x=50;
 for(let i=0;i<400&&slab.phase!=='fall';i++)LevitationMaxima.prototype._npcEarthStep.call(c,slab,1/60);
 assert.equal(slab.phase,'fall');assert.ok(slab.pos.distanceTo(new T.Vector3(20,9,0))<.01,'a player can evade after the target was chosen');assert.ok(v.mana<140);
});

test('blast interruption cancels the previous stance and wall plan; recovery starts a new lift',()=>{
 const f=fixture();f.step(150);const em=f.g.earthMages,s=em.swarms.get(f.v.id);
 em._phase(f.v,s,'wall');f.v.earth.wallPlan={plan:{cells:[]}};f.v.earth.slab='old-slab';let released=0;f.g.levMax={end(){released++;}};
 f.v.stunT=1;em.interrupt(f.v);em.interrupt(f.v);
 assert.equal(released,1);assert.equal(em.swarms.size,0);assert.equal(f.v.earth.wallPlan,null);assert.equal(f.v.earth.slab,null);assert.equal(f.v.model.earthPoseT,undefined);
 f.v.stunT=0;em.think(f.v,1/60);assert.equal(f.v.earth.phase,'lift');assert.ok(em.swarms.has(f.v.id));
});
