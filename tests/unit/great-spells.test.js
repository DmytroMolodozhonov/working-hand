// «Circle Attack» (+ Maxima) and «Inspirius» — the two mightiest spells (CircleAttack.js, Inspirius.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { CIRCLE, circleForm, circleFront, circleDamage, circleThrow, circleBlock, CircleAttack } from '../../src/game/CircleAttack.js';
import { INSP, inspiriusDamage, inspiriusThrow, inspiriusFront, inspiriusBlock, craterSphere } from '../../src/game/Inspirius.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { firstSpellGain } from '../../src/game/Mana.js';
import { rollKeyItem, LOOT_FOR, SCROLL_SPELL_COLOR } from '../../src/game/ItemTypes.js';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { ruinArea } from '../../src/world/Ruin.js';

test('the words: «Circle Attack» / «… Maxima» and «Inspirius», as the Russian recognizer writes them; talk never casts them', () => {
    for (const t of ['Circle Attack', 'circle attack', 'сёркл аттак', 'серкл атак', 'сиркл аттак', 'круговая атака']) assert.equal(matchSpell(t), 'CircleAttack', t);
    for (const t of ['Circle Attack Maxima', 'сёркл аттак максима', 'серкл атак макс']) assert.equal(matchSpell(t), 'CircleAttackMaxima', t);
    for (const t of ['Inspirius', 'инспириус', 'инспирус', 'инспайриус']) assert.equal(matchSpell(t), 'Inspirius', t);
    assert.notEqual(matchSpell('это была инспирация'), 'Inspirius');
    assert.equal(matchSpell('атака'), 'Attack');
    assert.equal(matchSpell('wave attack'), 'WaveAttack');
    assert.equal(matchSpell('Total Destruction'), 'TotalDestruction');
});

test('Circle Attack: mana as «Total Destruction» (80 / 160), its zones 30 / 20 / 10, the island safe, the close ones fly further', () => {
    assert.equal(SPELL_COST.CircleAttack, SPELL_COST.TotalDestruction);
    assert.equal(SPELL_COST.CircleAttackMaxima, SPELL_COST.TotalDestructionMaxima);
    const f = circleForm(false), M = circleForm(true);
    assert.equal(f.R, 30);
    assert.equal(circleDamage(1, f), 0, 'the island');
    assert.equal(circleDamage(5, f), 30);
    assert.equal(circleDamage(15, f), 20);
    assert.equal(circleDamage(28, f), 10);
    assert.equal(circleDamage(40, f), 0);
    assert.ok(M.R > f.R && M.zones[0] > f.zones[0] && M.rays[1] > f.rays[1], 'Maxima: much stronger');
    assert.ok(circleThrow(5, f).speed > circleThrow(25, f).speed && circleThrow(5, f).toss > circleThrow(25, f).toss);
    // the wave: the near ones at once, the far ones a couple of seconds later; all of it in 7 s
    assert.ok(circleFront(0.4, 30) > 5);
    assert.ok(circleFront(2, 30) < 25);
    assert.equal(circleFront(CIRCLE.FRONT_T, 30), 30);
    assert.ok(CIRCLE.TIME === 7);
    assert.equal(circleBlock({ enabled: true, max: 90, mana: 90 }, f), 'max');
    assert.equal(circleBlock({ enabled: true, max: 150, mana: 50 }, f), 'mana');
    assert.equal(circleBlock({ enabled: true, max: 150, mana: 150 }, M), 'max');
    assert.equal(circleBlock({ enabled: false }, M), null, 'Creative');
    assert.ok(firstSpellGain('CircleAttack') >= 12 && firstSpellGain('CircleAttackMaxima') === 20);
});

test('Circle Attack: arms in a T; it hurts and throws every creature its front reaches — never the wizard on his island', () => {
    const hits = [], thrown = [];
    const near = { group: { position: new THREE.Vector3(6, 0, 0) }, isDead: false };
    const far = { group: { position: new THREE.Vector3(27, 0, 0) }, isDead: false };
    const isl = { group: { position: new THREE.Vector3(1, 0, 0) }, isDead: false };
    let tpose = false;
    const g = {
        authority: true, localId: 'me', config: { mode: 'freeworld' }, remotes: new Map(),
        zombies: [near, far, isl],
        character: { group: { position: new THREE.Vector3(0, 2, 0) }, isTPose: () => tpose },
        combat: { enabled: true, maxFatigue: 120, fatigue: 100, check: () => null, pay() { this.fatigue -= 80; }, damage() { throw new Error('the wizard was hurt'); } },
        hud: { setVoice() {} },
        damageZombie: (z, dmg) => hits.push([z, dmg]),
        creatureImpact: { apply: (c, o) => thrown.push([c, o]) },
    };
    const C = new CircleAttack(g);
    // the rays: 3–5 of the creatures in the circle (never one on the island)
    const rays = C._pickRays(new THREE.Vector3(0, 0, 0), circleForm(false));
    assert.equal(rays.length, 2, 'only two creatures out of the island here');
    g.zombies.push(...Array.from({ length: 8 }, (_, i) => ({ group: { position: new THREE.Vector3(10, 0, i) }, isDead: false })));
    const r2 = C._pickRays(new THREE.Vector3(0, 0, 0), circleForm(false));
    assert.ok(r2.length >= 3 && r2.length <= 5, `${r2.length}`);
    g.zombies.length = 3;
    C._pickRays = () => []; // (the wave alone below)
    assert.equal(C.cast(true), null, 'arms not in a T');
    tpose = true;
    assert.equal(C.cast(false), null, 'unfinished: maybe «…Максима»');
    assert.equal(C.cast(true), 'CircleAttack');
    assert.equal(g.combat.fatigue, 20);
    for (let t = 0; t < 1; t += 0.05) C.update(0.05);
    assert.deepEqual(hits.map((h) => h[1]), [30], 'the near one at once');
    for (let t = 0; t < 7; t += 0.05) C.update(0.05);
    assert.deepEqual(hits.map((h) => h[1]), [30, 10], 'the far one later; the island never');
    assert.ok(thrown[0][1].toss > thrown[1][1].toss, 'the close one flies further');
    assert.equal(C.list.length, 0, 'over');
});

test('Inspirius: 500 mana at once, only with the wand (Creative — without), a maximum of 500; zones 100 / 50 / 25', () => {
    assert.equal(SPELL_COST.Inspirius, 500);
    assert.equal(inspiriusBlock({ enabled: true, max: 600, mana: 600, wand: false, creative: false }), 'wand');
    assert.equal(inspiriusBlock({ enabled: false, wand: false, creative: true }), null);
    assert.equal(inspiriusBlock({ enabled: true, max: 400, mana: 400, wand: true }), 'max');
    assert.equal(inspiriusBlock({ enabled: true, max: 500, mana: 499, wand: true }), 'mana');
    assert.equal(inspiriusBlock({ enabled: true, max: 500, mana: 500, wand: true }), null);
    assert.equal(inspiriusDamage(3), 100);
    assert.equal(inspiriusDamage(30), 50);
    assert.equal(inspiriusDamage(55), 25);
    assert.equal(inspiriusDamage(70), 0);
    assert.ok(inspiriusThrow(5).speed > inspiriusThrow(50).speed);
    assert.ok(INSP.SPEED * 5 > 50 && INSP.SPEED * 5 < 100, 'about 5 s of flight to a place 50–100 m off');
    assert.equal(inspiriusFront(INSP.SHOCK_T), INSP.HARM_R);
    // the pit: R across the top, D deep at the middle (deeper towards the centre)
    const S = craterSphere({ x: 0, y: 0, z: 0 });
    assert.ok(Math.abs(Math.hypot(INSP.CRATER_R, S.y) - S.r) < 1e-6, 'the rim at the ground');
    assert.ok(Math.abs(S.y - S.r + INSP.CRATER_DEPTH) < 1e-6, 'the bottom');
    assert.ok(firstSpellGain('Inspirius') === 20);
});

test('Inspirius: its scroll turns up only for a wizard whose mana maximum is already 500', () => {
    assert.ok(SCROLL_SPELL_COLOR.Inspirius, 'learnt from a scroll outside Creative');
    const roll = (n) => { let k = 0; for (let i = 0; i < n; i++) { const it = rollKeyItem(); if (it.spell === 'Inspirius') k++; } return k; };
    LOOT_FOR.maxMana = 499;
    assert.equal(roll(4000), 0);
    LOOT_FOR.maxMana = 500;
    assert.ok(roll(4000) > 0);
    LOOT_FOR.maxMana = 0;
});

test('the wave brings the ground down band by band: the island stays, every band once, the ridge thrown up', () => {
    const d = new TerrainData(); d.generate({ seed: 1 });
    for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) for (let L = 1; L <= 4; L++) d.set(x, L, z, BLOCK.CS_GREY); // (a stone yard)
    let gone = 0, heaved = 0;
    for (let r = 3; r < 15; r += 3) { const o = ruinArea(d, 0, -0.5, 0, r + 3, null, { inner: r, full: 15 }); gone += o.removed.length; heaved += o.heaved.length; }
    assert.ok(gone > 1000, 'the yard came down');
    assert.equal(d.get(0, 3, 0), BLOCK.CS_GREY, 'the island in the middle stands');
    assert.ok(heaved > 0, 'the earth heaved up');
});
