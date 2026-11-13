import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {deathImpulse,kickDeadDoll} from '../../src/game/DeathImpulse.js';
import {Ragdoll,DOLL} from '../../src/game/Ragdoll.js';
import {CreatureImpact} from '../../src/game/CreatureImpact.js';
import {Zombie} from '../../src/entities/Zombie.js';
import {Duel} from '../../src/game/Duel.js';

function velocity(d) {
    const out=[0,0,0],n=d.x.length/3;
    for(let i=0;i<d.x.length;i++)out[i%3]+=(d.x[i]-d.o[i])/(n*DOLL.DT);
    return out;
}

test('a quarter-Jolt death impulse pushes away from the caster and preserves stronger existing flight',()=>{
    const g={localId:'me',character:{group:{position:{x:-3,z:0}}}};
    const kick=deathImpulse(g,{x:0,z:0},'me');assert.deepEqual(kick,[5,1.75,0]);
    const d=new Ragdoll();d.launch(0,0,0,0);kickDeadDoll(d,kick);
    const v=velocity(d);assert.ok(Math.abs(v[0]-5)<1e-6);assert.ok(Math.abs(v[1]-1.75)<1e-6);
    d.launch(20,7,0,0);const before=velocity(d);kickDeadDoll(d,kick);
    assert.deepEqual(velocity(d),before,'a blast is not launched twice or weakened');
});

test('a newly killed creature gets the impulse once; surviving and already dead creatures do not',()=>{
    let rags=0;const d=Object.create(Duel.prototype);
    d.game={localId:'me',character:{group:{position:{x:0,z:0}}},creatureImpact:{ragDeath(){rags++;}}};
    const c={id:'v',x:0,z:-3,dead:false};
    d._finishLethal(c,false,'me','AvadaKedavra');assert.equal(rags,0);assert.equal(c.deathKick,undefined);
    c.dead=true;d._finishLethal(c,false,'me','AvadaKedavra');assert.deepEqual(c.deathKick,[0,1.75,-5]);
    d._finishLethal(c,true,'me','AvadaKedavra');assert.equal(rags,1);
    const doll=new Ragdoll();doll.launch(0,0,0,0);
    CreatureImpact.prototype._deathKick(c,doll);const before=Array.from(doll.o);
    CreatureImpact.prototype._deathKick(c,doll);assert.deepEqual(Array.from(doll.o),before);
});

test('the real zombie rag doll launches and its death impulse survives a host snapshot',()=>{
    const scene=new THREE.Scene(),z=new Zombie(scene,new THREE.Vector3(),7,{});
    z.group.position.y=1;z.die();z.deathKick=[0,1.75,-5];
    const g={authority:true,zombies:[z],zombieById:new Map([[7,z]]),collision:{resolveCylinder(){}},scene};
    const ci=new CreatureImpact(g);ci.ragDeath(z);
    const doll=ci.deadRags.get('z|7')?.doll;assert.ok(doll);
    assert.ok(velocity(doll)[2]<-4.9);
    const remote=new Zombie(scene,new THREE.Vector3(),8,{});remote.remote=true;
    remote.applySnapshot(z.serialize());assert.equal(remote.isDying,true);assert.deepEqual(remote.deathKick,z.deathKick);
    z.dispose();remote.dispose();
});


test('the player death path records a magical kick, but a normal fall does not', async () => {
    const {Combat}=await import('../../src/game/Combat.js');
    for(const kind of ['AvadaKedavra','fall','Cannon']) {
        const c=Object.create(Combat.prototype);
        const game={localId:'me',character:{group:{position:{x:0,z:0}}},castleLife:{byId:new Map([['wizard',{x:-4,z:0}]])},playerName:()=> 'Mage',onLocalDeath(){}};
        Object.assign(c,{game,dead:false,hp:1});c.die('wizard',kind);
        assert.equal(c.dead,true);
        assert.deepEqual(game._deathKick,kind==='AvadaKedavra'?[5,1.75,0]:null);
    }
});
