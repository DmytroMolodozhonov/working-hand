import test from 'node:test';
import assert from 'node:assert/strict';
import { clapped, shardCount, HERO_SHARDS as H } from '../../src/game/HeroShards.js';
import { shardsWords } from '../../src/game/ElementVortexWords.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

test('a clap: the hands were apart and are together now, fast — not just held near, not far', () => {
    const t0 = 10;
    assert.equal(clapped([{ t: t0, d: 0.9 }, { t: t0 + 0.15, d: 0.5 }, { t: t0 + 0.3, d: 0.12 }]), true);
    assert.equal(clapped([{ t: t0, d: 0.15 }, { t: t0 + 0.2, d: 0.12 }, { t: t0 + 0.4, d: 0.1 }]), false, 'always near: no clap');
    assert.equal(clapped([{ t: t0, d: 0.9 }, { t: t0 + 0.2, d: 0.8 }, { t: t0 + 0.4, d: 0.7 }]), false, 'still apart');
    assert.equal(clapped([{ t: t0, d: 0.9 }, { t: t0 + 1.5, d: 0.12 }, { t: t0 + 1.6, d: 0.1 }]), false, 'too slow: the far reading is older than the window');
});
test('more water — more shards, within bounds', () => {
    assert.equal(shardCount(6), H.MIN_N); assert.ok(shardCount(20) > shardCount(10)); assert.equal(shardCount(500), H.MAX_N);
});
test('the word «Shards» is English and alone', () => {
    for (const t of ['shards', 'Shards!', 'шардс', 'ну шардс']) assert.ok(shardsWords(t), t);
    for (const t of ['shard of glass is sharp', 'вода', 'ice']) assert.ok(!shardsWords(t), t);
    assert.equal(matchSpell('shards'), 'IceShards');
});
