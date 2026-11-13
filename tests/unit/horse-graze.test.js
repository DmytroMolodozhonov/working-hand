// A horse grazing: the muzzle goes down to the grass IN FRONT of the forehooves — the head never curls back into the chest
// (the author 08.11: «когда лошадь опускает голову, у неё голова пропадает»).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { horseModel } from '../../src/game/HorseModel.js';
import { animatePose, POSE } from '../../src/game/AnimalHerd.js';

test('grazing horse: the muzzle is near the ground and ahead of the chest', () => {
    const m = horseModel(0), a = { model: m, id: 1 }, tip = new THREE.Vector3(0, 0, -0.66);
    for (let i = 0; i < 400; i++) animatePose(a, 0.05, POSE.graze);
    m.updateMatrixWorld(true);
    const p = m.userData.head.localToWorld(tip.clone());
    assert.ok(p.y < 0.4 && p.y > -0.1, 'muzzle at the grass: ' + p.y);
    assert.ok(p.z < -1.0, 'ahead of the chest (the chest/forelegs end at z ≈ −0.9): ' + p.z);
    for (let i = 0; i < 400; i++) animatePose(a, 0.05, POSE.stand);
    m.updateMatrixWorld(true);
    assert.ok(m.userData.head.localToWorld(tip.clone()).y > 1.5, 'head up again when standing');
});

test('grazing stops before the head enters an uphill bank, in world coordinates',async()=>{
 const {horseGrazePitch}=await import('../../src/game/AnimalHerd.js');
 for(const color of [0,0x4a3022,0xFE0000]){
  const m=horseModel(color),root=new THREE.Group();root.position.set(120,-.5,80);root.add(m);m.scale.setScalar(1.955);
  const a={model:m,id:1};animatePose(a,.01,POSE.stand);
  const data={isSolidAt:(x,y,z)=>y<(z<77.8?1.3:-.5)};
  const limit=horseGrazePitch(a,data);assert.ok(limit>m.userData.grazePitch,'a raised bank limits the bend');a.grazeLimit=limit;
  for(let i=0;i<400;i++)animatePose(a,.05,POSE.graze);m.updateWorldMatrix(true,true);
  const nose=m.userData.head.localToWorld(new THREE.Vector3(0,-.12,-.66));assert.ok(!data.isSolidAt(nose.x,nose.y,nose.z),'the real rendered muzzle remains above the bank');
 }
});
