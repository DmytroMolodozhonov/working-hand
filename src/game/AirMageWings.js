/** Physical NPC wings: the player's wingStep, real run-up, strokes, collision and landing. */
import {wingStep,HERO_FLY,TAKEOFF} from './WingFlight.js';
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
export function stepAirMageWings(g,v,foe,dt,landing=false){
 const a=v.elemental,L=g.castleLife,data=g.terrain?.data;
 const w=a.wings||(a.wings={air:false,vf:0,vy:0,since:0,beat:0,run:0,strokes:0,sprint:0,launch:false,yaw:v.yaw});
 if(v.dead||v.stunT>0||v.lev||v.carriedBy){w.air=w.launch=false;v.fly=false;return;}
 const gy=g.collision.groundAt(v.x,v.z,v.y+1),alt=Math.max(0,v.y-gy);
 if(!w.air){
  if(landing||!foe){w.launch=false;return;}
  const dist=Math.hypot(foe.x-v.x,foe.z-v.z);
  if(!w.launch&&a.flightCd<=0&&dist<18){w.launch=true;w.run=w.strokes=w.sprint=w.beat=0;w.yaw=v.yaw+Math.PI*.6;}
  if(!w.launch)return;
  const x=v.x,z=v.z;L._steer(v,x-Math.sin(w.yaw)*6,z-Math.cos(w.yaw)*6,HERO_FLY.takeoff+.8,dt,0);
  const speed=Math.hypot(v.x-x,v.z-z)/dt;
  w.run=speed>=HERO_FLY.takeoff?w.run+dt:0;w.sprint+=dt;w.beat-=dt;
  const stroke=w.beat<=0?1:0;if(stroke){w.beat=.6;w.strokes++;}
  wingStep(w,HERO_FLY,{ground:speed,runT:w.run,strokes:w.strokes,stroke},dt);
  v.mode='airRun';
  if(w.took){w.launch=false;v.fly=true;a.flight=7;a.flightCd=15;}
  else if(w.sprint>3){w.launch=false;a.flightCd=4;}
  return;
 }
 const descend=landing||a.flight<=0;w.beat-=dt;
 const stroke=!descend&&alt<5&&w.beat<=0?1:0;if(stroke)w.beat=.6;
 wingStep(w,HERO_FLY,{stroke,arms:'spread',alt,dive:descend?.2:alt>6?.12:0},dt);
 a.flight-=dt;
 if(foe&&!descend){
  const dx=foe.x-v.x,dz=foe.z-v.z,d=Math.hypot(dx,dz)||1,side=(v.entry.seed&1)?1:-1,rad=Math.max(-1,Math.min(1,(d-18)/6));
  const wanted=Math.atan2(-(dx/d*rad-dz/d*side),-(dz/d*rad+dx/d*side));
  w.yaw+=angle(wanted-w.yaw)*Math.min(1,dt*HERO_FLY.turn);
 }
 const distance=w.vf*dt,n=Math.max(1,Math.ceil(distance/.35)),step=distance/n;
 for(let i=0;i<n;i++){
  const x=v.x-Math.sin(w.yaw)*step,z=v.z-Math.cos(w.yaw)*step;
  if(data?.landMade&&!data.landMade(Math.round(x),Math.round(z))||L._airFree&&!L._airFree(x,z,v.y)){w.vf=0;break;}
  v.x=x;v.z=z;
 }
 const ny=v.y+w.vy*dt;
 if(!L._airFree||L._airFree(v.x,v.z,ny))v.y=ny;else{w.vy=Math.min(0,w.vy);a.flight=0;}
 const floor=g.collision.groundAt(v.x,v.z,v.y+1);
 if(v.y<=floor){v.y=floor;w.air=false;w.vy=w.vf=0;v.fly=false;v.vy=0;a.flightCd=Math.max(a.flightCd,5);}
 else{v.fly=true;v.mode='airFlight';v.speed=w.vf;}
}
