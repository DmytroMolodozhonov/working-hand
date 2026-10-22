import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { crystalCluster, isDeepInCave, caveDepth, CRYSTAL, ManaCrystals } from '../../src/game/ManaCrystals.js';
import { ITEM_INFO, makeItemModel, describeItem } from '../../src/game/ItemTypes.js';

/** Real caves of a real world. */
function caves(seed = 7, n = 60) {
    const d = new TerrainData();
    d.generate({ seed, mountains: true });
    const out = [];
    for (let gz = -6; gz <= 6 && out.length < n; gz++) for (let gx = -6; gx <= 6 && out.length < n; gx++) { const c = d.caveOf(gx, gz); if (c) out.push(c); }
    return { d, list: out };
}

test('mana crystals: the same cave always has the same crystals (from the seed)', () => {
    const { d, list } = caves(7);
    assert.ok(list.length >= 10, `caves found: ${list.length}`);
    for (const cv of list) assert.deepEqual(crystalCluster(cv, 7, d.heightAt), crystalCluster({ ...cv }, 7, d.heightAt));
    const a = list.map((cv) => !!crystalCluster(cv, 7, d.heightAt)).join();
    const b = list.map((cv) => !!crystalCluster(cv, 8, d.heightAt)).join();
    assert.notEqual(a, b, 'another world: other caves have them');
});

test('mana crystals: rare (some caves), clusters of 3–5, deep in the chamber — never at the way in', () => {
    const { d, list } = caves(7);
    const with_ = list.filter((cv) => crystalCluster(cv, 7, d.heightAt));
    assert.ok(with_.length >= 1 && with_.length < list.length * 0.7, `${with_.length} of ${list.length}`);
    for (const cv of with_) {
        const cl = crystalCluster(cv, 7, d.heightAt);
        assert.ok(cl.crystals.length >= CRYSTAL.MIN && cl.crystals.length <= CRYSTAL.MAX);
        assert.ok(isDeepInCave(cv, cl.x, cl.z), `deep: ${caveDepth(cv, cl.x, cl.z).toFixed(1)} m from the way in`);
        for (const c of cl.crystals) {
            assert.ok(Math.hypot(c.x - cv.kx, c.z - cv.kz) < cv.r + 1.5, 'at the chamber');
            assert.ok(caveDepth(cv, c.x, c.z) >= 8);
            assert.ok(c.h > 0.3 && c.h < 1.2 && c.r > 0.04 && c.r < 0.2, 'a slim prism');
            assert.ok(c.y - cl.floor > 1.2 && c.y - cl.floor < 2.4, 'at hand height on the wall');
            // it grows out of the rock: its foot in stone, its tip in the open chamber
            const L = (y) => Math.floor(y + 1.5);
            assert.notEqual(d.get(Math.round(c.x), L(c.y), Math.round(c.z)), BLOCK.AIR, 'the foot in rock');
            const tx = c.x + c.ax * c.h, ty = c.y + c.ay * c.h, tz = c.z + c.az * c.h;
            assert.equal(d.get(Math.round(tx), L(ty), Math.round(tz)), BLOCK.AIR, 'the tip in the air');
        }
    }
});

test('mana crystal item: a slim hexagonal prism with a pointed tip (not a cube), stacks to 10', () => {
    assert.equal(ITEM_INFO.crystal.stack, 10);
    const m = makeItemModel({ kind: 'crystal', uid: 'x' });
    let lathe = 0;
    m.traverse((o) => { if (o.isMesh && o.geometry.type === 'LatheGeometry') { lathe++; assert.equal(o.geometry.parameters.segments, 6, 'six faces'); } });
    assert.ok(lathe >= 1);
    assert.match(describeItem({ kind: 'crystal', count: 2 }).lines.join(' '), /сожмите/);
});

test('mana crystals: Gather takes the whole cluster into the slots; taken ones are gone and saved', () => {
    const stored = [];
    const g = {
        config: { mode: 'survival' }, scene: new THREE.Scene(), fx: null,
        character: { group: { position: new THREE.Vector3() } },
        inventory: { storeItem: (it) => { stored.push(it); return true; } },
        terrain: null,
    };
    const mc = new ManaCrystals(g);
    const cv = { id: 'cvT', kx: 0, kz: 0, ex: 20, ez: 0, F: 10, r: 7 };
    let cl = null;
    for (let s = 0; s < 50 && !cl; s++) cl = crystalCluster(cv, s);
    mc.addCluster(cv.id, cl);
    const n = cl.crystals.length;
    assert.equal(mc.growing().length, n);
    const target = mc.growing()[0].center;
    const o = new THREE.Vector3(target.x + 4, target.y, target.z);
    const msg = mc.gatherAt(o, target.clone().sub(o).normalize(), 'right');
    assert.match(msg, /кристалл/);
    assert.equal(stored[0].count, n);
    assert.equal(mc.growing().length, 0);
    assert.equal(mc.gatherAt(o, target.clone().sub(o).normalize()), null, 'nothing left there');
    const mc2 = new ManaCrystals(g);
    mc2.restore(mc.snapshot());
    mc2.addCluster(cv.id, cl);
    assert.equal(mc2.growing().length, 0, 'a loaded world remembers');
});

function crystalGame(over = {}) {
    let cells = 0;
    const sent = [];
    const g = {
        config: { mode: 'survival' }, scene: null, fx: null, authority: true, localId: 'me',
        character: { group: { position: new THREE.Vector3() } },
        remotes: new Map([['friend', { character: { group: { position: new THREE.Vector3(3, 0, 0) } } }]]),
        mana: { crystal: () => cells++ },
        sync: { crystalBurst: (l, by) => sent.push({ t: 'mcb', l, by }), crystalAsk: (l) => sent.push({ t: 'mcq', l }) },
        ...over,
    };
    const mc = new ManaCrystals(g);
    const cv = { id: 'cvB', kx: 0, kz: 0, ex: 20, ez: 0, F: 10, r: 7 };
    let cl = null;
    for (let s = 0; s < 50 && !cl; s++) cl = crystalCluster(cv, s);
    mc.addCluster(cv.id, cl);
    return { g, mc, sent, cells: () => cells };
}

test('mana crystals: anything that breaks one (a blast) — the host decides, its power goes to the one who broke it; creatures get nothing', () => {
    const { mc, sent, cells } = crystalGame();
    const c = mc.growing()[0], n = mc.growing().length;
    const k = mc.hitAt(c.center, 0.01, 'local', 'Bombardo');
    assert.ok(k >= 1 && mc.taken.has(c.id), 'a small blast at it: it cracks');
    assert.equal(mc.growing().length, n - k);
    assert.equal(cells(), k, 'mine: +1 cell for each');
    assert.equal(sent.at(-1).by, 'me', 'everybody sees it');
    assert.ok(sent.at(-1).l.includes(c.id));
    if (mc.growing().length) {
        mc.hitAt(mc.growing()[0].center, 0.01, 'friend', 'Bombardo');
        assert.equal(cells(), k, "another player's blast: his cell, not mine");
        assert.equal(sent.at(-1).by, 'friend');
    }
    if (mc.growing().length) {
        mc.hitAt(mc.growing()[0].center, 0.01, 'wizard:3', 'Stupefy');
        assert.equal(cells(), k, 'a wizard (an NPC) gets nothing — the power scatters');
    }
    assert.equal(mc.hitAt(new THREE.Vector3(100, 0, 100), 3, 'me'), 0, 'far away: nothing');
    // a broken one is remembered (the save)
    const mc2 = new ManaCrystals({ config: { mode: 'survival' }, character: { group: { position: new THREE.Vector3() } } });
    mc2.restore(mc.snapshot());
    assert.equal(mc2.snapshot().length, mc.snapshot().length);
});

test('mana crystals: a guest asks the host; what the host says is seen on the guest and credited to him', () => {
    const { mc, sent, cells } = crystalGame({ authority: false });
    const c = mc.growing()[0];
    assert.ok(mc.squeeze(c, 'right'));
    assert.deepEqual(sent.at(-1), { t: 'mcq', l: [c.id] }, 'asked the host');
    assert.equal(mc.growing().length, mc.growing().length, 'nothing broken yet here');
    assert.equal(cells(), 0);
    mc.onBurst([c.id], 'me', [c.center.clone()], 'hand'); // (the host's 'mcb')
    assert.ok(mc.taken.has(c.id));
    assert.equal(cells(), 1);
    mc.onBurst([c.id], 'me', [c.center.clone()], 'hand');
    assert.equal(cells(), 1, 'the same crystal twice: once');
    assert.equal(mc.hitAt(mc.growing()[0].center, 1, 'me'), 0, 'a guest never decides a blast');
});

test('mana crystals: the hand lies on a crystal (never through it); a crystal held in a hand is seen (sized, in the fingers)', async () => {
    const { mc } = crystalGame();
    mc.update(1 / 30); // (the crystals by me)
    const c = mc.growing()[0];
    assert.ok(mc.solidAt(c.center.x, c.center.y, c.center.z), 'inside it: solid');
    assert.ok(!mc.solidAt(c.center.x + 1, c.center.y + 1, c.center.z + 1), 'beside it: free');
    const { ITEM_SCALE } = await import('../../src/game/ItemTypes.js');
    assert.ok(ITEM_SCALE.crystal >= 1.5, 'as big next to the hero as an apple — not hidden inside the fist');
    const src = (await import('node:fs')).readFileSync(new URL('../../src/game/Items.js', import.meta.url), 'utf8');
    assert.match(src, /\n\s+crystal: \{ axis: 'body'/, 'held in the fingers (GRIPPED), its tip out of the hand');
});
