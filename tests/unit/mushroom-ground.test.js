// Гриб (светлошляпка) и другие дикие растения в гладком мире (со скосами): под всем следом основания — земля, пустоты под краем нет.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, WORLD_GEN } from '../../src/world/Terrain.js';
import { floraGroupIn, plantFoot, FOOT_R, MAX_SPREAD } from '../../src/game/MagicFlora.js';

const make = (seed) => {
    const t = new TerrainData();
    t.generate({ seed, mountains: true, seas: true, lush: true, slopes: true });
    return t;
};
const water = (t) => (ix, tl, iz) => t.get(ix, tl, iz) === BLOCK.WATER || t.get(ix, tl + 1, iz) === BLOCK.WATER;

test('гладкий мир: у каждой посаженной светлошляпки по всему следу земля не ниже основания и не выше чем на MAX_SPREAD', () => {
    let planted = 0, skipped = 0, oldGap = 0, ramps = 0;
    for (const seed of [1, 7, 42, 2026]) {
        const t = make(seed);
        for (let gx = -6; gx < 6; gx++) for (let gz = -6; gz < 6; gz++) {
            const grp = floraGroupIn('glowcap', gx, gz, seed, () => 'forest');
            if (!grp) continue;
            for (const m of grp.members) {
                const ix = Math.round(m.x), iz = Math.round(m.z);
                if (!t.landMade || t.landMade(m.x, m.z) === false) continue;
                const top = t.topLayer(ix, iz);
                if (t.get(ix, top, iz) !== BLOCK.GRASS) continue;
                const oldY = top - 0.5;
                const foot = plantFoot(t, 'glowcap', m.x, m.z, m.scale, water(t));
                const r = FOOT_R.glowcap * m.scale;
                // «до»: основание по одному столбцу висело над землёй края
                let lowest = Infinity;
                for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; lowest = Math.min(lowest, t.surfaceY(m.x + Math.cos(a) * r, m.z + Math.sin(a) * r)); }
                if (oldY - lowest > 0.15) oldGap++;
                if (t.shape && t.surfaceY(m.x, m.z) !== oldY) ramps++;
                if (!foot) { skipped++; continue; }
                planted++;
                for (let i = 0; i < 16; i++) {
                    const a = i / 16 * Math.PI * 2, y = t.surfaceY(m.x + Math.cos(a) * r, m.z + Math.sin(a) * r);
                    assert.ok(y >= foot.y - 0.2, `пустота под краем: земля ${y} ниже основания ${foot.y} (сид ${seed}, ${m.id})`);
                    assert.ok(y - foot.y <= MAX_SPREAD + 0.5, 'слишком глубоко вросло');
                }
            }
        }
    }
    assert.ok(planted > 20, `грибов проверено ${planted}`);
    console.log(`грибов: ${planted}, не выросло: ${skipped}, висело бы по-старому: ${oldGap}, на скосе: ${ramps}`);
});

test('ровная земля: основание там же, где и было (top − 0,5); скос — по самой низкой точке; вода и пропасть — не растёт', () => {
    const flat = { topLayer: () => 10, surfaceY: () => 9.5 };
    assert.ok(Math.abs(plantFoot(flat, "glowcap", 3, 4, 1).y - 9.45) < 1e-9);
    const slope = { topLayer: () => 10, surfaceY: (x) => 9.5 + 0.3 * x };
    const f = plantFoot(slope, "glowcap", 0, 0, 1);
    assert.ok(f.y < 9.5 - 0.3 && f.spread > 0.5, 'встал на нижнюю точку склона');
    assert.equal(plantFoot({ topLayer: () => 10, surfaceY: (x) => 9.5 + 2 * x }, 'glowcap', 0, 0, 1), null, 'обрыв');
    assert.equal(plantFoot(flat, 'glowcap', 0, 0, 1, () => true), null, 'вода');
    assert.equal(plantFoot({ topLayer: () => -1e9, surfaceY: () => 0 }, 'glowcap', 0, 0, 1), null, 'пустой столбец');
    assert.ok(WORLD_GEN >= 6);
});
