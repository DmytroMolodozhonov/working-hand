import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { BurnWreck, burnsInFire } from '../../src/game/BurnWreck.js';

test('a house burnt under its brick top: the bricks fall, nothing hangs in the air', () => {
    const d = new TerrainData(); d.generate({ seed: 1 });
    // plank corner posts, a brick top on them
    for (let L = 1; L <= 5; L++) for (const [x, z] of [[10, 10], [14, 10], [10, 14], [14, 14]]) d.set(x, L, z, BLOCK.PLANKS);
    for (let i = 0; i <= 4; i++) for (let k = 0; k <= 4; k++) d.set(10 + i, 6, 10 + k, BLOCK.COBBLE);
    const falls = [];
    const g = { world: { terrain: { data: d } }, falling: { add: (f) => falls.push(f) }, wreck: { afterBlast() {} }, fire: { burningBlocks: new Map(), burningAt: () => false }, chests: [] };
    const bw = new BurnWreck(g);
    // the fire eats the posts (Fire.js tells each block gone)
    for (let L = 1; L <= 5; L++) for (const [x, z] of [[10, 10], [14, 10], [10, 14], [14, 14]]) { d.set(x, L, z, BLOCK.AIR); bw.blockGone(x, L, z); }
    bw.update(1);
    assert.equal(falls.length, 1, 'the brick top comes down');
    assert.equal(d.get(12, 6, 12), BLOCK.AIR, 'nothing left up there');
    assert.ok(falls[0].d > 0);
});

test('a burning chest: food and wool burn, coins, steel and magic things fall out', () => {
    for (const k of ['bread', 'cheese', 'pie', 'steak', 'wool', 'arrows']) assert.equal(burnsInFire({ kind: k }), true, k);
    for (const it of [{ kind: 'coins' }, { kind: 'weapon' }, { kind: 'scroll' }, { kind: 'wand' }, { kind: 'book' }, { kind: 'bow', magic: true }, { kind: 'shield' }, { kind: 'phoenixFeather' }])
        assert.equal(burnsInFire(it), false, it.kind);
});
