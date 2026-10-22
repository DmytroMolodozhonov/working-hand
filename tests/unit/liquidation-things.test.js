// «Liquidation»: a cauldron, a chest, a bed, a door… are reached by their solid box and crumble
// (the big ones only by «Максима»); what crumbled is remembered and never made again.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Liquidation, thingVerdict } from '../../src/game/Liquidation.js';
import { CollisionWorld } from '../../src/world/Collision.js';

test('what crumbles by which splash (and what never does)', () => {
    for (const k of ['cauldron', 'chest', 'bed', 'door']) {
        assert.equal(thingVerdict(k, false), 'maxima', k);
        assert.equal(thingVerdict(k, true), 'dust', k);
    }
    for (const k of ['board', 'campfire', 'crystal']) assert.equal(thingVerdict(k, false), 'dust', k);
    assert.ok(thingVerdict('door', true, { gate: true }).none);
    assert.ok(thingVerdict('chest', true, { ship: true }).none);
    assert.ok(thingVerdict('chest', true, { id: 'cart:7' }).none);
    assert.ok(thingVerdict('chest', true, { room: 'iceQueen', locked: true }).none);
    assert.ok(thingVerdict('cauldron', true, { godGift: true }).none);
});

function world() {
    const collision = new CollisionWorld();
    const said = [], sent = [];
    const caul = { id: 'cave:5', pos: new THREE.Vector3(5, 0.6, 0), boxId: null };
    caul.boxId = collision.addBox({ minX: 4.4, maxX: 5.6, minY: 0, maxY: 1.3, minZ: -0.6, maxZ: 0.6, kind: 'cauldron' });
    const g = {
        localId: 'me', authority: true, collision,
        hud: { setVoice: (t) => said.push(t) },
        fx: { spark() {}, lightFlash() {}, glow: { spawn() {} } },
        sound: {}, mana: { success() {} },
        items: { loose: new Map() }, weapons: { weapons: [] },
        sync: { liquidated: (k, id) => sent.push([k, id]) },
        cauldrons: {
            list: new Map([[caul.id, caul]]),
            destroy(id) { const c = this.list.get(id); collision.removeBox(c.boxId); this.list.delete(id); return true; },
        },
    };
    return { g, said, sent, caul };
}

test('the cauldron: the plain splash breaks on it, «Максима» crumbles it — for everybody, for good', () => {
    const { g, said, sent } = world();
    const L = new Liquidation(g);
    const a = new THREE.Vector3(0, 0.7, 0), b = new THREE.Vector3(8, 0.7, 0), d = new THREE.Vector3(1, 0, 0);
    let h = L._first(a, b, d, 'me', false);
    assert.equal(h?.kind, 'box');
    L._strike(h, 'Liquidation', a, d, 'me', false);
    assert.ok(g.cauldrons.list.has('cave:5'), 'the plain splash does not take it');
    assert.match(said.at(-1), /Максима/);
    h = L._first(a, b, d, 'me', true);
    L._strike(h, 'LiquidationMaxima', a, d, 'me', true);
    assert.ok(!g.cauldrons.list.has('cave:5'), '«Максима» crumbles it');
    assert.deepEqual(sent, [['cauldron', 'cave:5']], 'the others are told');
    assert.ok(L.isGone('cauldron', 'cave:5'));
    // saved and restored: a cave looked into again makes no new one (the sweep takes it at once)
    const L2 = new Liquidation(world().g);
    L2.restore(L.snapshot());
    assert.ok(L2.isGone('cauldron', 'cave:5'));
    L2.update(2);
    assert.ok(!L2.game.cauldrons.list.has('cave:5'));
});

test('a guest: the host\'s word takes the bed and the door away', () => {
    const { g } = world();
    g.authority = false;
    const removed = [];
    g.beds = { list: new Map([['h1b0', { id: 'h1b0', x: 0, y: 0, z: 0 }]]), lying: null, removeBed: (id) => { removed.push(id); g.beds.list.delete(id); } };
    g.doors = { list: new Map([['h1d', { id: 'h1d', x: 0, y: 0, z: 0 }]]), remove: (id) => { removed.push(id); g.doors.list.delete(id); } };
    const L = new Liquidation(g);
    L.onNet({ t: 'liq', k: 'bed', id: 'h1b0' });
    L.onNet({ t: 'liq', k: 'door', id: 'h1d' });
    assert.deepEqual(removed, ['h1b0', 'h1d']);
    // the house comes near again and makes its door anew: gone again
    g.doors.list.set('h1d', { id: 'h1d', x: 0, y: 0, z: 0 });
    L.update(2);
    assert.ok(!g.doors.list.has('h1d'));
});

test('a light correction, as the duel charges: a thing a little beside the hand\'s line is struck, one far beside it is not', () => {
    const run = (side) => {
        const { g, caul } = world();
        g.cauldrons.destroy(caul.id); // (nothing else on the way)
        const model = { position: new THREE.Vector3(10, 0.7, side) };
        g.items.loose.set('u1', { item: { kind: 'cheese', uid: 'u1' }, model });
        g.items.removeLoose = (uid) => g.items.loose.delete(uid);
        g.sync.itemGone = () => {};
        const spells = [];
        g.spells = { spells };
        g.scene = { add() {}, remove() {} };
        const L = new Liquidation(g);
        L.fly('Liquidation', new THREE.Vector3(0, 0.7, 0), new THREE.Vector3(1, 0, 0), 'me');
        const s = spells[0];
        for (let i = 0; i < 120 && s.life > 0; i++) s.onUpdate(s, 1 / 60);
        return !g.items.loose.has('u1');
    };
    assert.equal(run(0.9), true, '~5° beside the line: found');
    assert.equal(run(4), false, '~22° beside it: a miss');
});
