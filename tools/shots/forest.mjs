// The forest's undergrowth: a thick forest, a clearing, and close-ups.   node tools/shot.mjs forest --mode creative [--args '{"x":..,"z":..}']
export default async function (h, args) {
    const g = h.g, data = g.world.terrain.data;
    h.log('gen', g.gen, 'floor', !!g.forestFloor);
    let spot = args?.x != null ? { x: args.x, z: args.z } : null;
    if (!spot) {
        outer: for (let r = 0; r < 30; r++) for (let gz = -r; gz <= r; gz++) for (let gx = -r; gx <= r; gx++) {
            if (Math.max(Math.abs(gx), Math.abs(gz)) !== r) continue;
            const x = gx * 40, z = gz * 40;
            if (data.biomeAt(x, z) === 1 && data.land.grove(x, z) > 1.1 && data.biomeAt(x + 40, z) === 1 && data.biomeAt(x - 40, z + 20) === 1) { spot = { x, z }; break outer; }
        }
    }
    h.log('spot', JSON.stringify(spot));
    if (!spot) return;
    g.dayPhase = () => 0.3; h.time(0.3);
    h.log('going');
    await h.go(spot.x, data.heightAt(spot.x, spot.z) + 8, spot.z, true);
    h.log('arrived');
    { const t0 = performance.now(); await h.frames(30); h.log('30 frames ms', Math.round(performance.now() - t0), 'chunks', g.forestFloor.chunks.size); await h.until(() => g.forestFloor.chunks.size > 10, 120000); }
    const ff = g.forestFloor; h.log('chunks', ff.chunks.size, 'drawn', ff.stats.drawn);
    const items = []; for (const c of ff.chunks.values()) for (const it of c.items) items.push(it);
    const kinds = {}; for (const it of items) kinds[it.k] = (kinds[it.k] || 0) + 1; h.log('items', JSON.stringify(kinds));
    const near = (k, v) => items.filter((i) => i.k === k && (v == null || i.v === v)).sort((a, b) => Math.hypot(a.x - spot.x, a.z - spot.z) - Math.hypot(b.x - spot.x, b.z - spot.z))[0];
    const ground = (x, z) => data.heightAt(Math.round(x), Math.round(z)) - 0.5;
    // the wide view: eye height of the hero, over the floor
    const eye = (x, z) => ground(x, z) + 3.4;
    h.cam([spot.x, eye(spot.x, spot.z), spot.z], [spot.x + 30, eye(spot.x, spot.z) - 1.5, spot.z + 8]);
    await h.frames(12); await h.shot('wide-1', { settle: 4 });
    h.cam([spot.x, eye(spot.x, spot.z), spot.z], [spot.x - 14, eye(spot.x, spot.z) - 4, spot.z - 26]);
    await h.frames(10); await h.shot('wide-2', { settle: 3 });
    const look = async (name, it, d, up, side) => {
        if (!it) { h.log('no', name); return; }
        const gy = ground(it.x, it.z);
        h.cam([it.x - d * 0.7 + (side || 0), gy + up, it.z - d * 0.7], [it.x, gy + (it.k === 'log' ? 0.8 : 0.5), it.z]);
        await h.frames(10); await h.shot(name, { settle: 3 });
    };
    for (let v = 0; v < 4; v++) await look('mush' + v, near('mush', v), 4.5, 2.2);
    await look('log0', near('log', 0), 9, 3.5); await look('log1', near('log', 1), 9, 3.5);
    await look('stump', near('stump'), 6, 3); await look('fern', near('fern'), 4, 2.4);
    await look('bush', near('bush', 1), 6, 3); await look('bell', near('bell', 0), 4, 2.2); await look('litter', near('litter'), 5, 2.6);
}
