import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rememberDeath, deathCheckpoint, forgetDeath } from '../../src/game/DeathCheckpoint.js';
import { applyPlayerSnapshot, WorldKeeper } from '../../src/game/WorldSave.js';

test('quit before respawn: a death checkpoint overrides an older rich living save', () => {
    const old=globalThis.localStorage, store=new Map();
    globalThis.localStorage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
    try {
        let wiped=0,restored=0;
        const g={keeper:{id:'world'},seed:8,net:{pid:'me'},config:{mode:'freeworld'},active:false,
            character:{group:new THREE.Group()},mana:{onDeath(){wiped++;},restore(){restored++;}},
            inventory:{slots:[{kind:'wand'}],back:[{kind:'scroll'}]}};
        rememberDeath(g,{dead:true,hp:0,pos:[100,4,100],ld:[100,4,100,55]});
        const checkpoint=deathCheckpoint(g);
        assert.equal(checkpoint.dead,true);
        applyPlayerSnapshot(g,{hp:20,pos:[100,4,100],mana:{cells:1000,value:1000},slots:[{kind:'wand'}]});
        assert.equal(wiped,1);assert.equal(restored,0);
        assert.deepEqual(g.character.group.position.toArray(),[0,0,0]);
        assert.deepEqual(g.inventory.slots,[null]);assert.deepEqual(g.inventory.back,[null]);
        assert.equal(g._respawnAfterRestore,true);
        assert.equal(deathCheckpoint({...g,net:{pid:'friend'}}),null,'another player has another life');
        assert.equal(deathCheckpoint({...g,keeper:{id:'other'}}),null,'another world is independent');
        forgetDeath(g);assert.equal(deathCheckpoint(g),null);
    } finally { if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old; }
});


test('a death arriving during an autosave is written next, and awaited by the same save job', async () => {
    const oldDB=globalThis.indexedDB,oldDisk=globalThis.__ZNS_NO_DISK_WORLDS__;
    const writes=[],pending=[];
    globalThis.__ZNS_NO_DISK_WORLDS__=true;
    globalThis.indexedDB={open(){
        const request={};
        queueMicrotask(()=>{request.result={transaction(){
            const transaction={objectStore:()=>({put(value){writes.push(value);return {};}})};
            pending.push(transaction);return transaction;
        }};request.onsuccess();});
        return request;
    }};
    let state={id:'world',hp:20,dead:false};
    const keeper={game:{active:true},snapshot:()=>({...state}),save:WorldKeeper.prototype.save};
    const turn=()=>new Promise(resolve=>setImmediate(resolve));
    try {
        const job=keeper.save();await turn();
        assert.equal(writes.length,1);assert.equal(writes[0].dead,false);
        state={id:'world',hp:0,dead:true};
        assert.equal(keeper.save(),job);
        pending[0].oncomplete();await turn();
        assert.equal(writes.length,2);assert.equal(writes[1].dead,true);
        pending[1].oncomplete();await job;
        assert.equal(keeper._saving,false);
    } finally {
        if(oldDB===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=oldDB;
        if(oldDisk===undefined)delete globalThis.__ZNS_NO_DISK_WORLDS__;else globalThis.__ZNS_NO_DISK_WORLDS__=oldDisk;
    }
});
