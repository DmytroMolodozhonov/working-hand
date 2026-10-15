import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat } from '../../src/game/Combat.js';
import { Mana, MANA, FIRST_SPELL, NOT_SPELLS, SAME_SPELL, MAGIC_KILL, firstSpellGain, duelGain, animalMagicKind, creditKill, GOD_SPELLS } from '../../src/game/Mana.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { readFileSync } from 'node:fs';
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

test('mana: base 30; only the FIRST success of each spell grows the maximum, by its strength', () => {
    const { g, toasts } = fakeGame();
    assert.equal(g.mana.max, MANA.BASE);
    assert.equal(MANA.BASE, 30);
    assert.equal(g.mana.success('Levitation'), 1);
    assert.equal(g.mana.max, 31);
    assert.equal(g.mana.success('Levitation'), 0, 'again: nothing (no more +1 a cast)');
    assert.equal(g.mana.success('Wind'), 1);
    assert.equal(g.mana.success('WindMaxima'), 3, 'a Maxima form is its own spell');
    assert.equal(g.mana.max, 35);
    assert.ok(toasts.some((t) => t.includes('Первое «Вайнд Максима»') && t.includes('+3')), toasts.join('|'));
    assert.equal(g.mana.success('Stop'), 0, 'not a spell');
    assert.equal(g.mana.success('WallRise'), 2, 'Breakthrough reported by its wall');
    assert.equal(g.mana.success('Breakthrough'), 0, 'the same spell');
});

test('mana: the table — every spell matchSpell / SPELL_COST knows has its bonus: simple 1, medium 2–5, strong up to 20', () => {
    const src = readFileSync(new URL('../../src/fx/SpellManager.js', import.meta.url), 'utf8');
    const names = new Set([...src.matchAll(/return '([A-Z][A-Za-z]+)'/g)].map((m) => m[1]).concat(Object.keys(SPELL_COST)));
    for (const m of src.matchAll(/'([A-Z][A-Za-z]+Maxima)'/g)) names.add(m[1]);
    for (const n of names) assert.ok(n in FIRST_SPELL || n in SAME_SPELL || NOT_SPELLS.has(n), `${n}: no first-success bonus in the table (or NOT_SPELLS)`);
    for (const [n, v] of Object.entries(FIRST_SPELL)) assert.ok(v >= 1 && v <= (GOD_SPELLS.has(n) ? 100 : 20), n); // (the gods' scrolls: +100 — the author)
    for (const n of ['Lumos', 'Accio', 'Gather', 'CreateWall', 'Fire', 'Wind']) assert.equal(firstSpellGain(n), 1, n);
    for (const n of ['LightningStrike', 'TotalDestruction', 'Hellfire', 'WaterVortexSuperMaxima']) assert.ok(firstSpellGain(n) >= 12, n);
    assert.equal(firstSpellGain('Hellfire'), 20);
    assert.ok(firstSpellGain('BombardoMaxima') > firstSpellGain('Bombardo'));
});

test('mana: a duel won — 30% of (the opponent\'s maximum − 30), at least +1; a magical creature once per kind; a crystal +5', () => {
    assert.equal(duelGain(30), 1);
    assert.equal(duelGain(20), 1);
    assert.equal(duelGain(35), 2, '1.5 → 2');
    assert.equal(duelGain(40), 3, 'a teacher');
    assert.equal(duelGain(80), 15, 'the Master');
    const { g, toasts } = fakeGame();
    assert.equal(g.mana.duelWon(40), 3);
    assert.ok(toasts.some((t) => t.includes('соперник повержен: +3')));
    assert.equal(g.mana.magicKill('spider'), 20);
    assert.equal(g.mana.magicKill('spider'), 0, 'the second spider: nothing');
    assert.equal(g.mana.magicKill('pegasus'), MAGIC_KILL.pegasus.n);
    assert.ok(toasts.some((t) => t.includes('Пегас: +8')));
    assert.equal(g.mana.magicKill('cow'), 0, 'an ordinary animal');
    g.mana.crystal();
    assert.equal(g.mana.max, 30 + 3 + 20 + 8 + 5);
    assert.equal(g.combat.fatigue, g.mana.max, 'the mana in it grows too');
});

test('mana: a duel won without a kill +1…+3 at random; each opponent counts once (a win once, a kill once)', () => {
    const { g } = fakeGame();
    assert.equal(g.mana.duelWonAlive('w1', () => 0), 1);
    assert.equal(g.mana.duelWonAlive('w1', () => 0.99), 0, 'the same one lifted again: nothing');
    assert.equal(g.mana.duelWonAlive('w2', () => 0.99), 3);
    assert.equal(g.mana.duelWon(80, 'w1'), 15, 'then killed in a duel: the kill still counts');
    assert.equal(g.mana.duelWon(80, 'w1'), 0, 'killed again (a player came back): nothing');
    assert.equal(g.mana.max, 30 + 1 + 3 + 15);
    g.mana.onDeath();
    assert.equal(g.mana.duelWonAlive('w1', () => 0), 1, 'after my death: earned again');
});

test('mana: which animals are magical', () => {
    assert.equal(animalMagicKind({ type: 'horse', pegasus: true }), 'pegasus');
    assert.equal(animalMagicKind({ type: 'horse' }), null);
    assert.equal(animalMagicKind({ type: 'cow' }), null);
    assert.equal(animalMagicKind({ type: 'cow', guard: 'bull', form: 2 }), 'bronzeBull');
    assert.equal(animalMagicKind({ type: 'cow', guard: 'bull', form: 0 }), null, 'not turned: an ordinary cow');
    assert.equal(animalMagicKind({ type: 'sheep', guard: 'ram', form: 2 }), 'minotaur');
    assert.equal(animalMagicKind({ type: 'sheep' }), null);
    assert.equal(animalMagicKind({ type: 'pig' }), 'wingedPig');
    assert.equal(animalMagicKind({ type: 'runbook' }), 'runningBook');
});

test('mana: the host credits a kill — mine grows here, a guest\'s is sent to him', () => {
    const { g } = fakeGame();
    const sent = [];
    g.remotes = new Map([['guest', {}]]);
    g.sync = { manaCredit: (to, m) => sent.push([to, m]) };
    creditKill(g, 'me', { kind: 'minotaur' });
    assert.equal(g.mana.max, 42);
    creditKill(g, 'guest', { kind: 'dragon' });
    assert.deepEqual(sent, [['guest', { kind: 'dragon' }]]);
    assert.equal(g.mana.max, 42);
    creditKill(g, 'z17', { kind: 'dragon' }); // (a zombie / a villager: nobody to grow)
    assert.equal(sent.length, 1);
});

test('mana: death → back to 30 (a burnt strength scroll stays)', () => {
    const { g } = fakeGame();
    g.combat.addMaxFatigue(7); // a strength scroll
    g.mana.success('Bombardo');
    g.mana.duelWon(40);
    assert.equal(g.mana.max, 42);
    g.combat.die(null, 'test');
    g.combat.revive();
    assert.equal(g.mana.max, 37, '30 + the scroll');
    assert.equal(g.mana.growth, 0);
    assert.equal(g.combat.fatigue, 37);
    const { g: g2 } = fakeGame();
    g2.mana.success('Sapira');
    g2.mana.magicKill('pegasus');
    g2.combat.die(null, 'test');
    g2.combat.revive();
    assert.equal(g2.mana.max, 30);
    assert.equal(g2.mana.success('Sapira'), 2, 'the firsts are lost with the growth: earned again');
    assert.equal(g2.mana.magicKill('pegasus'), 8);
});

test('mana: the maximum, the spells and creatures already counted are saved with the player', () => {
    const { g } = fakeGame();
    g.mana.success('AvadaKedavra');
    g.mana.success('Levitation');
    g.mana.magicKill('pegasus');
    const snap = JSON.parse(JSON.stringify(playerSnapshot(g)));
    assert.deepEqual(snap.mana, { growth: 19, spells: ['AvadaKedavra', 'Levitation'], kills: ['pegasus'] });
    const { g: g2 } = fakeGame();
    applyPlayerSnapshot(g2, snap);
    assert.equal(g2.mana.max, 49);
    assert.equal(g2.mana.success('AvadaKedavra'), 0, 'already given');
    assert.equal(g2.mana.magicKill('pegasus'), 0);
    const { g: g3 } = fakeGame();
    g3.mana.restore({ growth: 4, strong: ['Hellfire'] }); // (an older save)
    assert.equal(g3.mana.success('Hellfire'), 0);
});

test('mana: a duel charge that hits counts (the first time); a clash won + the opponent killed = a duel won', () => {
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
    assert.equal(g.mana.max, 32, 'Sapira hit: its first time +2');
    duel.bolts.set('b2', { id: 'b2', by: 'me', spell: 'SapiraDuel', front: new THREE.Vector3() });
    duel._end(duel.bolts.get('b2'), 'hit', false);
    assert.equal(g.mana.max, 32, 'again: nothing');
    const a = { id: 'x', by: 'me', spell: 'AvadaKedavra', front: new THREE.Vector3() };
    const b = { id: 'y', by: 'enemy', spell: 'Stupefy', front: new THREE.Vector3() };
    duel._finishClash({ a, b, marks: [0xffffff, 0xffffff] }, 'enemy');
    assert.equal(g.mana.max, 42, 'Avada hit: its first time +10');
    assert.equal(duel.opponentDied('someone-else'), false);
    assert.equal(duel.opponentDied('enemy', 40), true);
    assert.equal(g.mana.log.at(-1).why, 'duel');
    assert.equal(g.mana.max, 45, 'a real duel won against a maximum of 40: +3');
    assert.equal(duel.opponentDied('enemy'), false, 'only once');    duel._won = { id: 'wiz7', at: performance.now() - 9000 }; // (a clash won 9 s ago, he still lives)
    duel._wonAlive();
    assert.equal(g.mana.log.at(-1).why, 'duelAlive');
    assert.ok(g.mana.max >= 46 && g.mana.max <= 48);
    assert.equal(duel._won, null);
});

test('mana: the giant spider gives +20 to whoever killed it — the first one only', () => {
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
    const s3 = sp.spawn(new THREE.Vector3(0, 0, 0), 'sp3', 5);
    sp.hit(s3, 10, 'Bombardo');
    assert.ok(s3.dead);
    assert.equal(g.mana.max, 50, 'the second spider: nothing');
});
