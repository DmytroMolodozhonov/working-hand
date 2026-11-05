// The sea's bottom keeps its secrets (the author: «подводный храм и затонувшие корабли с сундуками»): the places are the world's own
// (the same on every computer), the temple rare; a site lies only on a deep, flat enough sea bottom; near the player it is raised —
// its model, its solid parts, its chests (rolled as a wreck's / the temple's offerings) — and put away far off; an opened chest stays opened.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SUNKEN, sunkenSiteAt, sunkenSitesNear, siteFits, footprint } from '../../src/game/SunkenSites.js';
import { SunkenWorld } from '../../src/game/SunkenWorld.js';
import { rollWreckLoot, rollSeaTempleLoot, SEA_SCROLLS } from '../../src/game/ItemTypes.js';
import { templeSolids, TEMPLE, TEMPLE_CHESTS } from '../../src/entities/SeaTempleModel.js';

test('the places: the same from the same seed, wrecks often, the temple rare', () => {
    let w = 0, t = 0;
    for (let x = -30; x < 30; x++) for (let z = -30; z < 30; z++) {
        const a = sunkenSiteAt(x, z, 4242), b = sunkenSiteAt(x, z, 4242);
        assert.deepEqual(a, b);
        if (a?.kind === 'wreck') w++; else if (a?.kind === 'temple') t++;
    }
    assert.ok(w > t * 3 && t > 0, `wrecks ${w}, temples ${t}`);
    let n = 0; sunkenSitesNear(0, 0, 2000, 4242, () => n++);
    assert.ok(n > 0);
});

test('a site lies only on deep, flat sea: shallow, a lake / land, or a steep bottom — no', () => {
    const site = { id: 'wreck:1,1', kind: 'wreck', x: 0, z: 0, yaw: 0.4, cls: 'pinnace' };
    assert.equal(footprint(site).length, 9);
    assert.ok(siteFits(site, () => ({ depth: 12, floor: -15 })));
    assert.equal(siteFits(site, () => ({ depth: 5, floor: -8 })), null, 'too shallow');
    assert.equal(siteFits(site, () => null), null, 'no sea there');
    assert.equal(siteFits(site, (x) => ({ depth: 14, floor: -15 + x * 0.5 })), null, 'too steep under her');
    const temple = { id: 'seaTemple:0,0', kind: 'temple', x: 0, z: 0, yaw: 0 };
    assert.equal(siteFits(temple, () => ({ depth: SUNKEN.TEMPLE_DEPTH - 1, floor: -20 })), null, 'the temple wants the deep');
});

test('the chests: a wreck keeps precious things (its captain more), the temple its offerings with the sea\'s scrolls', () => {
    for (let i = 0; i < 30; i++) {
        const w = rollWreckLoot(Math.random, false, 3), c = rollWreckLoot(Math.random, true), t = rollSeaTempleLoot(Math.random, true);
        assert.equal(w.length, 3);
        assert.ok(c.length >= 3);
        assert.ok(t.some((it) => it.kind === 'scroll' && SEA_SCROLLS.includes(it.spell)), 'a scroll of the sea in the altar\'s chest');
    }
});

test('the temple: its solids hold a doorway into the cella, every chest stands free of them', () => {
    const S = templeSolids(), Y = TEMPLE.TOP + 1;
    const inside = (x, y, z) => S.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1);
    assert.ok(!inside(0, Y, TEMPLE.CELLA.z1), 'the doorway is open');
    assert.ok(inside(TEMPLE.CELLA.x0, Y, 0), 'the side wall is solid');
    for (const c of TEMPLE_CHESTS) assert.ok(!inside(c.x, TEMPLE.TOP + 0.5, c.z), `chest at ${c.x},${c.z} is not in a wall`);
});

function fakeGame() {
    const movers = new Set(), boxes = new Map(); let id = 0;
    const g = {
        seed: 4242, scene: new THREE.Scene(), chests: [], config: {},
        character: { group: { position: new THREE.Vector3() } },
        sea: { s: () => 100 },
        collision: { addMover: (m) => movers.add(m), removeMover: (m) => movers.delete(m), addBox: (b) => { boxes.set(++id, b); return id; }, removeBox: (i) => boxes.delete(i) },
    };
    return { g, movers, boxes };
}

test('raised near the player: a wreck (solid, her chests in her) and the temple (its boxes, its chests); put away far off', () => {
    const { g, movers, boxes } = fakeGame();
    let wreck = null, temple = null;
    for (let x = -40; x < 40 && !(wreck && temple); x++) for (let z = -40; z < 40; z++) {
        const s = sunkenSiteAt(x, z, g.seed);
        if (s?.kind === 'wreck' && !wreck) wreck = s;
        if (s?.kind === 'temple' && !temple) temple = s;
    }
    const sw = new SunkenWorld(g);
    sw._seaAt = () => ({ depth: 20, floor: -22 });
    const raise = (site) => { g.character.group.position.set(site.x + 20, -10, site.z); for (let i = 0; i < 200; i++) sw.update(0.05); assert.ok(sw.sites.has(site.id), site.kind + ' raised'); return sw.sites.get(site.id); };
    const W = raise(wreck);
    assert.ok(movers.has(W.collider) && W.collider.flooded, 'the wreck is solid and full of water');
    assert.ok(W.model.ready && W.shown, 'her model built a little a frame and shown');
    assert.ok(W.chests.length >= 2 && W.chests.every((c) => c.sunk && (c.room === 'wreck' || c.room === 'wreckCaptain')));
    assert.ok(W.chests.some((c) => c.room === 'wreckCaptain'), 'the captain\'s chest');
    const T = raise(temple);
    assert.equal(T.chests.length, TEMPLE_CHESTS.length);
    assert.ok(T.chests.some((c) => c.room === 'seaAltar'));
    assert.ok(boxes.size > 20, 'the temple\'s steps, columns, walls are solid');
    // the temple's floor round its middle covers the weed; a chest opened is remembered when it is put away
    assert.ok(sw.covers(temple.x, temple.z));
    T.chests[0].isOpen = true;
    // (far off over land: wrecks are dense now — the author 05.11: «в 2 раза реже, чем пещеры» — the sea far away would raise its own)
    sw._seaAt = () => null;
    g.character.group.position.set(1e5, 0, 1e5);
    sw.update(0.05);
    assert.equal(sw.sites.size, 0, 'put away far off');
    assert.equal(movers.size, 0, 'no solid wreck left behind'); assert.equal(boxes.size, 0, 'no box left behind');
    assert.ok(g._openedChests.has(T.chests[0].id));
    assert.equal(g.chests.length, 0);
});

test('a wreck looks for a flat spot near its point (the reefs and canyons of the gen-24 seabed — the author: «никак не могу найти»)', async () => {
    const { fitSite, siteVariants } = await import('../../src/game/SunkenSites.js');
    let s = null;
    for (let x = 0; !s; x++) { const t = sunkenSiteAt(x, 3, 777); if (t?.kind === 'wreck') s = t; }
    // the bottom: a steep slope (1 m up a metre) round the point — no ship fits it whichever way she lies — flat 40 m east of it
    const seaAt = (x, z) => ({ depth: 25, floor: x < s.x + 40 ? -60 + (x - s.x) : -30 });
    const got = fitSite(s, seaAt);
    assert.ok(got && got.site.x > s.x + 35, 'moved to the flat bottom');
    assert.equal(got.site.id, s.id, 'the same site (the same id on every computer)');
    assert.deepEqual(fitSite(s, () => undefined), undefined, 'land not made yet: asked again later');
    assert.equal(fitSite(s, () => null), null, 'no sea at all');
    assert.ok(siteVariants(s).length > 20);
});
