import * as THREE from 'three';
import { WEAPON_SPECS } from '../src/entities/WeaponModels.js';
import { segmentToSegment } from '../src/game/SegmentContact.js';

const V3=THREE.Vector3, up=new V3(0,1,0);
const moves={
    thrust:{time:.74,start:[-.34,-.36,.38],end:[-.20,-.05,1],blade:[-.03,.05,1],wind:.37,force:1.4},
    diagonal:{time:1.06,start:[-.53,.18,.16],end:[.48,-.22,.71],blade:[.61,-.07,.77],wind:.44,force:2.7},
    overhead:{time:1.23,start:[-.32,.49,-.25],end:[-.12,-.38,.85],blade:[-.08,-.58,.8],wind:.49,force:4.55},
};
const recipes=[['thrust','diagonal'],['overhead','diagonal','thrust'],['diagonal','thrust','overhead']];
const ease=t=>t*t*(3-2*t);

export function armKnight(person, inventory, seed) {
    const model=inventory.itemModel({kind:'weapon',type:'sword'});
    model.scale.multiplyScalar(1.28);
    const palm=person.rig.fingers.R.hb.palm;
    palm.add(model);
    model.position.set(.012,-.5*(WEAPON_SPECS.sword.handle[0]+WEAPON_SPECS.sword.handle[1])*model.scale.y-.045,0);
    model.rotation.x=Math.PI*.83;
    person.sword={model,palm,recipe:recipes[seed%recipes.length],next:0,wait:.27,move:null,t:0,tip:null,hit:false};
}

export function prepareSword(person, enemy, distance, dt) {
    const s=person.sword;
    if(!s)return;
    s.wait=Math.max(0,s.wait-dt);
    if(!enemy||person.hurt>.12&&person.vy>.5){
        s.move=null;s.tip=null;s.model.rotation.set(Math.PI*.83,0,0);
        return;
    }
    if(!s.move&&distance<1.63&&s.wait===0){
        s.move=moves[s.recipe[s.next++%s.recipe.length]];
        s.t=0;s.tip=null;s.hit=false;
    }
    if(!s.move)return;
    const a=s.move,speed=Math.max(.76,Math.min(1.22,Math.sqrt(76/person.mass)));
    s.t+=dt*speed/a.time;
    if(s.t>=1){s.move=null;s.tip=null;s.wait=.21+(person.mass-47)*.005;return;}
    const from=new V3(...a.start),to=new V3(...a.end);
    const strike=Math.max(0,Math.min(1,(s.t-a.wind)/.27));
    const prime=Math.min(1,s.t/a.wind);
    const point=new V3(-.36,-.49,.34).lerp(from,ease(prime)).lerp(to,ease(strike));
    const arm=person.rig.arms.dirs.R;
    arm.ok=true;
    arm.u.copy(point).add(new V3(-.12,-.13,-.12)).normalize();
    arm.f.copy(point).add(new V3(.11,.12,.16)).normalize();
    s.aim=new V3(.02,.61,.49).lerp(new V3(...a.blade),ease(strike)).normalize();
}

export function swingSword(person, enemy, collision, impact) {
    const s=person.sword,a=s?.move;
    if(!a||!enemy)return;
    const facing=s.aim.clone().applyAxisAngle(up,person.faceYaw);
    const aim=new THREE.Quaternion().setFromUnitVectors(up,facing);
    s.model.quaternion.copy(s.palm.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(aim);
    const spec=WEAPON_SPECS.sword;
    const root=s.model.localToWorld(new V3(0,spec.bladeStart,0)),tip=s.model.localToWorld(new V3(0,spec.length,0));
    const low=enemy.clone().add(new V3(0,.35,0)),high=enemy.clone().add(new V3(0,1.47,0));
    if(!s.hit&&s.t>=a.wind&&s.t<=a.wind+.36&&
        (segmentToSegment(root,tip,low,high).dist<.39||s.tip&&segmentToSegment(s.tip,tip,low,high).dist<.37)&&!collision(root,high,.02)){
        s.hit=true;
        const force=a.force*Math.max(.81,Math.min(1.2,person.mass/78));
        impact(person,person.caster,enemy.clone().sub(person.pos).setY(0).normalize(),spec.damage+force*.45,force);
    }
    s.tip=tip;
}
