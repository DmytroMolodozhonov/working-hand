import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Duel } from '../../src/game/Duel.js';
import { SpellManager } from '../../src/fx/SpellManager.js';

function target(local = false) {
    const group = new THREE.Group();
    const duel = Object.create(Duel.prototype);
    const body = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
    return { group, local, id: 'victim', center: () => group.position.clone().add(new THREE.Vector3(0, 0.6, 0)),
        body: () => duel._heroBody(group, body), blocks: () => false, hit() {} };
}

function manager(player) {
    const explosions = [];
    const fx = { glow: { spawn() {} }, spark() {}, straightBeam() {}, castBurst() {} };
    const sm = new SpellManager(new THREE.Scene(), fx, { players: () => [player], zombies: () => [],
        explode: (p) => explosions.push(p.clone()) });
    return { sm, explosions };
}

test('Бомбардо не проходит сквозь голого игрока между кадрами', () => {
    const p = target();
    const { sm, explosions } = manager(p);
    sm.castBombardo(new THREE.Vector3(-2, 0.6, 0), new THREE.Vector3(1, 0, 0), 'caster');
    const spell = sm.spells[0];
    spell.onUpdate(spell, 0.125);
    assert.equal(explosions.length, 1);
    assert.equal(spell.life, 0);
    assert.ok(Math.abs(explosions[0].x) < 0.01);
});

test('щит отражает пересёкший игрока Бомбардо без взрыва', () => {
    const p = target(); let bounces = 0;
    p.blocks = () => true;
    p.hit = (kind) => { if (kind === 'Bounce') bounces++; };
    const { sm, explosions } = manager(p);
    sm.castBombardo(new THREE.Vector3(-2, 0.6, 0), new THREE.Vector3(1, 0, 0), 'caster');
    const spell = sm.spells[0];
    spell.onUpdate(spell, 0.125);
    assert.equal(bounces, 1);
    assert.equal(explosions.length, 0);
    assert.ok(sm.orbs.find((o) => o.visible).position.x < 0);
});

test('Сапира задевает верх тела без мантии, но не игрока сбоку', () => {
    const p = target(true); let hits = 0; p.hit = () => hits++;
    const { sm } = manager(p);
    sm.castSapira(new THREE.Vector3(-2, 2.1, 0), new THREE.Vector3(1, 0, 0), 'caster');
    assert.equal(hits, 1);
    sm.castSapira(new THREE.Vector3(-2, 2.1, 2), new THREE.Vector3(1, 0, 0), 'caster');
    assert.equal(hits, 1);
});

test('Санд не проходит сквозь тело между кадрами', () => {
    const p = target(true); let hits = 0; p.hit = () => hits++;
    const { sm } = manager(p);
    sm.castSands(new THREE.Vector3(-2, 0.6, 0), new THREE.Vector3(1, 0, 0), 'caster');
    const spell = sm.spells[0]; spell.onUpdate(spell, 0.16);
    assert.equal(hits, 1); assert.equal(spell.life, 0);
});

test('Бомбардо учитывает лежащее тело и настоящее положение нового кадра', () => {
    const p = target(); const { sm, explosions } = manager(p);
    sm.castBombardo(new THREE.Vector3(-2, 5, 1.9), new THREE.Vector3(1, 0, 0), 'caster');
    p.group.position.y = 5;
    p.group.rotation.x = Math.PI / 2;
    const spell = sm.spells[0]; spell.onUpdate(spell, 0.125);
    assert.equal(explosions.length, 1); assert.equal(spell.life, 0);
});

test('Бомбардо не задевает далёкого сбоку игрока', () => {
    const { sm, explosions } = manager(target());
    sm.castBombardo(new THREE.Vector3(-2, 0.6, 2), new THREE.Vector3(1, 0, 0), 'caster');
    const spell = sm.spells[0]; spell.onUpdate(spell, 0.125);
    assert.equal(explosions.length, 0); assert.ok(spell.life > 0);
});