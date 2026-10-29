// The library of a wizards' town (the author: «я так и не нашёл библиотеку… старца-читателя не убрали»): in every settlement, in worlds of
// any generation, a building of its own with a columned porch and a sign board, ≥3 lecterns with the books of the world's history,
// nobody reading there, the door reachable on the walking graph, the Elder's hall has no book shelves.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TerrainData } from '../../src/world/Terrain.js';
import { LORE_BOOKS, loreForSite } from '../../src/game/LoreBooks.js';

const SEEDS = [4242, 12345, 1, 7, 99, 2024, 31337];

test('every settlement has a library with lecterns, a sign, no chests, no reader; the door is reachable from the gate', () => {
    for (const seed of SEEDS) {
        const t = new TerrainData(); t.generate({ seed, mountains: true });
        const s = t.villages.spawnVillage();
        assert.ok(s, `seed ${seed}: a settlement near the spawn`);
        const lib = s.houses.find((h) => h.kind === 'library');
        assert.ok(lib && lib.chests.length === 0, `seed ${seed}: a library without chests`);
        assert.ok(s.lore.length >= 3 && loreForSite(s).length === Math.min(s.lore.length, LORE_BOOKS.length), `seed ${seed}: lecterns with books`);
        assert.ok(s.library.sign && Number.isFinite(s.library.sign.yaw) && s.library.door, `seed ${seed}: a sign board and a door`);
        assert.ok(!s.spots.some((p) => p.kind === 'desk'), 'nobody sits in the library');
        assert.equal(lib.doorRec.w, 5);
        assert.ok(lib.doorRec.h >= 6);
        const adj = new Map();
        for (const [a, b] of s.edges) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
        const start = s.nodes.find((n) => n.tag === 'gateOut').id;
        const seen = new Set([start]); const q = [start];
        while (q.length) for (const m of adj.get(q.pop()) || []) if (!seen.has(m)) { seen.add(m); q.push(m); }
        assert.ok(seen.has(lib.doorNode), `seed ${seed}: the library door is reached from the gate`);
        assert.ok(seen.has(lib.homeNode), `seed ${seed}: the library inside is reached`);
    }
});

test('the library is not tied to a world generation, the Elder’s hall has no book shelves, nobody “reads” in the village code', () => {
    const v = fs.readFileSync(new URL('../../src/world/WizardVillages.js', import.meta.url), 'utf8');
    const hall = v.slice(v.indexOf('function buildHall'), v.indexOf('function buildCauldronHall'));
    assert.ok(!/B\.BOOKS/.test(hall), 'no shelves of books in the hall');
    const life = fs.readFileSync(new URL('../../src/game/WizVillages.js', import.meta.url), 'utf8');
    assert.ok(!/job: 'desk'|librarian/.test(life));
    const lib = fs.readFileSync(new URL('../../src/game/LoreLibrary.js', import.meta.url), 'utf8');
    assert.ok(!/LORE_FROM_GEN/.test(lib) && !/gen[^\n]*<[^\n]*lore/i.test(lib), 'books of the lore: any generation');
});
