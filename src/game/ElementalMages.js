import {LEV_MAX} from './LevitationMaxima.js';
import {HOLD_FATIGUE} from './Levitation.js';
import {duelRange,emptyRange} from './DuelRange.js';
import { NPC_COST } from './WizardAI.js';
import {waveSource} from './WaveSource.js';
/** Host-owned elemental combat on ordinary CastleLife bodies: shared spell collisions, armour and death. */
import * as T from 'three';
import { SWAT, SWAT_MODES, swatSpell, pickOrb, backDirection, canSwat, BEND, bendAngle, rotateYInPlace, boltAsOrb } from './ElementalParry.js';
import { isDivine } from './ProtectionGods.js';
import { findWater, WIDE_WATER } from './WaterMageSource.js';
import { newHop, stepHop, newWatch, stuckStep } from './ElementalMove.js';
import {WaterMageGuard} from '../fx/WaterMageGuard.js';
import { ElementalSwirl } from '../fx/ElementalSwirl.js';
import { IceShards } from './IceShards.js';
import { SHARDS, shardAim } from './ElementalRules.js';
import { elementalEndurance, AIR_THROW, throwVector, lowMana, readyMana, REGEN, AIR_SPIN, nextAirMove } from './ElementalRules.js';
import { SPELL_COST } from './SpellCosts.js';
import { elementK } from './HeroElement.js';
import {FLIGHT} from './Flight.js';
import { FEATHER } from './Featherfall.js';
import { isImpulse } from './WindImpulse.js';
import {AirMageObjects} from './AirMageObjects.js';
import {stepAirMageWings} from './AirMageWings.js';
import { FX } from '../fx/WizardFx.js';
import { BLOCK } from '../world/Terrain.js';
import { createRng } from '../core/math.js';
import { airWet } from './HydroRules.js';
const TITLES={water:'Маг воды',air:'Маг воздуха',fire:'Маг огня'};
const _up0=new T.Vector3(0,1,0),_o=new T.Vector3(),_d=new T.Vector3();
export function elementalGifts(entry){const r=createRng((entry.seed??1)^0x43b2ca19);return {hydro:{h:entry.element==='water'&&r()<.25?1:0},resist:{f:entry.element==='water'&&r()<.1?1:0}};}
export class ElementalMages {
 constructor(game){this.game=game;this.seq=0;this.objects=new AirMageObjects(game);this.guard=game.scene?new WaterMageGuard(game):null;this.swirl=game.scene?new ElementalSwirl(game):null;this.shards=game.scene?new IceShards(game):null;}
 init(v){
  const element=v.entry?.element;if(!TITLES[element])return;
  v.element=element;v.title=TITLES[element];v.bareHand='advanced';v.bareMaster=true;v.noWand=true;v.rank='elemental';v.skillRole='mage';
  const endurance=elementalEndurance(v.entry);v.elementalTier=endurance.tier;v.mana=v.maxMana=endurance.mana;v.hp=v.maxHp=32;v.armor=v.maxArmor=0;
  v.W={...v.W,regen:1,dome:null};v.knowsFlight=element==='air'&&!v.entry.look?.wings;v.gifts=elementalGifts(v.entry);
  if(!v.cs?.def||v.cs.def.kind==='elemental')v.job='elemental';v.elemental={t:0,phase:'rest',cycle:0,recover:false,scan:0,source:false,water:v.entry.look?.tank?36:0,guard:0,flight:0,flightCd:0};
  v.model.setHeldTool('none');
  v.elemental.winged=element==='air'&&!!v.entry.look?.wings;
 }
 pay(v,cost){if(v.mana<cost)return false;v.mana-=cost;return true;}
 phase(v,p){v.elemental.phase=p;v.elemental.t=0;v.elemental.fired=false;v.elemental.shots=0;v.model.elementPoseT=0;v.mode=v.element+p;}
 interrupt(v){
  if(v.element==='fire'&&v.elemental?.phase==='Vault'){this.phase(v,'Chamber');v.castT=0;}
  // (an air mage knocked off by a blast or stunned: the lift and the stance end at once and, if he flies by the wind, he FALLS — he must not hang in the air in a stand-up pose; the brain starts again when he is up)
  if(v.element==='air'&&v.elemental&&!v.elemental.hit1){const a=v.elemental;a.hit1=true;if(a.liftT>0||a.carry)this.endLift(v,null);a.hopping=false;a.guard=0;if(a.phase!=='Coil'&&a.phase!=='rest')this.phase(v,'Coil');if(v.fly&&!a.winged&&(v.stunT>0||v.vy)){v.fly=false;a.flight=0;a.flightCd=Math.max(a.flightCd||0,4);if(!v.vy)v.vy=-0.01;}}
 }
 /** Hops (ElementalMove.js): a few steps to a free place, a pause, the body turned the way he goes — never a slide round the foe. → 'hop' | 'wait' | 'stuck' */
 reposition(v,foe,dt,radius=14){
  const L=this.game.castleLife,a=v.elemental,foeId=v.foe,h=v.hop||(v.hop=newHop());
  if(a.blindT>1.2&&!a.recover)radius=Math.min(radius,7); // (the foe is hidden — behind a hill, a wall, trees: he comes closer to see him, not stays at a distance for ever: 14.11, 81 s of «Coil» without a cast)
  const r=stepHop(h,foe,radius,v.walk*1.1,dt,{pos:v,steer:(tx,tz,sp,d)=>L._steer(v,tx,tz,sp,d,0),free:(x,z)=>L._walkable?L._walkable(x,z,v.y):true,rng:Math.random});
  if(!v.foe&&foeId)v.foe=foeId; // (a blocked step must not make the pilot forget a live foe)
  a.hopping=r==='hop';return r;
 }
 /** Beating a thrown orb back (ElementalParry.js): see it, swing, take it out of the flight, throw it back at the thrower. → true while the swing goes on. */
 /**
  * The fire mage's answer to a duel charge flying at him (the author 15.11: «вместо протекшена… магия луча огня… вступает в дуэль… огненная версия заклинания»):
  * his own beam («Fire Vortex») leaves the wand at whoever cast it, the two charges meet and push against each other (Duel clashes: the one the meeting point
  * reaches loses). Half the price for his own element. Only at a player's charge that is not of the gods; one answer to one charge; not in a clash already.
  * true: he answered (the caller does nothing else this frame).
  */
 fireCounter(v,foe){
  const g=this.game,L=g.castleLife,duel=g.duel,a=v.elemental;
  if(!duel?.bolts||!duel._addBolt||(a.fireCd||0)>0||a.swat||v.prep)return false;
  if(duel.clashes?.some((x)=>x.a.by===v.id||x.b.by===v.id))return false;
  let hit=null;
  for(const b of duel.bolts.values()){
   if(b.state!=='flying'||b.npc||b.by===v.id||b.fireSeen||isDivine(b.spell)||!L._isPlayer(b.by))continue;
   const dx=v.x-b.front.x,dz=v.z-b.front.z,dist=Math.hypot(dx,dz);
   if(dist>22||dist<3)continue;
   if(!((b.tk==='v'&&b.tid===v.id)||(b.dir.x*dx+b.dir.z*dz>dist*.94)))continue; // (aimed at him, or coming straight at him)
   hit=b;break;
  }
  if(!hit)return false;
  hit.fireSeen=true; // (one answer to one charge, taken or not)
  const cost=(NPC_COST.FireDuel??14)*elementK('fire','FireVortex');
  const fp=L._playerPos?.(hit.by);if(!fp||v.mana<cost||!L._sees(v,foe||{x:fp.x,y:fp.y,z:fp.z}))return false;
  if(Math.random()>=.85)return false; // (his die: he did not see it in time)
  const o=T.Vector3?new T.Vector3(v.x-Math.sin(v.yaw)*.9,v.y+2.7,v.z-Math.cos(v.yaw)*.9):null;
  const d=new T.Vector3(hit.o.x-o.x,hit.o.y-o.y,hit.o.z-o.z).normalize();
  const reach=duelRange(v.mana);if(reach<=0)return false;
  if(g.collision?.lineOfSight&&!g.collision.lineOfSight(v.x,v.y+3,v.z,o.x,o.y,o.z,.15))return false;
  v.mana-=cost;a.fireCd=2.2;
  v.yaw=Math.atan2(-(hit.o.x-v.x),-(hit.o.z-v.z));
  const b=duel._addBolt({rng:emptyRange(reach,true),id:`${v.id}:fc${++this._fcSeq||(this._fcSeq=1)}`,by:v.id,spell:'FireDuel',side:'right',tk:'p',tid:hit.by,ak:.55,o:o.clone(),d,npc:true,vs:hit.id});
  if(!b)return false;
  g.sync?.duelCast?.(b);duel._burst?.(o,duel.colors('FireDuel',v.id).glow,12);
  v.aimPitch=Math.asin(Math.max(-1,Math.min(1,d.y)));v.castT=.55;v.model.castNow=true;
  L._say?.(v,'Fire Vortex!',1.8);this.phase(v,'Chamber');
  return true;
 }
 parry(v,foe,dt){
  if(v.elemental)v.elemental.fireCd=Math.max(0,(v.elemental.fireCd||0)-dt);
  const a=v.elemental,g=this.game,L=g.castleLife;a.parryCd=Math.max(0,(a.parryCd||0)-dt);
  if(a.swat){
   const S=a.swat;S.t+=dt;v.mode=SWAT_MODES[v.element];v.model.elementPoseT=S.t;a.hopping=false;v.speed=0;
   if(S.kind==='bend'){
    if(!S.done&&S.t>=BEND.HIT){S.done=true;this.bendNow(v,S);}
   }else if(!S.done&&S.t>=SWAT.HIT){
    const t=S.task,o=t.orb;
    if(t.life>0&&Math.hypot(o.p.x-v.x,o.p.y-(v.y+2.6),o.p.z-v.z)<=(SWAT.TAKE_BY[v.element]||SWAT.TAKE_R)){S.done=true;this.swatHit(v,t,foe);}
    else if(S.t>=SWAT.HIT_MAX)S.done=true; // (it burst or flew wide: the swing found nothing)
   }
   if(S.t>=SWAT.T){a.swat=null;a.parryCd=S.kind==='bend'?BEND.CD:SWAT.CD;this.phase(v,v.element==='fire'?'Chamber':v.element==='water'?'Gather':'Coil');}
   L._ground(v);return true;
  }
  if(v.element==='fire'&&this.fireCounter(v,foe))return true; // (a charge flies at the fire mage: his beam of fire meets it — a duel)
  if(!g.spells?.spells||!canSwat(v,a,v.mana)||!L._sees(v,foe))return false;
  if(v.element==='water'&&!this.waterSource(v,0))return false; // (the water he douses with is the water he has)
  const chest={x:v.x,y:v.y+2.6,z:v.z},orbs=this._orbs||(this._orbs=[]);orbs.length=0;
  for(const t of g.spells.spells)if(t.orb&&t.life>0&&t.parry)orbs.push(t.orb);
  if(v.element==='air'&&g.duel?.bolts)for(const b of g.duel.bolts.values())if(b.state==='flying'&&b.by!==v.id&&!isDivine(b.spell))orbs.push(boltAsOrb(b,g.duel.boltSpeed?.(b)||22)); // (a charge of the duel too: the gods' spells are not turned by anything)
  const pick=pickOrb(orbs,chest,v.id,SWAT.REACH_BY[v.element]||SWAT.REACH);if(!pick)return false;
  const kind=v.element==='air'&&(pick.o.bolt||Math.random()>=BEND.RETURN_SHARE)?'bend':'return'; // (air: a charge is always bent; a thrown orb is bent or thrown back, by his mood)
  a.parryCd=SWAT.CD*.5;if(Math.random()>=SWAT.CHANCE[v.element])return false; // (his die: he did not see it in time)
  if(!this.pay(v,kind==='bend'?BEND.COST:SWAT.COST[v.element]))return false;
  a.swat={t:0,task:pick.o.task,bolt:pick.o.bolt||null,kind,done:false,variant:Math.random()<.5?0:1};v.model.elementVariant=a.swat.variant;if(v.element==='water'&&!a.source&&!a.humid)a.water=Math.max(0,a.water-3);this.phase(v,'Swat');v.mode=SWAT_MODES[v.element];return true;
 }
 /** The blow lands: the orb is taken out of its flight (no blast at the mage) and a new one of the same spell goes back from his hand at whoever threw it. */
 swatHit(v,task,foe){
  const g=this.game,L=g.castleLife,o=task.orb,at=o.p,name=swatSpell(o);
  if(!task.parry?.())return;
  if(v.element==='water'){this.douse(v,o,at);return;} // (water puts it out: no orb comes back)
  const from=L._playerPos?.(o.by)||foe;
  g.fx?.lightFlash?.(at,v.element==='fire'?0xff8a26:0xcfefff,2.2,.18,10);
  for(let i=0;i<10;i++)g.fx?.spark?.(at,v.element==='fire'?0xffa040:0xe6f6ff,.1,_d.set((Math.random()-.5)*5,Math.random()*3,(Math.random()-.5)*5),.45);
  g.sound?.playClang?.(.5);
  _o.set(v.x-Math.sin(v.yaw)*1.0,v.y+2.7,v.z-Math.cos(v.yaw)*1.0);
  const d=backDirection(_o,{x:from.x,y:from.y+1.0,z:from.z},Math.random());
  _d.set(d.x,d.y,d.z);
  g.spells.cast(name,_o.clone(),_d.clone(),'right',v.id);g.sync?.spell?.(name,_o,_d,'right',v.id);
  if(name==='Inferno'&&v.element==='fire')this.startHang(v,_o,_d); // (the beam hangs in the air and goes on at the foe while he moves — the author 15.11)
  v.castT=.4;this.engaged(v);
 }
 /**
  * A water mage with no water about (he wandered off in the fight, or the stream is out of reach) goes BACK to the water he knows — he does not stand «gathering» for ever (the long fight
  * of 14.11: 188 s without one cast, mana full). No water known: he looks wider round him (every 3 s), else he hops about as a fighter does. → true while he is walking to it.
  */
 seekWater(v,foe,dt){
  const a=v.elemental,L=this.game.castleLife;
  if(a.source||a.humid||a.water>=6||a.capture||a.wave||a.guard>0){a.seeking=false;return false;}
  a.seekT=(a.seekT||0)-dt;
  if(!a.lastSource&&a.seekT<=0){a.seekT=3;const d=this.game.terrain?.data;const w=d?findWater((x,y,z)=>d.get(x,y,z),id=>id===BLOCK.WATER,v.x,v.y,v.z,d.landMade?(x,z)=>d.landMade(x,z):null,WIDE_WATER):null;if(w)a.lastSource=w;}
  if(!a.lastSource)return false;
  const w=a.lastSource,d=Math.hypot(w.x-v.x,w.z-v.z);
  if(d<=5){a.scan=0;return false;} // (near enough: the next scan finds it)
  a.seeking=true;L._steer(v,w.x,w.z,v.walk*1.3,dt,4);a.hopping=true;v.mode='waterGather';L._ground(v);return true;
 }
 /** Out of mana (or badly hurt): he RUNS from the foe to a safe distance, then stands and gathers himself — and comes back (the author 14.11). → true while running. */
 retreat(v,foe,dt){
  const a=v.elemental,L=this.game.castleLife,dx=v.x-foe.x,dz=v.z-foe.z,d=Math.hypot(dx,dz)||1;
  if(d>=24){this.reposition(v,foe,dt,24);return false;}
  const side=((v.entry.seed&1)?1:-1)*(.35+.25*Math.sin((a.t||0)*.7)),foeId=v.foe;
  L._steer(v,v.x+(dx/d-dz/d*side)*8,v.z+(dz/d+dx/d*side)*8,v.walk*1.5,dt,0);if(!v.foe&&foeId)v.foe=foeId;a.hopping=true;return true;
 }
 /** The gust: a flying charge or orb is turned aside by an angle that makes it miss (ElementalParry.BEND); the air is seen to bend where it was turned. */
 bendNow(v,S){
  const g=this.game,chest=_o.set(v.x,v.y+2.6,v.z);let at=null,ang=0;
  if(S.bolt){
   const b=S.bolt;if(!g.duel?.bolts?.has(b.id)||b.state!=='flying')return;
   const d=b.front.distanceTo(chest);if(d<BEND.MIN_DIST)return;
   ang=bendAngle(d,Math.random());const nb=g.duel.bendBolt(b,ang);if(!nb)return;at=b.front;
  }else{
   const t=S.task,o=t?.orb;if(!o||t.life<=0)return;
   const d=Math.hypot(o.p.x-chest.x,o.p.y-chest.y,o.p.z-chest.z);if(d<BEND.MIN_DIST)return;
   ang=bendAngle(d,Math.random());rotateYInPlace(o.v,ang);at=o.p;
  }
  this.airBendFx(v,at,ang);this.engaged(v);
 }
 /** The air bending: a ring of wisps round the turned thing, streaming off to the side it was turned. */
 airBendFx(v,at,ang){
  const g=this.game,glow=g.fx?.glow;if(!glow)return;
  const sx=-Math.sign(ang||1);
  for(let i=0;i<18;i++){const a=i/18*6.2832;glow.spawn(at.x+Math.cos(a)*.5,at.y+Math.sin(a)*.5,at.z,Math.cos(a)*3+sx*4,Math.sin(a)*3,(Math.random()-.5)*2,i%3?0xffffff:0xcfefff,.14+Math.random()*.16,.5,{shrink:1});}
  for(let i=0;i<10;i++)glow.spawn(at.x,at.y,at.z,sx*(3+Math.random()*4),(Math.random()-.5)*2,(Math.random()-.5)*2,0xeef6ff,.5+Math.random()*.5,.7,{shrink:.5});
  g.fx?.lightFlash?.(at,0xcfefff,1.2,.12,6);g.sound?.playWhoosh?.();
 }
 /** The water mage douses a thrown orb: a stream flies from his hands to it, it goes out in a cloud of steam. */
 douse(v,o,at){
  const g=this.game,glow=g.fx?.glow;
  if(glow){const sx=v.x-Math.sin(v.yaw)*.8,sy=v.y+2.7,sz=v.z-Math.cos(v.yaw)*.8;for(let i=0;i<28;i++){const u=Math.random();glow.spawn(sx+(at.x-sx)*u,sy+(at.y-sy)*u+Math.sin(u*Math.PI)*.5,sz+(at.z-sz)*u,(at.x-sx)*3,0,(at.z-sz)*3,[0x6ec6ff,0x9fdcff,0xd8f2ff][i%3],.2+Math.random()*.2,.3,{shrink:1.5});}
   for(let i=0;i<22;i++)glow.spawn(at.x,at.y,at.z,(Math.random()-.5)*5,Math.random()*3,(Math.random()-.5)*5,i%2?0xf2f6fa:0xc9d4de,.5+Math.random()*.6,.7,{shrink:.6});}
  g.fx?.lightFlash?.(at,0xcfe8ff,2.4,.2,12);g.sound?.playSplash?.();this.engaged(v);
 }
 /** The watchdog (a mage that makes no progress for a few seconds is set going again): the way, the stuck flags, the phase. */
 unstick(v,foe){
  const a=v.elemental,g=this.game;
  g.castleLife?.alog?.decision?.(v,'стихийный маг стоял без дела — сброшены путь и состояние');
  if(a.liftT>0)this.endLift(v);a.capture=null;a.wave=null;a.guard=0;v.fx=0;
  if(v.mana>=12)a.recover=false;
  v.hop=newHop();v.hop.side=-(a.moveSide||1);a.moveSide=v.hop.side;v.hop.wait=0;a.hopping=false;
  this.phase(v,'rest');a.swat=null;a.shard=null;v.castT=0;
 }
 /** A resident needs nearby real water; only a traveller has a finite portable reservoir. */
 waterSource(v,dt){
  const a=v.elemental,g=this.game;a.scan-=dt;
  if(a.scan<=0){
   a.scan=.75;a.source=false;a.sourcePoint=null;const data=g.terrain?.data;
   const w=data?findWater((x,y,z)=>data.get(x,y,z),id=>id===BLOCK.WATER,v.x,v.y,v.z,data.landMade?(x,z)=>data.landMade(x,z):null):null; // (the nearest real water: WaterMageSource.js — the picture uses the same)
   if(w){a.source=true;a.sourcePoint=w;a.lastSource=w;}
  }
  if(a.source&&v.entry.look?.tank)a.water=Math.min(36,a.water+dt*6);
  const desert=!!g.terrain?.data?.pyr?.sandy?.(Math.round(v.x),Math.round(v.z));
  const humid=!!v.gifts.hydro.h&&!airWet({offEarth:!!g.space?.offEarth,hell:!!g.hellGate?.inHell,desert});
  a.humid=humid;return a.source||humid||a.water>=6;
 }
 cast(v,name,foe,origin=null){
  const g=this.game;if(!g.spells?.cast)return false;
  if(origin)_o.copy(origin);
  else if(isImpulse(name))_o.set(v.x,v.y+1.5,v.z);
  else _o.set(v.x-Math.sin(v.yaw)*.9,v.y+2.7,v.z-Math.cos(v.yaw)*.9);
  _d.set(foe.x,foe.y,foe.z).sub(_o).normalize();
  if(!isImpulse(name)&&!g.collision.lineOfSight?.(_o.x,_o.y,_o.z,foe.x,foe.y,foe.z,.2)&&g.collision.lineOfSight)return false;
  if(!this.pay(v,(SPELL_COST[name]??10)*elementK(v.element,name)))return false; // (a mage's own element: half the price — the author 15.11)
  g.spells.cast(name,_o.clone(),_d.clone(),'right',v.id);g.sync?.spell?.(name,_o,_d,'right',v.id);g.sound?.spellCast?.(name,_o);
  v.aimPitch=Math.asin(_d.y);v.castT=.6;v.model.castNow=true;this.engaged(v);return true;
 }
 engaged(v){if(v.elemental)v.elemental.atkAt=performance.now();if(v.foe)(v.castAtPlayers||(v.castAtPlayers=new Set())).add(v.foe);}
 fireFoot(v,side){
  const foot=side?v.model.leftKnee:v.model.rightKnee;
  if(!foot)return null;
  // Like horse hit capsules, this descendant must be current before localToWorld.
  foot.updateWorldMatrix(true,false);return foot.localToWorld(new T.Vector3(0,-.95,0)).add(new T.Vector3(-Math.sin(v.yaw)*.35,0,-Math.cos(v.yaw)*.35));
 }
 /** The ice shards (IceShards.js): the water he has is wound round him, freezes into shards, and is hurled at the foe in a volley. */
 canShards(v,foe){
  const a=v.elemental,d=Math.hypot(foe.x-v.x,foe.z-v.z);
  return !!this.shards&&v.mana>=SHARDS.COST&&d>=SHARDS.MIN_DIST&&d<=SHARDS.MAX_DIST&&this.waterSource(v,0)&&this.game.castleLife._sees(v,foe);
 }
 startShards(v){
  const a=v.elemental;if(!this.pay(v,SHARDS.COST))return false;
  if(!a.source&&!a.humid)a.water=Math.max(0,a.water-8); // (a tank gives its water)
  a.shard={t:0,hurled:false};this.phase(v,'Shard');v.mode='waterFreeze';v.fx=FX.SHARDS;return true;
 }
 shardStep(v,foe,dt){
  const a=v.elemental,S=a.shard,g=this.game,L=g.castleLife;
  if(v.stunT>0||v.lev||v.vy||v.dead||v.carriedBy){a.shard=null;v.fx=0;return false;}
  S.t+=dt;v.speed=0;a.hopping=false;v.model.elementPoseT=S.t;
  v.fx=S.t<SHARDS.HURL_T&&!S.hurled?FX.SHARDS:0;
  v.mode=S.t<SHARDS.FREEZE_T?'waterFreeze':'waterHurl';
  if(!S.hurled&&S.t>=SHARDS.HURL_T){
   S.hurled=true;
   if(L._sees(v,foe)){
    const list=[];for(let i=0;i<SHARDS.N;i++){
     this.shards.orbitAt(v.id,i,v,_o);const to={x:foe.x,y:foe.y+.3,z:foe.z},dir=shardAim(_o,to,Math.random());
     list.push({p:[_o.x,_o.y,_o.z],v:[dir.x*SHARDS.SPEED,dir.y*SHARDS.SPEED,dir.z*SHARDS.SPEED],d:i*SHARDS.STAGGER});
    }
    this.shards.volley(v.id,list);g.sound?.spellCast?.('IceDuel',_o.set(v.x,v.y+2.4,v.z));this.engaged(v);
   }
  }
  if(S.t>=SHARDS.END_T){a.shard=null;v.fx=0;a.cycle++;this.phase(v,'Gather');}
  L._ground(v);return true;
 }
 waterAttack(v,foe){
  const g=this.game,a=v.elemental;
  if(a.cycle%4===1&&this.canShards(v,foe)&&this.startShards(v))return true; // (every fourth attack, when he has the water and the foe is in the range)
  if(a.cycle%3===0&&a.sourcePoint&&g.waves&&waveSource(g.world?.terrain?.data,a.sourcePoint)){
   const name=v.mana>60&&a.cycle%2===0?'WaveAttackMaxima':'WaveAttack';
   if(this.pay(v,SPELL_COST[name])){const wave=g.waves.npcRaise(v,name,a.sourcePoint,foe);if(wave){a.wave=wave;this.engaged(v);return true;}v.mana+=SPELL_COST[name];}
  }
  if(!this.waterSource(v,0)||!g.vortex||!this.pay(v,SPELL_COST.WaterVortex))return false;
  if(!a.source&&!a.humid)a.water=Math.max(0,a.water-6);
  _o.set(v.x,v.y+2.6,v.z);_d.set(foe.x,foe.y,foe.z).sub(_o).normalize();
  const m={by:v.id,ev:'launch',id:v.id+':water:'+(++this.seq),o:_o.toArray(),d:_d.toArray(),h:_o.clone().addScaledVector(_d,1.5).toArray(),v:6,a:0,pw:1,tk:'p',tid:v.foe,s:null,npcMode:['','freeze','throw','drown'][a.cycle%4]};
  if(m.npcMode)a.capture=m.id;g.vortex._addFlight(v.id,m);g.sync?.vortex?.(m);g.sound?.spellCast?.('WaterVortex',_o);this.engaged(v);return true;
 }
 airLift(v,foe){ // (14.11: always the great kind — only the dome of «Protection Maxima» keeps it off; then the throw: endLift(v, thr))
  const g=this.game,a=v.elemental;
  a.liftAck=false;a.liftHeld=false;
  if(g.levMax?.npcPlayer?.(v,v.foe)){a.liftT=AIR_THROW.HOLD;a.liftMax=true;v.mode='airLift';this.engaged(v);return true;}
  return false;
 }
 /** The velocity of the throw: away from the mage over the foe, aside by his die. */
 throwOf(v,foe){const t=throwVector(v.x,v.z,foe.x,foe.z,Math.random());return {x:t.x,y:t.y,z:t.z};}
 liftedBy(by,on){if(!this.game.authority)return;const v=this.game.castleLife?.byId?.get(by);if(v?.element==='air'&&v.elemental){v.elemental.liftAck=true;v.elemental.liftHeld=!!on;}}
 /** The lift ends: dropped, or (`thr`: a velocity) THROWN — the swing, the body flies; the net message carries the throw to a guest. */
 endLift(v,thr=null){const g=this.game,a=v.elemental;a.liftT=0;a.cycle++;if(a.carry){const cr=a.carry;a.carry=null;g.brawl?.throwCarried(v,cr,thr);} // (a creature held by the wind: thrown or dropped — Brawl)
  g.sync?.lev?.('p',v.foe,'right',0,false,false,v.id,thr);if(g.levitation?.lifted?.by===v.id){if(thr)g.levitation.throwMe(v.id,thr);else g.levitation.dropMe(false);}
  if(thr){this.phase(v,'Sweep');a.fired=true;a.t=.2;v.castT=.5;g.sound?.spellCast?.('WindImpulseMaxima',_o.set(v.x,v.y+2,v.z));}else this.phase(v,'Coil');}
 /**
  * The fire mage's HANGING beam (the author 15.11: «когда он пуляет свой луч, он может продолжать делать какие-то движения, но луч продолжается, будет висеть в воздухе и пуляться в игрока»):
  * the Inferno he casts is let go of his hand — it stays floating at his shoulder (a burning orb), follows him loosely, and turns on the foe at a limited rate, keeping on
  * (up to the stream's own life) while he strikes, hops, parries. Everyone draws the stream from the same hook (Game.handPose → `v.hangBeam`). Gone with him (dead / asleep) or the foe.
  */
 startHang(v,o,d){const a=v.elemental;a.hang={t:0,life:4.6,side:(v.entry?.seed&1)?1:-1,p:new T.Vector3(o.x,o.y,o.z),dir:new T.Vector3(d.x,d.y,d.z)};v.hangBeam={origin:a.hang.p,dir:a.hang.dir};}
 hangStep(v,dt){
  const a=v.elemental,h=a?.hang;if(!h)return;
  const g=this.game,L=g.castleLife,glow=g.fx?.glow;h.t+=dt;
  const foe=v.foe?L._playerPos(v.foe):null;
  if(v.dead||h.t>h.life||!foe){a.hang=null;v.hangBeam=null;return;}
  // the orb floats at his shoulder (right side of his body: cos/sin of his yaw), a little bobbing, following with a lag
  const sx=Math.cos(v.yaw)*1.35*h.side-Math.sin(v.yaw)*.3,sz=-Math.sin(v.yaw)*1.35*h.side-Math.cos(v.yaw)*.3,wy=v.y+3.5+Math.sin(h.t*3)*.15;
  h.p.x+=(v.x+sx-h.p.x)*Math.min(1,dt*6);h.p.y+=(wy-h.p.y)*Math.min(1,dt*6);h.p.z+=(v.z+sz-h.p.z)*Math.min(1,dt*6);
  // it turns on the foe at a limited rate (never a snap): the beam sweeps
  _d.set(foe.x-h.p.x,foe.y+1.4-h.p.y,foe.z-h.p.z).normalize();
  const ang=h.dir.angleTo(_d),step=Math.min(ang,1.7*dt);if(ang>1e-4)h.dir.lerp(_d,step/ang).normalize();
  // the hanging orb: a ball of fire with embers streaming from it
  if(glow){for(let i=0;i<4;i++){const q=Math.random()*6.2832;glow.spawn(h.p.x+Math.cos(q)*.25,h.p.y+(Math.random()-.5)*.4,h.p.z+Math.sin(q)*.25,Math.cos(q)*1.2,.6+Math.random()*1.4,Math.sin(q)*1.2,[0xff7a1a,0xffd27a,0xff3a00][i%3],.35+Math.random()*.35,.45,{shrink:1});}
   if(Math.random()<dt*14)glow.spawn(h.p.x,h.p.y,h.p.z,h.dir.x*8,h.dir.y*8,h.dir.z*8,0xffe9a0,.2,.4,{shrink:.8});}
 }
 /** A fan of `n` wind blades (duel charges) from the mage's hands at the foe (the author 15.11: the air mage had few moves): 6 mana (half for his element), a whoosh, a ring of leaves. */
 gustFan(v,foe,n){
  const g=this.game,L=g.castleLife,duel=g.duel;if(!duel?._addBolt||!L._isPlayer?.(v.foe))return false;
  const cost=6*elementK('air','Wind');if(v.mana<cost)return false;
  const o=new T.Vector3(v.x-Math.sin(v.yaw)*.9,v.y+2.3,v.z-Math.cos(v.yaw)*.9);
  const reach=duelRange(v.mana);if(reach<=0)return false;
  const base=new T.Vector3(foe.x-o.x,foe.y+1.4-o.y,foe.z-o.z).normalize();
  v.mana-=cost;
  for(let i=0;i<n;i++){
   const d=base.clone().applyAxisAngle(_up0,(i-(n-1)/2)*.2);
   const b=duel._addBolt({rng:emptyRange(reach,true),id:`${v.id}:gf${this._gfSeq=(this._gfSeq||0)+1}`,by:v.id,spell:'GustDuel',side:'right',tk:'p',tid:v.foe,ak:.55,o:o.clone(),d,npc:true});
   if(b)g.sync?.duelCast?.(b);
  }
  v.castT=.5;v.model.castNow=true;g.sound?.playWhoosh?.();
  const glow=g.fx?.glow;if(glow)for(let i=0;i<26;i++){const q=i/26*6.2832;glow.spawn(o.x+Math.cos(q)*.4,o.y+Math.sin(q)*.4,o.z,Math.cos(q)*3,Math.sin(q)*3,0,i%3?0xeaf6e0:0xb7d65c,.15+Math.random()*.15,.5,{shrink:1});}
  g.fx?.lightFlash?.(o,0xe0f5d0,1.4,.14,8);L._say?.(v,'Gust!',1.5);this.engaged(v);return true;
 }
 /** A streak of wind and leaves behind the dashing mage. */
 dashFx(v){const glow=this.game.fx?.glow;if(!glow)return;for(let i=0;i<5;i++)glow.spawn(v.x+(Math.random()-.5)*.8,v.y+.6+Math.random()*2.6,v.z+(Math.random()-.5)*.8,(Math.random()-.5)*2,.5,(Math.random()-.5)*2,i%2?0xeaf6e0:0xffffff,.3+Math.random()*.3,.45,{shrink:1});}
 /** The column of air he rises on: a ring of dust and leaves thrown out from the ground. */
 riseFx(v){const g=this.game,glow=g.fx?.glow;if(glow)for(let i=0;i<40;i++){const q=i/40*6.2832;glow.spawn(v.x+Math.cos(q)*.8,v.y+.3,v.z+Math.sin(q)*.8,Math.cos(q)*6,1+Math.random()*2,Math.sin(q)*6,i%3?0xcbbf9f:0xb7d65c,.3+Math.random()*.3,.8,{shrink:.7});}g.fx?.lightFlash?.(_o.set(v.x,v.y+1,v.z),0xe8f6ff,2.2,.3,16);g.sound?.playWhoosh?.();}
 /** The controller: `_think`, and the swirl bit on top — the mage winds his element round himself while he rests, coils, gathers or whirls (ElementalSwirl.js). */
 think(v,dt){
  if(v.elemental?.hang)this.hangStep(v,dt);
  const r=this._think(v,dt);
  if(r&&v.elemental&&!v.dead&&!(v.fx&(FX.DOME|FX.SHIELD))&&this.swirling(v))v.fx=(v.fx|0)|FX.SWIRL;
  return r;
 }
  swirling(v){const a=v.elemental,p=a.phase;if(v.element==='air'&&!v.fly)return false; // (the author 17.11: the air round an air mage only when he has taken off)
  return !!(v.element==='air'&&!a.liftT||a.recover||p==='Coil'||p==='Chamber'||p==='Gather'||p==='rest'||p==='Spin');}
 _think(v,dt){
  const g=this.game,L=g.castleLife,a=v.elemental;if(!a)return false;
  if(!v.foe&&v.cs?.def&&v.cs.def.kind!=='elemental'){
   v.mana=Math.min(v.maxMana,v.mana+dt);a.phase='rest';if(v.fly){this.land(v,dt);return true;}return false;
  }
  a.t+=dt;v.model.elementPoseT=a.t;a.flightCd=Math.max(0,a.flightCd-dt);v.prep=null;v.cardilon=null;v.practice=null;v.fleeT=0;v.path=null;v.seated=false;v.speed=0;
  const foe=v.foe?L._playerPos(v.foe):null;
  if(v.element==='water')this.waterSource(v,dt);
  if(!foe||Math.hypot(foe.x-v.x,foe.z-v.z)>75){if(a.liftT>0)this.endLift(v);v.foe=null;v.fx=0;v.mana=Math.min(v.maxMana,v.mana+dt);if(v.fly)this.land(v,dt);else L._ground(v);v.mode='idle';a.phase='rest';return true;}
  const dx=foe.x-v.x,dz=foe.z-v.z,dist=Math.hypot(dx,dz)||1,want=Math.atan2(-dx,-dz);
  if(!a.hopping)v.yaw+=Math.atan2(Math.sin(want-v.yaw),Math.cos(want-v.yaw))*Math.min(1,dt*5);
  a.hopping=false;
  a.blindT=L._sees(v,foe)?0:(a.blindT||0)+dt;
  if(a.blindT>12){a.blindT=0;if(a.liftT>0)this.endLift(v);v.foe=null;v.fx=0;v.mode='idle';a.phase='rest';L._ground(v);return true;} // (the foe has been out of sight for twelve seconds: he gives up the chase — he does not hop round a hill for ever; the ordinary aggro finds the player again)
  if(stuckStep(a.watch||(a.watch=newWatch()),v,true,a.phase+':'+a.cycle,dt,!!(v.vy||v.stunT>0||v.lev||v.carriedBy||v.fly||a.liftT>0||a.capture||a.wave||a.guard>0||g.hellfire?.npcs?.has(v.id)))){this.unstick(v,foe);return true;}
  const threat=g.earthMages?._threat(v);
  v.mana=Math.min(v.maxMana,v.mana+(a.recover?REGEN.REST:REGEN.FIGHT)*dt); // (mana comes back all the time — a mage at 12 mana must not wait for ever)
  if(v.mana<=lowMana(v.element,v.maxMana))a.recover=true;else if(a.recover&&v.mana>=readyMana(v.element,v.maxMana))a.recover=false;
  if(a.recover){if(a.liftT>0)this.endLift(v);v.fx=0;if(v.fly)this.land(v,dt);v.mana=Math.min(v.maxMana,v.mana+dt);const ran=!v.fly&&this.retreat(v,foe,dt);v.mode=v.fly?'airFlight':ran?'run':v.element+'Rest';if(!v.fly&&!v.vy)L._ground(v);return true;}
  if(v.element==='water'){
   if(this.parry(v,foe,dt))return true; // (puts out a thrown fireball / bombardo with a jet of water before it arrives)
   if(this.seekWater(v,foe,dt))return true;
   if(a.shard)return this.shardStep(v,foe,dt);
   if(a.capture){const b=g.vortex?.bubbles?.get(a.capture),f=g.vortex?.flights?.get(a.capture);if(b||f){v.mode=b?.phase==='ice'?'waterPush':'waterGather';if(f&&!b&&!this.pay(v,dt)){g.vortex._endFlight(f,'mana',true);}L._ground(v);return true;}a.capture=null;}
   if(a.guard>0){a.guard-=dt;if(!this.pay(v,(v.fx&FX.DOME?1:.5)*dt)){a.guard=0;v.fx=0;a.recover=true;}v.mode='waterGuard';}
   else{v.fx=0;if(threat&&this.waterSource(v,0)&&this.pay(v,threat.bomb?20:5)){a.guard=threat.bomb?4:1.8;v.fx=threat.bomb?FX.DOME:FX.SHIELD;this.phase(v,'Guard');}}
   if(!a.guard){
    if(a.wave&&(a.wave.phase==='rise'||a.wave.phase==='aim')){v.mode='waterGather';L._ground(v);return true;}a.wave=null;
    if(a.phase==='rest'||a.phase==='Guard')this.phase(v,'Gather');
    if(a.phase==='Gather'&&a.t>.75)this.phase(v,'Push');
    if(a.phase==='Push'&&a.t>.45&&!a.fired){a.fired=true;if(L._sees(v,foe))this.waterAttack(v,foe);}
    if(a.phase==='Push'&&a.t>1.3){a.fired=false;a.cycle++;this.phase(v,'Gather');}
    v.mode='water'+a.phase;
   }
   if(dist>26){L._steer(v,foe.x,foe.z,v.walk,dt,22);a.hopping=true;}else if(dist<9){L._steer(v,v.x-dx/dist*6,v.z-dz/dist*6,v.walk,dt,0);a.hopping=true;}else if(a.phase==='Gather'&&!a.capture&&!a.wave&&!a.guard)this.reposition(v,foe,dt,18);
   L._ground(v);
  }else if(v.element==='air'){
   v.fx=0;
   if(this.parry(v,foe,dt))return true;
   if(a.winged)stepAirMageWings(g,v,foe,dt);
   if(a.liftT>0){a.liftT-=dt;const cost=(a.liftMax?LEV_MAX.DRAIN:HOLD_FATIGUE.wizard)+(v.fly&&!a.winged?FLIGHT.HOVER_COST:0);if(a.liftT<=0||(a.liftAck&&!a.liftHeld)||!this.pay(v,cost*dt)){this.endLift(v,a.liftT<=0&&a.liftMax&&a.liftHeld?this.throwOf(v,foe):null);}else{v.mode='airLift';if(!v.fly&&!v.vy)L._ground(v);return true;}}
   if(!a.winged&&!v.fly&&a.flightCd<=0&&(dist<14||threat)&&this.pay(v,SPELL_COST.Flight)){v.fly=true;a.flight=7;a.flightCd=15;}
   if(v.fly&&!a.winged){
    if(!this.pay(v,dt*FLIGHT.COST)||a.flight<=0)this.land(v,dt);
    else{a.flight-=dt;const gy=g.collision.groundAt(v.x,v.z,v.y+1);const ny=v.y+(gy+5-v.y)*Math.min(1,dt*1.5);if(!L._airFree||L._airFree(v.x,v.z,ny))v.y=ny;else a.flight=0;v.mode='airFlight';}
   }
   if((dist<17||threat)&&!(a.winged&&(v.fly||a.wings?.launch))&&a.phase!=='Spin'&&a.phase!=='Lash'&&a.phase!=='Dash'&&a.phase!=='Slash'&&a.phase!=='Rise'){
    const hop=this.reposition(v,foe,dt,17);
    if(hop==='stuck'&&a.phase==='Coil'&&a.t>.3)this.phase(v,'Slash'); // (nowhere to go back to — he fights: the author 17.11 «если им некуда идти — будут атаковать»)
   }
   a.atkAt??=performance.now();const idle=(performance.now()-a.atkAt)/1000; // (s since his last attack: an air mage mostly keeps away, but never forgets to strike — the author 17.11: «чтобы не завис и не проиграл в воздухе, не решившись напасть»)
   if(v.fly&&!a.winged&&idle>2.5&&dist<26&&a.phase!=='Spin'&&L._sees(v,foe)){this.gustFan(v,foe,3);a.atkAt=performance.now();} // (in the air too: a fan of blades from above whenever he has been quiet too long) // (not while he whirls or lashes: those are on the spot) // (hops back and aside — never chase an opponent who is leaving)
   if(a.phase==='rest')this.phase(v,'Coil');
   a.objectsCd=Math.max(0,(a.objectsCd||0)-dt);
   if(!a.liftT&&a.objectsCd<=0){a.objectsCd=12;if(this.objects.start(v)){a.cycle++;this.phase(v,'Coil');}}
   if(a.phase==='Coil'&&a.t>.7){const mv=idle>3.5?['Slash','Lash','Sweep'][(Math.random()*3)|0]:a.lastMove!=='Drift'&&Math.random()<.22?'Drift':nextAirMove(a.lastMove==='Drift'?null:a.lastMove,Math.random());a.lastMove=mv;this.phase(v,mv);}
   if(a.phase==='Spin'){
    if(a.t<AIR_SPIN.SPIN_T)v.yaw+=AIR_SPIN.RATE*dt;a.hopping=a.t<AIR_SPIN.SPIN_T; // (two turns on the spot: the body is his own to turn while he whirls)
    if(a.t>AIR_SPIN.FIRE_T&&!a.fired){a.fired=true;if(dist<23&&L._sees(v,foe)){if(dist<11&&Math.abs(foe.y-v.y-1.5)<=11&&v.mana>=SPELL_COST.WindImpulseMaxima)this.cast(v,'WindImpulseMaxima',foe);else this.cast(v,'WindMaxima',foe);}}
    if(a.t>AIR_SPIN.END_T){a.fired=false;a.cycle++;this.phase(v,'Coil');}
   }
   if(a.phase==='Slash'){ // the arms cross and fling out: a fan of three wind blades (duel charges), a whoosh and a ring of leaves
    if(a.t>.42&&!a.fired){a.fired=true;if(dist<26&&L._sees(v,foe))this.gustFan(v,foe,3);}
    if(a.t>1.15){a.fired=false;a.cycle++;this.phase(v,'Coil');}
   }
   if(a.phase==='Dash'){ // a lunge sideways along the wind (a streak of air behind him), then a gust at the foe from the new place
    if(!a.dashTo){const sg=Math.random()<.5?-1:1,px=-dz/dist*sg,pz=dx/dist*sg,len=7+Math.random()*3;a.dashTo={x:v.x+px*len,z:v.z+pz*len};}
    if(a.t<.38){a.hopping=true;L._steer(v,a.dashTo.x,a.dashTo.z,20,dt,0);this.dashFx(v);}
    else if(a.t>.42&&!a.fired){a.fired=true;if(dist<23&&L._sees(v,foe)&&this.pay(v,SPELL_COST.Wind*elementK('air','Wind')))this.cast(v,dist<12?'Wind':'WindMaxima',foe);} // (an ordinary gust reaches 14 m only)
    if(a.t>.8){a.dashTo=null;a.fired=false;a.cycle++;this.phase(v,'Coil');}
   }
   if(a.phase==='Rise'){ // the arms draw the air up out of the ground: he rises on a column and rains blades from above (his flight, with the fan)
    if(a.t>.85&&!a.fired){a.fired=true;if(!v.fly&&!a.winged&&a.flightCd<=0&&this.pay(v,SPELL_COST.Flight*elementK('air','Flight'))){v.fly=true;a.flight=6;a.flightCd=14;a.skyfall=true;a.sfT=.3;this.riseFx(v);}}
    if(a.t>1.05){a.fired=false;a.cycle++;this.phase(v,'Coil');}
   }
   if(a.phase==='Drift'&&a.t>1.6){a.cycle++;this.phase(v,'Coil');}
   if(a.skyfall){a.sfT-=dt;if(!v.fly){a.skyfall=false;}else if(a.sfT<=0&&dist<26&&L._sees(v,foe)){a.sfT=.9;this.gustFan(v,foe,2);}}
   if(a.phase==='Lash'){
    if(a.t>.38&&!a.fired){a.fired=true;if(dist<23&&L._sees(v,foe)){_o.set(v.x-Math.sin(v.yaw)*.9,v.y+1.1,v.z-Math.cos(v.yaw)*.9);this.cast(v,dist<12?'Wind':'WindMaxima',foe,_o.clone());}} // (an ordinary gust reaches 14 m only: a far foe gets the heavy one)
    if(a.t>1.0){a.fired=false;a.cycle++;this.phase(v,'Coil');}
   }
   if(a.phase==='Sweep'&&a.t>.45&&!a.fired){a.fired=true;if(dist<23&&L._sees(v,foe)){
    if(dist<3&&Math.abs(foe.y-v.y-1.5)<=5)this.cast(v,'WindImpulse',foe);
    else if(dist<9&&Math.abs(foe.y-v.y-1.5)<=11&&a.cycle%2===0&&v.mana>=SPELL_COST.WindImpulseMaxima)this.cast(v,'WindImpulseMaxima',foe);
    else if(!this.objects.active.has(v.id)&&a.cycle%4===3&&dist<17&&this.airLift(v,foe))return true;
    else this.cast(v,dist<9||Math.hypot(dist,foe.y-(v.y+2.7))>12?'WindMaxima':'Wind',foe);
   }}
   if(a.phase==='Sweep'&&a.t>1.35){a.fired=false;a.cycle++;this.phase(v,'Coil');}
   if(!v.fly){v.mode=a.wings?.launch?'airRun':'air'+a.phase;if(!v.vy)L._ground(v);}
  }else{
   v.fx=0; // Fire has no shield/dome and never delegates to the ordinary wizard's defence.
   if(this.parry(v,foe,dt))return true;
   const visible=L._sees(v,foe);
   if(g.hellfire?.npcs?.has(v.id)){v.mode='firePunch';L._ground(v);return true;}
   if(a.phase==='Chamber'&&a.t>.8&&a.cycle%6===4&&visible&&dist<22&&g.hellfire?.npcStart?.(v)){a.cycle++;this.engaged(v);v.mode='firePunch';L._ground(v);return true;}
   if(a.phase==='rest')this.phase(v,'Chamber');
   if(a.phase==='Chamber'&&a.t>.45&&visible&&!(a.cycle%6===4&&g.hellfire?.npcStart&&v.mana>=260&&a.t<=.8))this.phase(v,a.cycle%4===3&&v.mana>=2*SPELL_COST.Fireball?'Vault':a.cycle%3===2?'Kick':'Punch');
   if(a.phase==='Vault'){
    while((a.shots||0)<2&&a.t>=.64+(a.shots||0)*.24){const side=a.shots||0;a.shots=side+1;if(L._sees(v,foe))this.cast(v,'Fireball',foe,this.fireFoot(v,side));}
    if(a.t>1.6){a.cycle++;this.phase(v,'Chamber');}
   }
   if((a.phase==='Punch'||a.phase==='Kick')&&a.t>.43&&!a.fired){a.fired=true;if(L._sees(v,foe))this.cast(v,a.cycle%3===1?'Fireball':dist<11?'Inferno':a.cycle%4===3&&v.mana>=SPELL_COST.BombardoMaxima?'BombardoMaxima':'Bombardo',foe);}
   if((a.phase==='Punch'||a.phase==='Kick')&&a.t>1.1){a.fired=false;a.cycle++;this.phase(v,'Chamber');}
   if(a.phase==='Chamber'||a.phase!=='Vault'&&a.t>.85){
    a.blindT=visible?0:(a.blindT||0)+dt;
    // (no line of sight for a while — the foe behind a hill or a wall: straight at it only pushed him into the rock (the long fight of 14.11: 184 s without a cast); now he hops about it: aside, back, round)
    if(!visible&&a.blindT>1.2)this.reposition(v,foe,dt,12);
    else if(dist>20||!visible){const foeId=v.foe;L._steer(v,foe.x,foe.z,v.walk*1.6,dt,visible?16:0);if(!v.foe)v.foe=foeId;a.hopping=true;}else this.reposition(v,foe,dt,12);
   }
   v.mode='fire'+a.phase;L._ground(v);
  }
  return true;
 }
 brake(v,dt){
  if(v.element!=='air')return;
  v.fly=false;
  if(v.elemental?.wings){v.elemental.wings.air=false;v.elemental.wings.launch=false;}
  if(v.dead||v.stunT>0){v.featherFall=false;return;}
  if(!v.featherFall&&v.vy< -5&&this.pay(v,FEATHER.COST)){v.featherFall=true;this.game.sound?.spellCast?.('Featherfall',_o.set(v.x,v.y+2,v.z));}
  if(v.featherFall&&!this.pay(v,FEATHER.DRAIN*dt))v.featherFall=false;
 }
 update(dt){this.guard?.update(dt);this.swirl?.update(dt);this.shards?.update(dt);this.objects.update(dt);}
 dispose(){this.objects.dispose();this.guard?.dispose();this.shards?.dispose();}
 land(v,dt){if(v.elemental?.winged){stepAirMageWings(this.game,v,null,dt,true);return;}if(!this.pay(v,FLIGHT.HOVER_COST*dt)){v.fly=false;v.vy=Math.min(v.vy||0,-.5);return;}const gy=this.game.collision.groundAt(v.x,v.z,v.y+1);v.y=Math.max(gy,v.y-dt*2);if(v.y<=gy+.05){v.fly=false;v.vy=0;v.y=gy;}}
}
