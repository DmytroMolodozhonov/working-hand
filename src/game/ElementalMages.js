import {waveSource} from './WaveSource.js';
/** Host-owned elemental combat on ordinary CastleLife bodies: shared spell collisions, armour and death. */
import * as T from 'three';
import {WaterMageGuard} from '../fx/WaterMageGuard.js';
import { elementalEndurance } from './ElementalRules.js';
import { SPELL_COST } from './SpellCosts.js';
import {FLIGHT} from './Flight.js';
import { FEATHER } from './Featherfall.js';
import { FX } from '../fx/WizardFx.js';
import { BLOCK } from '../world/Terrain.js';
import { createRng } from '../core/math.js';
import { airWet } from './HydroRules.js';
const TITLES={water:'Маг воды',air:'Маг воздуха',fire:'Маг огня'};
const _o=new T.Vector3(),_d=new T.Vector3();
export function elementalGifts(entry){const r=createRng((entry.seed??1)^0x43b2ca19);return {hydro:{h:entry.element==='water'&&r()<.25?1:0},resist:{f:entry.element==='water'&&r()<.1?1:0}};}
export class ElementalMages {
 constructor(game){this.game=game;this.seq=0;this.guard=game.scene?new WaterMageGuard(game):null;}
 init(v){
  const element=v.entry?.element;if(!TITLES[element])return;
  v.element=element;v.title=TITLES[element];v.bareHand='advanced';v.bareMaster=true;v.noWand=true;v.rank='elemental';v.skillRole='mage';
  const endurance=elementalEndurance(v.entry);v.elementalTier=endurance.tier;v.mana=v.maxMana=endurance.mana;v.hp=v.maxHp=32;v.armor=v.maxArmor=0;
  v.W={...v.W,regen:1,dome:null};v.knowsFlight=element==='air';v.gifts=elementalGifts(v.entry);
  v.job='elemental';v.elemental={t:0,phase:'rest',cycle:0,recover:false,scan:0,source:false,water:v.entry.look?.tank?36:0,guard:0,flight:0,flightCd:0};
  v.model.setHeldTool('none');
 }
 pay(v,cost){if(v.mana<cost)return false;v.mana-=cost;return true;}
 phase(v,p){v.elemental.phase=p;v.elemental.t=0;v.mode=v.element+p;}
 /** A resident needs nearby real water; only a traveller has a finite portable reservoir. */
 waterSource(v,dt){
  const a=v.elemental,g=this.game;a.scan-=dt;
  if(a.scan<=0){
   a.scan=.75;a.source=false;a.sourcePoint=null;const data=g.terrain?.data;
   if(data)for(let x=-6;x<=6&&!a.source;x+=2)for(let z=-6;z<=6&&!a.source;z+=2){
    const X=Math.round(v.x+x),Z=Math.round(v.z+z);if(data.landMade&&!data.landMade(X,Z))continue;
    for(let y=-3;y<=3;y++)if(data.get(X,Math.round(v.y)+y+1,Z)===BLOCK.WATER){a.source=true;a.sourcePoint={x:X,y:Math.round(v.y)+y,z:Z};break;}
   }
  }
  if(a.source&&v.entry.look?.tank)a.water=Math.min(36,a.water+dt*6);
  const desert=!!g.terrain?.data?.pyr?.sandy?.(Math.round(v.x),Math.round(v.z));
  const humid=!!v.gifts.hydro.h&&!airWet({offEarth:!!g.space?.offEarth,hell:!!g.hellGate?.inHell,desert});
  a.humid=humid;return a.source||humid||a.water>=6;
 }
 cast(v,name,foe){
  const g=this.game;if(!g.spells?.cast)return false;
  _o.set(v.x-Math.sin(v.yaw)*.9,v.y+2.7,v.z-Math.cos(v.yaw)*.9);_d.set(foe.x,foe.y,foe.z).sub(_o).normalize();
  if(!g.collision.lineOfSight?.(_o.x,_o.y,_o.z,foe.x,foe.y,foe.z,.2)&&g.collision.lineOfSight)return false;
  if(!this.pay(v,SPELL_COST[name]??10))return false;
  g.spells.cast(name,_o.clone(),_d.clone(),'right',v.id);g.sync?.spell?.(name,_o,_d,'right',v.id);g.sound?.spellCast?.(name,_o);
  v.aimPitch=Math.asin(_d.y);v.castT=.6;v.model.castNow=true;this.engaged(v);return true;
 }
 engaged(v){if(v.foe)(v.castAtPlayers||(v.castAtPlayers=new Set())).add(v.foe);}
 waterAttack(v,foe){
  const g=this.game,a=v.elemental;
  if(a.cycle%3===0&&a.sourcePoint&&g.waves&&waveSource(g.world?.terrain?.data,a.sourcePoint)){
   const name=v.mana>60&&a.cycle%2===0?'WaveAttackMaxima':'WaveAttack';
   if(this.pay(v,SPELL_COST[name])){const wave=g.waves.npcRaise(v,name,a.sourcePoint,foe);if(wave){a.wave=wave;this.engaged(v);return true;}v.mana+=SPELL_COST[name];}
  }
  if(!this.waterSource(v,0)||!g.vortex||!this.pay(v,SPELL_COST.WaterVortex))return false;
  if(!a.source&&!a.humid)a.water=Math.max(0,a.water-6);
  _o.set(v.x,v.y+2.6,v.z);_d.set(foe.x,foe.y,foe.z).sub(_o).normalize();
  const m={by:v.id,ev:'launch',id:v.id+':water:'+(++this.seq),o:_o.toArray(),d:_d.toArray(),h:_o.clone().addScaledVector(_d,1.5).toArray(),v:6,a:0,pw:1,tk:'p',tid:v.foe,s:null};
  g.vortex._addFlight(v.id,m);g.sync?.vortex?.(m);g.sound?.spellCast?.('WaterVortex',_o);this.engaged(v);return true;
 }
 think(v,dt){
  const g=this.game,L=g.castleLife,a=v.elemental;if(!a)return false;
  a.t+=dt;a.flightCd=Math.max(0,a.flightCd-dt);v.prep=null;v.cardilon=null;v.practice=null;v.fleeT=0;v.path=null;v.seated=false;v.speed=0;
  const foe=v.foe?L._playerPos(v.foe):null;
  if(v.element==='water')this.waterSource(v,dt);
  if(!foe||Math.hypot(foe.x-v.x,foe.z-v.z)>75){v.foe=null;v.fx=0;v.mana=Math.min(v.maxMana,v.mana+dt);if(v.fly)this.land(v,dt);else L._ground(v);v.mode='idle';a.phase='rest';return true;}
  const dx=foe.x-v.x,dz=foe.z-v.z,dist=Math.hypot(dx,dz)||1,want=Math.atan2(-dx,-dz);
  v.yaw+=Math.atan2(Math.sin(want-v.yaw),Math.cos(want-v.yaw))*Math.min(1,dt*5);
  const threat=g.earthMages?._threat(v);
  if(v.mana<10)a.recover=true;if(a.recover&&v.mana>=Math.max(v.element==='air'?SPELL_COST.Wind:v.element==='water'?SPELL_COST.WaterVortex:SPELL_COST.Inferno,Math.min(v.maxMana,45)))a.recover=false;
  if(a.recover){v.fx=0;if(v.fly)this.land(v,dt);v.mana=Math.min(v.maxMana,v.mana+dt);if(dist<22)L._steer(v,v.x-dx/dist*9,v.z-dz/dist*9,v.walk*1.5,dt,0);v.yaw=want;v.mode=v.element+'Rest';if(!v.fly)L._ground(v);return true;}
  if(v.element==='water'){
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
   if(dist>26)L._steer(v,foe.x,foe.z,v.walk,dt,22);else if(dist<9)L._steer(v,v.x-dx/dist*6,v.z-dz/dist*6,v.walk,dt,0);
   L._ground(v);
  }else if(v.element==='air'){
   v.fx=0;
   if(!v.fly&&a.flightCd<=0&&(dist<14||threat)&&this.pay(v,SPELL_COST.Flight)){v.fly=true;a.flight=7;a.flightCd=15;}
   if(v.fly){
    if(!this.pay(v,dt*FLIGHT.COST)||a.flight<=0)this.land(v,dt);
    else{a.flight-=dt;const gy=g.collision.groundAt(v.x,v.z,v.y+1);const ny=v.y+(gy+5-v.y)*Math.min(1,dt*1.5);if(!L._airFree||L._airFree(v.x,v.z,ny))v.y=ny;else a.flight=0;v.mode='airFlight';}
   }
   if(dist<17||threat){ // Defensive circular retreat, never chase an opponent who is leaving.
    const sign=(v.entry.seed&1)?1:-1;L._steer(v,v.x-dx/dist*5-dz/dist*sign*4,v.z-dz/dist*5+dx/dist*sign*4,v.walk*1.3,dt,0);v.yaw=want;
   }
   if(a.phase==='rest')this.phase(v,'Coil');
   if(a.phase==='Coil'&&a.t>.7)this.phase(v,'Sweep');
   if(a.phase==='Sweep'&&a.t>.45&&!a.fired){a.fired=true;if(dist<23&&L._sees(v,foe))this.cast(v,dist<9?'WindMaxima':'Wind',foe);}
   if(a.phase==='Sweep'&&a.t>1.35){a.fired=false;this.phase(v,'Coil');}
   if(!v.fly){v.mode='air'+a.phase;L._ground(v);}
  }else{
   v.fx=0; // Fire has no shield/dome and never delegates to the ordinary wizard's defence.
   if(a.phase==='rest')this.phase(v,'Chamber');
   if(a.phase==='Chamber'&&a.t>.45)this.phase(v,a.cycle%3===2?'Kick':'Punch');
   if((a.phase==='Punch'||a.phase==='Kick')&&a.t>.43&&!a.fired){a.fired=true;if(L._sees(v,foe))this.cast(v,dist<11?'Inferno':a.cycle%4===3&&v.mana>=SPELL_COST.BombardoMaxima?'BombardoMaxima':'Bombardo',foe);}
   if((a.phase==='Punch'||a.phase==='Kick')&&a.t>1.1){a.fired=false;a.cycle++;this.phase(v,'Chamber');}
   if(dist>20)L._steer(v,foe.x,foe.z,v.walk*1.6,dt,16);else if(dist<7)L._steer(v,v.x-dx/dist*5,v.z-dz/dist*5,v.walk,dt,0);
   v.mode='fire'+a.phase;L._ground(v);
  }
  return true;
 }
 brake(v,dt){
  if(v.element!=='air')return;
  v.fly=false;
  if(v.dead||v.stunT>0){v.featherFall=false;return;}
  if(!v.featherFall&&v.vy< -5&&this.pay(v,FEATHER.COST)){v.featherFall=true;this.game.sound?.spellCast?.('Featherfall',_o.set(v.x,v.y+2,v.z));}
  if(v.featherFall&&!this.pay(v,FEATHER.DRAIN*dt))v.featherFall=false;
 }
 update(dt){this.guard?.update(dt);}
 dispose(){this.guard?.dispose();}
 land(v,dt){const gy=this.game.collision.groundAt(v.x,v.z,v.y+1);v.y=Math.max(gy,v.y-dt*2);if(v.y<=gy+.05){v.fly=false;v.vy=0;v.y=gy;}}
}
