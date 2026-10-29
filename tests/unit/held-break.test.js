// «Liquidation» on what a humanoid holds in his hand (HeldBreak.js) and its duel charges (Duel.js):
// the plain one takes a non-magic thing, the Maxima any (a wand, the king's sword, the captain's rapier); the hand with a thing is
// the target (the main one first, else the other); the loser of a «Liquidation Maxima» duel loses his wand.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { chooseSlot, slotVerdict, creatureSlots, mySlots, breakMyHeld, breakCreatureHeld, duelBreaks, isLiquidationDuel, HELD_TARGETS, liquidationNeedsMaxima } from '../../src/game/HeldBreak.js';
import { Duel, DUEL_SPELLS } from '../../src/game/Duel.js';
import { Liquidation } from '../../src/game/Liquidation.js';
import { ARENA_SPELLS } from '../../src/game/ArenaRules.js';
import { DUEL_SPELL_NAME } from '../../src/game/Mana.js';
import { SPELL_SOUND, SPELL_GEN } from '../../src/audio/SpellMusic.js';

const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- creatures
const model = (toolKind, shield = false) => ({
    toolKind, shield: shield ? { visible: true } : null,
    setHeldTool(k) { this.toolKind = k; },
    dropShield() { this.shield = null; return true; },
});
const person = (role, toolKind, extra = {}) => ({ id: role + ':1', role, isVillager: true, model: model(toolKind, role === 'knight' || role === 'king'), ...extra });

test('the plain «Liquidation» crumbles a knight\'s sword (he fights with fists), not a wizard\'s wand', () => {
    const k = person('knight', 'sword');
    const r = breakCreatureHeld({}, k, { max: false });
    assert.equal(r.out, 'weapon');
    assert.equal(k.disarmed, true);
    assert.equal(k.model.toolKind, 'none');
    assert.ok(k.model.shield, 'the shield is the other hand: untouched');
    const w = person('wizard', 'wand', { wizard: true });
    const r2 = breakCreatureHeld({}, w, { max: false });
    assert.equal(r2.out, null);
    assert.match(r2.why, /Максима/);
    assert.equal(w.model.toolKind, 'wand');
    assert.ok(!w.noWand);
});

test('the Maxima takes the wand, the king\'s magic sword and the captain\'s rapier', () => {
    const w = person('wizard', 'wand', { wizard: true });
    assert.equal(breakCreatureHeld({}, w, { max: true }).out, 'wand');
    assert.equal(w.noWand, true);
    assert.equal(w.model.toolKind, 'none');
    assert.equal(w.lostWand, null, 'nothing lying about to fetch');
    const king = person('king', 'sword');
    assert.equal(breakCreatureHeld({}, king, { max: false }).out, null, 'the king\'s sword is magic');
    assert.equal(breakCreatureHeld({}, king, { max: true }).out, 'weapon');
    const bb = person('blackbeard', 'rapier', { isSailor: true });
    assert.equal(breakCreatureHeld({}, bb, { max: false }).out, null, 'cursed rapier');
    assert.equal(breakCreatureHeld({}, bb, { max: true }).out, 'weapon', 'Maxima works even on Black Moustache');
    assert.equal(bb.disarmed, true);
});

test('skeletons and sailors lose their sabre / axe / pistol to the plain one too (then fists)', () => {
    for (const tool of ['cutlass', 'axe', 'pistol', 'sword']) {
        const s = person('skeleton', tool, { isSailor: true });
        assert.equal(breakCreatureHeld({}, s, { max: false }).out, 'weapon', tool);
        assert.equal(s.disarmed, true);
        assert.equal(s.model.toolKind, 'none');
        assert.equal(breakCreatureHeld({}, s, { max: true }).out, null, 'nothing left in the hands');
    }
});

test('priority: the hand with the sword first; an empty main hand — the other (the shield); a hoe is a plain tool', () => {
    const k = person('knight', 'sword');
    assert.deepEqual(creatureSlots(k).map((s) => s.kind), ['weapon', 'shield']);
    assert.equal(chooseSlot(creatureSlots(k), false).kind, 'weapon');
    const k2 = person('knight', 'none');
    assert.deepEqual(creatureSlots(k2).map((s) => s.kind), ['shield']);
    const r = breakCreatureHeld({}, k2, { max: false });
    assert.equal(r.out, 'shield');
    assert.equal(k2.shieldGone, true);
    assert.equal(k2.model.shield, null);
    assert.equal(breakCreatureHeld({}, k2, { max: true }).out, null, 'both hands empty');
    const f = person('farmer', 'hoe');
    assert.equal(breakCreatureHeld({}, f, { max: false }).out, 'tool');
    assert.equal(f.toolGone, true);
});

test('gifts of the gods and an arena wand are never taken, Maxima too', () => {
    assert.equal(slotVerdict({ kind: 'item', godGift: true, magic: true }, true).act, 'no');
    assert.match(slotVerdict({ kind: 'item', godGift: true }, true).why, /дар богов/);
    assert.equal(slotVerdict({ kind: 'wand', arena: true, magic: true }, true).code, 'arena');
    assert.equal(slotVerdict({ kind: 'weapon', magic: false }, false).act, 'break');
    assert.equal(slotVerdict({ kind: 'weapon', magic: true }, false).code, 'magic');
    assert.equal(slotVerdict({ kind: 'weapon', magic: true }, true).act, 'break');
    assert.equal(slotVerdict(null, true).act, 'no');
    assert.ok(liquidationNeedsMaxima({ kind: 'wand' }) && !liquidationNeedsMaxima({ kind: 'apple' }));
});

test('the Maxima duel takes the WAND first (the loser loses his wand); the plain duel charge only a non-magic thing', () => {
    const slots = [{ hand: 'right', kind: 'weapon', magic: false }, { hand: 'left', kind: 'wand', magic: true }];
    assert.equal(chooseSlot(slots, true, true).kind, 'wand', 'Maxima + wandFirst');
    assert.equal(chooseSlot(slots, false, true).kind, 'weapon', 'plain: the priority hand');
    assert.deepEqual(duelBreaks('LiquidationMaximaDuel'), { max: true, wandFirst: true });
    assert.deepEqual(duelBreaks('LiquidationDuel'), { max: false, wandFirst: false });
    assert.ok(isLiquidationDuel('LiquidationDuel') && isLiquidationDuel('LiquidationMaximaDuel') && !isLiquidationDuel('Liquidation'));
});

// ---------------------------------------------------------------- me
function me({ right = null, left = null, dom = 'right' } = {}) {
    const held = { right: right && { item: right }, left: left && { item: left } };
    const hands = { right: { held: null }, left: { held: null } };
    const log = { released: [], removed: [], gone: [] };
    const g = {
        dom, items: { held, releaseHand(s) { const h = held[s]; held[s] = null; log.released.push(s); return h?.item || null; } },
        weapons: { hands, byId: new Map(), weapons: [], release(s) { hands[s].held = null; log.released.push('w' + s); }, remove(w) { log.removed.push(w.id); } },
        sync: { weaponGone: (w) => log.gone.push(w.id) }, inventory: { ownWand: 'W1', inHand: null }, wandMagic: { light: false },
    };
    return { g, log, hands };
}

test('me: the plain splash takes an apple / a plain shield, not my wand; the Maxima takes the wand', () => {
    const wand = { kind: 'wand', uid: 'W1' };
    const a = me({ right: wand });
    const r = breakMyHeld(a.g, { max: false });
    assert.equal(r.out, null);
    assert.match(r.why, /Максима/);
    assert.equal(a.g.items.held.right?.item, wand);
    const b = me({ right: wand });
    assert.equal(breakMyHeld(b.g, { max: true }).out, 'wand');
    assert.equal(b.g.items.held.right, null);
    assert.equal(b.g.inventory.ownWand, null, 'a wand that is gone is not looked for');
    const c = me({ right: { kind: 'shield', type: 0, magic: false } });
    assert.equal(breakMyHeld(c.g, { max: false }).out, 'shield');
    assert.equal(mySlots(me({ right: { kind: 'apple' } }).g)[0].kind, 'item');
});

test('me: the hand with the thing is the target — the dominant one first, else the other', () => {
    const sword = { id: 7, magic: false };
    const a = me({ left: { kind: 'apple' }, dom: 'right' });
    a.hands.right.held = sword;
    a.g.weapons.byId.set(7, sword);
    const r = breakMyHeld(a.g, { max: false });
    assert.equal(r.out, 'weapon', 'the right hand first');
    assert.deepEqual(a.log.removed, [7]);
    assert.deepEqual(a.log.gone, [7], 'the others see it gone');
    assert.ok(a.g.items.held.left, 'the apple in the left hand stays');
    // an empty right hand: the left one
    const b = me({ left: { kind: 'apple' }, dom: 'right' });
    assert.equal(breakMyHeld(b.g, { max: false }).out, 'item');
    assert.equal(b.g.items.held.left, null);
    // left-handed: the left first
    const c = me({ right: { kind: 'apple' }, left: { kind: 'bread' }, dom: 'left' });
    breakMyHeld(c.g, { max: false });
    assert.equal(c.g.items.held.left, null);
    assert.ok(c.g.items.held.right);
    // nothing in the hands
    assert.equal(breakMyHeld(me().g, { max: true }).out, null);
    // a god's gift in the hand: no
    const d = me({ right: { kind: 'iceRod', godGift: true } });
    assert.equal(breakMyHeld(d.g, { max: true }).out, null);
    assert.ok(d.g.items.held.right);
    // an arena wand won from a wizard: the steward's, no
    const e = me({ right: { kind: 'wand', arenaWand: true } });
    assert.equal(breakMyHeld(e.g, { max: true }).out, null);
});

// ---------------------------------------------------------------- the duel charges
test('the duel charges exist, are told apart from the splash, cost what the splash costs, have sounds and arena rules', () => {
    for (const s of ['LiquidationDuel', 'LiquidationMaximaDuel']) {
        const d = DUEL_SPELLS[s];
        assert.ok(d && d.name.includes('дуэльный'), s);
        assert.ok(d.speed >= 15 && d.speed <= 16.5, 'fast as the other charges: ' + d.speed);
        assert.ok(ARENA_SPELLS[s], 'arena rule: ' + s);
        assert.ok(SPELL_SOUND[s]?.own?.every((k) => SPELL_GEN[k]), 'sound: ' + s);
    }
    assert.equal(DUEL_SPELL_NAME.LiquidationDuel, 'Liquidation');
    assert.equal(DUEL_SPELL_NAME.LiquidationMaximaDuel, 'LiquidationMaxima');
    assert.ok(DUEL_SPELLS.LiquidationMaximaDuel.glow > DUEL_SPELLS.LiquidationDuel.glow, 'the Maxima is thicker');
    // the hand that points at a creature casts the duel charge; the words are the same (Game.js)
    assert.match(src('src/game/Game.js'), /name === 'Liquidation' \? 'LiquidationDuel' : 'LiquidationMaximaDuel'/);
});

function duelWorld({ held = null, authority = true } = {}) {
    const meGroup = new THREE.Group();
    meGroup.position.set(0, -1.25, 0.3);
    const l = me(held || {});
    const said = [], dmg = [];
    const g = {
        ...l.g, localId: 'me', authority, scene: new THREE.Scene(), remotes: new Map(), zombies: [], zombieById: new Map(),
        fx: { spark() {}, lightFlash() {} }, hud: { setVoice: (t) => said.push(t), flashColor() {}, setDuelBar() {} }, sound: {},
        impact: { apply() {} },
        castOrigin: (s, out = V()) => out.set(0, 0, 0),
        character: { group: meGroup, getHandWorldPosition: (s, o = V()) => o.set(0, 0, 0) },
        combat: { dead: false, enabled: true, center: (o) => o.copy(meGroup.position).add(V(0, 0.6, 0)), shieldFactor: () => 0, _blocked: () => false, damage: (n, by, kind) => dmg.push([n, by, kind]) },
        armor: { guard: () => false },
    };
    const d = new Duel(g);
    d._burst = () => {};
    return { g, d, said, dmg, l };
}

test('I lose a «Liquidation Maxima» duel: my WAND crumbles; a plain «Liquidation» duel hits me without taking the wand', () => {
    const wand = { kind: 'wand', uid: 'W1' };
    const w = duelWorld({ held: { right: wand, left: { kind: 'apple' } } });
    w.d.applyToMe('LiquidationMaximaDuel', 'foe', 'right', { clash: true });
    assert.equal(w.g.items.held.right, null, 'the wand is gone');
    assert.ok(w.g.items.held.left, 'the apple in the other hand stays: the wand was the target');
    assert.deepEqual(w.dmg, [[3, 'foe', 'Liquidation']]);
    assert.match(w.said.at(-1), /палочка рассыпалась/);
    assert.ok(w.d.log.some((e) => e.ev === 'liquidated' && e.out === 'wand'));

    const p = duelWorld({ held: { right: wand, left: { kind: 'apple' } } });
    p.d.applyToMe('LiquidationDuel', 'foe', 'right');
    assert.equal(p.g.items.held.right?.item, wand, 'the plain charge cannot take a wand (magic)');
    assert.ok(p.g.items.held.left, 'the priority hand holds the wand: the apple is not taken instead');
    assert.match(p.said.at(-1), /Максима/);

    const q = duelWorld({ held: { right: { kind: 'bread' } } });
    q.d.applyToMe('LiquidationDuel', 'foe', 'right');
    assert.equal(q.g.items.held.right, null, 'a plain thing crumbles');
    const e = duelWorld();
    e.d.applyToMe('LiquidationMaximaDuel', 'foe', 'right');
    assert.match(e.said.at(-1), /ничего не было/);
});

test('a duel charge at a knight / a skeleton / a wizard: the host crumbles what they hold (and a ward stops it)', () => {
    const w = duelWorld();
    const L = new Liquidation(w.g);
    w.g.liquidation = L;
    w.g.duel = w.d;
    const knight = { ...person('knight', 'sword'), x: 0, y: 0, z: -5 };
    const skel = { ...person('skeleton', 'cutlass', { isSailor: true }), x: 0, y: 0, z: -9 };
    const wiz = { ...person('wizard', 'wand', { wizard: true }), x: 0, y: 0, z: -7 };
    w.d._creature = (k, id) => ({ v: knight, c: skel }[k]);
    L.breakHeld('v', knight.id, V(0, 1, -5), 'me', false, V(0, 1, 0), false);
    assert.equal(knight.disarmed, true);
    L.breakHeld('c', skel.id, V(0, 1, -9), 'me', false, V(0, 1, 0), false);
    assert.equal(skel.disarmed, true, 'a skeleton\'s sabre is taken by the plain one');
    w.d._creature = () => wiz;
    L.breakHeld('v', wiz.id, V(0, 1, -7), 'me', false, V(0, 1, 0), false);
    assert.ok(!wiz.noWand, 'the plain one: not a wand');
    L.breakHeld('v', wiz.id, V(0, 1, -7), 'me', true, V(0, 1, 0), true);
    assert.equal(wiz.noWand, true, 'the Maxima: the wand');
    // a guest does not decide for creatures (the host does)
    const guest = duelWorld({ authority: false });
    const L2 = new Liquidation(guest.g);
    const k2 = { ...person('knight', 'sword') };
    guest.d._creature = () => k2;
    guest.g.duel = guest.d;
    L2.breakHeld('v', k2.id, V(0, 1, -5), 'me', true, V(0, 1, 0), false);
    assert.ok(!k2.disarmed, 'only the host');
    // a guest player decides for himself: his own computer breaks his own hand
    const gp = duelWorld({ authority: false, held: { right: { kind: 'bread' } } });
    new Liquidation(gp.g).breakHeld('p', 'me', V(), 'foe', false, V(), false);
    assert.equal(gp.g.items.held.right, null);
});

test('the dead hold nothing; sync: the guests see the sabre / the shield / the wand gone', () => {
    const dead = person('knight', 'sword', { dead: true });
    const L = new Liquidation(duelWorld().g);
    L.game.duel = { _creature: () => dead };
    L.breakHeld('v', dead.id, V(), 'me', false, V(), false);
    assert.ok(!dead.disarmed, 'nothing to crumble: dropped already');
    const cl = src('src/game/CastleLife.js');
    assert.match(cl, /\(v\.disarmed \? 1 : 0\) \| \(v\.shieldGone \? 2 : 0\) \| \(v\.toolGone \? 4 : 0\)/, 'villagers: bits sent');
    assert.match(cl, /disarmed & 2\) && !v\.shieldGone/, 'villagers: bits applied');
    const sl = src('src/game/Sailors.js');
    assert.match(sl, /v\.disarmed \? 1 : 0\]\);/, 'sailors: sent');
    assert.match(sl, /a\[12\] && !v\.disarmed/, 'sailors: applied');
    assert.match(sl, /v\.disarmed \? Math\.max\(1, Math\.round\(v\.dmg \* EXPELLIARMUS\.FIST\)\)/, 'sailors without a weapon hit with fists');
});

test('the table «who / what» is written for every kind (CLAUDE.md)', () => {
    for (const [k, t] of Object.entries(HELD_TARGETS)) assert.ok(t.does && t.why, k);
    for (const k of ['players', 'knights', 'king', 'wizards', 'sailors', 'blackbeard', 'skeletons', 'zombies', 'animals', 'godGifts', 'arenaWand', 'carried']) assert.ok(HELD_TARGETS[k], k);
});
