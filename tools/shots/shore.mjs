// The shore: reeds, lilies, pebbles, irises, driftwood.   node tools/shot.mjs shore --mode creative [--args '{"x":..,"z":..}']
export default async function (h, args) {
    const g = h.g, data = g.world.terrain.data, H = data.heightAt;
    let spot = args?.x != null ? { x: args.x, z: args.z } : null;
    if (!spot) { // a lake: still water with a bank, not a river and not the sea
        outer: for (let r = 0; r < 30; r++) for (let gz = -r; gz <= r; gz++) for (let gx = -r; gx <= r; gx++) {
            if (Math.max(Math.abs(gx), Math.abs(gz)) !== r) continue;
            const x = gx * 32, z = gz * 32; H(x, z);
            if (H.water >= 1 && !H.river && !H.sea) { spot = { x, z }; break outer; }
        }
    }
    h.log('spot', JSON.stringify(spot)); if (!spot) return;
    g.dayPhase = () => 0.3; h.time(0.3);
    await h.go(spot.x, H(spot.x, spot.z) + 8, spot.z, true);
    await h.frames(300);
    const sf = g.shoreFloor, items = []; for (const c of sf.chunks.values()) for (const it of c.items) items.push(it);
    const kinds = {}; for (const it of items) kinds[it.k] = (kinds[it.k] || 0) + 1; h.log('items', JSON.stringify(kinds), 'drawn', sf.stats.drawn);
    const near = (k) => items.filter((i) => i.k === k).sort((a, b) => Math.hypot(a.x - spot.x, a.z - spot.z) - Math.hypot(b.x - spot.x, b.z - spot.z))[0];
    const look = async (name, it, d, up) => { if (!it) { h.log('no', name); return; } h.cam([it.x - d * 0.7, it.y + up, it.z - d * 0.7], [it.x, it.y + 0.8, it.z]); await h.frames(60); await h.shot(name, { settle: 10 }); };
    h.cam([spot.x - 20, H(spot.x - 20, spot.z) + 8, spot.z - 20], [spot.x, H(spot.x, spot.z), spot.z]); await h.frames(80); await h.shot('wide', { settle: 20 });
    for (const k of ['reed', 'lily', 'pebbles', 'iris', 'marigold', 'sedge', 'drift']) await look(k, near(k), 6, 3);
}
