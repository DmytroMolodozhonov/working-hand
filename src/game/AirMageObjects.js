/** NPC Leviosa Maxima uses real loose things, never conjured ammunition or terrain.
 * Same mass/speed damage and creature immunities as ItemSwarmRules.SWARM_TARGETS.
 * Host simulates; existing item/weapon snapshots carry poses. Reliable metadata
 * only identifies held objects, so guests can stop their own spells on them too.
 */
import * as T from 'three';
import {SwarmSim,itemRefusal,swarmDrain,hitDamage,hitPush} from './ItemSwarmRules.js';
import {ITEM_INFO} from './ItemTypes.js';
import {SPELL_COST} from './SpellCosts.js';
import {LEV_MAX} from './LevitationMaxima.js';
import {isDivine} from './ProtectionGods.js';
const HURT=new Set(['p','v','z','a','c']),SOLID=new Set(['t','s','D','I']);
const end=new T.Vector3();
export class AirMageObjects {
 constructor(game){this.game=game;this.active=new Map();this.remote=new Map();this.seq=0;this.hits=new Set();}
 point(ref){return ref.kind==='w'?ref.obj.position:ref.obj.model.position;}
 owns(ref,by){return ref.kind==='w'?ref.obj.holder?.airMage===by:ref.obj.airMage===by&&ref.obj.lev;}
 wire(s){const ids=s.sim.members.filter(m=>!m.fly&&!m.out).map(m=>{const r=s.refs.get(m.id);return[r.kind,r.id];});this.game.net?.send?.({t:'aobj',by:s.v.id,token:s.token,ids},true);}
 start(v){
  const g=this.game;if(!g.authority||this.active.has(v.id)||this.active.size>=16||v.mana<SPELL_COST.LevitationMaxima+8)return false;
  const candidates=[],at=new T.Vector3(v.x,v.y+1.5,v.z);
  for(const L of g.items?.loose?.values()||[]){if(!itemRefusal(L)&&!L.airMage)candidates.push({kind:'i',id:L.item.uid,obj:L});}
  for(const w of g.weapons?.weapons||[]){if(!w.holder&&!w.remoteTarget&&!w.ritual&&!w.godGift&&!g.sync?.weaponOwners?.has(w.id))candidates.push({kind:'w',id:w.id,obj:w});}
  const refs=candidates.filter(r=>{const p=this.point(r);return p.distanceToSquared(at)<144&&(!g.collision?.lineOfSight||g.collision.lineOfSight(at.x,at.y,at.z,p.x,p.y,p.z,.2));}).sort((a,b)=>Number(b.kind==='w')-Number(a.kind==='w')||this.point(a).distanceToSquared(at)-this.point(b).distanceToSquared(at)).slice(0,6);
  if(!refs.length)return false;
  const s={v,sim:new SwarmSim(),refs:new Map(),age:0,token:v.id+':objects:'+(++this.seq)};
  s.sim.mode='orbit';v.mana-=SPELL_COST.LevitationMaxima;
  for(const r of refs){const key=r.kind+':'+r.id;s.refs.set(key,r);s.sim.add(key,this.point(r));
   if(r.kind==='w'){r.obj.hover=null;r.obj.attach({levitate:true,airMage:v.id});}
   else {const L=r.obj;L.lev=true;L.swarm=true;L.airMage=v.id;L.hover=null;L.rest=false;L.sentRest=false;L.vel?.set(0,0,0);}
  }
  this.active.set(v.id,s);this.wire(s);return true;
 }
 release(s,m){
  const r=s.refs.get(m.id);if(r&&this.owns(r,s.v.id)){
   if(r.kind==='w'){r.obj.release();r.obj.velocity.set(m.vx,m.vy,m.vz).clampLength(0,22);}
   else {const L=r.obj;L.airMage=null;L.lev=false;L.swarm=false;L.rest=false;L.sentRest=false;L.noPick=performance.now()+300;L.vel?.set(m.vx,m.vy,m.vz);}
  }
  s.refs.delete(m.id);s.sim.remove(m.id);
 }
 stop(by){const s=this.active.get(by);if(!s)return;for(const m of [...s.sim.members])this.release(s,m);this.active.delete(by);this.wire(s);}
 update(dt){
  const g=this.game;if(!g.authority)return;
  let bodies=null;
  for(const [by,s] of this.active){
   const v=s.v,foe=v.foe&&g.castleLife?._playerPos(v.foe);s.age+=dt;
   if(g.castleLife?.byId?.get(by)!==v||v.dead||v.stunT>0||v.lev||v.carriedBy||v.elemental?.recover||!foe||s.age>9){this.stop(by);continue;}
   let changed=false;
   for(const m of [...s.sim.members]){const r=s.refs.get(m.id);if(!r||!this.owns(r,by)||(r.kind==='i'&&g.items.loose.get(r.id)!==r.obj)||(r.kind==='w'&&!g.weapons.weapons.includes(r.obj))){s.refs.delete(m.id);s.sim.remove(m.id);changed=true;}}
   const cost=(LEV_MAX.DRAIN+swarmDrain(s.sim.size))*dt;if(v.mana<cost){this.stop(by);continue;}v.mana-=cost;
   const I={body:{x:v.x,y:v.y+1.7,z:v.z},head:{x:v.x,y:v.y+3,z:v.z},omega:3.5,wandYaw:Math.atan2(foe.x-v.x,foe.z-v.z),selfId:'v:'+by,
    blocked:(x,y,z)=>!!g.collision?.pointBlocked?.(x,y,z),floorY:(x,z,y)=>g.collision?.groundAt?.(x,z,y+.5)??-1e9};
   if(s.sim.mode!=='launch'){
    const mode=g.earthMages?._threat(v)&&s.sim.size>=3?'shield':'orbit';if(mode!==s.sim.mode){s.sim.mode=mode;changed=true;}
    if(s.age>3.2&&mode!=='shield'&&g.castleLife._sees(v,foe)){s.sim.launch({aim:foe},'p:'+v.foe);changed=true;g.elementalMages?.engaged(v);}
   }
   if(s.sim.mode==='launch'){
    if(!bodies)bodies=(g.duel?._bodies(null)||[]).filter(b=>HURT.has(b.kind)||SOLID.has(b.kind)).map(b=>({id:b.kind+':'+b.id,kind:b.kind,cid:b.id,x:(b.a.x+b.b.x)/2,y:(b.a.y+b.b.y)/2,z:(b.a.z+b.b.z)/2,r:b.r,hy:Math.abs(b.a.y-b.b.y)/2+b.r}));
    I.bodies=bodies;
   }
   const events=s.sim.step(dt,I);
   for(const m of s.sim.members){const r=s.refs.get(m.id);if(!r)continue;this.point(r).set(m.x,m.y,m.z);
    if(r.kind==='w'){const w=r.obj;w.drive.position.copy(w.position);w.quaternion.setFromEuler(new T.Euler(.5,s.age*2+m.ph,0));w.drive.quaternion.copy(w.quaternion);w.velocity.set(m.vx,m.vy,m.vz);}
    else r.obj.model.rotation.y+=dt*2;
   }
   for(const e of events)if(e.type==='hit')this.hit(s,e);
   for(const m of [...s.sim.members])if(m.done){this.release(s,m);changed=true;}
   if(!s.sim.size){this.stop(by);continue;}if(changed)this.wire(s);
  }
 }
 hit(s,e){
  const g=this.game,b=e.body,r=s.refs.get(e.m.id);if(!r||!HURT.has(b.kind))return;
  const mass=r.kind==='w'?r.obj.mass:ITEM_INFO[r.obj.item.kind]?.weight??1,from=new T.Vector3(e.m.x,e.m.y,e.m.z);
  const m={t:'aobjhit',id:s.token+':'+e.m.id,to:b.cid,by:s.v.id,damage:hitDamage(mass,e.v),from:from.toArray(),vel:[e.dir.x*hitPush(mass,e.v),e.dir.y*hitPush(mass,e.v),e.dir.z*hitPush(mass,e.v)]};
  if(b.kind==='p'){if(b.cid===g.localId)this.hitMe(m);else g.net?.send?.(m,true);return;}
  const c=g.duel?._creature(b.kind,b.cid);if(!c||b.kind==='v'&&g.castleLife.wardOff(c,from,'LevitationMaxima'))return;
  const vel=new T.Vector3(...m.vel);g.levitation?._hurt(b.kind,c,m.damage,s.v.id,vel,from);g.creatureImpact?.apply(c,{v:vel,by:s.v.id,kind:'swarm',from,noShield:true});
 }
 hitMe(m){
  const g=this.game,c=g.combat;if(m.to!==g.localId||!c?.enabled||c.dead||!Array.isArray(m.from)||!Array.isArray(m.vel)||![...m.from,...m.vel,m.damage].every(Number.isFinite))return;
  if(this.hits.has(m.id))return;this.hits.add(m.id);if(this.hits.size>512)this.hits.delete(this.hits.values().next().value);
  const p=new T.Vector3(...m.from),vel=new T.Vector3(...m.vel).clampLength(0,7);
  if(c.shieldFactor(p)>=1&&c._blocked(p,'LevitationMaxima'))return;
  c.damage(Math.max(1,Math.min(10,m.damage)),m.by,'thrown');g.impact?.apply({v:vel,from:p,by:m.by,kind:'swarm'});
 }
 onNet(m){if(this.game.authority)return;if(m.t==='aobjhit'){this.hitMe(m);return;}if(typeof m.by!=='string'||!Array.isArray(m.ids)||m.ids.length>6)return;if(!m.ids.length){this.remote.delete(m.by);return;}this.remote.set(m.by,{token:m.token,ids:m.ids.filter(r=>Array.isArray(r)&&['w','i'].includes(r[0])&&typeof r[1]==='string')});}
 *held(){
  if(this.game.authority){for(const s of this.active.values())for(const m of s.sim.members)if(!m.fly&&!m.out){const r=s.refs.get(m.id);if(r&&this.owns(r,s.v.id))yield{by:s.v.id,r,s,m};}}
  else for(const [by,s] of this.remote)for(const [kind,id] of s.ids){const obj=kind==='w'?this.game.weapons?.weapons.find(w=>w.id===id):this.game.items?.loose.get(id);if(obj)yield{by,r:{kind,id,obj}};}
 }
 segmentHit(a,b,by=null){
  let best=null;const d=new T.Vector3().subVectors(b,a),len=d.lengthSq();if(!len)return null;
  for(const h of this.held()){if(h.by===by)continue;const p=this.point(h.r),r=h.r.kind==='w'?Math.min(1.2,h.r.obj.spec.length*h.r.obj.S*.5):.45;
   const q=new T.Vector3().subVectors(a,p),B=q.dot(d),C=q.lengthSq()-r*r,disc=B*B-len*C;if(disc<0)continue;
   const t=C<=0?0:(-B-Math.sqrt(disc))/len;if(t<0||t>1||best&&t>=best.t)continue;best={...h,t,airObject:true,point:new T.Vector3().lerpVectors(a,b,t)};
  }return best;
 }
 take(hit,spell){if(!hit)return false;const divine=isDivine(spell);if(this.game.authority){hit.m.vx=0;hit.m.vy=2;hit.m.vz=0;this.release(hit.s,hit.m);this.wire(hit.s);}return !divine;}
 clipRay(o,d,len){const hit=this.segmentHit(o,end.copy(o).addScaledVector(d,len));return hit?hit.t*len:len;}
 blast(p,r){if(!this.game.authority)return;for(const s of this.active.values()){let changed=false;for(const m of [...s.sim.members])if(this.point(s.refs.get(m.id)).distanceToSquared(p)<(r+.5)**2){this.release(s,m);changed=true;}if(changed)this.wire(s);}}
 snapshot(){return [...this.active.values()].map(s=>({t:'aobj',by:s.v.id,token:s.token,ids:s.sim.members.filter(m=>!m.fly&&!m.out).map(m=>{const r=s.refs.get(m.id);return[r.kind,r.id];})}));}
 dispose(){for(const by of [...this.active.keys()])this.stop(by);this.remote.clear();}
}
