import test from 'node:test';
import assert from 'node:assert/strict';
import {worldPlayers,nearWorldPlayer} from '../../src/game/WorldPlayers.js';
import {Boats} from '../../src/game/Boats.js';
import {Cauldrons} from '../../src/game/Cauldrons.js';

test('authoritative cave and port scans consider guests, skipping dead players', () => {
    const host={x:0,z:0},guest={x:2000,z:1500},dead={x:4000,z:4000};
    const calls=[];
    const terrain={cavesNear(x,z){calls.push(['cave',x,z]);return [];},castles:{near(x,z){calls.push(['port',x,z]);return [];}}};
    const g={authority:true,character:{group:{position:host}},remotes:new Map([['guest',{position:guest}],['dead',{position:dead,dead:true}]]),config:{mode:'freeworld'},terrain:{data:terrain},world:{terrain:{data:terrain}}};
    assert.deepEqual(worldPlayers(g),[host,guest]);
    assert.equal(nearWorldPlayer(worldPlayers(g),guest.x+1,guest.z+1,5),true);
    Cauldrons.prototype._caves.call({game:g});
    Boats.prototype._portBoats.call({game:g,_portScan:0},1);
    assert.deepEqual(calls,[['cave',0,0],['cave',2000,1500],['port',0,0],['port',2000,1500]]);
    g.authority=false;assert.deepEqual(worldPlayers(g),[host],'clients do not simulate other players areas');
});
