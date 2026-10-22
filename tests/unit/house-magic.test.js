// «Create a House» / «Improve a House» in a small world without a screen (src/game/HouseMagic.js):
// the heap and the trees are used up, the house rises in 10 s, the chest keeps what is put in it
// through an improvement, a broken magic starts a fire, the scroll is easy to find only the first time.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HouseMagic } from '../../src/game/HouseMagic.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { MAGIC_TIME } from '../../src/world/MagicHouse.js';

function world({ trees = 4 } = {}) {
    const cells = new Map();
    const G = 10;
    const data = {
        get: (x, L, z) => cells.get(x + ',' + L + ',' + z) ?? (L <= G ? BLOCK.GRASS : BLOCK.AIR),
        set: (x, L, z, t) => cells.set(x + ',' + L + ',' + z, t),
        topLayer(x, z) { let L = G + 30; while (L > G && this.get(x, L, z) === BLOCK.AIR) L--; return L; },
        isSeaColumn: () => false,
    };
    // trees of blocks round the place: a trunk of 5 logs and leaves
    for (let i = 0; i < trees; i++) {
        const x = 13 + 3 * (i >> 1), z = i % 2 ? 10 : 4;
        for (let L = G + 1; L <= G + 5; L++) data.set(x, L, z, BLOCK.BIRCH);
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) data.set(x + dx, G + 6, z + dz, BLOCK.BIRCH_LEAVES);
    }
    const loose = new Map();
    const fires = [];
    const g = {
        config: { mode: 'freeworld' }, authority: true, localId: 'local', scene: new THREE.Scene(),
        terrain: { data }, world: { trees: [], removeTree() {} },
        character: { group: { position: new THREE.Vector3(0, G + 3.5, -14) } }, remotes: new Map(),
        collision: { _n: 0, addBox() { return ++this._n; }, removeBox() {}, groundY: () => G - 0.5 },
        items: {
            loose,
            heldOf: (k) => (k === 'wand' && g._wand ? { side: 'right' } : null),
            removeLoose(uid) { const L = loose.get(uid); loose.delete(uid); return L?.item; },
            spawnLoose(item, pos, { hover = false } = {}) { const L = { item, model: { position: pos.clone() }, hover, vel: new THREE.Vector3() }; loose.set(item.uid, L); return L; },
        },
        doors: { list: new Map(), _place(d) { this.list.set(d.id, d); }, remove(id) { this.list.delete(id); } },
        beds: { list: new Map(), spawnBed(p, yaw, c, { id }) { const b = { id, ...p, ry: yaw, color: c }; this.list.set(id, b); return b; }, _place(d) { this.list.set(d.id, d); }, _data: (b) => b, removeBed(id) { this.list.delete(id); } },
        houses: { panes: [], setExtraPanes(k, l) { this.panes = l; } },
        chests: [],
        combat: { enabled: true, fatigue: 100, paidCount: 0, drain(a) { if (this.fatigue <= 0) return false; this.fatigue -= a; return true; } },
        mana: { got: [], success(n) { this.got.push(n); } },
        fire: { ignite(p) { fires.push(p.clone()); } },
        builder: { edits: 0, _sendEdits(l) { this.edits += l.length; } },
        hud: { said: '', setVoice(t) { this.said = t; }, toast() {} },
        _wand: true,
    };
    g.houseMagic = new HouseMagic(g);
    let uid = 0;
    const drop = (kind, count, x, z) => g.items.spawnLoose(kind === 'wool' ? { kind, uid: 'u' + uid++, count } : { kind: 'blocks', block: BLOCK.SAND, uid: 'u' + uid++, count }, new THREE.Vector3(x, G - 0.3, z));
    const run = (s) => { for (let t = 0; t < s; t += 0.05) g.houseMagic.update(0.05); };
    return { g, data, G, drop, run, fires };
}

const ask = (kind, at, c = [0, -14], hid = null) => ({ kind, at, c, hid });

test('the heap and three trees → a house in 10 s with its door, bed, chest and glass; the trees are gone, mana paid', () => {
    const { g, data, G, drop, run } = world();
    drop('wool', 2, 0, 0); drop('wool', 1, 0.5, 0.3);
    drop('blocks', 10, -0.5, 0.5);
    assert.equal(g.houseMagic._hostStart(ask('CreateHouse', [0, G, 0]), 'local'), true);
    assert.equal(g.combat.fatigue, 80, '−20 mana at once');
    assert.equal(g.items.loose.size, 0, 'the wool and the sand are used up');
    run(MAGIC_TIME + 0.5);
    assert.equal(g.houseMagic.magic, null);
    const rec = [...g.houseMagic.list.values()][0];
    assert.ok(rec && rec.level === 1);
    assert.ok(g.combat.fatigue < 80 - 4 && g.combat.fatigue > 80 - 6.5, `0.5 a second: ${g.combat.fatigue}`);
    assert.deepEqual(g.mana.got, ['CreateHouse']);
    assert.ok(g.doors.list.has(rec.id + 'd'));
    assert.equal(g.beds.list.size, 1);
    assert.equal(g.chests.length, 1);
    assert.ok(g.houses.panes.length >= 3);
    // the walls are birch: the trees' wood; the trees taken
    const p = g.houseMagic.plan(rec);
    let have = 0;
    for (const k of p.own) { const [x, L, z] = k.split(',').map(Number); if (data.get(x, L, z) !== BLOCK.AIR) have++; }
    assert.ok(have > p.own.size * 0.9, `${have}/${p.own.size} blocks`);
    for (const [x, z] of [[13, 4], [13, 10], [16, 4]]) assert.equal(data.get(x, G + 1, z), BLOCK.AIR, 'three trees taken');
    assert.equal(data.get(16, G + 1, 10), BLOCK.BIRCH, 'the fourth stays');
});

test('not enough: the hint says what is missing; nothing is used up', () => {
    const { g, G, drop } = world({ trees: 1 });
    drop('wool', 3, 0, 0); drop('blocks', 4, 0, 1);
    const r = g.houseMagic._hostStart(ask('CreateHouse', [0, G, 0]), 'local');
    assert.match(r, /песка 6/); assert.match(r, /деревьев рядом 2/);
    assert.equal(g.items.loose.size, 2);
    assert.equal(g.combat.fatigue, 100);
});

test('the wand let go: the magic breaks and the place burns', () => {
    const { g, G, drop, run, fires } = world();
    drop('wool', 3, 0, 0); drop('blocks', 10, 0, 1);
    g.houseMagic._hostStart(ask('CreateHouse', [0, G, 0]), 'local');
    run(3);
    g._wand = false;
    run(1.5);
    assert.equal(g.houseMagic.magic, null);
    assert.equal(g.houseMagic.list.size, 0, 'no house');
    assert.ok(fires.length >= 1, 'fire');
    assert.match(g.hud.said, /пожар/);
});

test('a thing put into the open chest stays in it through «Improve a House» (level 2 twice as dear)', () => {
    const { g, G, drop, run } = world({ trees: 8 });
    drop('wool', 3, 0, 0); drop('blocks', 10, 0, 1);
    g.houseMagic._hostStart(ask('CreateHouse', [0, G, 0]), 'local');
    run(MAGIC_TIME + 0.5);
    const rec = [...g.houseMagic.list.values()][0];
    const chest = g.chests[0];
    g.houseMagic.chestOpened(chest); chest.isOpen = true; chest.animating = false;
    // an apple let fall into the open chest
    const pos = chest.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    g.items.spawnLoose({ kind: 'apple', uid: 'apple1', count: 1 }, pos);
    run(0.5);
    assert.equal(g.items.loose.has('apple1'), false, 'the apple went into the chest');
    assert.equal(rec.store[0].length, 1);
    // improve: the heap beside the house, outside it
    const p = g.houseMagic.plan(rec);
    const ax = p.rect.x1 + 3;
    drop('wool', 6, ax, 0); drop('blocks', 20, ax, 1);
    g.combat.fatigue = 100;
    assert.match(g.houseMagic._hostStart(ask('ImproveHouse', [ax, G, 0], [ax + 4, 0], rec.id), 'local'), /подождите/);
    rec.t -= 200 * 1000;
    assert.equal(g.houseMagic._hostStart(ask('ImproveHouse', [ax, G, 0], [ax + 4, 0], rec.id), 'local'), true);
    assert.equal(g.combat.fatigue, 60, '−40 mana for level 2');
    run(MAGIC_TIME + 0.5);
    const now = g.houseMagic.list.get(rec.id);
    assert.equal(now.level, 2);
    assert.equal(now.store[0].length, 1, 'the apple is still in the chest');
    assert.equal(g.beds.list.size, 2);
    assert.equal(g.chests.length, 1);
    // opened: it rises out of it
    g.houseMagic.chestOpened(g.chests[0]);
    assert.ok(g.items.loose.has('apple1'));
    // saved and loaded
    const snap = JSON.parse(JSON.stringify(g.houseMagic.snapshot()));
    assert.equal(snap.list[0].level, 2);
});

test('the first «Create a House» scroll is easy to find — for each player once', () => {
    const { g } = world();
    let got = 0;
    for (let i = 0; i < 20; i++) got += g.houseMagic.scrollFor('local', () => 0.1).length;
    assert.equal(got, 1);
    g.net = { players: new Map([['P2', { pid: 'abc', name: 'Аня' }]]) };
    assert.equal(g.houseMagic.scrollFor('P2', () => 0.9).length, 0);
    assert.equal(g.houseMagic.scrollFor('P2', () => 0.1).length, 1);
    assert.equal(g.houseMagic.scrollFor('P2', () => 0.1).length, 0);
});

test('created → saved → loaded: the house stands block for block as it was saved (a replayed old blast or dropped old edits do not eat its walls; what was really broken stays broken)', () => {
    const { g, data, G, drop, run } = world();
    drop('wool', 3, 0, 0); drop('blocks', 10, 0, 1);
    g.houseMagic._hostStart(ask('CreateHouse', [0, G, 0]), 'local');
    run(MAGIC_TIME + 0.5);
    const rec = [...g.houseMagic.list.values()][0];
    const p = g.houseMagic.plan(rec);
    const walls = p.cells.filter((c) => c[3] !== BLOCK.AIR && c[1] > G + 1);
    // really broken before the save: one wall block
    const broken = walls[5];
    data.set(broken[0], broken[1], broken[2], BLOCK.AIR);
    const save = JSON.parse(JSON.stringify(g.houseMagic.snapshot()));
    assert.deepEqual(save.list[0].miss, [broken.slice(0, 3).join(',')]);
    // the load: the world replays its edits wrongly (half the walls missing — as after an old blast replayed later)
    for (const c of walls.slice(0, 200)) data.set(c[0], c[1], c[2], BLOCK.AIR);
    const g2 = world().g;
    g2.terrain.data = data;
    g2.houseMagic.restore(save);
    for (const c of walls) {
        const want = c === broken ? BLOCK.AIR : c[3];
        assert.equal(data.get(c[0], c[1], c[2]), want, `block ${c.slice(0, 3)}`);
    }
    assert.equal(g2.chests.length, 1);
    assert.ok(g2.doors.list.has(rec.id + 'd'));
});

test('the wool and sand in the pockets are enough: nothing is thrown out, they are used up from the slots', async () => {
    const { stockOf, stockTake } = await import('../../src/game/Stock.js');
    const { g, G, drop } = world();
    g.inventory = { slots: [{ kind: 'wool', count: 5 }, { kind: 'res', block: BLOCK.SAND, count: 14 }, null, null, null], _render() {} };
    g.items.held = { right: null, left: null };
    const st = stockOf(g);
    assert.deepEqual(st, { wool: 5, sand: 14, logs: 0 });
    const a = { ...ask('CreateHouse', [0, G, 0]), inv: { wool: st.wool, sand: st.sand } };
    assert.equal(g.houseMagic._hostStart(a, 'local'), true);
    assert.equal(g.inventory.slots[0].count, 2, '3 wool used up');
    assert.equal(g.inventory.slots[1].count, 4, '10 sand used up');
    // not enough in total (pockets + the ground): a hint with what is missing
    const w2 = world();
    w2.g.inventory = { slots: [{ kind: 'wool', count: 1 }, null, null, null, null], _render() {} };
    w2.g.items.held = { right: null, left: null };
    w2.drop('wool', 1, 0, 0);
    const r = w2.g.houseMagic._hostStart({ ...ask('CreateHouse', [0, w2.G, 0]), inv: { wool: 1, sand: 0 } }, 'local');
    assert.match(r, /Не хватает: шерсти 1, песка 10/);
    assert.equal(w2.g.inventory.slots[0].count, 1, 'a refused spell takes nothing');
    // the ground and the pockets together
    const w3 = world();
    w3.g.inventory = { slots: [{ kind: 'wool', count: 1 }, { kind: 'res', block: BLOCK.SAND, count: 4 }, null, null, null], _render() {} };
    w3.g.items.held = { right: null, left: null };
    w3.drop('wool', 2, 0, 0); w3.drop('blocks', 6, 0.5, 0.5);
    assert.equal(w3.g.houseMagic._hostStart({ ...ask('CreateHouse', [0, w3.G, 0]), inv: { wool: 1, sand: 4 } }, 'local'), true);
    assert.equal(w3.g.items.loose.size, 0);
    assert.equal(w3.g.inventory.slots[0], null);
    assert.equal(w3.g.inventory.slots[1], null);
});
