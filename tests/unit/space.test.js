// «Космос»: the planets' registry (Planets.js), their ground (PlanetSurface.js), the far zone of the voxel
// world, «Flying Maxima»'s words and what spells do off the Earth (Space.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANETS, SPACE, PlanetRegistry, realmAt, slotRect, slotAt, surfaceToDir, dirToSurface, earthToDir, dirToEarth, planetPosition } from '../../src/world/Planets.js';
import { TerrainData, BLOCK, CHUNK } from '../../src/world/Terrain.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { spaceSpellBlock, flyingMaximaWords } from '../../src/game/Space.js';

test('the Solar System: the real order out from the Sun, the real order of sizes', () => {
    const byA = PLANETS.filter((p) => p.a && !p.parent).sort((a, b) => a.a - b.a).map((p) => p.id);
    assert.deepEqual(byA, ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']);
    const R = Object.fromEntries(PLANETS.map((p) => [p.id, p.radius]));
    assert.ok(R.sun > R.jupiter && R.jupiter > R.saturn && R.saturn > R.uranus && R.uranus > R.neptune && R.neptune > R.earth);
    assert.ok(R.earth > R.venus && R.venus > R.mars && R.mars > R.mercury && R.mercury > R.moon && R.moon > R.pluto);
    assert.ok(PLANETS.find((p) => p.id === 'saturn').rings, 'Saturn has rings');
    // the planets go round the Sun slowly (the Earth: once in two hours), each at its own distance
    const e = PLANETS.find((p) => p.id === 'earth');
    const a = planetPosition(e, 0), b = planetPosition(e, SPACE.YEAR / 4);
    assert.ok(Math.abs(Math.hypot(a.x, a.z) - e.a) < 1 && Math.abs(Math.hypot(b.x, b.z) - e.a) < 1);
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > e.a);
    // the Sun kills well inside Mercury's orbit; Mercury itself is outside the death zone
    assert.ok(SPACE.DEATH_R < SPACE.HEAT_R && SPACE.HEAT_R < PLANETS.find((p) => p.id === 'mercury').a);
});

test('the registry: the same planets on every computer; made / changed ones saved and sent', () => {
    const r1 = new PlanetRegistry(42), r2 = new PlanetRegistry(42);
    assert.deepEqual(r1.list.map((p) => p.seed), r2.list.map((p) => p.seed));
    assert.equal(r1.clusters.length, 13, 'meteor clusters in both belts');
    assert.deepEqual(r1.toJSON(), { v: 1, changed: {}, created: [], clusters: [] });
    const id = r1.add({ name: 'Новая', a: 60000, radius: 250, created: 'Игрок' });
    r1.update('mars', { radius: 535, terraformed: true });
    r1.updateCluster(r1.clusters[0].id, { used: true });
    const s = JSON.parse(JSON.stringify(r1.toJSON()));
    r2.applyJSON(s);
    assert.equal(r2.get(id).name, 'Новая');
    assert.equal(r2.get('mars').radius, 535);
    assert.equal(r2.get('mars').terraformed, true);
    assert.equal(r2.clusters[0].used, true);
    const np = r2.get(id);
    assert.ok(np.slot >= 5 && slotRect(np), 'a made planet gets a surface of its own');
    assert.equal(realmAt(slotRect(np).cx, 5, slotRect(np).cz, r2), id);
});

test('where somebody is comes from the position alone: the Earth, space, a planet', () => {
    const reg = new PlanetRegistry(1);
    assert.equal(realmAt(0, 5, 0, reg), 'earth');
    assert.equal(realmAt(5000, 120, -3000, reg), 'earth');
    assert.equal(realmAt(SPACE.ANCHOR_X, SPACE.ORIGIN_Y, SPACE.ANCHOR_Z, reg), 'space');
    for (const p of reg.rocky()) {
        const r = slotRect(p);
        assert.equal(slotAt(r.cx, r.cz), p.slot);
        assert.equal(realmAt(r.cx + 1000, 10, r.cz - 2000, reg), p.id);
    }
    // the anchor of space is in the empty gap between the slots (no ground is ever made there)
    assert.equal(slotAt(SPACE.ANCHOR_X, SPACE.ANCHOR_Z), -1);
    assert.equal(slotAt(SPACE.ANCHOR_X + SPACE.FLOAT, SPACE.ANCHOR_Z + SPACE.FLOAT), -1);
});

test('a place on a planet ↔ a point on its globe, both ways (landing where you flew at)', () => {
    const mars = new PlanetRegistry(1).get('mars'), r = slotRect(mars);
    for (const [x, z] of [[r.cx, r.cz], [r.cx + 5000, r.cz - 3000], [r.cx - 12000, r.cz + 6000]]) {
        const d = surfaceToDir(mars, x, z), q = dirToSurface(mars, d);
        assert.ok(Math.abs(q.x - x) < 0.5 && Math.abs(q.z - z) < 0.5, `${x},${z} → ${q.x},${q.z}`);
    }
    // the Earth: the start at the north pole, every place round it has its own spot on the globe
    assert.ok(earthToDir(0, 0).y > 0.999);
    for (const [x, z] of [[300, -200], [-4000, 2500], [9000, 9000]]) {
        const q = dirToEarth(earthToDir(x, z));
        assert.ok(Math.abs(q.x - x) < 0.5 && Math.abs(q.z - z) < 0.5, `${x},${z} → ${q.x},${q.z}`);
    }
});

test('the planets\' ground: by their own recipe, the same every time; no castles, caves or trees there', () => {
    const d = new TerrainData();
    d.generate({ seed: 7, mountains: true, seas: true, deepCaves: true, lush: true });
    const d2 = new TerrainData();
    d2.generate({ seed: 7, mountains: true, seas: true, deepCaves: true, lush: true });
    for (const id of ['moon', 'mercury', 'venus', 'mars', 'pluto', 'jupiter', 'saturn', 'uranus', 'neptune']) {
        const r = slotRect(d.planets.get(id));
        const cx = Math.floor(r.cx / CHUNK), cz = Math.floor(r.cz / CHUNK);
        const c = d.chunk(cx, cz), c2 = d2.chunk(cx, cz);
        assert.equal(c.planet, id);
        assert.deepEqual([...c.top], [...c2.top], `${id}: deterministic`);
        const kinds = new Set(c.blocks);
        for (const t of [BLOCK.GRASS, BLOCK.WOOD, BLOCK.LEAVES, BLOCK.WATER, BLOCK.CS_GREY]) assert.ok(!kinds.has(t), `${id}: no ${t}`);
        assert.ok([BLOCK.REGOLITH, BLOCK.PLANET_ICE, BLOCK.PLANET_DARK, BLOCK.PLANET_ROCK].some((t) => kinds.has(t)), `${id}: its own ground`);
        assert.equal(d.sites.near(r.cx, r.cz, 600).length, 0, `${id}: no castles`);
        assert.equal(d.cavesNear(r.cx, r.cz, 300).length, 0, `${id}: no caves`);
    }
    // the empty zone round space's anchor: one shared empty chunk, never kept
    const n = d.chunks.size;
    const e1 = d.chunk(Math.floor(SPACE.ANCHOR_X / CHUNK), Math.floor(SPACE.ANCHOR_Z / CHUNK)), e2 = d.chunk(Math.floor(SPACE.ANCHOR_X / CHUNK) + 9, Math.floor(SPACE.ANCHOR_Z / CHUNK) - 4);
    assert.ok(e1.empty && e1 === e2);
    assert.equal(d.chunks.size, n);
    // the Earth near the start is the Earth's
    assert.ok(!d.chunk(0, 0).planet);
});

test('«Flying Maxima»: its words — never the plain «Флайн» or the lone «Максима»', () => {
    for (const s of ['Flying Maxima', 'флайн максима', 'Флайинг Максима', 'полёт максима']) assert.equal(matchSpell(s), 'FlyingMaxima', s);
    assert.equal(matchSpell('флайн'), 'Flight');
    assert.equal(matchSpell('максима'), 'Maxima');
    assert.equal(matchSpell('fire maxima'), 'FireMaxima');
    assert.equal(matchSpell('lumos maxima'), 'LumosMaxima');
    assert.ok(!flyingMaximaWords('флайн'));
});

test('spells off the Earth: what has nothing to work with says why (who / what × how)', () => {
    assert.equal(spaceSpellBlock('Inferno', 'earth', 'air'), null);
    assert.match(spaceSpellBlock('Inferno', 'space', 'space'), /не горит/);
    assert.match(spaceSpellBlock('Inferno', 'moon', 'none'), /не горит/);
    assert.match(spaceSpellBlock('FireMaxima', 'pluto', 'none'), /не горит/);
    assert.equal(spaceSpellBlock('Inferno', 'mars', 'air'), null, 'Mars has air (the author)');
    assert.equal(spaceSpellBlock('Inferno', 'venus', 'air'), null, 'Venus has air: fire burns');
    assert.equal(spaceSpellBlock('LightningStrike', 'venus', 'air'), null, 'Venus: storm clouds');
    assert.match(spaceSpellBlock('LightningStrike', 'mars', 'air'), /туч/);
    assert.equal(spaceSpellBlock('LightningStrike', 'jupiter', 'air', { kind: 'gas' }), null, 'the giants: storm clouds');
    assert.match(spaceSpellBlock('Waterball', 'space', 'space'), /замерзает/);
    assert.match(spaceSpellBlock('Wind', 'moon', 'none'), /ветру/);
    assert.match(spaceSpellBlock('Earthquake', 'space', 'space'), /ничего нет/);
    assert.equal(spaceSpellBlock('Earthquake', 'mars', 'air'), null, 'on a planet: ground to shake');
    for (const ok of ['Stupefy', 'Jolt', 'Protection', 'ProtectionMaxima', 'Lumos', 'Levitation', 'Accio', 'AvadaKedavra', 'Expelliarmus']) assert.equal(spaceSpellBlock(ok, 'space', 'space'), null, ok);
});

test('other players in space are drawn where they really are in space (each hero has his own origin)', async () => {
    const { Space } = await import('../../src/game/Space.js');
    const mk = () => { const s = new Space({ config: { mode: 'creative' }, seed: 1 }); s.realm = 'space'; return s; };
    const me = mk(), you = mk();
    me.P = { x: 50000, y: 300, z: -20000 }; me.O = { x: 49500, y: 0, z: -20500 };
    you.P = { x: 50040, y: 310, z: -19990 }; you.O = { x: 51000, y: 900, z: -18000 };
    const at = me.remoteWorld(you.netPos());
    const mine = [SPACE.ANCHOR_X + (me.P.x - me.O.x), SPACE.ORIGIN_Y + (me.P.y - me.O.y), SPACE.ANCHOR_Z + (me.P.z - me.O.z)];
    assert.deepEqual(at.map((v, i) => Math.round(v - mine[i])), [40, 10, 10], 'the same 40 m apart on my screen as in space');
    me.realm = 'mars';
    assert.equal(me.remoteWorld(you.netPos()), null, 'not while I am elsewhere');
    assert.equal(me.netPos(), undefined);
});

test('the author: where one breathes (no mana for it) and where by magic; every planet its own gravity', async () => {
    const { breathable } = await import('../../src/game/Space.js');
    const reg = new PlanetRegistry(1);
    for (const id of ['earth', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) assert.ok(breathable(reg.get(id)), id);
    for (const id of ['mercury', 'moon', 'pluto']) assert.ok(!breathable(reg.get(id)), id);
    const p = reg.get(reg.add({ name: 'Новая', a: 60000 }));
    assert.ok(!breathable(p), 'a new planet: no air until terraformed');
    reg.update(p.id, { terraformed: true });
    assert.ok(breathable(reg.get(p.id)));
    // the giants can be stood on: each has its ground
    for (const id of ['jupiter', 'saturn', 'uranus', 'neptune']) assert.ok(slotRect(reg.get(id)), id);
    assert.ok(p.slot > 8, 'a new planet takes a free slot');
    const g = Object.fromEntries(reg.list.map((d) => [d.id, d.gravity]));
    assert.ok(g.jupiter > g.neptune && g.neptune > g.saturn && g.saturn > g.earth && g.earth > g.venus && g.venus > g.uranus);
    assert.ok(g.mars === g.mercury && g.mars < 0.5 && g.moon < g.mars && g.pluto < g.moon);
});
