// Две белые пентаграммы зрения — «Pentagranium Noctis» (ночное зрение, 50 маны) и «Pentagranium Spectris» (видение невидимых, 150 маны + перо/трава):
// правила (SightRules.js), дар (SecondSight.js), реестр невидимого (Invisibles.js), смерть и «Give Me My Power» (Legacy.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SIGHT, SIGHT_HINT, SIGHT_TARGETS, lightBoost, fogBoost, caveDim, darkness, findIngredient } from '../../src/game/SightRules.js';
import { SecondSight } from '../../src/game/SecondSight.js';
import { GHOST, ghostAlpha, seesInvisible, seers, isGhostItem, registerInvisible, invisibleKinds, registerInvisibleStructure, invisibleStructures, invisibleStructureAt, INVISIBLE_WORLD } from '../../src/game/Invisibles.js';
import { captureLegacy, wipeHero, absorbLegacy } from '../../src/game/Legacy.js';
import { PENTAGRAMS } from '../../src/game/Pentagrams.js';
import { figureOf, figureIds, pentagramScroll } from '../../src/game/PentagramRules.js';
import { pentagramWords, pentagramSpell, PENT_NAMES } from '../../src/game/PentagramWords.js';
import { USE } from '../../src/game/PentagramUse.js';
import { ITEM_INFO, describeItem, itemValue, makeItemModel, SCROLL_WEIGHTS } from '../../src/game/ItemTypes.js';
import { IMPERIUS_TARGETS, kindOf } from '../../src/game/Imperius.js';

const slot = (kind, count = 1) => ({ kind, count, uid: kind + Math.random() });

/** A hero with a bag, hands, loose things and a bar of mana — enough for the circle. */
function hero({ mana = 500, slots = [], held = {}, loose = [], pays = true } = {}) {
    const log = { hints: [], said: [], fx: 0, removed: [], gone: [], released: [] };
    const g = {
        combat: { fatigue: mana, _hudKey: 'x', dead: false },
        inventory: { slots: [...slots], take(st, n) { st.count -= n; if (st.count <= 0) this.slots[this.slots.indexOf(st)] = null; return true; } },
        items: { held: { left: held.left ? { item: held.left } : null, right: held.right ? { item: held.right } : null }, loose: new Map(loose.map((it, i) => [i, { item: it, model: { position: { x: 0.5, y: 0, z: 0 } } }])),
            releaseHand(side) { const h = this.held[side]; this.held[side] = null; log.released.push(side); return h?.item; }, removeLoose(uid) { log.removed.push(uid); this.loose.delete(uid); } },
        sync: { itemGone: (uid) => log.gone.push(uid) },
        hud: { setVoice: (t) => log.said.push(t) },
        perf: { note() {} }, world: { setNightVision(k) { g._nv = k; } }, fx: { spark() {}, lightFlash() {} },
        character: { group: { position: { x: 0, y: 0, z: 0 } } },
    };
    const s = new SecondSight(g);
    const ctx = (m = { x: 0, y: 0, z: 0, r: 3.5 }) => ({ m, pays, mana: g.combat.fatigue, hint: (t) => log.hints.push(t), fx: () => { log.fx++; } });
    return { g, s, log, ctx };
}

test('the numbers of the author: 50 and 150 mana; 50 % better in the dark; the fog of the dark 1.5 times as far', () => {
    assert.equal(SIGHT.NIGHT_COST, 50); assert.equal(SIGHT.SEE_COST, 150); assert.equal(SIGHT.NIGHT_K, 0.5); assert.equal(SIGHT.FOG_K, 1.5);
    assert.equal(lightBoost(1, 1), 1.5); assert.equal(lightBoost(1, 0), 1, 'by day no change'); assert.equal(lightBoost(0, 1), 1, 'without the gift no change');
    assert.equal(fogBoost(1, 1), 1.5); assert.equal(fogBoost(1, 0), 1); assert.equal(fogBoost(0, 1), 1);
    assert.ok(Math.abs(lightBoost(1, 0.5) - 1.25) < 1e-9, 'half as dark: half the gift');
    assert.ok(Math.abs(caveDim(1, 0) - 0.2) < 1e-9, 'the cave as it was'); assert.ok(caveDim(1, 1) > 0.4 && caveDim(1, 1) < 0.5, 'the cave 50 % less dark');
    assert.equal(darkness(0.3, 0.8), 0.8); assert.equal(darkness(undefined, undefined), 0);
});

test('the pentagrams of sight: white, permanent, their own names, scrolls and drawings', () => {
    for (const [id, name, cost] of [['night', 'Noctis', 50], ['sight', 'Spectris', 150]]) {
        const d = PENTAGRAMS[id];
        assert.ok(d, id); assert.equal(d.dark, false, 'white magic'); assert.equal(d.permanent, true); assert.equal(d.cost, cost);
        assert.ok(figureOf(id), 'a drawing'); assert.equal(PENT_NAMES[id].en, name); assert.equal(pentagramSpell(id), 'Pentagranium ' + name);
        assert.equal(pentagramWords('пентаграниум ' + PENT_NAMES[id].say[0]), id);
        assert.equal(pentagramWords('Pentagranium ' + name), id);
        assert.equal(pentagramWords(name), null, 'the name alone is no spell');
        assert.ok(figureIds().includes(id));
        assert.equal(pentagramScroll(id, 'u').pent, id, 'a burnt scroll teaches it');
    }
    assert.ok(SCROLL_WEIGHTS.some(([k]) => k === 'pent:night') && SCROLL_WEIGHTS.some(([k]) => k === 'pent:sight'), 'scrolls turn up in chests');
    assert.ok(USE.PERM_MAX >= 24);
});

test('night: stand in the circle, pay 50, the gift is yours for good — once', () => {
    const { s, g, log, ctx } = hero({ mana: 80 });
    assert.equal(s.night, false);
    assert.ok(s.useCircle('night', ctx()));
    assert.equal(s.night, true); assert.equal(g.combat.fatigue, 30, '50 paid'); assert.equal(log.fx, 1);
    assert.ok(log.said.some((t) => t.includes('50 %')));
    const again = s.useCircle('night', { ...ctx(), mana: 30 });
    assert.equal(again, false); assert.equal(g.combat.fatigue, 30, 'nothing paid twice'); assert.ok(log.hints.at(-1).includes('уже'));
});

test('night: no mana — nothing is paid, nothing is given', () => {
    const { s, g, log, ctx } = hero({ mana: 49 });
    assert.equal(s.useCircle('night', ctx()), false);
    assert.equal(s.night, false); assert.equal(g.combat.fatigue, 49); assert.ok(log.hints.at(-1).includes('50'));
});

test('sight: needs the feather — without it only a hint; with it 150 mana and ONE feather are used up', () => {
    const none = hero({ mana: 400 });
    assert.equal(none.s.useCircle('sight', none.ctx()), false);
    assert.equal(none.s.sees, false); assert.equal(none.g.combat.fatigue, 400); assert.ok(none.log.hints.at(-1).includes('Спенсера'));
    const f = slot('spencerFeather', 2);
    const h = hero({ mana: 400, slots: [f] });
    assert.ok(h.s.useCircle('sight', h.ctx()));
    assert.equal(h.s.sees, true); assert.equal(h.g.combat.fatigue, 250); assert.equal(f.count, 1, 'one feather of two');
    assert.ok(h.log.said.some((t) => t.includes('невидимое')));
});

test('sight: the grass instead of the feather; the feather lying in the circle or in a hand counts; the feather first', () => {
    const grass = slot('beslanGrass');
    const a = hero({ slots: [grass] });
    assert.ok(a.s.useCircle('sight', a.ctx())); assert.equal(a.g.inventory.slots[0], null, 'the last sheaf is gone');
    const lying = { kind: 'spencerFeather', count: 1, uid: 'L' };
    const b = hero({ loose: [lying] });
    assert.ok(b.s.useCircle('sight', b.ctx())); assert.equal(b.log.removed.length, 1, 'the one on the ground is taken'); assert.equal(b.log.gone.length, 1, 'and the others are told');
    const c = hero({ held: { right: { kind: 'beslanGrass', count: 1, uid: 'H' } } });
    assert.ok(c.s.useCircle('sight', c.ctx())); assert.deepEqual(c.log.released, ['right']);
    const both = findIngredient({ slots: [slot('beslanGrass')], held: [], loose: [{ uid: 1, item: slot('spencerFeather') }] });
    assert.equal(both.kind, 'spencerFeather', 'the bird\'s feather before the grass');
    assert.equal(findIngredient({ slots: [null, slot('apple')], held: [undefined], loose: [] }), null);
});

test('sight: not enough mana — the feather is kept', () => {
    const f = slot('spencerFeather');
    const h = hero({ mana: 100, slots: [f] });
    assert.equal(h.s.useCircle('sight', h.ctx()), false);
    assert.equal(f.count, 1); assert.equal(h.g.combat.fatigue, 100); assert.ok(h.log.hints.at(-1).includes('150'));
});

test('Creative: nothing is paid and no feather is needed — but the circle must be stood in', () => {
    const h = hero({ mana: 0, pays: false });
    assert.ok(h.s.useCircle('sight', h.ctx())); assert.equal(h.s.sees, true);
    assert.ok(h.s.useCircle('night', h.ctx())); assert.equal(h.s.night, true);
});

test('a dead hero gets nothing from a circle; death takes both gifts; the body keeps them for «Give Me My Power»', () => {
    const dead = hero({ slots: [slot('spencerFeather')] });
    dead.g.combat.dead = true;
    assert.equal(dead.s.useCircle('night', dead.ctx()), false);
    const h = hero({ slots: [slot('spencerFeather')] });
    h.s.useCircle('night', h.ctx()); h.s.useCircle('sight', h.ctx());
    h.g.sight = h.s; h.g.bonus = { hp: 0, fatigue: 0 }; h.g.maxHP = 20; h.g.playerHP = 20; h.g.books = { learned: new Set() };
    const rec = captureLegacy(h.g);
    assert.deepEqual(rec.sight, { n: 1, s: 1 }, 'in the body');
    wipeHero(h.g);
    assert.equal(h.s.night, false); assert.equal(h.s.sees, false, 'a death takes both');
    h.g.mana = { onDeath() {} }; h.g.achievements = { onDeath() {} }; h.g.hud = { setVoice() {}, update() {} }; h.g.combat.addMaxFatigue = () => {};
    absorbLegacy(h.g, rec);
    assert.equal(h.s.night, true); assert.equal(h.s.sees, true, '«Give Me My Power» brings them back');
    // (the save: the same record restores)
    const again = new SecondSight(h.g);
    again.restore(JSON.parse(JSON.stringify(h.s.snapshot())));
    assert.equal(again.sees, true); assert.equal(again.night, true);
    assert.equal(new SecondSight(h.g).snapshot(), null, 'nothing to save without the gifts');
});

test('the world is told the gift smoothly (no jump of the light)', () => {
    const h = hero(); h.s.night = true;
    h.s.update(0.1);
    assert.ok(h.g._nv > 0 && h.g._nv < 1, 'eased');
    for (let i = 0; i < 100; i++) h.s.update(0.1);
    assert.equal(h.g._nv, 1);
    h.s.onDeath(); for (let i = 0; i < 100; i++) h.s.update(0.1);
    assert.equal(h.g._nv, 0);
});

test('the registry of the invisible world: who sees, the ghost look, the kinds, the structures hook', () => {
    assert.equal(GHOST.ALPHA, 0.85, '15 % see-through');
    for (let t = 0; t < 30; t += 0.37) { const a = ghostAlpha(t, 1.1); assert.ok(a > 0.79 && a < 0.91, 'shimmers round 0.85'); }
    const me = { sight: { sees: false }, localId: 'a', remotes: new Map([['b', { sees: true, dead: false, position: { x: 1, y: 0, z: 1 } }], ['c', { sees: false, position: { x: 0, y: 0, z: 0 } }]]), character: { group: { position: { x: 0, y: 0, z: 0 } } } };
    assert.equal(seesInvisible(me), false); assert.equal(seesInvisible(me, 'b'), true); assert.equal(seesInvisible(me, 'c'), false);
    me.sight.sees = true;
    assert.equal(seesInvisible(me), true); assert.equal(seesInvisible(me, 'a'), true);
    assert.deepEqual(seers(me).map((x) => x.id), ['a', 'b'], 'me and the friend who sees');
    assert.ok(isGhostItem({ kind: 'spencerFeather' }) && isGhostItem({ kind: 'beslanGrass' }) && !isGhostItem({ kind: 'owlFeather' }));
    for (const k of ['player', 'spencer', 'beslan', 'items']) assert.ok(invisibleKinds().includes(k), k);
    registerInvisible('test-ghost', { ru: 'тест' });
    assert.ok(invisibleKinds().includes('test-ghost'), 'a future invisible kind registers itself');
    registerInvisibleStructure({ id: 'ghost-castle', title: 'Замок призраков', at: (x, z) => Math.hypot(x, z) < 50 });
    assert.equal(invisibleStructures().length >= 1, true); assert.equal(invisibleStructureAt(10, 10)?.id, 'ghost-castle'); assert.equal(invisibleStructureAt(500, 0), null);
});

test('the tables «who / what» say something for every kind', () => {
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'dragon', 'iceCastle', 'phoenix', 'owl', 'items', 'ground', 'spells']) assert.ok(SIGHT_TARGETS[k]?.why, 'SIGHT_TARGETS ' + k);
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'dragon', 'iceCastle', 'phoenix', 'owl', 'items', 'structures']) assert.ok(INVISIBLE_WORLD[k]?.why, 'INVISIBLE_WORLD ' + k);
});

test('the feather and the grass are things of the game: names, worth, a model, a description', () => {
    for (const k of ['spencerFeather', 'beslanGrass']) {
        assert.ok(ITEM_INFO[k].name); assert.ok(itemValue({ kind: k, count: 2 }) > 0);
        const d = describeItem({ kind: k, count: 2 }); assert.ok(d?.title && d.lines.length >= 2, k);
        const m = makeItemModel({ kind: k }); assert.ok(m && m.children.length, 'a model');
    }
    assert.equal(ITEM_INFO.spencerFeather.name, 'Перо птички Спенсера');
});

test('the Imperius table knows the bird; the hint texts are plain Russian to the person', () => {
    assert.ok(IMPERIUS_TARGETS.spencer?.magic && IMPERIUS_TARGETS.spencer.fly, 'only the Maxima; it flies');
    assert.equal(kindOf('sx', {}), 'spencer');
    for (const t of [SIGHT_HINT.nightDone, SIGHT_HINT.seeDone, SIGHT_HINT.noIngredient, SIGHT_HINT.nightHave, SIGHT_HINT.seeHave]) assert.match(t, /[А-Яа-я]/);
});
