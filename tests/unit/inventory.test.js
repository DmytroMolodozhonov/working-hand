import test from 'node:test';
import assert from 'node:assert/strict';
import { pocketStrike, behindBack } from '../../src/game/Inventory.js';

const hist = (ys, step = 50) => ys.map((y, i) => ({ t: i * step, y }));
const at = (x, y) => ({ x, y, z: 0 });

test('pocket: a quick strike down that stops on the hip counts', () => {
    assert.ok(pocketStrike(hist([1.0, 0.85, 0.45, 0.0, -0.05, -0.06]), at(0.7, -0.06), 1));
});

test('pocket: lowering a sword fast and letting it hang does not (no stop on the hip)', () => {
    assert.ok(!pocketStrike(hist([1.0, 0.75, 0.45, 0.15, -0.15]), at(0.7, -0.15), 1));
    // a small quick drop near the hip neither
    assert.ok(!pocketStrike(hist([0.3, 0.2, 0.0, -0.05, -0.05]), at(0.7, -0.05), 1));
});

test('back: over the shoulder and still counts; a fast overhead swing does not', () => {
    assert.ok(behindBack({ x: 0.4, y: 1.8, z: 0.1 }, 0.8));
    assert.ok(!behindBack({ x: 0.4, y: 1.8, z: 0.1 }, 6));
    assert.ok(!behindBack({ x: 0.4, y: 1.8, z: -0.9 }, 0.5)); // raised in front
    assert.ok(!behindBack({ x: 0.7, y: -0.5, z: 0 }, 0.2)); // hanging
});

test('pocket: slowly lowering the hand (holding a sword down) does not', () => {
    assert.ok(!pocketStrike(hist([0.9, 0.85, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0], 120), at(0.7, 0.0), 1));
});

test('pocket: a hand hanging still does not; the other side does not', () => {
    assert.ok(!pocketStrike(hist([0, 0, 0, 0]), at(0.7, 0.0), 1));
    assert.ok(!pocketStrike(hist([0.9, 0.5, 0.0]), at(0.7, 0.0), -1));
});

test('a thing held in the right hand and brought to the right hip (as a pouch is tied on) goes into a slot; a hanging arm does not', async () => {
    const { Inventory } = await import('../../src/game/Inventory.js');
    const { purseHand, pocketPose } = await import('../../src/input/PoseInterpreter.js');
    const { frame } = await import('../e2e/poses.mjs');
    const rightHand = (f) => f.hands.find((h) => h.label === 'Left')?.landmarks;
    // the hand holding the cheese is seen, its fingers round the cheese: never «in the pocket» — the hip place counts
    const hip = frame({ arms: 'hang', purse: 'hip', rightCurl: 0.9 });
    assert.equal(pocketPose(hip.poseLandmarks, rightHand(hip), 'right'), false);
    assert.equal(purseHand(hip.poseLandmarks, 'right'), true);
    const hang = frame({ arms: 'hang', rightCurl: 0.9 });
    assert.equal(purseHand(hang.poseLandmarks, 'right'), false);
    // what may go there: food and the like — not the wand (its waistband), coins (the belt), a sword or a shield (the back)
    const can = (item, weapon = null) => Inventory.prototype._pocketable.call({ game: { items: { held: { right: item ? { item } : null } }, weapons: { hands: { right: { held: weapon } } } } }, 'right');
    assert.ok(can({ kind: 'cheese' }));
    assert.ok(!can({ kind: 'wand' }) && !can({ kind: 'coins' }) && !can({ kind: 'shield' }) && !can(null) && !can(null, {}));
});

// Creative: five golden apples are always with the hero
import { Inventory, CREATIVE_APPLES, APPLES_WAIT } from '../../src/game/Inventory.js';
const fake = (mode = 'creative', slots = [null, null, null, null, null], held = {}) => ({ game: { config: { mode }, items: { held }, isDeadLocal: false }, slots, _render() {}, ensure: Inventory.prototype.ensureCreativeApples });
const total = (inv) => inv.slots.reduce((n, s) => n + (s?.kind === 'apple' ? s.count : 0), 0);

test('creative start: no apples → five at once in one cell; the wand stays; Survival gets none', () => {
    const inv = fake('creative', [{ kind: 'wand' }, null, null, null, null]);
    assert.ok(inv.ensure(99));
    assert.equal(total(inv), CREATIVE_APPLES);
    assert.equal(inv.slots[0].kind, 'wand');
    assert.equal(inv.slots.filter((s) => s?.kind === 'apple').length, 1);
    const surv = fake('survival');
    assert.ok(!surv.ensure(99) && total(surv) === 0);
});

test('creative: one eaten → back to five after a pause, not at once; a stack in the hand counts; no room waits', () => {
    const inv = fake();
    inv.ensure(99);
    inv.slots.find((s) => s).count = 4;
    assert.ok(!inv.ensure(0.5) && total(inv) === 4);
    assert.ok(inv.ensure(APPLES_WAIT) && total(inv) === 5);
    const hand = fake('creative', [null, null, null, null, null], { right: { item: { kind: 'apple', count: 5 } } });
    assert.ok(!hand.ensure(99) && total(hand) === 0);
    const full = fake('creative', Array.from({ length: 5 }, () => ({ kind: 'sword' })));
    assert.ok(!full.ensure(99));
    full.slots[2] = null;
    assert.ok(full.ensure(99) && total(full) === 5);
    const dead = fake(); dead.game.isDeadLocal = true;
    assert.ok(!dead.ensure(99));
});
