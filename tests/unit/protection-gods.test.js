// «Protection Gods» / «… Maxima» (ProtectionGods.js): the voice, the price, what it holds for nothing, what the gods'
// own spells take from it, and its scrolls — only in the gods' temple, never on the Earth.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat, SPELL_COST } from '../../src/game/Combat.js';
import { PGODS, DIVINE_SPELLS, divineHitCost, payDivine, godsKeepsOff } from '../../src/game/ProtectionGods.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { GOD_SPELLS, firstSpellGain } from '../../src/game/Mana.js';
import { TEMPLE_SCROLLS, templePlan } from '../../src/world/GodsTemple.js';
import { mayCast } from '../../src/game/Concentration.js';
import { rollScroll, rollLoot, rollKeyItem, rollDragonLoot, rollIceQueenLoot, rollHouseLoot, rollPortLoot, LOOT_FOR } from '../../src/game/ItemTypes.js';
import { readFileSync } from 'node:fs';

function fakeGame({ tPose = false, mode = 'freeworld' } = {}) {
    const voice = [];
    const g = {
        config: { mode }, scene: new THREE.Scene(), localId: 'me', knockback: new THREE.Vector3(), remotes: new Map(),
        fx: { spark() {}, lightFlash() {} },
        hud: { update() {}, setFatigue() {}, setStatus() {}, setFrozenOverlay() {}, damageFlash() {}, setVoice(t) { voice.push(t); } },
        character: {
            group: { position: new THREE.Vector3(0, 0.5, 0) },
            getHandWorldPosition: (side, out = new THREE.Vector3()) => out.set(0.6, 1.2, -1.5),
            getHandDirection: (side, out = new THREE.Vector3()) => out.set(0, 0, -1),
            isArmExtended: (side) => side === 'right',
            isTPose: () => tPose,
        },
        wandSide: () => null, playerName: () => 'Враг', onLocalDeath() {},
    };
    return { g, voice, c: new Combat(g) };
}

test('the voice: «Protection Gods», «Протекшн Гадс», «Божественная защита» (… Максима) — never the plain shield, the plain one stays', () => {
    for (const t of ['Protection Gods', 'протекшн гадс', 'Протекшн Годс', 'Божественная защита']) assert.equal(matchSpell(t), 'ProtectionGods', t);
    for (const t of ['Protection Gods Maxima', 'протекшн гадс максима', 'Божественная защита Максима']) assert.equal(matchSpell(t), 'ProtectionGodsMaxima', t);
    assert.equal(matchSpell('Protection'), 'Protection');
    assert.equal(matchSpell('Protection Maxima'), 'ProtectionMaxima');
    assert.equal(matchSpell('Protection House'), 'ProtectionHouse');
    assert.equal(matchSpell('с новым годом'), null);
});

test('the price: 100 at once + 3 a second, the dome 300 + 5; out of mana it goes out; it is held (concentration)', () => {
    assert.deepEqual([SPELL_COST.ProtectionGods, SPELL_COST.ProtectionGodsMaxima, PGODS.DRAIN, PGODS.DRAIN_MAX], [100, 300, 3, 5]);
    const { c } = fakeGame();
    c.fatigue = c.maxFatigue = 110;
    assert.equal(c.castProtection(false, true), null);
    assert.ok(c.shield.gods && c.shield.type === 1);
    assert.equal(c.fatigue, 10);
    c.update(1);
    assert.ok(Math.abs(c.fatigue - 7) < 1e-6, 'no mana comes back while it holds: −3 a second');
    c.update(3);
    assert.equal(c.shield, null, 'out of mana: it goes out');
    const d = fakeGame({ tPose: true }).c;
    d.fatigue = 299;
    assert.ok(d.castProtection(true, true), 'not enough for the dome');
    assert.ok(mayCast('GodsShield', 'Lumos') && !mayCast('GodsShield', 'Bombardo') && mayCast('GodsShield', 'ProtectionGodsMaxima'));
    // (Creative: free)
    const k = fakeGame({ mode: 'creative' }).c;
    k.fatigue = 0;
    assert.equal(k.castProtection(false, true), null);
    assert.ok(k.shield?.gods);
});

test('any spell not of the gods: nothing gets through and no mana is taken (the dome: from everywhere)', () => {
    const { c } = fakeGame({ tPose: true });
    c.fatigue = c.maxFatigue = 1000;
    c.castProtection(true, true);
    const m = c.fatigue, hp = c.hp, back = new THREE.Vector3(0, 1, 20);
    assert.equal(c.hitBySpell('Sapira', back, 'x'), false);
    c.explosion(new THREE.Vector3(1, 1, 0), 6, 3, 'x');
    for (const k of ['AvadaKedavra', 'TotalDestruction', 'Hellfire', 'Inspirius', 'Lightning', 'IceBall', 'Earthquake', 'CircleAttack']) c.damage(10, 'x', k);
    c.stun(5, 'x', 'stupefy');
    c.freeze('x');
    assert.equal(c.chillBy(1, back, 'x'), false);
    assert.equal(c.hp, hp);
    assert.equal(c.fatigue, m, 'no mana for what it holds');
    assert.ok(!c.stunned && !c.frozen);
    // (not a spell — a blade, an arrow, a beast — is as with an ordinary shield: the dome holds what faces… a blow by a knight still hurts)
    c.damage(2, null, 'knight');
    assert.equal(c.hp, hp - 2);
    assert.ok(!godsKeepsOff(c.shield, 'arrow') && godsKeepsOff(c.shield, 'Sapira'));
});

test('a spell of the gods: held, for half its price × the share of the blow; not enough — it breaks, the rest goes on', () => {
    assert.ok(DIVINE_SPELLS === GOD_SPELLS && TEMPLE_SCROLLS.every((n) => GOD_SPELLS.has(n)));
    assert.ok(GOD_SPELLS.has('Boom') && GOD_SPELLS.has('PlanetLiquidation') && GOD_SPELLS.has('ProtectionGods') && GOD_SPELLS.has('ProtectionGodsMaxima'));
    assert.equal(divineHitCost(750, 1), 375);
    assert.equal(divineHitCost(750, 0.2), 75);
    assert.deepEqual(payDivine(500, 750, 1), { mana: 125, pass: 0 });
    const half = payDivine(100, 1000, 1); // (cost 500, 100 of it paid: a fifth held)
    assert.equal(half.mana, 0);
    assert.ok(Math.abs(half.pass - 0.8) < 1e-9);
    const { c } = fakeGame({ tPose: true });
    c.fatigue = c.maxFatigue = 1000;
    c.castProtection(true, true);
    assert.equal(c.godsHit('Boom', null, 0.5), 0);
    assert.equal(c.fatigue, 700 - 187.5);
    assert.equal(c.godsHit('Sapira', null, 1), 0);
    assert.equal(c.fatigue, 512.5, 'not of the gods: nothing taken');
    const pass = c.godsHit('PlanetLiquidation', null, 1, 2000);
    assert.ok(pass > 0 && c.shield === null, 'out of mana: broken, the rest goes on');
    // («Дай»: the first blow breaks the shield — no mana, nothing gets through this time)
    const e = fakeGame({ tPose: true }).c;
    e.fatigue = e.maxFatigue = 1000;
    e.castProtection(true, true);
    const m1 = e.fatigue;
    assert.equal(e.godsHit('Die', null, 1), 0);
    assert.ok(e.shield === null && e.fatigue === m1, '«Дай» breaks it, takes no mana');
    assert.equal(e.godsHit('Die', null, 1), 1, 'the next one gets through');
    assert.ok(firstSpellGain('ProtectionGods') === 100 && firstSpellGain('ProtectionGodsMaxima') === 100);
});

test('the scrolls: each on its own pedestal of the gods\' library — and never on the Earth (chests, merchants, bosses, towers)', () => {
    const plan = templePlan(7);
    for (const n of ['ProtectionGods', 'ProtectionGodsMaxima']) assert.equal(plan.pedestals.filter((p) => p.spell === n).length, 1, n);
    let seed = 1;
    const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const found = new Set();
    const note = (x) => { for (const it of [].concat(x || [])) if (it?.spell) found.add(it.spell); };
    for (const mm of [0, 500, 5000]) {
        LOOT_FOR.maxMana = mm;
        for (let i = 0; i < 4000; i++) {
            note(rollScroll(r)); note(rollKeyItem(r));
            for (const f of [rollLoot, rollDragonLoot, rollIceQueenLoot, rollHouseLoot, rollPortLoot]) { try { note(f(r)); } catch { /* (a roll that wants more) */ } }
        }
    }
    LOOT_FOR.maxMana = 0;
    for (const n of GOD_SPELLS) assert.ok(!found.has(n), `${n} came out of a chest on the Earth`);
    // the other ways a spell is learnt on the Earth name their spells: none of the gods'
    for (const f of ['src/game/WizardShop.js', 'src/game/BookBirds.js', 'src/game/WizardTowerLife.js', 'src/game/HouseMagic.js']) {
        let t = '';
        try { t = readFileSync(new URL('../../' + f, import.meta.url), 'utf8'); } catch { continue; }
        for (const n of ['ProtectionGods', 'ProtectionGodsMaxima']) assert.ok(!t.includes(`'${n}'`), `${f} names ${n}`);
    }
});
