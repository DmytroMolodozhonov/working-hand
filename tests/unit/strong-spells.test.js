// The strong duel spells (StrongSpells.js / StrongMagic.js): «Акцентрик», «Пилбидрио», «Электром», «Дай»; «Айс» = «Frozen».
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { spellPhrase } from '../../src/audio/SpellPhrase.js';
import { SPELL_COST, Combat } from '../../src/game/Combat.js';
import { GOD_SPELLS, firstSpellGain } from '../../src/game/Mana.js';
import { TEMPLE_SCROLLS, templePlan } from '../../src/world/GodsTemple.js';
import { rollScroll, LOOT_FOR } from '../../src/game/ItemTypes.js';
import { STRONG, clashPower, dieWords, accentricK, isTitan } from '../../src/game/StrongSpells.js';
import { StrongMagic } from '../../src/game/StrongMagic.js';
import { dragonDamage, DRAGON_HP } from '../../src/game/DragonKinds.js';
import { mayCast } from '../../src/game/Concentration.js';

test('«Дай»: only the whole phrase, one word — never «дай мне», «да й», «дайте», «дай посмотреть»', () => {
    for (const t of ['дай', 'Дай!', 'Die', 'дия']) assert.equal(matchSpell(t), 'Die', t);
    for (const t of ['дай мне', 'да й', 'дайте', 'дай посмотреть', 'давай', 'дай-ка мне', 'ну дай', 'дай мне мою силу', 'подай']) assert.notEqual(matchSpell(t), 'Die', t);
    assert.equal(matchSpell('дай мне мою силу'), 'GiveMyPower');
    assert.ok(!dieWords('дай дай') && dieWords(' дай '));
    assert.equal(spellPhrase('дай мне').ok, false);
});

test('the words: «Акцентрик», «Пилбидрио», «Электром»; «Айс» and «Frozen» one spell, «Айс Максима» = «Frozen Maxima» = «Ice Maxima»', () => {
    for (const [t, n] of [['Акцентрик', 'Accentric'], ['accentric', 'Accentric'], ['Пилбидрио', 'Pilbidrio'], ['Электром', 'Electrum'], ['electrum', 'Electrum'],
        ['айс максима', 'IceMaxima'], ['Frozen Maxima', 'IceMaxima'], ['ice maxima', 'IceMaxima']]) assert.equal(matchSpell(t), n, t);
    assert.equal(matchSpell('электромобиль'), null);
    assert.equal(SPELL_COST.Ice, SPELL_COST.Frozen);
    assert.deepEqual([SPELL_COST.Ice, SPELL_COST.IceMaxima, SPELL_COST.Accentric, SPELL_COST.Pilbidrio, SPELL_COST.Electrum, SPELL_COST.Die], [5, 20, 50, 100, 50, 1000]);
    assert.deepEqual([clashPower('Accentric'), clashPower('Pilbidrio'), clashPower('Die'), clashPower('Electrum'), clashPower('Stupefy')], [1.2, 1.4, 5, 1, 1]);
    assert.ok(mayCast('Electrum', 'Electrum') && !mayCast('Electrum', 'Bombardo'), '«Электром» is held');
});

test('«Дай» is a spell of the gods: +100 cells, its scroll only in the gods\' temple — never on the Earth; the others from chests (Пилбидрио rarer)', () => {
    assert.ok(GOD_SPELLS.has('Die') && TEMPLE_SCROLLS.includes('Die'));
    assert.equal(firstSpellGain('Die'), 100);
    assert.equal(templePlan(7).pedestals.filter((p) => p.spell === 'Die').length, 1);
    let seed = 3;
    const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const n = {};
    for (const mm of [0, 5000]) { LOOT_FOR.maxMana = mm; for (let i = 0; i < 20000; i++) { const s = rollScroll(r).spell; if (s) n[s] = (n[s] || 0) + 1; } }
    LOOT_FOR.maxMana = 0;
    assert.ok(!n.Die, '«Дай» came out of a chest');
    assert.ok(n.Accentric > 0 && n.Electrum > 0 && n.Pilbidrio > 0 && n.Pilbidrio < n.Accentric);
});

test('Accentric on me: blurred about a minute (fading from the 40th second), −5 HP/s — 40 in all', () => {
    assert.equal(accentricK(10), 1);
    assert.ok(accentricK(50) > 0 && accentricK(50) < 1 && accentricK(61) === 0);
    const g = { config: { mode: 'freeworld' }, localId: 'me', remotes: new Map(), fx: null, hud: { setVoice() {}, flashColor() {}, damageFlash() {}, setStatus() {}, update() {} },
        character: { group: { position: new THREE.Vector3() } }, onLocalDeath() {}, playerName: () => 'x' };
    g.combat = new Combat(g);
    g.combat.maxHp = g.combat.hp = 100;
    const s = new StrongMagic(g);
    s.hitMe('Accentric', 'x');
    for (let t = 0; t < 62; t += 0.1) s._meUpdate(0.1);
    assert.ok(Math.abs(g.combat.hp - 60) < 0.01, `−40: ${g.combat.hp}`);
    assert.equal(s.accMe, null, 'over after a minute');
    assert.ok(!isTitan({}) && isTitan({ cls: 'titan' }));
});

/** A small world with one dragon (500 HP), its damage by DragonKinds — the host decides. */
function dragonWorld() {
    const d = { id: 'd1', hp: DRAGON_HP, dead: false, model: { position: new THREE.Vector3(), visible: true } };
    const g = { authority: true, localId: 'me', hud: { setVoice() {} }, fx: null };
    g.dragons = {
        list: [d],
        byId: (id) => (id === d.id && !d.dead ? d : null),
        hit(x, dmg, kind) { if (x.dead) return; x.hp -= dragonDamage(kind, dmg).dmg; if (x.hp <= 0) { x.hp = 0; x.dead = true; } },
    };
    // its body: a capsule from the chest (a) to the tail (b) at 3 m
    g.duel = { _bodyOf: (k, id, e) => (k === 'D' && !d.dead ? Object.assign(e, { a: new THREE.Vector3(0, 3, -2.6), b: new THREE.Vector3(0, 3, 2.8), r: 1.9 }) : null) };
    g.strong = new StrongMagic(g);
    return { g, d };
}

test('how to beat a dragon (the author): «Бомбардо» it, slow it with «Айс Максима», then the long spell — «Электром», and «Пилбидрио» blows it apart', () => {
    const { g, d } = dragonWorld();
    const S = g.strong;
    for (let i = 0; i < 3; i++) g.dragons.hit(d, 36, 'Bombardo'); // (three «Бомбардо Максима»: 12 × 3 each)
    assert.equal(d.hp, 500 - 108);
    // plain «Айс» does nothing to it; «Айс Максима» in a leg: it limps 10 s, −10/s
    assert.ok(S.boltHit('D', d, 'IceDuel', 'me', new THREE.Vector3(0, 3, 0)));
    assert.equal(d.hp, 392, 'plain ice: no effect');
    S.boltHit('D', d, 'IceDuelMaxima', 'me', new THREE.Vector3(0, 1.4, 1.5));
    assert.ok(d.iceSlowT === 10 && d.iceSlowK <= 0.3, 'a leg in ice: it limps');
    for (let t = 0; t < 10.3; t += 0.1) S.update(0.1);
    assert.ok(Math.abs(d.hp - 292) < 1, `−10/s × 10 s: ${d.hp}`);
    // «Айс Максима» in the face: it can't strike 10 s
    S.boltHit('D', d, 'IceDuelMaxima', 'me', new THREE.Vector3(0, 3.5, -2.5));
    assert.ok(d.iceHeadT === 10 && d.blind === 10);
    S.dots.length = 0; d.hp = 292;
    // «Электром» held 10 s: −25, then −20/s
    S.hitCreature('D', d, 'Electrum', 'me');
    for (let i = 0; i < 40; i++) S._tickCreature('me', 'D', 'd1', STRONG.Electrum.dps * STRONG.Electrum.tick);
    assert.ok(Math.abs(d.hp - 67) < 1, `Электром: ${d.hp}`);
    // «Пилбидрио»: ≤ 80 left — it bursts
    S.hitCreature('D', d, 'Pilbidrio', 'me');
    assert.ok(d.dead && d.burst && !d.model.visible, 'blown apart');
});

test('«Дай» kills a dragon at once, whatever its HP; a titan (another class) it does not', () => {
    const { g, d } = dragonWorld();
    g.strong.hitCreature('D', d, 'Die', 'me');
    assert.ok(d.dead && d.annihilated && !d.model.visible);
    const t = { id: 't', titan: true };
    assert.equal(g.strong.annihilate('v', t, 'me'), false);
    assert.ok(!t.annihilated);
});

test('«Дай» on me: the gods\' shield is only broken by the first; with no shield — dead, no body, the old power gone', async () => {
    const { Duel } = await import('../../src/game/Duel.js');
    const voice = [];
    const g = {
        config: { mode: 'freeworld' }, localId: 'me', remotes: new Map(), knockback: new THREE.Vector3(), fx: { spark() {}, lightFlash() {} },
        hud: { setVoice: (t) => voice.push(t), flashColor() {}, damageFlash() {}, setStatus() {}, update() {}, setFrozenOverlay() {} },
        character: { group: { position: new THREE.Vector3(), rotation: { y: 0 } }, getHandWorldPosition: (s, o = new THREE.Vector3()) => o.set(0, 1, -1), getHandDirection: (s, o = new THREE.Vector3()) => o.set(0, 0, -1), isArmExtended: () => true, isTPose: () => true },
        wandSide: () => null, playerName: () => 'Враг', deaths: [], onLocalDeath(text, by) { this.deaths.push({ text, by, how: this._deathHow }); },
    };
    g.combat = new Combat(g);
    g.combat.fatigue = g.combat.maxFatigue = 1000;
    g.strong = new StrongMagic(g);
    const duel = Object.assign(Object.create(Duel.prototype), { game: g, log: [], _t: 0, bolts: new Map(), clashes: [], _burst() {}, _hitBurst() {}, _handOf: () => false, _note() {} });
    g.duel = duel;
    g.combat.castProtection(true, true); // (the gods' dome)
    const bolt = () => { const b = { id: 'x:' + Math.random(), by: 'x', spell: 'Die', side: 'right', o: new THREE.Vector3(0, 1, -10), dir: new THREE.Vector3(0, 0, 1), front: new THREE.Vector3(0, 1, -1), state: 'arrived', meWait: 9 }; duel.bolts.set(b.id, b); return b; };
    const mana = g.combat.fatigue;
    duel._arriveAtMe(bolt());
    assert.equal(g.combat.shield, null, 'the gods\' shield broken');
    assert.equal(g.combat.fatigue, mana, 'no mana taken');
    assert.ok(!g.combat.dead, 'and alive');
    duel._arriveAtMe(bolt());
    assert.ok(g.combat.dead, 'the second kills');
    assert.equal(g.deaths[0].how, 'annihilate');
});

test('«Электром» on a dragon / the spider: the charge ends as a HIT (so the held lightning starts), not a fizzle', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../src/game/Duel.js', import.meta.url), 'utf8');
    for (const k of ["'s'", "'D'"]) {
        const line = src.split('\n').find((l) => l.includes(`b.tk === ${k} && this._referee()`) && l.includes('boltHit'));
        assert.ok(line, `arrive line for ${k}`);
        assert.match(line, /b\.spell === 'Electrum' \? 'hit' : 'fizzle'/, `Electrum on ${k} must end as a hit`);
    }
    assert.ok(STRONG.Electrum.drain > 0 && STRONG.Electrum.dps > 0, 'held: mana per second, damage per second');
});

test('range: «Электром» 2× (60 м), «Пилбидрио» 2,5× (75 м), the rest 30 м', async () => {
    const { legacyRange: duelRange } = await import('../../src/game/Duel.js');
    assert.equal(duelRange('Electrum'), 60);
    assert.equal(duelRange('Pilbidrio'), 75);
    assert.equal(duelRange('Stupefy'), 30);
    assert.ok(STRONG.Electrum.reach >= duelRange('Electrum'), 'the held lightning stays on a target the charge could hit');
});

test('«Электром» held on a dragon: lasts until «стоп» — not a flash (hand on it, mana, ticks per second)', () => {
    const { g, d } = dragonWorld();
    const S = g.strong;
    const tp = new THREE.Vector3(0, 3, 0);
    g.duel._targetPos = (b, out) => (b.tk === 'D' && !d.dead ? out.copy(tp) : null);
    g.duel._myRay = (side, o, dir) => { o.set(0, 3, 20); dir.set(0, 0, -1); };
    g.duel._drawBolt = () => {};
    let mana = 100;
    g.combat = { dead: false, frozen: false, stunned: false, drain: (a) => { mana -= a; return mana > 0; } };
    g.character = { isArmRaised: () => true };
    g.wandSide = () => 'right';
    S.startElectrum('right', 'D', 'd1');
    assert.ok(S.electrum, 'started');
    const hp0 = d.hp;
    for (let t = 0; t < 6; t += 1 / 60) S.update(1 / 60);
    assert.ok(S.electrum, 'still held after 6 s');
    assert.ok(hp0 - d.hp > 100, `−20/s for 6 s: ${hp0 - d.hp}`);
    assert.ok(Math.abs(100 - mana - 18) < 1, `3 mana/s: ${100 - mana}`);
    assert.ok(S.stopElectrum('stop') && !S.electrum, '«стоп» ends it');
    // the hand drifts off a moment (aiming at a moving dragon): not an instant break
    S.startElectrum('right', 'D', 'd1');
    g.duel._myRay = (side, o, dir) => { o.set(0, 3, 20); dir.set(1, 0, -0.3).normalize(); };
    for (let t = 0; t < 0.8; t += 1 / 60) S.update(1 / 60);
    assert.ok(S.electrum, 'a short slip of the hand does not break it');
});

test('«Электром»: the boss\'s own bolt-catcher (dragons/spiders boltAt) also ends the charge as a hit', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../src/game/Duel.js', import.meta.url), 'utf8');
    for (const k of ['spiders', 'dragons']) {
        const line = src.split('\n').find((l) => l.includes(`g.${k}?.boltAt(b.front`));
        assert.ok(line && /b\.spell === 'Electrum' \? 'hit' : 'fizzle'/.test(line), k);
    }
});
