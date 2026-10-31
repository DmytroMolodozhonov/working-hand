// Monster form, two of the author's complaints: «правая кисть монстра не работает, левая работает» and «монстр НЕ может брать предметы
// из карманов/инвентаря, пока не вернулся в обычный вид; подсказка один раз».
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MonsterTransform } from '../../src/game/MonsterTransform.js';
import { VoxelCharacter, PLAYER_GROUND_OFFSET } from '../../src/entities/Character.js';
import { Inventory } from '../../src/game/Inventory.js';
import { ItemSystem as Items } from '../../src/game/Items.js';
import { CoinBelt } from '../../src/game/CoinBelt.js';
import { DarkHero } from '../../src/game/DarkMagic.js';

function fakeGame({ wandSide = 'right' } = {}) {
    const scene = new THREE.Scene();
    const ch = new VoxelCharacter(scene);
    ch.group.position.set(0, PLAYER_GROUND_OFFSET, 0);
    const wand = { kind: 'wand', uid: 'w1' };
    const held = { left: null, right: null };
    held[wandSide] = { item: wand, model: new THREE.Group(), gripped: true, q: new THREE.Quaternion() };
    const toasts = [];
    const g = {
        scene, character: ch, items: { held, _throw() {} }, config: { mode: 'creative' }, combat: { enabled: false }, playerHP: 20, maxHP: 20,
        dark: new DarkHero(null), hud: { setVoice() {}, setMonsterTimer() {}, toast: (t) => toasts.push(t) }, fx: { shake: 0, spark() {} },
        sound: { spellCast() {} }, sync: { castSound() {}, itemHold() {} }, stopSpells() {}, localId: 'me',
        terrain: { data: { get: () => 0, set() {}, topLayer: () => 0, floorBelow: () => 0, solidIn: () => false, ceilingAbove: () => Infinity } },
        collision: { pointBlocked: () => false }, builder: { _sendEdits() {} },
    };
    g.monster = new MonsterTransform(g);
    // (the wand's grip, as Items.update puts it on: the fingers held at half-closed round the handle)
    ch.getActiveHands()[wandSide].setGrip(0.5, null);
    ch.aim = { left: null, right: null }; ch.aim[wandSide] = { dir: new THREE.Vector3(0, 0, -1), at: 1 };
    return { g, ch, toasts };
}

for (const side of ['right', 'left']) {
    test(`the hand that held the wand (${side}) is free as the other: the grip is off, both fists close and open`, () => {
        const { g, ch } = fakeGame({ wandSide: side });
        const hand = ch.getActiveHands()[side];
        assert.ok(hand.gripOverride, 'before: the wand\'s grip holds the fingers');
        assert.equal(g.monster.begin(), true);
        for (const s of ['left', 'right']) {
            assert.equal(ch.getActiveHands()[s].gripOverride, null, `${s}: no grip`);
            assert.equal(ch.aim[s], null, `${s}: no wand aim`);
        }
        assert.equal(g.items.held[side].gripped, false, 'the wand will grip again when it is back');
        // both hands: the tracked fingers shut → drawn fingers follow (before, the wand's hand stayed at ~0.5)
        for (const s of ['left', 'right']) {
            const h = ch.getActiveHands()[s];
            for (const f in h.targetState.fingers) h.targetState.fingers[f] = 1;
            for (let i = 0; i < 90; i++) h._stepState();
            assert.ok(h.currentState.fingers.index > 0.9, `${s}: fist closes (${h.currentState.fingers.index.toFixed(2)})`);
            for (const f in h.targetState.fingers) h.targetState.fingers[f] = 0;
            for (let i = 0; i < 90; i++) h._stepState();
            assert.ok(h.currentState.fingers.index < 0.1, `${s}: palm opens (${h.currentState.fingers.index.toFixed(2)})`);
            assert.ok(ch.getGripCurl(s) < 0.35, `${s}: the tracked curl reads open`);
        }
    });
}

test('the wand\'s hand was stuck at half-closed before the fix (the hand cannot open or shut under the grip)', () => {
    const { ch } = fakeGame();
    const h = ch.getActiveHands().right;
    for (const f in h.targetState.fingers) h.targetState.fingers[f] = 1;
    for (let i = 0; i < 90; i++) h._stepState();
    assert.ok(h.currentState.fingers.index < 0.7, 'under the grip the fist cannot close');
});

test('while the form lasts a grip that comes back is taken off again (every frame, only on a wand hand)', () => {
    const { g, ch } = fakeGame();
    g.monster.begin();
    g.monster.phase = 'on';
    ch.getActiveHands().right.setGrip(0.5, null);
    g.monster._freeWandHand();
    assert.equal(ch.getActiveHands().right.gripOverride, null);
});

// ---------------------------------------------------------------- pockets

function inv(active) {
    const toasts = [];
    const g = { monster: { active, _pocketHint: false }, hud: { toast: (t) => toasts.push(t) }, items: { held: { left: null, right: null }, takeIntoHand() { throw new Error('took'); } }, weapons: { hands: { left: {}, right: {} } } };
    const o = { game: g, slots: [{ kind: 'apple', uid: 'a1', count: 1 }, null, null], selected: -1, inHand: null, _render() {}, _putBackHand() {}, _takeIntoHand() {}, monsterShut: Inventory.prototype.monsterShut };
    return { o, toasts, g };
}

test('pockets: shut in the monster form — every way in is refused, the hint comes once', () => {
    const { o, toasts, g } = inv(true);
    o.select = Inventory.prototype.select;
    o.select(0);
    assert.equal(o.selected, -1, 'the cell is not chosen');
    o.select(1);
    assert.deepEqual(toasts, ['🐺 В облике монстра карманы недоступны'], 'one hint for all tries');
    for (const name of ['takeNext', 'pocketTouch', 'pocketRight', 'wandPocket', '_backGesture', '_fromSlot']) {
        assert.ok(!Inventory.prototype[name].call(o, 0, 'right'), `${name} refuses`);
    }
    assert.equal(toasts.length, 1);
    g.monster._pocketHint = false; // (a new form: the hint again)
    o.select(0);
    assert.equal(toasts.length, 2);
});

test('pockets: open as ever in a man\'s form; the free hand (-1) is allowed in the monster\'s', () => {
    const { o, toasts } = inv(false);
    assert.equal(o.monsterShut(), false);
    o.select = Inventory.prototype.select;
    o.select(0);
    assert.equal(o.selected, 0);
    const m = inv(true);
    m.o.select = Inventory.prototype.select;
    m.o.select(-1);
    assert.equal(m.toasts.length, 0);
});

test('Items: nothing goes into a monster\'s paw (a slot, Accio, a body) or its slots from the ground', () => {
    const toasts = [];
    const shut = () => { toasts.push('shut'); };
    const it = Object.create(Items.prototype);
    it.game = { monster: { active: true }, inventory: { monsterShut: shut }, localId: 'me' };
    it.held = { left: null, right: null };
    it.loose = new Map([['u1', { item: { uid: 'u1', kind: 'apple' }, asked: true }]]);
    assert.equal(it.takeIntoHand({ kind: 'apple', uid: 'x' }, 'right'), false);
    assert.equal(it.held.right, null);
    it.pickUp('u1', 'me', 'right');
    assert.ok(it.loose.has('u1'), 'the thing stays on the ground');
    assert.equal(it.loose.get('u1').asked, false);
    assert.equal(toasts.length, 2);
});

test('the pouch of the belt stays on the belt in the monster form', () => {
    const calls = [];
    const belt = Object.create(CoinBelt.prototype);
    belt.game = { inventory: { monsterShut: () => { calls.push('shut'); return true; } }, items: { takeIntoHand() { throw new Error('took'); } } };
    belt.log = [];
    belt._take('left');
    assert.deepEqual(calls, ['shut']);
});
