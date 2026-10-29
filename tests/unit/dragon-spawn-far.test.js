/**
 * «Где появиться → У горы дракона»: другая местность, не ближе 2500 м к Ледяной Королеве, перед видимой пещерой.
 * Печатает фактические расстояния (метры) по сидам.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, isSolid } from '../../src/world/Terrain.js';
import { LAIR } from '../../src/world/DragonLairs.js';
import { lairCells, lairUsable, lairApproach, standLayer, DRAGON_LAIR_MIN_FROM_QUEEN, DRAGON_LAIR_MIN_FROM_SITES, DRAGON_LAIR_MIN_FROM_HAMLETS } from '../../src/game/SpawnSpots.js';

const SEEDS = [1, 5, 11, 2026, 77];
const make = (seed, apart) => {
    const t = new TerrainData();
    t.generate({ seed, mountains: true, seas: true, lush: true, deepCaves: true, test: true, slopes: true, wizHuts: true, furnish: true, apart });
    return t;
};
const pick = (t) => {
    for (const { gx, gz } of lairCells(LAIR.CELL, 20)) {
        const S = t.lairOf(gx, gz);
        if (!S?.lair || !lairUsable(S.lair, t)) continue;
        const a = lairApproach(S.lair, t.heightAt);
        if (a) return { S, a };
    }
    return null;
};

for (const apart of [true, false]) {
    test(`дракон далеко от Королевы, пещера на виду (${apart ? 'места врозь' : 'старый мир'})`, () => {
        for (const seed of SEEDS) {
            const t = make(seed, apart), P = t.iceCastle.plan;
            const r = pick(t);
            assert.ok(r, `seed ${seed}: нет подходящего логова`);
            const { S, a } = r, L = S.lair;
            const toQ = Math.hypot(a.x - P.x, a.z - P.z), lairQ = Math.hypot(L.x - P.x, L.z - P.z);
            const toMouth = Math.hypot(a.x - L.mouth.x, a.z - L.mouth.z), toDragon = Math.hypot(a.x - L.hoard.x, a.z - L.hoard.z);
            console.log(`${apart ? 'врозь ' : 'старый'} seed ${seed}: герой—Королева ${Math.round(toQ)} м, пещера—Королева ${Math.round(lairQ)} м, герой—устье ${Math.round(toMouth)} м, герой—дракон ${Math.round(toDragon)} м`);
            assert.ok(toQ >= DRAGON_LAIR_MIN_FROM_QUEEN && lairQ >= DRAGON_LAIR_MIN_FROM_QUEEN);
            assert.ok(toMouth >= 60 && toMouth <= 120, `устье в ${toMouth} м`);
            for (const q of t.sites.near(L.mouth.x, L.mouth.z, DRAGON_LAIR_MIN_FROM_SITES)) assert.ok(Math.hypot(q.x - L.mouth.x, q.z - L.mouth.z) >= (String(q.id).startsWith('hm') ? DRAGON_LAIR_MIN_FROM_HAMLETS : DRAGON_LAIR_MIN_FROM_SITES), `рядом место ${q.id}`);
            assert.equal(S.lair.id.startsWith('lair'), true);
            // твёрдая земля и воздух над головой
            const L0 = standLayer((x, l, z) => isSolid(t.get(x, l, z)), (x, l, z) => t.get(x, l, z) === BLOCK.AIR, a.x, a.z, a.layer - a.down, a.layer + a.up);
            assert.ok(L0 != null, 'твёрдое место');
            // дракон в логове: логово есть в lairsNear у точки и зал внутри
            assert.ok(t.lairsNear(a.x, a.z, 150).some((q) => q.lair.id === L.id), 'логово в 150 м');
            // у Королевы дракона нет: в 2500 м от дворца логовов нет
            for (const q of t.lairsNear(P.x, P.z, DRAGON_LAIR_MIN_FROM_QUEEN - 200)) {
                if (apart) assert.fail(`логово ${q.lair.id} ближе 2500 м к Королеве`);
            }
        }
    });
}
