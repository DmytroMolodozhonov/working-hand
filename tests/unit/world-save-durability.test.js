import test from 'node:test';
import assert from 'node:assert/strict';
import {putWorld, WorldKeeper} from '../../src/game/WorldSave.js';

let dbFails=false;
globalThis.indexedDB={open(){const req={};queueMicrotask(()=>{
 req.result={transaction(){
  const tx={objectStore:()=>({put:()=>({}),getAll:()=>({result:[]}),get:()=>({result:undefined})})};
  queueMicrotask(()=>dbFails?tx.onerror():tx.oncomplete());return tx;
 }};req.onsuccess();
});return req;}};

test('save needs a real acknowledgement; either independent store can survive the other failing',async()=>{
 const oldFetch=globalThis.fetch;
 try{
  globalThis.fetch=async()=>({ok:true});dbFails=true;
  assert.deepEqual(await putWorld({id:'w'}),{browser:false,disk:true});
  globalThis.fetch=async()=>({ok:false,status:500});dbFails=false;
  assert.deepEqual(await putWorld({id:'w'}),{browser:true,disk:false});
  dbFails=true;await assert.rejects(putWorld({id:'w'}),/не удалось сохранить/);
  globalThis.fetch=async()=>{throw Error('offline');};
  await assert.rejects(putWorld({id:'w'}),/не удалось сохранить/);
 }finally{globalThis.fetch=oldFetch;dbFails=false;}
});

test('failed saving never updates lastSaved and warns once; retry recovery is reported',async()=>{
 const oldFetch=globalThis.fetch,warnings=[];
 const keeper={game:{active:true,hud:{toast:t=>warnings.push(t)}},lastSaved:123,snapshot:()=>({id:'w'}),save:WorldKeeper.prototype.save};
 try{
  dbFails=true;globalThis.fetch=async()=>({ok:false,status:500});
  await keeper.save();await keeper.save();
  assert.equal(keeper.lastSaved,123);assert.equal(warnings.length,1);assert.match(warnings[0],/Не удалось сохранить/);
  dbFails=false;globalThis.fetch=async()=>({ok:true});await keeper.save();
  assert.ok(keeper.lastSaved>123);assert.equal(warnings.length,2);assert.match(warnings[1],/снова работает/);
 }finally{globalThis.fetch=oldFetch;dbFails=false;}
});

test('an empty or inaccessible browser profile still lists and loads disk worlds with their mana',async()=>{
 const {listWorlds,loadWorld}=await import('../../src/game/WorldSave.js');
 const oldFetch=globalThis.fetch;
 const w={id:'actual-world',seed:77,updated:456,name:'Мой мир',players:{'id:host':{name:'Маг',mana:{cells:250}},'id:guest':{name:'Друг',mana:{cells:140}}}};
 try{
  dbFails=true;globalThis.fetch=async url=>({ok:true,json:async()=>url.includes('?id=')?w:[w]});
  const worlds=await listWorlds();assert.equal(worlds.length,1);assert.deepEqual(worlds[0].players,['Маг','Друг']);
  assert.deepEqual(await loadWorld('actual-world'),w);
 }finally{globalThis.fetch=oldFetch;dbFails=false;}
});
