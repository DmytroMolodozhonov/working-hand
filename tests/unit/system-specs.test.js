// «Требования к ПК» (автор 07.11): ступени, оценка видеокарты по названию, выбор настроек по замерам.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gpuScore, verdict, PRESETS, TUNE, pickPreset, presetFloor, SPEC_TIERS, isSoftwareGpu } from '../../src/game/SystemSpecs.js';
import { QUALITY_LEVELS, VIEW_DISTANCES } from '../../src/game/Quality.js';

test('видеокарты по названию из WebGL: известные узнаются, неизвестные — честно «не знаю»', () => {
    const n = (s) => gpuScore(s).score;
    assert.equal(n('ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 19500);
    assert.ok(n('NVIDIA GeForce RTX 4060 Ti') > n('NVIDIA GeForce RTX 4060'), 'Ti сильнее, и не путается с обычной');
    assert.ok(n('NVIDIA GeForce GTX 1050 Ti') > n('NVIDIA GeForce GTX 1050'));
    assert.ok(n('Intel(R) Iris(R) Xe Graphics') > n('Intel(R) UHD Graphics 620'));
    assert.equal(gpuScore('Some Future GPU 9000').known, false);
    assert.equal(gpuScore('').known, false);
    assert.ok(isSoftwareGpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'));
});

test('ступени: порядок и вердикт — по меньшему из видеокарты и процессора', () => {
    assert.ok(SPEC_TIERS.min.g3d < SPEC_TIERS.rec.g3d && SPEC_TIERS.rec.g3d < SPEC_TIERS.max.g3d);
    assert.ok(SPEC_TIERS.min.threads <= SPEC_TIERS.rec.threads && SPEC_TIERS.rec.threads <= SPEC_TIERS.max.threads);
    assert.equal(verdict({ gpuName: 'NVIDIA GeForce RTX 4070', threads: 16 }).tier, 'max');
    assert.equal(verdict({ gpuName: 'NVIDIA GeForce RTX 4070', threads: 8 }).tier, 'rec', 'сильная карта, но мало потоков — рекомендуемые');
    assert.equal(verdict({ gpuName: 'NVIDIA GeForce GTX 1650', threads: 12 }).tier, 'rec', 'GTX 1650 — рекомендуемые');
    assert.equal(verdict({ gpuName: 'NVIDIA GeForce GTX 1050 Ti', threads: 8 }).tier, 'min');
    assert.equal(verdict({ gpuName: 'Intel(R) UHD Graphics 620', threads: 8 }).tier, 'none');
    assert.equal(verdict({ gpuName: 'Mystery GPU', threads: 8 }).tier, 'unknown');
    const sw = verdict({ gpuName: 'SwiftShader', threads: 8 });
    assert.equal(sw.tier, 'none'); assert.ok(sw.note.length);
});

test('наборы настроек: от красивого к лёгкому, все существуют в игре', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const sel = (id) => [...html.slice(html.indexOf(`id="${id}"`)).split('</select>')[0].matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
    const gq = sel('graphics-quality'), vd = sel('view-distance');
    for (const p of PRESETS) { assert.ok(gq.includes(p.graphics), p.id); assert.ok(vd.includes(p.view), p.id); assert.ok(VIEW_DISTANCES[p.view], p.id); if (p.graphics !== 'ultra') assert.ok(QUALITY_LEVELS[Number(p.graphics)], p.id); }
    // (не красивее предыдущего ни по графике, ни по дальности)
    const gr = (p) => (p.graphics === 'ultra' ? 4 : Number(p.graphics)), vw = (p) => VIEW_DISTANCES[p.view].scale;
    for (let i = 1; i < PRESETS.length; i++) assert.ok(gr(PRESETS[i]) <= gr(PRESETS[i - 1]) && (gr(PRESETS[i]) < gr(PRESETS[i - 1]) || vw(PRESETS[i]) <= vw(PRESETS[i - 1])), PRESETS[i].id);
});

test('выбор по замерам: самый красивый из тех, что укладываются в бюджет; потолок по процессору; слабым — самый лёгкий', () => {
    const all = (t) => Object.fromEntries(PRESETS.map((p, i) => [p.id, t * (PRESETS.length - i)])); // (чем красивее, тем дороже)
    const strong = pickPreset(Object.fromEntries(PRESETS.map((p) => [p.id, 1])), { threads: 16 });
    assert.equal(strong.preset.id, 'ultra-max');
    const mid = pickPreset(all(0.7), { threads: 16 }); // (ultra-max = 7 мс > 4, ultra-high = 6.3, ultra-medium = 5.6, high-max = 4.9, high-high = 4.2, high-medium = 3.5 ✓)
    assert.equal(mid.preset.id, 'high-medium');
    assert.equal(pickPreset(Object.fromEntries(PRESETS.map((p) => [p.id, 1])), { threads: 6 }).preset.id, 'high-medium', '6 потоков — выше «Высокая, средняя» не поднимаемся');
    assert.equal(pickPreset(Object.fromEntries(PRESETS.map((p) => [p.id, 1])), { threads: 6 }).reason, 'cpu');
    const weak = pickPreset(Object.fromEntries(PRESETS.map((p) => [p.id, 50])), { threads: 8 });
    assert.equal(weak.preset.id, PRESETS[PRESETS.length - 1].id); assert.equal(weak.reason, 'weak');
    assert.ok(presetFloor({ threads: 2 }) >= PRESETS.findIndex((p) => p.id === 'mid-low'));
    assert.ok(presetFloor({ threads: 16, weakGpu: true }) >= PRESETS.findIndex((p) => p.id === 'mid-low'), 'встроенная графика — без «Ультра»');
    assert.ok(TUNE.BUDGET_MS < 1000 / 60 / 2, 'бюджет — меньше половины кадра: запас на всё остальное');
});
