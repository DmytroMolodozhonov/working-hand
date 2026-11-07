import test from 'node:test';
import assert from 'node:assert/strict';
import { SKY, SKY_SPELLS, SKY_NEEDING, skyVisible, skyBlockFor, lightningLand, mayTell, isLeaf } from '../../src/game/SkyRules.js';
import { FIRST_SPELL } from '../../src/game/Mana.js';
import { BLOCK } from '../../src/world/Terrain.js';

// a column world: blocks[y] by layer at one x,z; ceilingAt like Collision (underside of the first solid layer at/above the head)
function world(blocks, extra = {}) {
    const get = (L) => blocks[L] ?? BLOCK.AIR;
    const top = Math.max(0, ...Object.keys(blocks).map(Number));
    return {
        character: { group: { position: { x: 0, y: 2, z: 0 } } },
        collision: {
            ceilingAt(x, z, headY) {
                for (let L = Math.floor(headY + 1.5); L <= top; L++) { const b = get(L); if (b !== BLOCK.AIR && b !== BLOCK.WATER) return L - 1.5; }
                return Infinity;
            },
        },
        terrain: { blockAt: (ix, L) => get(L), topLayer: () => top },
        world: { cave: 0 },
        ...extra,
    };
}
const pos = (g) => g.character.group.position;
const see = (g) => skyVisible(g, pos(g).x, pos(g).y, pos(g).z);

test('every sky spell is in the table with a reason, and is a known spell', () => {
    for (const [k, r] of Object.entries(SKY_SPELLS)) {
        assert.equal(typeof r.needs, 'boolean', k);
        assert.ok(r.why, k);
    }
    for (const k of ['LightningStrike', 'ToTheSun', 'LetItRain', 'Thunderwave', 'Fireworks', 'PentagramGargoyles', 'ThorHammer']) assert.ok(SKY_SPELLS[k]?.needs, k);
    for (const k of SKY_NEEDING) if (k !== 'PentagramGargoyles' && k !== 'ThorHammer') assert.ok(k in FIRST_SPELL, k + ' not in Mana.FIRST_SPELL');
    for (const k of ['Hellfire', 'Inspirius', 'Boom', 'TotalDestruction', 'WaterVortexSuperMaxima']) assert.equal(SKY_SPELLS[k].needs, false, k);
});

test('open ground: sky visible, spell allowed', () => {
    const g = world({ 0: BLOCK.GRASS });
    assert.equal(see(g), null);
    assert.equal(skyBlockFor(g, 'LightningStrike'), null);
});

test('a room (roof over the head): refused with the message, no mana involved', () => {
    const g = world({ 0: BLOCK.STONE, 5: BLOCK.STONE });
    assert.equal(see(g), 'roof');
    for (const n of ['LightningStrike', 'ToTheSun', 'LetItRain', 'Thunderwave', 'Fireworks']) assert.match(skyBlockFor(g, n), /помещении/);
    assert.equal(skyBlockFor(g, 'Hellfire'), null);
    assert.equal(skyBlockFor(g, 'Lumos'), null);
});

test('a doorway / hole in the roof: the column above is free — works', () => {
    const g = world({ 0: BLOCK.STONE }); // (the roof is next door, not over the head)
    assert.equal(see(g), null);
});

test('a cave: the other message; glass roof closes', () => {
    const g = world({ 6: BLOCK.STONE }, { world: { cave: 0.8 } });
    assert.match(skyBlockFor(g, 'ToTheSun'), /пещере/);
    const glass = world({ 6: BLOCK.ICE });
    assert.equal(see(glass), 'roof');
});

test('canopy: one or two leaves do not hide the sky, a thick crown does, a roof above the leaves does', () => {
    assert.equal(see(world({ 6: BLOCK.LEAVES })), null);
    assert.equal(see(world({ 6: BLOCK.LEAVES, 7: BLOCK.LEAVES })), null);
    assert.equal(see(world({ 6: BLOCK.LEAVES, 7: BLOCK.LEAVES, 8: BLOCK.LEAVES })), 'canopy');
    assert.equal(see(world({ 6: BLOCK.LEAVES, 9: BLOCK.STONE })), 'roof');
    assert.ok(isLeaf(BLOCK.BIRCH_LEAVES));
});

test('under water, in hell: no sky; a roof very high up is still sky; space defers to Space.js', () => {
    const g = world({ 0: BLOCK.GRASS });
    assert.match(skyBlockFor({ ...g, swim: { underwater: true } }, 'LetItRain'), /Под водой/);
    assert.equal(skyBlockFor({ ...g, hellGate: { inHell: true } }, 'LetItRain'), null, 'в аду дождь зовётся — кровавый (автор 07.11)');
    assert.match(skyBlockFor({ ...g, hellGate: { inHell: true } }, 'ToTheSun'), /нет неба/);
    assert.equal(see(world({ [3 + SKY.REACH + 20]: BLOCK.STONE })), null);
    assert.equal(skyBlockFor({ ...world({ 5: BLOCK.STONE }), space: { offEarth: true } }, 'LetItRain'), null);
});

test('lightning at a target under a roof strikes the roof; in the open it stays', () => {
    const g = world({ 0: BLOCK.STONE, 5: BLOCK.STONE });
    const p = { x: 0, y: 2, z: 0 };
    assert.equal(lightningLand(g, p), true);
    assert.ok(p.y > 5);
    const q = { x: 0, y: 2, z: 0 };
    assert.equal(lightningLand(world({ 0: BLOCK.GRASS }), q), false);
    assert.equal(q.y, 2);
});

test('the message is not spammed', () => {
    const st = {};
    assert.equal(mayTell(st, 10000), true);
    assert.equal(mayTell(st, 10500), false);
    assert.equal(mayTell(st, 12100), true);
});
