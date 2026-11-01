// Coins come out of the pouch only when buying or selling (CoinDeal.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Inventory } from '../../src/game/Inventory.js';
import { CoinDeal, DEAL, dealer } from '../../src/game/CoinDeal.js';
import { makeMagicPouch } from '../../src/game/CoinBelt.js';

function fakeGame({ mode = 'survival', remotes = 0 } = {}) {
    const held = { right: null, left: null }, loose = new Map(), merchants = new Map();
    const night = { shut: false, deal: false, closed() { return this.shut; }, dealHeld() { return this.deal; } };
    const counter = { x0: 10, x1: 15, z0: 0, z1: 2, top: 2 };
    const g = {
        dom: 'right', config: { mode }, isDeadLocal: false, remotes: new Map(),
        hud: { toast: (t) => { g.toasts.push(t); }, setVoice: () => {} },
        toasts: [],
        fx: { spark: () => {} },
        character: { getHandWorldPosition: (s, v = new THREE.Vector3()) => v.set(0, 1, 0), group: { position: new THREE.Vector3(12, 0, 5) } },
        weapons: { hands: { right: { held: null }, left: { held: null } } },
        items: {
            held, loose,
            takeIntoHand(item, side) { if (held[side]) return false; held[side] = { item }; return true; },
            releaseHand(side) { const h = held[side]; held[side] = null; return h?.item || null; },
            removeLoose(uid) { const L = loose.get(uid); loose.delete(uid); return L?.item || null; },
        },
        castleLife: {
            byId: merchants, night,
            castles: new Map([['c', { awake: true, def: { stalls: [{ counter }] } }]]),
            talk: {
                _trader: (v) => v.role === 'merchant',
                _counterCoins: () => [...loose.values()].filter((L) => L.item.kind === 'coins' && !L.item.shop),
            },
        },
    };
    for (let i = 0; i < remotes; i++) g.remotes.set('p' + i, {});
    g.coinDeal = new CoinDeal(g);
    g.inventory = new Inventory(g);
    g.night = night;
    g.addMerchant = (o = {}) => merchants.set('m', { id: 'm', role: 'merchant', x: 12, y: 0, z: 2, cs: {}, entry: { stall: 0 }, ...o });
    return g;
}
const tick = (g, s) => { for (let t = 0; t < s; t += 0.1) { g.coinDeal.update(0.1); } };
const take = (g, side = 'left') => g.inventory.purse._take(side);

test('no deal: the pouch does not come out, the hint is told, rarely', () => {
    const g = fakeGame(); g.inventory.purse.count = 300;
    take(g); take(g); take(g);
    assert.equal(g.items.held.left, null);
    assert.equal(g.inventory.purse.count, 300);
    assert.equal(g.inventory.purse.magic, true);
    assert.equal(g.toasts.length, 1, 'the hint once, not on every try');
    assert.match(g.toasts[0], /покупаете или продаёте/);
    g.inventory.pouchClick(); assert.equal(g.items.held.left, null);
    g.inventory.pocketTouch('left'); assert.equal(g.items.held.left, null, 'the pocket circle does not give it');
});

test('a merchant near: the pouch comes out as always', () => {
    const g = fakeGame(); g.addMerchant(); g.inventory.purse.count = 300;
    take(g);
    assert.equal(g.items.held.left.item.count, 300);
    assert.equal(g.inventory.purse.magic, false);
    assert.ok(!g.toasts.some((t) => /покупаете или продаёте/.test(t)), 'no hint in a deal');
});

test('not a deal: far, dead, enemy, asleep, scared, shut for the night', () => {
    for (const o of [{ x: 12 + DEAL.NEAR + 3 }, { dead: true }, { foe: true }, { sleep: true }, { fleeT: 2 }]) {
        const g = fakeGame(); g.addMerchant(o); g.inventory.purse.count = 50; take(g);
        assert.equal(g.items.held.left, null, JSON.stringify(o));
    }
    const g = fakeGame(); g.addMerchant(); g.night.shut = true; g.inventory.purse.count = 50; take(g);
    assert.equal(g.items.held.left, null, 'night');
    g.night.deal = true; g.coinDeal._look = 0; take(g);
    assert.equal(g.items.held.left.item.count, 50, 'a deal held open at night goes on');
});

test('the deal is over: the pouch in the hand goes back into the belt, nothing is lost', () => {
    const g = fakeGame(); g.addMerchant(); g.inventory.purse.count = 300;
    take(g); assert.equal(g.inventory.purse.magic, false);
    tick(g, 1); assert.ok(g.items.held.left, 'still the deal');
    g.castleLife.byId.get('m').dead = true; // (killed)
    tick(g, 1); assert.ok(g.items.held.left, 'a short grace');
    tick(g, 3);
    assert.equal(g.items.held.left, null);
    assert.equal(g.inventory.purse.magic, true);
    assert.equal(g.inventory.purse.count, 300);
    assert.equal(g.inventory.coins(), 300);
});

test('my pouch left on the counter: the deal goes on while I am at it; alone it comes home when the deal is over', () => {
    const g = fakeGame(); g.inventory.purse.count = 0;
    g.items.loose.set('u', { item: makeMagicPouch('u', 120), model: { position: new THREE.Vector3(12, 2, 1) }, vel: new THREE.Vector3() });
    tick(g, 1);
    assert.equal(g.coinDeal._open, true, 'a pouch on my counter keeps the deal');
    assert.equal(g.items.loose.size, 1);
    g.coinDeal._counterPouches = (any) => (any ? false : [...g.items.loose.values()]); // (the deal is over, I still stand at the counter)
    tick(g, 4);
    assert.equal(g.items.loose.size, 0, 'swept');
    assert.equal(g.inventory.purse.count, 120);
});

test('two players at one merchant: another player\'s pouch on the counter is not swept', () => {
    const g = fakeGame({ remotes: 1 }); g.inventory.purse.count = 0;
    g.items.loose.set('their', { item: makeMagicPouch('their', 80), model: { position: new THREE.Vector3(12, 2, 1) }, vel: new THREE.Vector3() });
    g.coinDeal._counterPouches = (any) => (any ? false : [...g.items.loose.values()]);
    tick(g, 4);
    assert.equal(g.items.loose.size, 1, 'not mine: left where it is');
    assert.equal(g.inventory.purse.count, 0);
});

test('creative: as before; dead: no', () => {
    const g = fakeGame({ mode: 'creative' }); g.inventory.purse.count = 9;
    take(g); assert.equal(g.items.held.left.item.count, 9);
    const d = fakeGame(); d.addMerchant(); d.isDeadLocal = true; d.inventory.purse.count = 9; take(d);
    assert.equal(d.items.held.left, null);
});

test('death: the pouch drops whole with its coins (unchanged)', () => {
    const g = fakeGame(); g.inventory.purse.count = 77;
    const out = g.inventory.purse.takeAll();
    assert.equal(out.length, 1); assert.equal(out[0].count, 77);
});

test('old save: coins lying in a slot go into the belt', () => {
    const g = fakeGame(); g.inventory.purse.count = 10;
    g.inventory.slots[2] = { kind: 'coins', uid: 's', count: 90 };
    g.character.group.position.set(0, 0, 0);
    tick(g, 0.2);
    assert.equal(g.inventory.slots[2], null);
    assert.equal(g.inventory.purse.count, 100);
});

test('dealer(): the pure rule', () => {
    const me = { x: 0, z: 0 };
    assert.equal(dealer({ x: 3, z: 3 }, me), true);
    assert.equal(dealer({ x: 30, z: 0 }, me), false);
    assert.equal(dealer({ x: 1, z: 1, dead: true }, me), false);
    assert.equal(dealer(null, me), false);
});
