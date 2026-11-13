import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {Duel,firstTouched} from '../../src/game/Duel.js';
import {horseModel} from '../../src/game/HorseModel.js';
function world(){
 const scene=new T.Scene(),model=horseModel(0),group=new T.Group();group.add(model);scene.add(group);group.position.set(0,0,-50);scene.updateMatrixWorld(true);
 const a={id:'horse',type:'horse',group,model,dims:{wid:1.6,height:3,minY:0,minZ:-2,maxZ:2}};
 const g={localId:'me',scene,animals:{targets:()=>[a]},remotes:new Map(),fx:{spark(){}},character:{group:new T.Group()},combat:{}};
 return{d:new Duel(g),a,g};
}
test('a moved horse never stretches its neck and leg hit capsules across the world before its next render',()=>{
 const {d,a}=world();a.group.position.set(100,0,-100);
 const bodies=d._bodies('me');assert.equal(bodies.length,6);
 for(const b of bodies){assert.ok(b.a.distanceTo(b.b)<5,JSON.stringify({a:b.a.toArray(),b:b.b.toArray()}));assert.ok(b.a.distanceTo(a.group.position)<5);assert.ok(b.b.distanceTo(a.group.position)<5);}
 const midpoint=new T.Vector3(50,1.5,-75),end=midpoint.clone().add(new T.Vector3(0,0,-5));assert.equal(firstTouched(midpoint,end,bodies),null,'a remote horse cannot eat an unrelated spell at its caster');
});
test('a hidden/frozen horse and an animated grazing head still expose compact current body capsules',()=>{
 const {d,a}=world();a.group.visible=false;a.group.userData.matFrozen=true;
 for(let i=0;i<60;i++){a.group.position.set(i*3,0,-50-i);a.group.rotation.y=i*.1;a.model.userData.neck.rotation.x=-i*.015;
  for(const b of d._bodies('me'))assert.ok(b.a.distanceTo(b.b)<5,'no stale descendant world matrix, even without a scene render');
 }
});
