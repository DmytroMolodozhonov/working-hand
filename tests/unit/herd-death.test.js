import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Animals} from '../../src/game/Animals.js';
import {BLOCK} from '../../src/world/Terrain.js';
import {recipeById,matchRecipe} from '../../src/game/Potions.js';
import {ITEM_INFO,makeItemModel} from '../../src/game/ItemTypes.js';
function fixture(){
 const drops=[],g={config:{mode:'freeworld'},authority:true,localId:'me',seed:7,scene:new T.Scene(),character:{group:new T.Group()},remotes:new Map(),collision:{groundY:()=>0,resolveCylinder(){}},fx:{spark(){}},hud:{setVoice(){}},combat:{enabled:false},items:{spawnLoose:it=>drops.push(it)},terrain:{data:{get:(x,L)=>L<=1?BLOCK.STONE:BLOCK.AIR,topLayer:()=>1,floorBelow:()=>1,landMade:()=>true}},damageLocalPlayer(){}};
 g.character.group.position.set(-10,2,0);const A=new Animals(g);A.enabled=true;return {g,A,drops};
}
for(const type of ['horse','cow','sheep','pig','swan','dolphin','glowfin','shark'])test(type+': killing a herd mate makes calm witnesses flee',()=>{
 const {A}=fixture(),herd={x:0,z:0},dead=A._spawn(type,new T.Vector3(0,.5,0),{herd,color:1}),mate=A._spawn(type,new T.Vector3(8,.5,0),{herd,color:1});
 A.hit(dead,999,null,'me');assert.equal(dead.dead,true);assert.equal(mate.state,'flee');assert.ok(mate.stateT>0);assert.equal(mate.scareFrom.x,-10);
 if(['horse','cow','sheep'].includes(type)){
  const x=mate.group.position.x;for(let i=0;i<30;i++)A._think(mate,1/30);
  assert.ok(mate.group.position.x>x,'a flee state must produce actual movement');
 }
});
test('environmental death also produces actual escape; existing defenders keep fighting',()=>{
 const {A}=fixture(),herd={x:0,z:0},dead=A._spawn('horse',new T.Vector3(0,.5,0),{herd,color:1}),mate=A._spawn('horse',new T.Vector3(8,.5,0),{herd,color:1}),fighter=A._spawn('horse',new T.Vector3(14,.5,0),{herd,color:1});
 fighter.state='attack';fighter.attacker='me';fighter.stateT=10;A._die(dead,false,null);
 assert.equal(fighter.state,'attack');const x=mate.group.position.x;
 for(let i=0;i<30;i++)A._think(mate,1/30);assert.ok(mate.group.position.x>x);
});
test('a flying pig drops one usable wing pair, and duplicate death notifications cannot duplicate loot',()=>{
 const {A,drops}=fixture(),pig=A._spawn('pig',new T.Vector3(0,.5,0));A._die(pig,false,'me');A._die(pig,false,'me');
 assert.equal(drops.length,1);assert.equal(drops[0].kind,'pigWings');assert.ok(ITEM_INFO.pigWings);assert.ok(makeItemModel(drops[0]));
 assert.equal(matchRecipe({pigWings:1,apple:1}).id,'wings');assert.equal(matchRecipe({magicSwanWings:1,apple:1}).id,'wings');assert.deepEqual(recipeById('wings').ingredients,{swanWings:1,apple:1});
});
