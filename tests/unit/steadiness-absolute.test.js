// «Pentagranium Firmitas» — белая пентаграмма абсолютной устойчивости: 300 маны + волшебный камушек на круге → навсегда (до смерти) героя не сбить ничем.
// Правила (FirmRules.js), флаг (Steadiness.absolute), обряд (Firmitas.js), удары (BodyImpact / Knockdown), смерть и «Give Me My Power» (Legacy.js), камушек канариков.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FIRM, FIRM_HINT, FIRM_TARGETS, findPebble, absoluteStops, ABSOLUTE_EXEMPT } from '../../src/game/FirmRules.js';
import { Steadiness, holdChance } from '../../src/game/Steadiness.js';
import { Firmitas } from '../../src/game/Firmitas.js';
import { BodyImpact } from '../../src/game/BodyImpact.js';
import { Knockdown } from '../../src/game/Knockdown.js';
import { captureLegacy, wipeHero, absorbLegacy } from '../../src/game/Legacy.js';
import { PENTAGRAMS } from '../../src/game/Pentagrams.js';
import { figureOf, figureIds, pentagramScroll } from '../../src/game/PentagramRules.js';
import { pentagramWords, pentagramSpell, PENT_NAMES } from '../../src/game/PentagramWords.js';
import { ITEM_INFO, describeItem, itemValue, makeItemModel, SCROLL_WEIGHTS } from '../../src/game/ItemTypes.js';
import { PEBBLE, pebbleDrop } from '../../src/game/CanaryRules.js';
import { IMPACT } from '../../src/game/Impact.js';

/** A hero with a bag of mana, loose things on the ground and a real Steadiness — enough for the circle. */
function hero({ mana = 500, loose = [], pays = true, skill = 1 } = {}) {
    const log = { hints: [], said: [], fx: 0, removed: [], gone: [] };
    const g = {
        config: { mode: 'survival' },
        combat: { fatigue: mana, _hudKey: 'x', dead: false },
        items: { held: {}, loose: new Map(loose.map((it, i) => [i, { item: it, rest: true, model: { position: new THREE.Vector3(0.5, 0, 0) } }])),
            removeLoose(uid) { log.removed.push(uid); this.loose.delete(uid); } },
        sync: { itemGone: (uid) => log.gone.push(uid) },
        hud: { setVoice: (t) => log.said.push(t) },
        perf: { note() {} }, fx: { spark() {}, lightFlash() {} },
        character: { group: { position: new THREE.Vector3(0, 2, 0) } },
        scene: new THREE.Scene(), knock: { held() { g._held = (g._held || 0) + 1; } },
    };
    g.steady = new Steadiness(g);
    g.steady.skill = skill;
    const f = new Firmitas(g);
    const ctx = (m = { x: 0, y: 0, z: 0, r: 3.5, pent: 'firm', rot: 0 }) => ({ m, pays, mana: g.combat.fatigue, hint: (t) => log.hints.push(t), fx: () => { log.fx++; } });
    return { g, f, log, ctx };
}
const pebble = (count = 1) => ({ kind: 'magicPebble', uid: 'p' + Math.random(), count });

test('the author\'s numbers: 300 mana, the pebble; a white permanent pentagram of its own name, drawing, scroll', () => {
    assert.equal(FIRM.COST, 300); assert.equal(FIRM.ITEM, 'magicPebble');
    const d = PENTAGRAMS.firm;
    assert.ok(d); assert.equal(d.dark, false, 'white magic'); assert.equal(d.permanent, true); assert.equal(d.cost, 300);
    assert.ok(figureOf('firm')); assert.ok(figureIds().includes('firm'));
    assert.equal(PENT_NAMES.firm.en, 'Firmitas'); assert.equal(pentagramSpell('firm'), 'Pentagranium Firmitas');
    assert.equal(pentagramWords('Pentagranium Firmitas'), 'firm'); assert.equal(pentagramWords('пентаграниум фирмитас'), 'firm');
    assert.equal(pentagramWords('Firmitas'), null, 'the name alone is no spell');
    assert.equal(pentagramScroll('firm', 'u').pent, 'firm', 'a burnt scroll teaches it');
    assert.ok(SCROLL_WEIGHTS.some(([k]) => k === 'pent:firm'), 'scrolls turn up in chests');
});

test('absolute steadiness: whatever the skill, whatever the cause — the hero holds; Wind Maxima and a 500 m fall too', () => {
    const { g } = hero({ skill: 1 });
    assert.equal(g.steady.holds('WindMaxima'), false, 'without the gift a skill-1 hero falls');
    g.steady.setAbsolute(true);
    for (const k of ['Wind', 'WindMaxima', 'Inspirius', 'BombardoMaxima', 'Levitation', 'WaterVortex', 'Jolt']) assert.equal(g.steady.holds(k), true, k);
    assert.equal(g.steady.holds(null, { drop: 500, spell: false }), true, 'a fall from 500 m');
    assert.equal(g.steady.holds('Levitation', { drop: IMPACT.FALL_KNOCK_DROP * 100 }), true);
    assert.equal(g.steady.effective, 100, 'the skill reads 100');
    assert.equal(holdChance(1, 'WindMaxima'), 0, 'the plain rule is unchanged for others');
});

test('absolute steadiness: a blow of a beast or a cannon is no spell — BodyImpact never fells the hero, the push is a fraction, no toss', () => {
    const { g } = hero({ skill: 1 });
    g.steady.setAbsolute(true);
    const calls = { knock: 0, held: 0, stagger: 0 };
    g.combat = { dead: false, fatigue: 100, shield: null, frozen: false, shieldFactor: () => 0, blastProof: () => false };
    g.isDeadLocal = false;
    g.character = { group: { position: new THREE.Vector3(), rotation: { y: 0 } }, isCrouching: false, swimY: null, verticalVelocity: 0, onGround: true };
    g.knockback = new THREE.Vector3();
    g.knock = { knock() { calls.knock++; }, held() { calls.held++; }, stagger() { calls.stagger++; } };
    g.armor = null; g.fx = { shake: 0 };
    const bi = new BodyImpact(g);
    bi._kickHead = () => {}; bi._note = () => {}; bi._recoil = () => {};
    for (const [spell, cause] of [['WindMaxima', null], ['Wind', null], ['Inspirius', null], ['BombardoMaxima', null], [null, 'cannon'], [null, 'beast']]) {
        calls.knock = calls.held = calls.stagger = 0; g.knockback.set(0, 0, 0);
        const o = { v: new THREE.Vector3(40, 30, 0), from: null, by: 'x', spell, kind: spell ? undefined : 'beast', cause, toss: 20, always: { down: 5 }, noShield: true, fly: true, tumble: 2 };
        const r = bi.apply(o);
        assert.equal(calls.knock, 0, `${spell || cause}: not felled`);
        assert.equal(r, 'stagger'); assert.equal(calls.held, 1, 'the «устоял» pose');
        assert.ok(g.knockback.x <= 40 * FIRM.PUSH_K + 1e-6, 'a fraction of the push'); assert.equal(g.character.verticalVelocity, 0, 'never thrown into the air');
    }
    // (the same blow fells a hero without the gift)
    g.steady.setAbsolute(false); g.steady.skill = 1; g.knockback.set(0, 0, 0); calls.knock = 0;
    bi.apply({ v: new THREE.Vector3(40, 0, 0), from: null, by: 'x', spell: 'WindMaxima', noShield: true });
    assert.equal(calls.knock, 1, 'without the gift: down');
});

test('absolute steadiness: Knockdown.knock itself refuses (vortices, falls, thrown things) — except the stun and death', () => {
    const { g } = hero();
    g.steady.setAbsolute(true);
    g.character = { group: { position: new THREE.Vector3() } };
    g.monster = null; g.fx = { shake: 0 }; g.hud = { setVoice() {} };
    const kd = new Knockdown(g);
    let held = 0; kd.held = () => { held++; };
    for (const kind of ['fall', 'thrown', 'vortex', 'GroundVortex', 'WindMaxima', 'Jolt']) assert.equal(kd.knock({ dir: 'back', kind }), false, kind);
    assert.equal(held, 6); assert.equal(kd.state, 'up', 'still on the feet');
    assert.ok(ABSOLUTE_EXEMPT.has('Stupefy') && ABSOLUTE_EXEMPT.has('avada'));
    assert.equal(absoluteStops('Stupefy'), false); assert.equal(absoluteStops('WindMaxima'), true);
    g.steady.skill = 1;
    assert.equal(g.steady.holds('Stupefy', {}, () => 0.5), false, 'the stun is no loss of balance: it still lays the hero down (the plain rule, skill 1)');
});

test('the pebble must LIE on the circle: in the bag or the hand it does not count; two lying stacks — one is used', () => {
    assert.equal(findPebble([{ item: pebble(), rest: false }]), null, 'still flying');
    assert.equal(findPebble([{ item: { kind: 'apple' }, rest: true }]), null);
    assert.ok(findPebble([{ item: pebble(), rest: true }]));
    const a = hero({ loose: [{ kind: 'apple', uid: 'a', count: 1 }] });
    assert.equal(a.f.useCircle(a.ctx()), false);
    assert.equal(a.g.steady.absolute, false); assert.equal(a.g.combat.fatigue, 500, 'nothing paid'); assert.ok(a.log.hints.at(-1).includes('камушек'));
});

test('the rite: 300 mana paid, ONE pebble used up (a stack loses one, the last one is gone and the others told), the gift is for good — once', () => {
    const one = hero({ mana: 350, loose: [pebble()] });
    assert.ok(one.f.useCircle(one.ctx()));
    assert.equal(one.g.steady.absolute, true); assert.equal(one.g.combat.fatigue, 50, '300 paid'); assert.equal(one.log.fx, 1);
    assert.equal(one.log.removed.length, 1); assert.equal(one.log.gone.length, 1, 'the others are told'); assert.equal(one.g.items.loose.size, 0);
    assert.ok(one.log.said.some((t) => t.includes('неколебим')));
    one.g.items.loose.set('x', { item: pebble(), rest: true, model: { position: new THREE.Vector3(0.5, 0, 0) } });
    assert.equal(one.f.useCircle({ ...one.ctx(), mana: 500 }), false); assert.equal(one.g.combat.fatigue, 50, 'nothing paid twice'); assert.equal(one.g.items.loose.size, 1, 'the second pebble kept');
    const stack = pebble(3);
    const two = hero({ loose: [stack] });
    assert.ok(two.f.useCircle(two.ctx())); assert.equal(stack.count, 2, 'one of three'); assert.equal(two.log.removed.length, 0);
    two.f.dispose();
});

test('not enough mana: nothing is paid, the pebble is kept, the hint says how much', () => {
    const h = hero({ mana: 299, loose: [pebble()] });
    assert.equal(h.f.useCircle(h.ctx()), false);
    assert.equal(h.g.steady.absolute, false); assert.equal(h.g.combat.fatigue, 299); assert.equal(h.g.items.loose.size, 1); assert.ok(h.log.hints.at(-1).includes('300'));
});

test('Creative: no pebble and no mana needed — but the circle must be stood in', () => {
    const h = hero({ mana: 0, pays: false });
    assert.ok(h.f.useCircle(h.ctx())); assert.equal(h.g.steady.absolute, true); assert.equal(h.g.combat.fatigue, 0);
});

test('a dead hero gets nothing; the picture ends cleanly (the model leaves the scene)', () => {
    const dead = hero({ loose: [pebble()] });
    dead.g.combat.dead = true;
    assert.equal(dead.f.useCircle(dead.ctx()), false);
    const h = hero({ loose: [pebble()] });
    h.f.useCircle(h.ctx());
    assert.ok(h.f.anim && h.f.anim.model, 'the rite plays');
    assert.equal(h.g.scene.children.length, 1);
    for (let i = 0; i < 60; i++) h.f.update(0.1);
    assert.equal(h.f.anim, null); assert.equal(h.g.scene.children.length, 0, 'nothing left in the scene'); assert.ok(h.g._held >= 1, 'the hero braced at the flash');
    const d2 = hero({ loose: [pebble()] });
    d2.f.useCircle(d2.ctx()); d2.f.onDeath(); assert.equal(d2.f.anim, null);
});

test('death takes the gift into the body; «Give Me My Power» brings it back (replaces); the save keeps it', () => {
    const h = hero({ loose: [pebble()] });
    h.f.useCircle(h.ctx());
    h.g.bonus = { hp: 0, fatigue: 0 }; h.g.maxHP = 20; h.g.playerHP = 20; h.g.books = { learned: new Set() };
    const rec = captureLegacy(h.g);
    assert.equal(rec.steady.ab, 1, 'in the body');
    wipeHero(h.g);
    assert.equal(h.g.steady.absolute, false, 'a death takes it');
    h.g.mana = { onDeath() {} }; h.g.achievements = { onDeath() {} }; h.g.hud = { setVoice() {}, update() {} }; h.g.combat.addMaxFatigue = () => {};
    absorbLegacy(h.g, rec);
    assert.equal(h.g.steady.absolute, true, '«Give Me My Power» brings it back');
    const again = new Steadiness(h.g);
    again.restore(JSON.parse(JSON.stringify(h.g.steady.snapshot())));
    assert.equal(again.absolute, true); assert.equal(new Steadiness(h.g).snapshot(), null, 'nothing to save without the gift');
    // (an old save has no `ab`)
    again.restore({ skill: 40, acc: 3 }); assert.equal(again.absolute, false); assert.equal(again.skill, 40);
});

test('the magic pebble: a thing of the game (name, worth, model, description) — and it drops from canaries: the leader always, the others ~30 %', () => {
    assert.equal(ITEM_INFO.magicPebble.name, 'Волшебный камушек'); assert.ok(itemValue({ kind: 'magicPebble', count: 2 }) > 0);
    const d = describeItem({ kind: 'magicPebble', count: 1 }); assert.ok(d?.title && d.lines.length >= 2);
    const m = makeItemModel({ kind: 'magicPebble' }); assert.ok(m && m.children.length >= 2, 'stone and glowing rune');
    const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    assert.ok(Math.max(size.x, size.y, size.z) > 0.4 && Math.max(size.x, size.y, size.z) < 0.9, 'a pebble in a hand: ' + size.x);
    assert.equal(pebbleDrop(true, () => 0.99), 1, 'the leader always');
    assert.equal(PEBBLE.CHANCE, 0.3);
    assert.equal(pebbleDrop(false, () => 0.29), 1); assert.equal(pebbleDrop(false, () => 0.31), 0);
    let n = 0; for (let i = 0; i < 10000; i++) n += pebbleDrop(false);
    assert.ok(n > 2700 && n < 3300, 'about 30 % of 10 000: ' + n);
});

test('the hint texts are plain Russian; the «who / what» table says something for every kind', () => {
    for (const t of [FIRM_HINT.have, FIRM_HINT.noPebble, FIRM_HINT.done, FIRM_HINT.noMana(300)]) assert.match(t, /[А-Яа-я]/);
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'dragon', 'iceCastle', 'phoenix', 'owl', 'canary', 'items', 'ground', 'spells']) assert.ok(FIRM_TARGETS[k]?.why, k);
});
