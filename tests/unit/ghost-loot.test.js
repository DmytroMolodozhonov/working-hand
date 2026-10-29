// The chests of the Castle of Ghosts: only what is bound up with pentagrams — scrolls of the strongest white and black ones, never one the opener
// already knows — and magic things (an axe, a sword…); never an ordinary spell scroll, never a potion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rollDungeonLoot, rollGhostLoot, strongPentagrams, LOOT_FOR } from '../../src/game/ItemTypes.js';
import { GHOST_CHESTS } from '../../src/game/GhostRules.js';
import { PENTAGRAMS } from '../../src/game/Pentagrams.js';
import { createRng } from '../../src/core/math.js';

test('the strong pentagrams: both colours, only the ones that cost 100 mana or more (or by a formula) and the devil\'s', () => {
    const { dark, white } = strongPentagrams();
    assert.ok(dark.length >= 3 && white.length >= 2, 'both colours');
    for (const id of dark) assert.ok(PENTAGRAMS[id].dark, id);
    for (const id of white) assert.ok(!PENTAGRAMS[id].dark, id);
    for (const id of dark.concat(white)) { const c = PENTAGRAMS[id].cost; assert.ok(typeof c !== 'number' || c >= 100 || id === 'devil', id + ' is weak'); }
    for (const weak of ['teleport', 'life', 'bare', 'night', 'breakward']) assert.ok(![...dark, ...white].includes(weak), weak + ' is not for the ghosts');
});

test('a ghosts\' chest: at least three things, a pentagram scroll in every one, nothing else of paper or glass; magic things always magic', () => {
    const strong = new Set([...strongPentagrams().dark, ...strongPentagrams().white]);
    let magic = 0, scrolls = 0, white = 0, dark = 0;
    for (let i = 0; i < 400; i++) {
        const r = createRng(1000 + i);
        const items = rollDungeonLoot(r, 'ghost', 2, 'L');
        assert.ok(items.length >= 3);
        assert.ok(items.some((x) => x.kind === 'scroll'), 'a scroll in every chest');
        for (const x of items) {
            assert.notEqual(x.kind, 'potion');
            if (x.kind === 'scroll') { assert.equal(x.stat, 'pentagram', 'no ordinary spell scrolls'); assert.ok(strong.has(x.pent), x.pent); scrolls++; if (PENTAGRAMS[x.pent].dark) dark++; else white++; }
            else { magic++; assert.ok(x.magic || x.kind === 'robe' || x.kind === 'wand' || x.kind === 'armor' || x.ench, JSON.stringify(x)); }
        }
    }
    assert.ok(scrolls > 600 && magic > 100, `scrolls ${scrolls}, magic ${magic}`);
    assert.ok(white > 100 && dark > 100, `both colours: white ${white}, dark ${dark}`);
});

test('a scroll the opener already knows is never in the chest (until every strong one is known: then magic things)', () => {
    const { dark, white } = strongPentagrams();
    const all = dark.concat(white);
    const was = LOOT_FOR.known;
    try {
        LOOT_FOR.known = (x) => x.pent === 'sight' || x.pent === 'monster';
        for (let i = 0; i < 300; i++) for (const x of rollGhostLoot(createRng(i + 1), 3)) assert.ok(!(x.pent === 'sight' || x.pent === 'monster'), 'a known one came again');
        LOOT_FOR.known = (x) => all.includes(x.pent);
        for (let i = 0; i < 100; i++) for (const x of rollGhostLoot(createRng(i + 1), 3)) assert.notEqual(x.kind, 'scroll', 'all known: no scrolls, magic things instead');
    } finally { LOOT_FOR.known = was; }
});

test('four chests in four different parts', () => {
    assert.deepEqual(GHOST_CHESTS.map((c) => c.id), ['tower', 'crypt', 'cellar', 'throne']);
    assert.equal(new Set(GHOST_CHESTS.map((c) => c.where)).size, 4);
});
