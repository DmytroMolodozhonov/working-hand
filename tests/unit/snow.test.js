/**
 * Snow on the mountains (generation 5): the high peaks are white, the lowlands are not, a band of
 * patches between; the same seed gives the same snow (whichever computer or worker makes it).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, SNOW_BAND } from '../../src/world/Terrain.js';

const OPTS = { seed: 777123, mountains: true, seas: true, deepCaves: true, lush: true };
const make = () => { const d = new TerrainData(); d.generate(OPTS); return d; };

/** Snow counts over a chunk's open-air columns by how far their top lies above the snow line. */
function survey(d, cx, cz) {
    const c = d.chunk(cx, cz), out = { high: 0, highSnow: 0, low: 0, lowSnow: 0, band: 0, bandSnow: 0 };
    for (let lz = 1; lz < 31; lz++) for (let lx = 1; lx < 31; lx++) {
        const x = cx * 32 + lx, z = cz * 32 + lz, h = d.heightAt(x, z);
        if (d.heightAt.water || h < 2 || c.top[lz * 32 + lx] !== h) continue; // (a tree, a castle, water on it)
        const t = d.get(x, h, z), line = c.snowL[lz * 32 + lx];
        const slope = Math.max(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => Math.abs(d.heightAt(x + a, z + b) - h)));
        const snow = t === BLOCK.SNOW ? 1 : 0;
        if (h >= line + 6 && slope <= 1) { out.high++; out.highSnow += snow; } else if (h < line - SNOW_BAND - 6) { out.low++; out.lowSnow += snow; } else if (h < line && h >= line - SNOW_BAND) { out.band++; out.bandSnow += snow; }
    }
    return out;
}

/** A chunk with a high peak in it and one in the low meadows (found from the recipe). */
function places(d) {
    let peak = null, vale = null;
    for (let r = 400; r < 3000 && !(peak && vale); r += 37) for (let a = 0; a < 6.28 && !(peak && vale); a += 0.21) {
        const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r), h = d.heightAt(x, z);
        if (!peak && h > 92) peak = [x >> 5, z >> 5];
        if (!vale && h > 3 && h < 18 && !d.heightAt.water) vale = [x >> 5, z >> 5];
    }
    return { peak, vale };
}

test('the high peaks lie under snow, the lowlands have none, patches between', () => {
    const d = make(), { peak, vale } = places(d);
    assert.ok(peak && vale, 'a peak and a vale in the world');
    const tot = { high: 0, highSnow: 0, low: 0, lowSnow: 0, band: 0, bandSnow: 0 };
    for (const [cx, cz] of [peak, vale, [peak[0] + 1, peak[1]], [peak[0], peak[1] + 1]]) {
        const s = survey(d, cx, cz);
        for (const k in tot) tot[k] += s[k];
    }
    assert.ok(tot.high > 20, `high columns: ${tot.high}`);
    assert.ok(tot.highSnow / tot.high > 0.9, `snow on the high ground: ${tot.highSnow}/${tot.high}`);
    assert.ok(tot.low > 100, `low columns: ${tot.low}`);
    assert.equal(tot.lowSnow, 0, 'no snow in the lowlands');
    assert.ok(tot.bandSnow > 0 && tot.bandSnow < tot.band, `patches below the line: ${tot.bandSnow}/${tot.band}`);
    assert.equal(survey(d, vale[0], vale[1]).lowSnow, 0, 'the vale is green');
});

test('the same seed gives the same snow (blocks and the snowy crowns\' colours), a chunk alone or after others', () => {
    const a = make(), b = make(), { peak } = places(a);
    for (const [x, z] of [[peak[0] + 3, peak[1] - 2], [peak[0] - 4, peak[1] + 1]]) b.chunk(x, z);
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1]]) {
        const cx = peak[0] + dx, cz = peak[1] + dz;
        const ma = a.buildChunkArrays(cx, cz), mb = b.buildChunkArrays(cx, cz);
        assert.deepEqual(a.chunk(cx, cz).blocks, b.chunk(cx, cz).blocks);
        assert.deepEqual(a.chunk(cx, cz).snowL, b.chunk(cx, cz).snowL);
        assert.deepEqual(ma.ground.colors, mb.ground.colors);
        assert.deepEqual(ma.ground.patterns, mb.ground.patterns);
    }
});
