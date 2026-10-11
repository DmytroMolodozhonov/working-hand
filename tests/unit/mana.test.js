import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat } from '../../src/game/Combat.js';
import { Mana, MANA, isStrongSpell } from '../../src/game/Mana.js';
import { playerSnapshot, applyPlayerSnapshot } from '../../src/game/WorldSave.js';
import { Duel } from '../../src/game/Duel.js';
import { Spiders } from '../../src/game/Spider.js';

function fakeGame(mode = 'freeworld') {
    const toasts = [];
    const g = {
        config: { mode },
        localId: 'me',
        knockback: new THREE.Vector3(),
        remotes: new Map(),
        fx: { spark() {}, lightFlash() {} },
        hud: { update() {}, setFatigue() {}, setStatus() {}, setFrozenOverlay() {}, damageFlash() {}, setVoice() {}, toast: (t) => toasts.push(t) },
        character: { group: { position: new THREE.Vector3(0, 0.5, 0) }, knockedDown: false },
        playerHP: 20,
        maxHP: 20,
        onLocalDeath() { g.mana.onDeath(); },
        playerName: () => null,
    };
    g.combat = new Combat(g);
    g.mana = new Mana(g);
    return { g, toasts };
}

test('mana: base 30, every spell that worked +1 to the maximum', () => {
    const { g } = fakeGame();
    assert.equal(g.mana.max, MANA.BASE);
    assert.equal(MANA.BASE, 30);
    g.mana.success('Levitation');
    assert.equal(g.mana.max, 31);
    g.mana.success('Bombardo');
    g.mana.success('Protection');
    assert.equal(g.mana.max, 33);
    assert.equal(g.mana.success('Stop'), 0, 'not a spell');
    assert.equal(g.mana.max, 33);
});

test('mana: a strong spell gives +3 more the first time only', () => {
    const { g, toasts } = fakeGame();
    for (const n of ['BombardoMaxima', 'AvadaKedavra', 'LightningStrike', 'Thunderwave', 'EarthquakeMaxima', 'WaterVortex', 'Alive', 'FireMaxima', 'ProtectionMaxima']) assert.ok(isStrongSpell(n), n);
    for (const n of ['Bombardo', 'Levitation', 'Accio', 'Sapira']) assert.ok(!isStrongSpell(n), n);
    assert.equal(g.mana.success('BombardoMaxima'), 4);
    assert.equal(g.mana.max, 34);
    assert.equal(g.mana.success('BombardoMaxima'), 1, 'second time: only +1');
    assert.equal(g.mana.max, 35);
    assert.ok(toasts.some((t) => /Мана/.test(t)));
});

test('mana: a duel won +5, the giant spider +20, a crystal +5', () => {
    const { g } = fakeGame();
    g.mana.duelWon();
    assert.equal(g.mana.max, 35);
    g.mana.spiderKilled();
    assert.equal(g.mana.max, 55);
    g.mana.crystal();
    assert.equal(g.mana.max, 60);
    assert.equal(g.combat.fatigue, 60, 'the mana in it grows too');
});

test('mana: death → back to 30 (a burnt strength scroll stays)', () => {
    const { g } = fakeGame();
    g.combat.addMaxFatigue(7); // a strength scroll
    g.mana.success('Bombardo');
    g.mana.duelWon();
    assert.equal(g.mana.max, 43);
    g.combat.die(null, 'test');
    g.combat.revive();
    assert.equal(g.mana.max, 37, '30 + the scroll');
    assert.equal(g.mana.growth, 0);
    assert.equal(g.combat.fatigue, 37);
    const { g: g2 } = fakeGame();
    g2.mana.success('Sapira');
    g2.combat.die(null, 'test');
    g2.combat.revive();
    assert.equal(g2.mana.max, 30);
});

test('mana: the maximum and the strong spells counted are saved with the player', () => {
    const { g } = fakeGame();
    g.mana.success('AvadaKedavra');
    g.mana.success('Levitation');
    const snap = JSON.parse(JSON.stringify(playerSnapshot(g)));
    assert.deepEqual(snap.mana, { growth: 5, strong: ['AvadaKedavra'] });
    const { g: g2 } = fakeGame();
    applyPlayerSnapshot(g2, snap);
    assert.equal(g2.mana.max, 35);
    assert.equal(g2.mana.success('AvadaKedavra'), 1, 'its +3 was already given');
});

test('mana: a duel charge that hits counts; a clash won + the opponent killed = +5', () => {
    const { g } = fakeGame();
    g.scene = new THREE.Scene();
    const duel = Object.create(Duel.prototype);
    duel.game = g;
    duel.bolts = new Map();
    duel.clashes = [];
    Object.defineProperty(duel, 'me', { get: () => 'me' });
    duel._burst = () => {};
    duel.bolts.set('b1', { id: 'b1', by: 'me', spell: 'SapiraDuel', front: new THREE.Vector3() });
    duel._end(duel.bolts.get('b1'), 'hit', false);
    assert.equal(g.mana.max, 31, 'Sapira hit');
    const a = { id: 'x', by: 'me', spell: 'AvadaKedavra', front: new THREE.Vector3() };
    const b = { id: 'y', by: 'enemy', spell: 'Stupefy', front: new THREE.Vector3() };
    duel._finishClash({ a, b, marks: [0xffffff, 0xffffff] }, 'enemy');
    assert.equal(g.mana.max, 35, 'Avada hit: +1, first strong +3');
    assert.equal(duel.opponentDied('someone-else'), false);
    assert.equal(duel.opponentDied('enemy'), true);
    assert.equal(g.mana.max, 40, 'a real duel won: +5');
    assert.equal(duel.opponentDied('enemy'), false, 'only once');
});

test('mana: the giant spider gives +20 to whoever killed it', () => {
    const { g } = fakeGame('survival');
    g.authority = true;
    g.scene = new THREE.Scene();
    g.items = { spawnLoose() {} };
    const sp = new Spiders(g);
    const s = sp.spawn(new THREE.Vector3(0, 0, 0), 'sp1', 10);
    sp.hit(s, 4, 'melee', 'friend');
    sp.hit(s, 10, 'Bombardo'); // the last blow is mine
    assert.ok(s.dead);
    assert.equal(g.mana.max, 50);
    const s2 = sp.spawn(new THREE.Vector3(0, 0, 0), 'sp2', 5);
    sp.hit(s2, 10, 'arrow', 'friend');
    assert.equal(s2.killer, 'friend');
    assert.equal(g.mana.max, 50, 'a friend\'s kill is theirs');
});
