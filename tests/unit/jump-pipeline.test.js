// The whole path of a real jump: the camera's body points (synthetic pose) → JumpReader → Character.jump / jumpBoost → the ledge
// (ledgePush, the real body and walls), standing flush, 0.3 m and 1 m from a ledge of 1, 2 and 3 blocks.
import * as THREE from 'three';
import test from 'node:test';
import assert from 'node:assert/strict';
import { frame } from '../e2e/poses.mjs';
import { JumpReader } from '../../src/input/JumpReader.js';
import { VoxelCharacter, PLAYER_GROUND_OFFSET } from '../../src/entities/Character.js';
import { CollisionWorld } from '../../src/world/Collision.js';
import { JUMP_ASSIST, ledgePush } from '../../src/game/Jump.js';
const SC=0.7,TT=(0.8-0.42)*SC,R=0.48,DT=1/60;
function pose(up,squat){const lm=frame({legs:{left:'stand',right:'stand'},scale:SC}).poseLandmarks;for(let i=0;i<lm.length;i++){let d=-up*TT;if(squat&&i<25)d+=squat*TT;if(i>=25&&squat&&!up)d=0;lm[i]={...lm[i],y:lm[i].y+d}}return lm}
const jump=(h)=>(t)=>{if(t<1)return{};if(t<1.25)return{squat:0.25*(t-1)/0.25};if(t<1.35)return{squat:0.25*(1-(t-1.25)/0.1)};const tf=Math.sqrt(h)*0.9,u=(t-1.35)/tf;if(u<1)return{up:Math.max(0,4*h*u*(1-u))};return{}};
function terrain(top,roof=()=>null){const solid=(ix,iz,l)=>l<=top(ix,iz)||roof(ix,iz)===l;return{topLayer:(ix,iz)=>roof(ix,iz)??top(ix,iz),surfaceY:(x,z)=>top(Math.round(x),Math.round(z))-0.5,floorBelow(ix,iz,L){for(let l=L;l>-10;l--)if(solid(ix,iz,l))return l;return -10},ceilingAbove(ix,iz,L){for(let l=L;l<40;l++)if(solid(ix,iz,l))return l;return Infinity},solidIn(ix,iz,a,b){for(let l=a;l<=b;l++)if(solid(ix,iz,l))return true;return false}}}
function sim(h, high, gap, roofAt = null) {
 const T=terrain((ix,iz)=>iz<=-2?high:0, roofAt?(ix,iz)=>iz<=-2?roofAt:null:()=>null);const col=new CollisionWorld();col.setTerrain(T);
 const ch=new VoxelCharacter(new THREE.Scene());ch.setIdlePose();
 ch.group.position.set(0,-0.5+PLAYER_GROUND_OFFSET,-1.5+R+gap);
 const resolve=()=>{const p=ch.group.position,feet=p.y-PLAYER_GROUND_OFFSET;const f=ch.onGround?Math.max(feet,Math.min(ch.groundY,feet+1.05)):feet;col.resolveCylinder(p,R,f,3.5,1.05+(ch.jumpAir?JUMP_ASSIST:0),true,3.5)};
 const r=new JumpReader();const at=jump(h);let seen=null,jat=null,det=null;let maxfeet=-9;
 let t=0;const total=3.5;
 for(let step=0;step<total*60;step++){
  t=step*DT;
  if(step%2===0){const J=r.read(pose(...[at(t).up||0,at(t).squat||0]),t*1000);
   if(J.jumps!==seen){const first=seen==null;seen=J.jumps;if(!first&&ch.onGround){det={s:J.strength,t};if(ch.jump(J.strength)){jat=J.at;const p=ch.group.position;const pu=ledgePush(T,p.x,p.z,p.y-PLAYER_GROUND_OFFSET,0,R);if(pu){ch.jumpVel.x=pu.x;ch.jumpVel.z=pu.z}}}}
   else if(J.air&&ch.jumpAir&&J.at===jat)ch.jumpBoost(J.strength);}
  ch.update(DT,col,true);resolve();maxfeet=Math.max(maxfeet,ch.group.position.y-PLAYER_GROUND_OFFSET);
 }
 return{det,feet:+(ch.group.position.y-PLAYER_GROUND_OFFSET).toFixed(2),max:+maxfeet.toFixed(2),z:+ch.group.position.z.toFixed(2)};
}

const floorTop = -0.5;

test('a real jump (normal height) onto a ledge of 1 and 2 blocks: flush, 0.3 m and 1 m away', () => {
    for (const high of [1, 2]) for (const gap of [0, 0.3, 1.0]) {
        const r = sim(0.8, high, gap);
        assert.ok(r.det, `detected (${high}, ${gap})`);
        assert.ok(Math.abs(r.feet - (floorTop + high)) < 0.05, `${high} blocks, gap ${gap}: ${JSON.stringify(r)}`);
    }
});

test('a real jump onto a 3-block wall: not got onto', () => {
    for (const gap of [0, 0.3, 1.0]) {
        const r = sim(0.8, 3, gap);
        assert.ok(r.feet < floorTop + 0.05, `gap ${gap}: ${JSON.stringify(r)}`);
    }
});

test('a real jump onto a 2-block ledge under a low roof: the head never goes into it', () => {
    const r = sim(0.8, 2, 0, 5);
    assert.ok(r.max < floorTop + 2.1, JSON.stringify(r));
});
