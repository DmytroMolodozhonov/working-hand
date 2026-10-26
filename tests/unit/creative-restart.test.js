import test from 'node:test';
import assert from 'node:assert/strict';
import { restartsCreative, creativeRestartConfig, takeCreativeRestart, CREATIVE_RESTART_KEY } from '../../src/game/CreativeRestart.js';
import { Game } from '../../src/game/Game.js';
import { BossRetry } from '../../src/game/BossRetry.js';

const game = (spawn = 'village') => ({
    config: { mode: 'creative', seed: 12345, gen: 8, realTrees: true, hero: { spawn, cells: 500 }, saved: { edits: [[1, 2, 3, 0]], players: { local: { mp: 30 } } } },
    hero: { spawn, cells: 800 }, seed: 12345, gen: 8,
    keeper: { id: 'world1', name: 'My city', created: 123, createdVersion: { sha: 'old' }, fav: true, players: { local: {} } },
});

test('selected solo Creative places restart completely; platform, duel and multiplayer never reset a shared world', () => {
    for (const id of ['village', 'magevillage', 'magehut', 'tower', 'castle', 'dragon', 'queen', 'port', 'spider', 'blackship']) assert.equal(restartsCreative(game(id)), true, id);
    for (const id of ['start', 'arena']) assert.equal(restartsCreative(game(id)), false, id);
    const g = game(); g.net = { active: true, isHost: true }; assert.equal(restartsCreative(g), false);
    g.net.isHost = false; assert.equal(restartsCreative(g), false);
    g.net.active = false; g.config.mode = 'freeworld'; assert.equal(restartsCreative(g), false);
    assert.equal(restartsCreative({ config: { mode: 'creative' } }), false);
});

test('restart keeps seed, generation, identity and selected hero but discards every old runtime snapshot', () => {
    const g = game(), config = creativeRestartConfig(g);
    assert.equal(config.seed, 12345); assert.equal(config.gen, 8); assert.equal(config.realTrees, true);
    assert.equal(config.saved.id, 'world1'); assert.equal(config.saved.name, 'My city'); assert.equal(config.saved.fav, true);
    assert.equal(config.hero.cells, 800); assert.equal(config.saved.hero.cells, 800);
    assert.deepEqual(config.saved.players, {});
    for (const field of ['edits', 'explosions', 'castles', 'rebuild', 'bodies', 'houses', 'ships', 'dayPhase']) assert.equal(Object.hasOwn(config.saved, field), false, field);
    assert.deepEqual(g.config.saved.edits, [[1, 2, 3, 0]], 'original save untouched');
    g.keeper = null; assert.equal(Object.hasOwn(creativeRestartConfig(g), 'saved'), false);
});

test('restart handoff is one-use even when invalid', () => {
    const map = new Map(), storage = { getItem: (k) => map.get(k), removeItem: (k) => map.delete(k) };
    map.set(CREATIVE_RESTART_KEY, JSON.stringify(creativeRestartConfig(game())));
    assert.equal(takeCreativeRestart(storage).hero.spawn, 'village');
    assert.equal(takeCreativeRestart(storage), null);
    map.set(CREATIVE_RESTART_KEY, '{bad'); assert.equal(takeCreativeRestart(storage), null); assert.equal(map.size, 0);
    map.set(CREATIVE_RESTART_KEY, JSON.stringify({ mode: 'creative', hero: { spawn: 'arena' } })); assert.equal(takeCreativeRestart(storage), null);
});

test('normal creative respawn and boss retry use the same whole-attempt restart', () => {
    const g = game(); let restarts = 0;
    g.ui = { restartCreative: (got) => { assert.equal(got, g); restarts++; return 'fresh'; } };
    assert.equal(Game.prototype.respawn.call(g), 'fresh');
    assert.equal(BossRetry.prototype._again.call({ game: g }, { ...g.hero, spawn: 'tower', cells: 1000 }), 'fresh');
    assert.equal(restarts, 2); assert.equal(g.config.hero.cells, 1000);
});