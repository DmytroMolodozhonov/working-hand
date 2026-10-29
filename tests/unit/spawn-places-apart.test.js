/**
 * «Где появиться» в Творческом (миры поколения 11+): дракон, Ледяная Королева и паучиха — каждый на своей отдельной «карте», а не на
 * одной тестовой горе. Каждое место ставит героя на твёрдое, с воздухом над головой, не вплотную к боссу, на готовой земле.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, isSolid, WORLD_GEN, SPAWN_MAPS_FROM_GEN, TEST_CAVE } from '../../src/world/Terrain.js';
import { testSeaCastleSpot } from '../../src/world/Castles.js';
import { LAIR } from '../../src/world/DragonLairs.js';
import { DEN } from '../../src/world/SpiderDens.js';
import { spotTarget, farTarget, lairSpot, denSpot, queenApproach, standLayer, safeNear, lairCells, lairUsable } from '../../src/game/SpawnSpots.js';

const SEEDS = [1, 5, 11, 2026];
const make = (seed, apart = true) => {
    const t = new TerrainData();
    t.generate({ seed, mountains: true, seas: true, lush: true, deepCaves: true, test: true, slopes: true, wizHuts: true, furnish: true, apart });
    return t;
};
const stand = (t, x, z, layer, up, down, clear = 6) => standLayer((a, L, b) => isSolid(t.get(a, L, b)), (a, L, b) => t.get(a, L, b) === BLOCK.AIR, x, z, layer - down, layer + up, clear);
const headroom = (t, floor) => (x, z) => { let n = 0; while (n < 16 && t.get(Math.round(x), floor + 1 + n, Math.round(z)) === BLOCK.AIR) n++; return n; };
const worlds = new Map();
const world = (seed) => { if (!worlds.has(seed)) worlds.set(seed, make(seed)); return worlds.get(seed); };

test('поколение мира: места врозь начиная с 11; старые миры не меняются', () => {
    assert.ok(WORLD_GEN >= SPAWN_MAPS_FROM_GEN);
    const old = make(1, false), now = world(1);
    assert.equal(old.iceCastle.plan.test, true, 'в старом мире дворец на тестовой горе');
    assert.equal(old.den, null);
    assert.equal(old.densNear(0, 0, 5000).length, 0);
    assert.ok(Math.hypot(old.iceCastle.plan.x - (TEST_CAVE.X - 6), old.iceCastle.plan.z - (TEST_CAVE.Z - 4)) < 30);
    assert.equal(now.iceCastle.plan.test, false);
    assert.ok(Math.hypot(now.iceCastle.plan.x, now.iceCastle.plan.z) > 900, 'дворец далеко от начальной площадки');
});

test('дракон: настоящее логово далеко от Королевы, герой на твёрдом уступе, дракон в 18–60 м, не вплотную', () => {
    for (const seed of SEEDS) {
        const t = world(seed), P = t.iceCastle.plan;
        let S = null;
        for (const { gx, gz } of lairCells(LAIR.CELL, 16)) { S = t.lairOf(gx, gz); if (S && lairUsable(S.lair, t)) break; S = null; }
        assert.ok(S, `seed ${seed}: логово дракона не нашлось`);
        const L = S.lair, tt = lairSpot(L);
        assert.ok(Math.hypot(L.x - P.x, L.z - P.z) > 300, 'дракон далеко от Королевы');
        assert.ok(Math.hypot(L.x, L.z) > 300, 'и от начальной площадки');
        const at = safeNear(tt, (x, z) => stand(t, x, z, tt.layer, tt.up, tt.down) != null, { rings: [0, 2, 4, 6], around: 8 });
        assert.ok(at, `seed ${seed}: нет твёрдого места у логова`);
        const d = Math.hypot(at.x - tt.boss.x, at.z - tt.boss.z);
        assert.ok(d >= tt.dist[0] && d <= tt.dist[1], `seed ${seed}: дракон в ${d} м`);
    }
});

test('Ледяная Королева: свой дворец, герой на уступе перед лестницей на твёрдом, Королева в 38+ м, дракона и паучихи рядом нет', () => {
    for (const seed of SEEDS) {
        const t = world(seed), P = t.iceCastle.plan, tt = queenApproach(P);
        const at = safeNear(tt, (x, z) => stand(t, x, z, tt.layer, tt.up, tt.down) != null, { rings: [0, 2, 4, 6, 10], around: 8 });
        assert.ok(at, `seed ${seed}: нет твёрдого места на уступе`);
        const d = Math.hypot(at.x - tt.boss.x, at.z - tt.boss.z);
        assert.ok(d >= tt.dist[0] && d <= tt.dist[1], `seed ${seed}: Королева в ${d} м`);
        const den = t.den.spot;
        assert.ok(den && Math.hypot(den.x - P.x, den.z - P.z) > 300, 'пещера паучихи далеко от дворца');
        // тестовая гора у старта пуста: старого дворца на ней нет
        assert.ok(Math.hypot(P.x - (TEST_CAVE.X - 6), P.z - (TEST_CAVE.Z - 4)) > 500);
    }
});

test('паучиха: тёмная пещера под своей горой, без сундуков, герой в зале под сводом в 18–45 м от неё, паучихе хватает высоты', () => {
    for (const seed of SEEDS) {
        const t = world(seed), D = t.spiderDen();
        assert.ok(D, `seed ${seed}: пещеры паучихи нет`);
        assert.deepEqual(D.chests, [], 'у паучихи сундуков нет');
        const L = D.lair, P = t.iceCastle.plan;
        assert.ok(Math.hypot(L.x - P.x, L.z - P.z) > 300, 'далеко от Королевы');
        assert.equal(t.lairsNear(L.x, L.z, 250).length, 0, 'и от логова дракона');
        const tt = denSpot(L).refine(headroom(t, L.F));
        const at = safeNear(tt, (x, z) => stand(t, x, z, tt.layer, tt.up, tt.down, 8) != null, { rings: [0, 2, 4, 6], around: 8 });
        assert.ok(at, `seed ${seed}: нет места для героя в зале`);
        const d = Math.hypot(at.x - tt.boss.x, at.z - tt.boss.z);
        assert.ok(d >= tt.dist[0] && d <= tt.dist[1], `seed ${seed}: паучиха в ${d} м`);
        // паучиха (~9 м ростом) стоит на полу под сводом
        assert.ok(stand(t, tt.boss.x, tt.boss.z, L.F, 2, 2, 9) != null, `seed ${seed}: паучихе не хватает высоты`);
        // тёмная: над героем камень (свод), а не небо
        const Ly = stand(t, at.x, at.z, tt.layer, tt.up, tt.down, 8);
        let rock = 0;
        for (let k = 9; k < 40; k++) if (t.get(at.x, Ly + k, at.z) !== BLOCK.AIR) rock++;
        assert.ok(rock > 0, `seed ${seed}: над героем небо — не тёмная пещера`);
        // зал и вход — внутри DEN: мир до и после один и тот же (детерминированность)
        assert.equal(make(seed).spiderDen().lair.id, L.id);
    }
});

test('каждое место из списка: твёрдая земля, воздух над головой, земля готова, босс не вплотную', () => {
    for (const seed of SEEDS.slice(0, 2)) {
        const t = world(seed);
        const gate = () => { const c = t.castles?.cellOf?.(0, -1); return c?.gate ? { x: c.gate.x, z: c.gate.z, yaw: c.gateYaw } : null; };
        const port = () => { const sp = testSeaCastleSpot(t.seed); return sp ? { x: sp.shore.x, z: sp.shore.z + 8 } : null; };
        const dry = (x, z) => t.landMade(x, z) && !t.isSeaColumn(Math.round(x), Math.round(z)) && !t.isWaterAt(x, t.surfaceY(x, z), z);
        const surface = (x, z) => { const top = Math.round(t.surfaceY(x, z) + 0.5); return stand(t, x, z, top, 1, 3, 5) != null; };
        const spots = { start: { x: 0, z: 0 } };
        for (const id of ['castle', 'tower', 'arena', 'village', 'magevillage', 'magehut', 'port']) {
            const g = ['tower', 'arena', 'village', 'magevillage', 'magehut', 'port'].includes(id) ? farTarget(id, t, { port }) : spotTarget(id, { castleGate: gate });
            if (g) spots[id] = g;
        }
        assert.ok(spots.castle && spots.port, 'замок и порт площадки есть');
        for (const [id, g] of Object.entries(spots)) {
            const at = safeNear(g, (x, z) => dry(x, z) && surface(x, z));
            assert.ok(at, `seed ${seed}, «${id}»: нет твёрдого места с воздухом над головой`);
            assert.ok(Math.hypot(at.x - g.x, at.z - g.z) <= 16, `seed ${seed}, «${id}»: далеко от цели`);
        }
        // дракона и Королевы на площадке нет: рядом со стартом ни логова, ни дворца
        assert.equal(t.lairsNear(0, 0, 300).length, 0);
        assert.ok(Math.hypot(t.iceCastle.plan.x, t.iceCastle.plan.z) > 900);
        // у пещеры паучихи и логова дракона: DEN/LAIR — свои, не общие
        assert.notEqual(DEN.ID, 'lair');
    }
});

test('Творческий: у логова ровно один дракон (раньше в четверти логовов рождалась пара)', async () => {
    const { Dragons } = await import('../../src/game/Dragons.js');
    const lairState = (mode, seed) => {
        const self = { state: {}, game: { config: { mode } }, _single: Dragons.prototype._single };
        return Dragons.prototype._lairState.call(self, { L: { id: 'lair' + seed, seed }, hoard: { loose: 0 } });
    };
    let pairsOutside = 0;
    for (let seed = 1; seed <= 400; seed++) {
        assert.equal(lairState('creative', seed * 7919).d.length, 1, `seed ${seed}: в Творческом дракон один`);
        if (lairState('free', seed * 7919).d.length === 2) pairsOutside++;
    }
    assert.ok(pairsOutside > 0, 'вне Творческого пары по-прежнему бывают');
});

test('места врозь: тестового дракона старой площадки в мире нет (он не дублирует дракона логова)', () => {
    const t = world(1);
    assert.ok(t.apart, 'мир с раздельными местами');
    // Game._updateTestDragon выходит при data.apart: у старта и на тестовой горе логова нет
    assert.equal(t.lairsNear(TEST_CAVE.X, TEST_CAVE.Z, 300).length, 0);
});
