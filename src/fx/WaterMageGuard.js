/** Water guards use the same shield collision surface as NPC Protection, with moving liquid geometry. */
import * as T from 'three';
import { createWaterMaterial } from './WaterMaterial.js';
import { NPC_SHIELD as S } from '../game/ShieldBounce.js';
import { FX } from './WizardFx.js';
export class WaterMageGuard {
 constructor(game){this.game=game;this.time=0;this.material=createWaterMaterial();this.material.side=T.DoubleSide;
  this.dome=new T.SphereGeometry(1,20,12);this.cap=new T.SphereGeometry(1,20,10,0,Math.PI*2,0,Math.PI/2);this.cap.rotateX(-Math.PI/2);
  this.slots=[];for(let i=0;i<8;i++){const m=new T.Mesh(this.dome,this.material);m.visible=false;m.frustumCulled=false;game.scene.add(m);this.slots.push(m);}
 }
 update(dt){this.time+=dt;this.material.userData.uniforms.uTime.value=this.time;let i=0;const p=this.game.character.group.position;
  for(const v of this.game.castleLife.byId.values()){
   if(v.element!=='water'||v.dead||!v.group.visible||!(v.fx&(FX.DOME|FX.SHIELD))||Math.hypot(v.x-p.x,v.z-p.z)>80||i>=this.slots.length)continue;
   const m=this.slots[i++],dome=!!(v.fx&FX.DOME),fx=-Math.sin(v.yaw),fz=-Math.cos(v.yaw);m.visible=true;m.geometry=dome?this.dome:this.cap;
   if(dome){m.position.set(v.x,v.y+S.DOME_UP,v.z);m.scale.setScalar(S.DOME_R);m.rotation.set(0,0,0);}
   else{m.position.set(v.x+fx*S.FWD-Math.cos(v.yaw)*S.SIDE,v.y+S.UP,v.z+fz*S.FWD+Math.sin(v.yaw)*S.SIDE);m.rotation.set(0,v.yaw,0);m.scale.set(S.R,S.R,.32);}
  }for(;i<this.slots.length;i++)this.slots[i].visible=false;
 }
 sampleModel(){const m=new T.Mesh(this.dome,this.material);m.userData.shared=true;return m;}
 dispose(){for(const m of this.slots)this.game.scene.remove(m);this.slots.length=0;this.dome.dispose();this.cap.dispose();this.material.dispose();}
}
