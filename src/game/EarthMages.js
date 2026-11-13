/** Host-driven earth discipline. Real terrain, shared Ground Vortex stones/flights, ordinary NPC bodies/armour/death. */
import * as THREE from 'three';
import { EARTH as E, EARTH_PHASES, EARTH_STRIKES, EARTH_ATTACKS, EARTH_SHELL, WALL_COUNT, ELEMENTAL_BARE_HAND, earthSlot, earthBlockHit } from './EarthMagicRules.js';
import { newSwarm } from './GroundVortex.js';
import { BLOCK } from '../world/Terrain.js';
import { GV, digCells, liftable, lifted, hitBlocks, sweepsShield } from './GroundVortexRules.js';
import { findPassage } from './Stitching.js';
import { SPELL_COST } from './Combat.js';
const _at=new THREE.Vector3(),_dir=new THREE.Vector3(),_hit=new THREE.Vector3(),_slot={};
const modeOf=p=>'earth'+p[0].toUpperCase()+p.slice(1);
const alive=v=>v&&!v.dead&&!v.sleep&&!v.lev&&!v.carriedBy&&!(v.stunT>0)&&!v.vy;

export class EarthMages {
 constructor(game){this.game=game;this.swarms=new Map();this.clock=0;}
 init(v){
  if(!v.entry?.element)return;
  v.element=v.entry.element;v.bareHand=ELEMENTAL_BARE_HAND;v.bareMaster=true;v.rank='elemental';v.skillRole='mage';
  v.title='Маг земли';v.hp=v.maxHp=E.HP;v.mana=v.maxMana=E.MANA;v.armor=v.maxArmor=0;
  v.W={...v.W,regen:E.REGEN,dome:null,spells:{GroundVortex:1}};v.knowsFlight=false;v.noWand=true;
  v.job='elemental';v.earth={phase:'rest',t:0,cycle:0,wallCd:0,stitchCd:0,scan:0,empty:0,recover:false,source:0};
  v.model.setHeldTool('none');
 }
 _phase(v,s,phase){
  const a=v.earth;a.phase=phase;a.t=0;a.fired=false;a.strike=0;a.wallPlan=null;v.mode=modeOf(phase);v.model.earthPoseT=0;
  if(s){s.phase=phase;s.phaseT=0;s.form=phase==='wall'||phase==='cocoon'||EARTH_STRIKES[phase]?phase:'orbit';this._send(s);}
  this.game.sound?.playStep?.();
 }
 _start(v){
  if(v.mana<E.START+18)return null;v.mana-=E.START;
  const s=newSwarm(v.id,true);s.npc=true;s.phase='lift';s.phaseT=0;s.form='orbit';s.blade=false;s.acc=0;s.plan=[];s.sendT=0;
  s.body.set(v.x,v.y+2.4,v.z);s.yaw=v.yaw;this.swarms.set(v.id,s);this._phase(v,s,'lift');return s;
 }
 _stop(id){const s=this.swarms.get(id);if(!s)return;this.game.groundVortex._releaseAll(s,!!this.game.authority);this.swarms.delete(id);if(this.game.authority)this.game.sync?.groundVortex({npc:true,by:id,ev:'end'});}
 _pay(v,n){if(v.mana<n)return false;v.mana-=n;return true;}
 _threat(v){
  // Swept direction, not just the mere presence of a charge nearby.
  let threat=null;
  const accept=(p,d,by,bomb=false)=>{
   if(by===v.id || !this.game.castleLife._sees(v,p))return;const dx=v.x-p.x,dy=v.y+2-p.y,dz=v.z-p.z,dist=Math.hypot(dx,dy,dz);
   if(dist>42||dist<.01)return;const dot=(dx*d.x+dy*(d.y||0)+dz*d.z)/(Math.hypot(d.x,d.y||0,d.z)||1);
   if(dot<=0||dx*dx+dy*dy+dz*dz-dot*dot>16)return;
   if(!threat||dist<threat.dist)threat={p,by,bomb,dist};
  };
  for(const b of this.game.duel?.bolts.values()||[])if(b.state==='flying')accept(b.front,b.dir,b.by);
  for(const task of this.game.spells?.spells||[])if(task.bomb&&task.life>0)accept(task.bomb.p,task.bomb.v,task.bomb.by,true);
  return threat;
 }
 think(v,dt){
  const g=this.game,L=g.castleLife,a=v.earth;if(!a)return false;
  if(!this.swarms.has(v.id)&&!(a.stitchPose>0))v.mana=Math.min(v.maxMana,v.mana+E.REGEN*dt);
  a.t+=dt;a.wallCd=Math.max(0,a.wallCd-dt);a.stitchCd=Math.max(0,a.stitchCd-dt);a.scan-=dt;
  v.prep=null;v.cardilon=null;v.practice=null;v.fx=0;v.fleeT=0;v.path=null;v.seated=false;v.speed=0;
  let foe=v.foe?L._playerPos(v.foe):null;
  const threat=this._threat(v);
  if(!foe&&threat&&L._isPlayer(threat.by)){v.foe=threat.by;foe=L._playerPos(v.foe);}
  let s=this.swarms.get(v.id);
  if(!foe||Math.hypot(foe.x-v.x,foe.z-v.z)>E.LEASH){
   if(s)this._stop(v.id);v.foe=null;v.mode='idle';v.model.earthPoseT=undefined;L._ground(v);return true;
  }
  const dx=foe.x-v.x,dz=foe.z-v.z,dist=Math.hypot(dx,dz)||1;
  const want=Math.atan2(-dx,-dz);v.yaw+=Math.atan2(Math.sin(want-v.yaw),Math.cos(want-v.yaw))*Math.min(1,dt*4);
  if(v.mana<18)a.recover=true;
  if(a.recover&&v.mana>=E.START+40)a.recover=false;
  const weak=v.hp<v.maxHp*.3||a.recover;
  if(weak){
   if(s)this._stop(v.id);
   if(a.phase!=='rest')this._phase(v,null,'rest');
   if(a.stitchCd<=0&&v.mana>=SPELL_COST.Stitching&&a.scan<=0){a.scan=.9;this._stitch(v,foe);}
   if(a.stitchPose>0){a.stitchPose-=dt;v.mode='earthWall';v.model.earthPoseT=1.3-a.stitchPose;L._ground(v);return true;}
   L._steer(v,v.x-dx/dist*8,v.z-dz/dist*8,v.walk*1.25,dt,0);v.mode=v.speed>.2?'run':'earthRest';L._ground(v);return true;
  }
  if(!s){s=this._start(v);if(!s){a.recover=true;v.mode='earthRest';L._ground(v);return true;}}
  s.body.set(v.x,v.y+2.4,v.z);s.yaw=v.yaw;s.phaseT=a.t;v.model.earthPoseT=a.t;
  v.mana=Math.max(0,v.mana-E.DRAIN*dt);
  if((a.phase==='lift'&&a.t>.22)||a.phase==='orbit')this._gather(v,s,dt);
  if(a.phase==='lift'&&a.t>=EARTH_PHASES.lift)this._phase(v,s,'orbit');
  else if(a.phase==='orbit'){
   if(threat?.bomb&&s.n>=EARTH_SHELL.length&&this._pay(v,E.COCOON_COST))this._phase(v,s,'cocoon');
   else if(threat?.bomb&&s.n<WALL_COUNT&&a.wallCd<=0&&v.mana>=SPELL_COST.Breakthrough&&threat.dist>7){
    const plan=g.breakthrough?.prepare({x:v.x,y:v.y,z:v.z},{x:dx,z:dz});
    if(plan?.plan){a.wallCd=8;this._phase(v,s,'wall');a.wallPlan=plan;}
   }else if(threat&&s.n>=WALL_COUNT&&this._pay(v,E.WALL_COST))this._phase(v,s,'wall');
   else if(a.t>EARTH_PHASES.orbit&&s.n>=1&&dist<=E.RANGE){
    a.cycle++;
    if(!s.blade&&a.cycle%2===0&&this._pay(v,E.BLADE_COST)){this._phase(v,s,'blade');L._say(v,'Лезвия!',1.8);}
    else if(L._sees(v,foe))this._phase(v,s,EARTH_ATTACKS[(a.cycle-1)%EARTH_ATTACKS.length]);
   }
  }else if(a.phase==='wall'&&a.wallPlan&&a.t>.65&&!a.fired){
   const p=a.wallPlan;a.fired=true;a.wallPlan=null;
   if(this._pay(v,SPELL_COST.Breakthrough)){g.breakthrough.grow(p.o,p.d,v.id,p.plan);g.sync?.spell('WallRise',p.o,p.d,null,v.id);L._say(v,'Breakthrough!',2);this._engaged(v);}
  }else if(a.phase==='blade'&&a.t>.8&&!a.fired){
   a.fired=true;s.blade=true;for(const b of s.B)if(b){b.blade=true;for(let k=0;k<2;k++)g.fx?.spark?.(b.pos,0xb6a27c,.12,_dir.set(Math.random()-.5,.7,Math.random()-.5),.6);}this._send(s);
  }else if(EARTH_STRIKES[a.phase]){
   const strikes=EARTH_STRIKES[a.phase];
   while(a.strike<strikes.length&&a.t>=strikes[a.strike][0]){
    const count=strikes[a.strike++][1];
    if(s.n&&L._sees(v,foe)&&this._pay(v,E.THROW_COST)){
     _dir.set(dx,0,dz).normalize();
     s.aim=[foe.x,foe.y+.6,foe.z];s.arc=a.phase==='hammer'?1.6:a.phase==='sweep'?1.15:1;
     this._send(s);g.groundVortex._volley(s,Math.min(count,s.n),_dir);this._engaged(v);
    }
   }
  }
  if(a.phase!=='lift'&&a.phase!=='orbit'&&a.t>EARTH_PHASES[a.phase])this._phase(v,s,'orbit');
  // No indefinite orbit waiting for twelve stones or a clear sightline. Seek a fresh
  // source/angle with real collision steering, and fall back to mana recovery.
  a.empty=s.n?0:a.empty+dt;
  if(a.empty>2.5){a.source++;s.plan.length=0;a.empty=0;}
  if((dist>E.RANGE||!L._sees(v,foe)||!s.n)&&a.phase==='orbit')L._steer(v,foe.x,foe.z,v.walk*1.3,dt,L._sees(v,foe)&&s.n?E.RANGE-3:0);
  v.mode=modeOf(a.phase);L._ground(v);return true;
 }
 _engaged(v){if(v.foe)(v.castAtPlayers||(v.castAtPlayers=new Set())).add(v.foe);}
 _stitch(v,foe){
  const g=this.game,data=g.terrain?.data;if(!data)return false;
  const x=Math.round(v.x),z=Math.round(v.z);if(data.landMade&&!data.landMade(x,z))return false;
  // Enclosed terrain overhead distinguishes a cave from an open field.
  const roof=data.raycast(_at.set(v.x,v.y+3.6,v.z),_dir.set(0,1,0),16);if(!roof)return false;
  _dir.set(foe.x-v.x,0,foe.z-v.z).normalize();_at.set(v.x+_dir.x*1.3,v.y+2.0,v.z+_dir.z*1.3);
  const plan=findPassage((x,L,z)=>data.get(x,L,z),_at,_dir);
  if(!plan.cells||plan.plane==='y')return false;
  const center=plan.cells.reduce((p,c)=>({x:p.x+c.x/plan.cells.length,y:p.y+(c.L-1)/plan.cells.length,z:p.z+c.z/plan.cells.length}),{x:0,y:0,z:0});
  const along=(center.x-v.x)*_dir.x+(center.z-v.z)*_dir.z;
  if(along<1.8||along>Math.hypot(foe.x-v.x,foe.z-v.z)-1||g.wards?.forbids?.(_at,center))return false;
  v.mana-=SPELL_COST.Stitching;v.earth.stitchCd=14;v.earth.stitchPose=1.3;
  g.stitching.sew(_at.clone(),_dir.clone(),v.id);g.sync?.spell('Stitching',_at,_dir,null,v.id);g.castleLife._say(v,'Stitching!',2);return true;
 }
 _gather(v,s,dt){
  const gv=this.game.groundVortex,data=gv.data;if(!data||s.n>=E.MAX)return;
  s.acc=Math.min(4,s.acc+dt*E.LIFT_RATE);let took=0;
  while(s.acc>=1&&s.n<E.MAX&&took<2){
   if(!s.plan.length){
    const angle=v.yaw+(v.earth.source%8)*Math.PI/4;
    const x=Math.round(v.x-Math.sin(angle)*5),z=Math.round(v.z-Math.cos(angle)*5);
    if(data.landMade&&!data.landMade(x,z))return;
    const level=data.floorBelow?data.floorBelow(x,z,Math.floor(v.y+1.5)):data.topLayer(x,z);
    s.plan=digCells((x,L,z)=>data.get(x,L,z),(x,z)=>data.landMade&&!data.landMade(x,z)?-1e6:data.floorBelow?data.floorBelow(x,z,Math.floor(v.y+1.5)):data.topLayer(x,z),{x,z,L:level},{x:v.x,z:v.z},18,(x,L,z)=>
     data.landMade&&!data.landMade(x,z)||data.godGiftAt?.(x,L,z)||this.game.wards?.forbids?.(s.body,{x,y:L-1,z})||this.game.ships?.footprintAt?.(x,L-1,z));
    if(!s.plan.length){v.earth.source++;s.acc=0;return;}
   }
   const [x,L,z,type]=s.plan.shift();if(!liftable(data.get(x,L,z)))continue;
   data.set(x,L,z,BLOCK.AIR);gv._edits.push([x,L,z,BLOCK.AIR]);
   const b=gv._newBlock(s,gv._freeIndex(s),lifted(type),x,L,z,new THREE.Vector3(x,L-1,z));b.blade=s.blade;b.npc=true;
   s.acc--;took++;s.dirty=true;
   this.game.fx?.spark?.(b.src,0xbba17b,.2,_dir.set(0,1.8,0),.65);
  }
 }
 update(dt){
  this.clock+=dt;
  for(const [id,s] of this.swarms){
   const v=this.game.castleLife?.byId.get(id);
   if(this.game.authority&&!alive(v)){this._stop(id);continue;}
   if(!this.game.authority){if(this.clock-s.received>4){this._stop(id);continue;}s.phaseT+=dt;if(v){v.model.earthPoseT=s.phaseT;v.mode=modeOf(s.phase);}}
   s.angle+=dt*1.1;
   let rank=0;
   for(const b of s.B)if(b){
    earthSlot(rank++,s.form,s.angle,s.yaw,_slot);
    _at.set(s.body.x+_slot.x,s.body.y+_slot.y,s.body.z+_slot.z);
    const age=(this.game.groundVortex._t-b.born)/.38;
    if(b.src&&age<1){const u=Math.max(0,age),k=u*u*(3-2*u);_at.lerpVectors(b.src,_at,k);_at.y+=Math.sin(u*Math.PI)*1.2;}
    else b.src=null;
    if(b.placed)b.pos.lerp(_at,1-Math.exp(-dt*7));else{b.pos.copy(_at);b.placed=true;}
   }
   if(this.game.authority){s.sendT-=dt;if(s.sendT<=0){s.sendT=.2;this._send(s);}}
  }
 }
 _send(s){if(!this.game.authority)return;this.game.sync?.groundVortex({npc:true,by:s.by,ev:'earth',p:s.body.toArray(),yaw:s.yaw,phase:s.phase,pt:s.phaseT,form:s.form,blade:!!s.blade,blocks:s.B.map(b=>b?[b.t,b.cx,b.cy,b.cz]:null)});}
 onNet(m){
  if(this.game.authority||typeof m.by!=='string'||!(m.by.startsWith(E.ID+':') || /^hm-?\d+_-?\d+_\d+:\d+$/.test(m.by)))return;
  let s=this.swarms.get(m.by);
  if(m.ev==='end'){this._stop(m.by);return;}
  if(m.ev!=='earth'){
   if(!s)return;
   if(m.ev==='volley'&&Array.isArray(m.ids)&&Array.isArray(m.d)){
    // Launch points are authoritative: a late snapshot must not throw a guest's
    // stones from their former extraction cells or unfinished interpolation.
    for(let j=0;j<Math.min(8,m.ids.length);j++){const b=s.B[m.ids[j]],p=m.origins?.[j];if(b&&Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)){b.pos.fromArray(p);b.src=null;}}
    s.arc=Number.isFinite(m.arc)?Math.max(1,Math.min(1.6,m.arc)):1;s.aim=Array.isArray(m.aim)&&m.aim.length===3&&m.aim.every(Number.isFinite)?m.aim:null;this.game.groundVortex._replayVolley(s,m.ids.filter(Number.isInteger).slice(0,8),_dir.fromArray(m.d),m.seed|0);}
   else if(m.ev==='hit'&&Array.isArray(m.ids))this.game.groundVortex._breakBlocks(s,m.ids.filter(Number.isInteger).slice(0,E.MAX),false);
   return;
  }
  if(!Array.isArray(m.p)||m.p.length!==3||!m.p.every(Number.isFinite)||!Array.isArray(m.blocks)||m.blocks.length>E.MAX||!Number.isFinite(m.yaw)||!EARTH_PHASES[m.phase])return;
  if(!s){if(this.swarms.size>=32)return;s=newSwarm(m.by,false);s.npc=true;this.swarms.set(m.by,s);}
  s.received=this.clock;s.body.fromArray(m.p);s.yaw=m.yaw;s.phase=m.phase;s.phaseT=Number.isFinite(m.pt)?Math.max(0,Math.min(10,m.pt)):0;s.form=['wall','cocoon',...EARTH_ATTACKS].includes(m.form)?m.form:'orbit';s.blade=!!m.blade;
  for(let i=0;i<E.MAX;i++){
   const cell=m.blocks[i],b=s.B[i];
   if(!Array.isArray(cell)||cell.length!==4||!cell.every(Number.isFinite)){if(b){s.B[i]=null;s.n--;}continue;}
   const nb=b||this.game.groundVortex._newBlock(s,i,cell[0],cell[1],cell[2]+1,cell[3],new THREE.Vector3(cell[1],cell[2],cell[3]));nb.blade=s.blade;nb.npc=true;
  }
 }
 segmentHit(a,b,by=null){
  let best=null;
  for(const s of this.swarms.values()){
   if(s.by===by)continue;
   for(let i=0;i<s.B.length;i++){const rock=s.B[i];if(!rock||!rock.placed)continue;const t=earthBlockHit(a,b,rock.pos,s.yaw);
    if(t!==null&&(!best||t<best.t))best={s,i,t,point:new THREE.Vector3().lerpVectors(a,b,t)};
   }
  }return best;
 }
 take(hit,spell){
  if(!hit)return false;
  const s=hit.s;
  if(!this.game.authority)return !sweepsShield(spell);
  if(sweepsShield(spell)){this._stop(s.by);return false;}
  const ids=[hit.i],want=Math.max(1,Math.min(20,hitBlocks(spell)));
  for(let i=0;i<s.B.length&&ids.length<want;i++)if(i!==hit.i&&s.B[i]&&s.B[i].pos.distanceToSquared(hit.point)<9)ids.push(i);
  this.game.groundVortex._breakBlocks(s,ids,true);this.game.sync?.groundVortex({npc:true,by:s.by,ev:'hit',ids});return true;
 }
 clipRay(o,d,len){const end=_hit.copy(o).addScaledVector(d,len),hit=this.segmentHit(o,end);return hit?len*hit.t:len;}
 blocksBlast(from,to,by){return !!this.segmentHit(from,to,by);}
 snapshot(){
  const out=[],seen=new Set(),add=b=>{const key=b.cx+','+b.cy+','+b.cz;if(!seen.has(key)){seen.add(key);out.push([b.cx,b.cy+1,b.cz,b.t]);}};
  for(const s of this.swarms.values())for(const b of s.B)if(b)add(b);
  for(const f of this.game.groundVortex.flights)if(f.b.npc&&f.mine)add(f.b);
  for(const f of this.game.groundVortex.falls)if(f.b.npc&&f.mine&&!f.crumble)add(f.b);
  return out;
 }
 restore(cells){
  const data=this.game.terrain?.data;if(!data||!Array.isArray(cells))return;
  const edits=[];for(const c of cells.slice(0,960))if(Array.isArray(c)&&c.length===4&&c.every(Number.isFinite)&&liftable(c[3])&&data.get(c[0],c[1],c[2])===BLOCK.AIR){data.set(...c);edits.push(c);}
  if(edits.length)this.game.builder?._sendEdits(edits);
 }
 dispose(){for(const id of [...this.swarms.keys()])this._stop(id);}
}
