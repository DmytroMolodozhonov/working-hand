import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeItemModel} from '../../src/game/ItemTypes.js';
import {figureIds} from '../../src/game/PentagramRules.js';

test('tablets are rigid round models with shared resources and distinct figure UVs',()=>{
 const materials=new Set(),geometries=new Set();
 for(const pent of figureIds()){
  const a=makeItemModel({kind:'scroll',stat:'pentagram',pent});
  const b=makeItemModel({kind:'scroll',stat:'pentagram',pent});
  assert.equal(a.name,'pentagram-tablet');assert.equal(a.children.length,4);
  const size=new THREE.Box3().setFromObject(a).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x-size.y)<.001);assert.ok(size.z<size.x*.2);
  a.children.forEach((m,i)=>{assert.equal(m.geometry,b.children[i].geometry);assert.equal(m.material,b.children[i].material);assert.ok(m.geometry.userData.shared);assert.ok(m.material.userData.shared);materials.add(m.material);geometries.add(m.geometry);});
 }
 assert.ok(materials.size<=6,'two atlas pages and two body palettes');
 assert.equal(geometries.size,figureIds().length+2);
 const light=makeItemModel({kind:'scroll',stat:'pentagram',pent:'life'}),dark=makeItemModel({kind:'scroll',stat:'pentagram',pent:'devil'});
 assert.notEqual(light.children[0].material.color.getHex(),dark.children[0].material.color.getHex());
 assert.notDeepEqual([...light.children[2].geometry.attributes.uv.array],[...dark.children[2].geometry.attributes.uv.array]);
 assert.notEqual(makeItemModel({kind:'scroll',stat:'spell',spell:'Bombardo'}).name,'pentagram-tablet');
});
