// Условия обрядов (только вне Творческого): горгульи — 3 тела убитых человекоподобных + 150 маны; монстр — рог Минотавра + 1 тело + 200 маны.
// Правила (PentagramOfferings.js), игровая часть (Offerings.js): тела лежат на круге → тёмное пламя → оплата в самом конце → тела сгорают; сбой — ничего не потеряно.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OFFERINGS, OFFER, OFFER_HINT, OFFERING_TARGETS, assess, humanoidBody, bodiesWord, HUMANOID_KINDS } from '../../src/game/PentagramOfferings.js';
import { bodyOk } from '../../src/game/UnitedRules.js';
import { Offerings } from '../../src/game/Offerings.js';
import { GARGOYLE } from '../../src/game/GargoyleRules.js';
import { MONSTER } from '../../src/game/MonsterForm.js';
import { BREAKWARD } from '../../src/game/Breakward.js';
import { ITEM_INFO } from '../../src/game/ItemTypes.js';

const body = (o = {}) => ({ id: 'b' + Math.random(), k: 'v', x: 0.5, y: 0, z: 0, ...o });
const horn = () => ({ uid: 'h', item: { kind: 'minotaurHorn' } });

test('the author\'s numbers: gargoyles — 3 bodies and 150 mana; monster — the Minotaur\'s horn, 1 body and 200 mana (the same numbers as the rituals themselves)', () => {
    assert.equal(OFFERINGS.gargoyles.bodies, 3); assert.equal(OFFERINGS.gargoyles.mana, 150); assert.equal(OFFERINGS.gargoyles.mana, GARGOYLE.MANA);
    assert.equal(OFFERINGS.monster.bodies, 1); assert.equal(OFFERINGS.monster.mana, 200); assert.equal(OFFERINGS.monster.mana, MONSTER.COST);
    assert.deepEqual(OFFERINGS.monster.things.map((t) => t.kind), ['minotaurHorn']); assert.ok(ITEM_INFO.minotaurHorn, 'the horn is an item of the game');
});

test('«Слом защиты» too (the author, via the main session): ONE body and 50 mana — exactly the mark\'s own price', () => {
    assert.equal(OFFERINGS.breakward.bodies, 1); assert.equal(OFFERINGS.breakward.mana, 50); assert.equal(OFFERINGS.breakward.mana, BREAKWARD.COST); assert.deepEqual(OFFERINGS.breakward.things, []);
    assert.equal(assess('breakward', { bodies: [] }).ok, false); assert.match(assess('breakward', { bodies: [] }).text, /ещё 1 тело/);
    assert.equal(assess('breakward', { bodies: [body({ bones: {} })] }).ok, false, 'bones do not count');
    assert.equal(assess('breakward', { bodies: [body({ k: 'a' })] }).ok, false, 'an animal does not count');
    assert.equal(assess('breakward', { bodies: [body()] }).ok, true);
});

test('ONE function says which body fits: man-like (a villager, a knight, a wizard, a sailor, a player, a zombie), never bones, never a hero\'s power', () => {
    for (const k of ['v', 'p', 'z']) assert.ok(humanoidBody(body({ k })).ok, k);
    assert.ok([...HUMANOID_KINDS].every((k) => ['v', 'p', 'z'].includes(k)));
    assert.match(humanoidBody(body({ bones: {} })).why, /Кости/); assert.match(humanoidBody(body({ stage: 'bones' })).why, /Кости/);
    assert.match(humanoidBody(body({ lg: 1 })).why, /сила героя/);
    for (const k of ['a', 'dragon', 'spider', 'x']) assert.equal(humanoidBody(body({ k })).ok, false, 'an animal / a dragon / a spider: ' + k);
    assert.equal(humanoidBody(null).ok, false);
    // the united power asks the same function — and keeps its rules (alone: a villager; online: only a player)
    assert.equal(bodyOk(body({ k: 'v' })).ok, true); assert.equal(bodyOk(body({ k: 'p' })).ok, false); assert.equal(bodyOk(body({ k: 'z' })).ok, false);
    assert.equal(bodyOk(body({ k: 'p', lg: 1 }), { multiplayer: true }).ok, true); assert.equal(bodyOk(body({ k: 'v' }), { multiplayer: true }).ok, false);
});

test('assess: 3 bodies for the gargoyles — two say «ещё 1 тело»; bones, animals and a hero\'s body do not count; more than 3 — three are used', () => {
    const a2 = assess('gargoyles', { bodies: [body(), body()] });
    assert.equal(a2.ok, false); assert.match(a2.text, /ещё 1 тело/); assert.equal(a2.bodies.length, 2);
    const a0 = assess('gargoyles', { bodies: [body({ bones: {} }), body({ k: 'a' }), body({ lg: 1 })] });
    assert.equal(a0.ok, false); assert.match(a0.text, /ещё 3 тела/); assert.ok(a0.bad, 'a reason is given for the wrong one');
    const a3 = assess('gargoyles', { bodies: [body(), body({ k: 'p' }), body({ k: 'z' })] });
    assert.equal(a3.ok, true); assert.equal(a3.bodies.length, 3);
    const a5 = assess('gargoyles', { bodies: [body(), body(), body(), body(), body()] });
    assert.equal(a5.ok, true); assert.equal(a5.bodies.length, 3, 'only three are taken');
    assert.deepEqual([1, 2, 3, 4, 5, 11, 21].map(bodiesWord), ['тело', 'тела', 'тела', 'тела', 'тел', 'тел', 'тело']);
});

test('assess: the monster wants the horn AND one body; either alone is not enough; other things on the circle are left alone', () => {
    assert.equal(assess('monster', { bodies: [body()], things: [] }).ok, false);
    assert.match(assess('monster', { bodies: [body()], things: [] }).text, /рог Минотавра/);
    const noBody = assess('monster', { bodies: [], things: [horn()] });
    assert.equal(noBody.ok, false); assert.match(noBody.text, /ещё 1 тело/);
    const both = assess('monster', { bodies: [body()], things: [{ uid: 'x', item: { kind: 'apple' } }, horn()] });
    assert.equal(both.ok, true); assert.deepEqual(both.things.map((t) => t.uid), ['h'], 'only the horn is taken');
    assert.match(assess('monster', { bodies: [], things: [] }).text, /рог.*ещё 1 тело/);
});

// ----------------------------------------------------------------- the game part
function game({ fatigue = 500, mode = 'survival', ritual = { ok: true }, can = { ok: true } } = {}) {
    const said = [], sent = [], log = { ritual: 0, removedItems: [], removedBodies: [] };
    const bodies = new Map(), loose = new Map();
    const g = {
        config: { mode }, hud: { setVoice: (t) => said.push(t) }, combat: { enabled: true, fatigue, _hudKey: '', dead: false },
        fx: { spark() {}, lightFlash() {} }, perf: { note() {} }, castleLife: { alarm() {} }, localId: 'me',
        sync: { pentagram: (m) => sent.push(m), itemGone: (uid) => log.removedItems.push('gone:' + uid) },
        death: { bodies, falling: new Set(), removeBody(id) { log.removedBodies.push(id); bodies.delete(id); } },
        items: { loose, removeLoose(uid) { loose.delete(uid); log.removedItems.push(uid); } },
        gargoyles: { startRitual() { log.ritual++; if (ritual.ok) g.combat.fatigue -= 150; return ritual; }, canRitual: () => can },
        monster: { phase: null },
        sound: { playSpellFxAt() {} },
    };
    const m = { id: 'm1', pent: 'gargoyles', x: 0, y: 0, z: 0, r: 3.5, fade: 1, anim: null, mine: true, life: 400, offer: 'gargoyles' };
    g.pentagranium = { marks: new Map([['m1', m]]) };
    const o = new Offerings(g);
    const addBody = (x = 0.5, extra = {}) => { const b = body({ x, ...extra }); bodies.set(b.id, b); return b; };
    const addHorn = () => { loose.set('h', { item: { kind: 'minotaurHorn', uid: 'h' }, rest: true, model: { position: new THREE.Vector3(1, 0, 0) } }); };
    const run = (sec) => { for (let t = 0; t < sec; t += 0.1) o.update(0.1); };
    return { g, o, m, said, sent, log, addBody, addHorn, run, bodies, loose };
}

test('gargoyles: two bodies — only a hint; the third — the dark flame gathers (nothing spent yet); at the end 150 are paid by the ritual, the bodies burn away', () => {
    const t = game();
    t.addBody(); t.addBody(-0.5);
    t.run(1);
    assert.ok(t.said.some((x) => /ещё 1 тело/.test(x)), 'told what is missing'); assert.equal(t.o.run, null); assert.equal(t.log.ritual, 0);
    t.addBody(0, { z: 0.6 });
    t.run(1);
    assert.ok(t.o.run, 'the flame gathers'); assert.equal(t.log.ritual, 0, 'nothing is spent while it gathers'); assert.equal(t.g.combat.fatigue, 500);
    assert.ok([...t.bodies.values()].every((b) => b.off), 'the bodies are locked');
    assert.ok(t.sent.some((s) => s.k === 'ofr' && s.op === 'charge'), 'the others see it');
    t.run(OFFER.CHARGE + 0.5);
    assert.equal(t.log.ritual, 1, 'the ritual paid and began'); assert.equal(t.g.combat.fatigue, 350); assert.equal(t.o.run, null);
    assert.ok(t.sent.some((s) => s.op === 'burn' && s.bodies.length === 3));
    assert.ok(t.m.life <= 6 + OFFER.BURN + 0.01, 'the picture burns out after the ritual began, as before');
    t.run(OFFER.BURN + 0.6);
    assert.equal(t.log.removedBodies.length, 3, 'the three bodies are gone'); assert.equal(t.bodies.size, 0);
});

test('trouble cancels the gathering and NOTHING is lost: a body carried off, the pentagram gone out, the caster dead', () => {
    const cases = { moved: (t, bs) => t.bodies.delete(bs[0].id), gone: (t) => t.g.pentagranium.marks.clear(), dead: (t) => { t.g.combat.dead = true; } };
    for (const [name, trouble] of Object.entries(cases)) {
        const t = game(); const bs = [t.addBody(), t.addBody(-0.5), t.addBody(0.2)];
        t.run(0.6); assert.ok(t.o.run, name);
        trouble(t, bs);
        t.run(0.5);
        assert.equal(t.o.run, null, name + ': cancelled'); assert.equal(t.log.ritual, 0, name + ': no ritual'); assert.equal(t.g.combat.fatigue, 500, name + ': no mana taken');
        assert.ok([...t.bodies.values()].every((b) => !b.off), name + ': the others are unlocked, they lie where they lay');
        assert.ok(t.sent.some((s) => s.op === 'cancel'), name + ': the others are told');
    }
});

test('not enough mana: the bodies lie there, nothing starts or is spent; mana is checked again at the very end (the ritual refuses: cancelled, nothing lost)', () => {
    const poor = game({ fatigue: 100 });
    poor.addBody(); poor.addBody(-0.5); poor.addBody(0.2);
    poor.run(1);
    assert.equal(poor.o.run, null); assert.ok(poor.said.some((x) => /не хватает маны.*150/.test(x)), 'told how much');
    const late = game({ ritual: { ok: false, why: 'mana' } });
    late.addBody(); late.addBody(-0.5); late.addBody(0.2);
    late.run(OFFER.CHARGE + 1);
    assert.equal(late.log.ritual, 1); assert.equal(late.o.run, null); assert.equal(late.bodies.size, 3, 'all three lie where they lay'); assert.ok([...late.bodies.values()].every((b) => !b.off));
    assert.ok(late.said.some((x) => /маны не хватило/.test(x)));
    const busy = game({ can: { ok: false, why: 'spent' } });
    busy.addBody(); busy.addBody(-0.5); busy.addBody(0.2);
    busy.run(1);
    assert.equal(busy.o.run, null); assert.ok(busy.said.some((x) => /выжжена/.test(x)));
});

test('monster: the horn and one body; 200 mana are paid at the end, the circle is marked paid (the hero then stands in it), the horn is used up and the body burns', () => {
    const t = game(); t.m.offer = 'monster'; t.m.pent = 'monster';
    t.addHorn(); t.run(1);
    assert.equal(t.o.run, null, 'the horn alone is not enough'); assert.ok(t.said.some((x) => /ещё 1 тело/.test(x)));
    const b = t.addBody();
    t.run(1);
    assert.ok(t.o.run); assert.equal(t.g.combat.fatigue, 500, 'nothing spent while it gathers'); assert.ok(t.loose.get('h').L === undefined && t.loose.get('h').ritual, 'the horn is locked');
    t.run(OFFER.CHARGE + 0.5);
    assert.equal(t.g.combat.fatigue, 300, '200 paid'); assert.equal(t.m.prepaid, true); assert.equal(t.loose.size, 0, 'the horn is used up'); assert.ok(t.log.removedItems.includes('gone:h'), 'the others are told');
    t.run(OFFER.BURN + 0.6);
    assert.ok(t.log.removedBodies.includes(b.id));
    assert.ok(t.said.some((x) => /встаньте в круг/.test(x)), 'told to stand in the circle');
    // already a monster: it does not begin
    const m2 = game(); m2.m.offer = 'monster'; m2.g.monster.phase = 'grow'; m2.addHorn(); m2.addBody(); m2.run(1);
    assert.equal(m2.o.run, null); assert.ok(m2.said.some((x) => /уже монстр/.test(x)));
});

test('the others only watch: a remote computer plays the flame and the burning of the bodies, takes nothing', () => {
    const t = game(); t.m.mine = false;
    const b = t.addBody();
    t.o.onNet('them', { k: 'ofr', op: 'charge', id: 'm1', at: [[0, 0, 0.5]] });
    assert.ok(t.o.run?.remote); t.run(1); assert.ok(t.m.offerHell > 0);
    t.o.onNet('them', { k: 'ofr', op: 'burn', id: 'm1', bodies: [b.id] });
    assert.equal(t.o.run, null); t.run(OFFER.BURN + 0.6);
    assert.ok(t.log.removedBodies.includes(b.id), 'the body burns on this computer too'); assert.equal(t.g.combat.fatigue, 500, 'nothing is paid here');
    const c = game(); c.m.mine = false; c.o.onNet('them', { k: 'ofr', op: 'charge', id: 'm1', at: [] }); c.o.onNet('them', { k: 'ofr', op: 'cancel', id: 'm1' });
    assert.equal(c.o.run, null);
});

test('the «who / what» table says something for every kind; hint texts are plain Russian', () => {
    for (const k of ['me', 'players', 'bodies', 'items', 'zombies', 'castlePeople', 'animals', 'spells', 'creative']) assert.ok(OFFERING_TARGETS[k]?.why, k);
    for (const t of [OFFER_HINT.start, OFFER_HINT.cancelGone, OFFER_HINT.cancelMoved, OFFER_HINT.cancelMana, OFFER_HINT.noMana(150, 10)]) assert.match(t, /[А-Яа-я]/);
});

test('breakward: a body on the circle — the flame gathers; at the end 50 are paid, the body burns, the mark is paid for (the step into the circle then puts the mark on); trouble costs nothing', () => {
    const t = game({ fatigue: 120 }); t.m.offer = 'breakward'; t.m.pent = 'breakward'; t.g.breakward = { marked: false };
    t.run(1); assert.equal(t.o.run, null, 'nothing lies there');
    const b = t.addBody();
    t.run(1); assert.ok(t.o.run, 'the flame gathers'); assert.equal(t.g.combat.fatigue, 120, 'nothing spent while it gathers');
    t.run(OFFER.CHARGE + 0.5);
    assert.equal(t.g.combat.fatigue, 70, '50 paid'); assert.equal(t.m.prepaid, true, 'the circle is paid for'); assert.equal(t.log.ritual, 0, 'no gargoyles');
    assert.ok(t.said.some((x) => /защита будет сломана/.test(x)));
    t.run(OFFER.BURN + 0.6); assert.ok(t.log.removedBodies.includes(b.id), 'the body burned');
    // not enough mana (49): the body lies there, nothing is paid
    const poor = game({ fatigue: 49 }); poor.m.offer = 'breakward'; poor.g.breakward = { marked: false }; poor.addBody(); poor.run(1);
    assert.equal(poor.o.run, null); assert.ok(poor.said.some((x) => /не хватает маны.*50/.test(x))); assert.equal(poor.bodies.size, 1);
    // the body is taken away while the flame gathers: cancelled, nothing lost
    const gone = game(); gone.m.offer = 'breakward'; gone.g.breakward = { marked: false }; const gb = gone.addBody(); gone.run(0.6); gone.bodies.delete(gb.id); gone.run(0.5);
    assert.equal(gone.o.run, null); assert.equal(gone.g.combat.fatigue, 500); assert.notEqual(gone.m.prepaid, true);
    // the protection is already broken: a second body is not burnt for nothing
    const done = game(); done.m.offer = 'breakward'; done.g.breakward = { marked: true }; done.addBody(); done.run(1);
    assert.equal(done.o.run, null); assert.ok(done.said.some((x) => /уже сломана/.test(x)));
});
