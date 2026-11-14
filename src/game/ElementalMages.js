import {LEV_MAX} from './LevitationMaxima.js';
import {HOLD_FATIGUE} from './Levitation.js';
import {duelRange} from './DuelRange.js';
import {waveSource} from './WaveSource.js';
/** Host-owned elemental combat on ordinary CastleLife bodies: shared spell collisions, armour and death. */
import * as T from 'three';
import { SWAT, SWAT_MODES, swatSpell, pickOrb, backDirection, canSwat } from './ElementalParry.js';
import { newHop, stepHop, newWatch, stuckStep } from './ElementalMove.js';
import {WaterMageGuard} from '../fx/WaterMageGuard.js';
import { elementalEndurance } from './ElementalRules.js';
import { SPELL_COST } from './SpellCosts.js';
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
const _o=new T.Vector3(),_d=new T.Vector3();
export function elementalGifts(entry){const r=createRng((entry.seed??1)^0x43b2ca19);return {hydro:{h:entry.element==='water'&&r()<.25?1:0},resist:{f:entry.element==='water'&&r()<.1?1:0}};}
export class ElementalMages {
 constructor(game){this.game=game;this.seq=0;this.objects=new AirMageObjects(game);this.guard=game.scene?new WaterMageGuard(game):null;}
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
 interrupt(v){if(v.element==='fire'&&v.elemental?.phase==='Vault'){this.phase(v,'Chamber');v.castT=0;}}
 /** Hops (ElementalMove.js): a few steps to a free place, a pause, the body turned the way he goes — never a slide round the foe. → 'hop' | 'wait' | 'stuck' */
 reposition(v,foe,dt,radius=14){
  const L=this.game.castleLife,a=v.elemental,foeId=v.foe,h=v.hop||(v.hop=newHop());
  const r=stepHop(h,foe,radius,v.walk*1.1,dt,{pos:v,steer:(tx,tz,sp,d)=>L._steer(v,tx,tz,sp,d,0),free:(x,z)=>L._walkable?L._walkable(x,z,v.y):true,rng:Math.random});
  if(!v.foe&&foeId)v.foe=foeId; // (a blocked step must not make the pilot forget a live foe)
  a.hopping=r==='hop';return r;
 }
 /** Beating a thrown orb back (ElementalParry.js): see it, swing, take it out of the flight, throw it back at the thrower. → true while the swing goes on. */
 parry(v,foe,dt){
  const a=v.elemental,g=this.game,L=g.castleLife;a.parryCd=Math.max(0,(a.parryCd||0)-dt);
  if(a.swat){
   const S=a.swat;S.t+=dt;v.mode=SWAT_MODES[v.element];v.model.elementPoseT=S.t;a.hopping=false;v.speed=0;
   if(!S.done&&S.t>=SWAT.HIT){
    const t=S.task,o=t.orb;
    if(t.life>0&&Math.hypot(o.p.x-v.x,o.p.y-(v.y+2.6),o.p.z-v.z)<=SWAT.TAKE_R){S.done=true;this.swatHit(v,t,foe);}
    else if(S.t>=SWAT.HIT_MAX)S.done=true; // (it burst or flew wide: the swing found nothing)
   }
   if(S.t>=SWAT.T){a.swat=null;a.parryCd=SWAT.CD;this.phase(v,v.element==='fire'?'Chamber':'Coil');}
   L._ground(v);return true;
  }
  if(!g.spells?.spells||!canSwat(v,a,v.mana)||!L._sees(v,foe))return false;
  const chest={x:v.x,y:v.y+2.6,z:v.z},orbs=this._orbs||(this._orbs=[]);orbs.length=0;
  for(const t of g.spells.spells)if(t.orb&&t.life>0&&t.parry)orbs.push(t.orb);
  const pick=pickOrb(orbs,chest,v.id);if(!pick)return false;
  a.parryCd=SWAT.CD*.5;if(Math.random()>=SWAT.CHANCE[v.element])return false; // (his die: he did not see it in time)
  if(!this.pay(v,SWAT.COST[v.element]))return false;
  a.swat={t:0,task:pick.o.task,done:false,variant:Math.random()<.5?0:1};v.model.elementVariant=a.swat.variant;this.phase(v,'Swat');v.mode=SWAT_MODES[v.element];return true;
 }
 /** The blow lands: the orb is taken out of its flight (no blast at the mage) and a new one of the same spell goes back from his hand at whoever threw it. */
 swatHit(v,task,foe){
  const g=this.game,L=g.castleLife,o=task.orb,at=o.p,name=swatSpell(o);
  if(!task.parry?.())return;
  const from=L._playerPos?.(o.by)||foe;
  g.fx?.lightFlash?.(at,v.element==='fire'?0xff8a26:0xcfefff,2.2,.18,10);
  for(let i=0;i<10;i++)g.fx?.spark?.(at,v.element==='fire'?0xffa040:0xe6f6ff,.1,_d.set((Math.random()-.5)*5,Math.random()*3,(Math.random()-.5)*5),.45);
  g.sound?.playClang?.(.5);
  _o.set(v.x-Math.sin(v.yaw)*1.0,v.y+2.7,v.z-Math.cos(v.yaw)*1.0);
  const d=backDirection(_o,{x:from.x,y:from.y+1.0,z:from.z},Math.random());
  _d.set(d.x,d.y,d.z);
  g.spells.cast(name,_o.clone(),_d.clone(),'right',v.id);g.sync?.spell?.(name,_o,_d,'right',v.id);
  v.castT=.4;this.engaged(v);
 }
 /** The watchdog (a mage that makes no progress for a few seconds is set going again): the way, the stuck flags, the phase. */
 unstick(v,foe){
  const a=v.elemental,g=this.game;
  g.castleLife?.alog?.decision?.(v,'стихийный маг стоял без дела — сброшены путь и состояние');
  if(a.liftT>0)this.endLift(v);a.capture=null;a.wave=null;a.guard=0;v.fx=0;
  if(v.mana>=12)a.recover=false;
  v.hop=newHop();v.hop.side=-(a.moveSide||1);a.moveSide=v.hop.side;v.hop.wait=0;a.hopping=false;
  this.phase(v,'rest');a.swat=null;v.castT=0;
 }
 /** A resident needs nearby real water; only a traveller has a finite portable reservoir. */
 waterSource(v,dt){
  const a=v.elemental,g=this.game;a.scan-=dt;
  if(a.scan<=0){
   a.scan=.75;a.source=false;a.sourcePoint=null;const data=g.terrain?.data;
   if(data)for(let x=-10;x<=10&&!a.source;x+=2)for(let z=-10;z<=10&&!a.source;z+=2){
    const X=Math.round(v.x+x),Z=Math.round(v.z+z);if(data.landMade&&!data.landMade(X,Z))continue;
    for(let y=-5;y<=3;y++)if(data.get(X,Math.round(v.y)+y+1,Z)===BLOCK.WATER){a.source=true;a.sourcePoint={x:X,y:Math.round(v.y)+y,z:Z};break;}
   }
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
  if(!this.pay(v,SPELL_COST[name]??10))return false;
  g.spells.cast(name,_o.clone(),_d.clone(),'right',v.id);g.sync?.spell?.(name,_o,_d,'right',v.id);g.sound?.spellCast?.(name,_o);
  v.aimPitch=Math.asin(_d.y);v.castT=.6;v.model.castNow=true;this.engaged(v);return true;
 }
 engaged(v){if(v.foe)(v.castAtPlayers||(v.castAtPlayers=new Set())).add(v.foe);}
 fireFoot(v,side){
  const foot=side?v.model.leftKnee:v.model.rightKnee;
  if(!foot)return null;
  // Like horse hit capsules, this descendant must be current before localToWorld.
  foot.updateWorldMatrix(true,false);return foot.localToWorld(new T.Vector3(0,-.95,0)).add(new T.Vector3(-Math.sin(v.yaw)*.35,0,-Math.cos(v.yaw)*.35));
 }
 waterAttack(v,foe){
  const g=this.game,a=v.elemental;
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
 airLift(v,foe){
  const g=this.game,a=v.elemental;
  a.liftAck=false;a.liftHeld=false;
  if(g.levMax?.npcPlayer?.(v,v.foe)){a.liftT=6;a.liftMax=true;v.mode='airLift';this.engaged(v);return true;}
  a.liftMax=false;if(!g.duel?._addBolt||!this.pay(v,SPELL_COST.Levitation))return false;
  _o.set(v.x,v.y+2.7,v.z);_d.set(foe.x,foe.y,foe.z).sub(_o).normalize();
  const b=g.duel._addBolt({id:v.id+':air:'+(++this.seq),by:v.id,spell:'LevitateDuel',side:'right',tk:'p',tid:v.foe,ak:.55,o:_o.clone(),d:_d.clone(),npc:true,rng:duelRange(v.mana+SPELL_COST.Levitation)});
  g.sync?.duelCast?.(b);g.sound?.spellCast?.('Levitation',_o);v.elemental.liftT=6;v.elemental.liftAck=false;v.elemental.liftHeld=false;v.mode='airLift';this.engaged(v);return true;
 }
 liftedBy(by,on){if(!this.game.authority)return;const v=this.game.castleLife?.byId?.get(by);if(v?.element==='air'&&v.elemental){v.elemental.liftAck=true;v.elemental.liftHeld=!!on;}}
 endLift(v){const g=this.game,a=v.elemental;a.liftT=0;a.cycle++;g.sync?.lev?.('p',v.foe,'right',0,false,false,v.id);if(g.levitation?.lifted?.by===v.id)g.levitation.dropMe(false);this.phase(v,'Coil');}
 think(v,dt){
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
  if(stuckStep(a.watch||(a.watch=newWatch()),v,true,a.phase+':'+a.cycle,dt,!!(v.vy||v.stunT>0||v.lev||v.carriedBy||v.fly||a.liftT>0||a.capture||a.wave||a.guard>0||g.hellfire?.npcs?.has(v.id)))){this.unstick(v,foe);return true;}
  const threat=g.earthMages?._threat(v);
  if(v.mana<10)a.recover=true;if(a.recover&&v.mana>=Math.max(v.element==='air'?SPELL_COST.Wind:v.element==='water'?SPELL_COST.WaterVortex:SPELL_COST.Inferno,Math.min(v.maxMana,45)))a.recover=false;
  if(a.recover){if(a.liftT>0)this.endLift(v);v.fx=0;if(v.fly)this.land(v,dt);v.mana=Math.min(v.maxMana,v.mana+dt);if(!v.fly)this.reposition(v,foe,dt,24);v.mode=v.fly?'airFlight':v.element+'Rest';if(!v.fly&&!v.vy)L._ground(v);return true;}
  if(v.element==='water'){
   if(a.capture){const b=g.vortex?.bubbles?.get(a.capture),f=g.vortex?.flights?.get(a.capture);if(b||f){v.mode=b?.phase==='ice'?'waterPush':'waterGather';if(f&&!b&&!this.pay(v,dt)){g.vortex._endFlight(f,'mana',true);}L._ground(v);return true;}a.capture=null;}
   if(a.guard>0){a.guard-=dt;if(!this.pay(v,(v.fx&FX.DOME?1:.5)*dt)){a.guard=0;v.fx=0;a.recover=true;}v.mode='waterGuard';}
   else{v.fx=0;if(threat&&this.waterSource(v,0)&&this.pay(v,threat.bomb?20:5)){a.guard=threat.bomb?3:1.8;v.fx=threat.bomb?FX.DOME:FX.SHIELD;this.phase(v,'Guard');}}
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
   if(a.liftT>0){a.liftT-=dt;const cost=(a.liftMax?LEV_MAX.DRAIN:HOLD_FATIGUE.wizard)+(v.fly&&!a.winged?FLIGHT.HOVER_COST:0);if(a.liftT<=0||(a.liftAck&&!a.liftHeld)||!this.pay(v,cost*dt)){this.endLift(v);}else{v.mode='airLift';if(!v.fly&&!v.vy)L._ground(v);return true;}}
   if(!a.winged&&!v.fly&&a.flightCd<=0&&(dist<14||threat)&&this.pay(v,SPELL_COST.Flight)){v.fly=true;a.flight=7;a.flightCd=15;}
   if(v.fly&&!a.winged){
    if(!this.pay(v,dt*FLIGHT.COST)||a.flight<=0)this.land(v,dt);
    else{a.flight-=dt;const gy=g.collision.groundAt(v.x,v.z,v.y+1);const ny=v.y+(gy+5-v.y)*Math.min(1,dt*1.5);if(!L._airFree||L._airFree(v.x,v.z,ny))v.y=ny;else a.flight=0;v.mode='airFlight';}
   }
   if((dist<17||threat)&&!(a.winged&&(v.fly||a.wings?.launch)))this.reposition(v,foe,dt,17); // (hops back and aside — never chase an opponent who is leaving)
   if(a.phase==='rest')this.phase(v,'Coil');
   a.objectsCd=Math.max(0,(a.objectsCd||0)-dt);
   if(!a.liftT&&a.objectsCd<=0){a.objectsCd=12;if(this.objects.start(v)){a.cycle++;this.phase(v,'Coil');}}
   if(a.phase==='Coil'&&a.t>.7)this.phase(v,'Sweep');
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
    if(dist>20||!visible){const foeId=v.foe;L._steer(v,foe.x,foe.z,v.walk*1.6,dt,visible?16:0);if(!v.foe)v.foe=foeId;a.hopping=true;}else this.reposition(v,foe,dt,12);
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
 update(dt){this.guard?.update(dt);this.objects.update(dt);}
 dispose(){this.objects.dispose();this.guard?.dispose();}
 land(v,dt){if(v.elemental?.winged){stepAirMageWings(this.game,v,null,dt,true);return;}if(!this.pay(v,FLIGHT.HOVER_COST*dt)){v.fly=false;v.vy=Math.min(v.vy||0,-.5);return;}const gy=this.game.collision.groundAt(v.x,v.z,v.y+1);v.y=Math.max(gy,v.y-dt*2);if(v.y<=gy+.05){v.fly=false;v.vy=0;v.y=gy;}}
}
