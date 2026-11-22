// The forest's light and air at dawn and by day.   node tools/shot.mjs forestair --mode creative
export default async function (h, args) {
    const g = h.g, data = g.world.terrain.data;
    let spot = args?.x != null ? { x: args.x, z: args.z } : null;
    if (!spot) outer: for (let r = 0; r < 30; r++) for (let gz = -r; gz <= r; gz++) for (let gx = -r; gx <= r; gx++) {
        if (Math.max(Math.abs(gx), Math.abs(gz)) !== r) continue;
        const x = gx * 40, z = gz * 40;
        if (data.biomeAt(x, z) === 1 && data.land.grove(x, z) > 1.1 && data.biomeAt(x + 40, z) === 1 && data.biomeAt(x - 40, z + 20) === 1) { spot = { x, z }; break outer; }
    }
    h.log('spot', JSON.stringify(spot)); if (!spot) return;
    for (const [name, ph] of [['day', 0.3], ['dawn', 0.04]]) {
        g.dayPhase = () => ph; h.time(ph);
        await h.go(spot.x, data.heightAt(spot.x, spot.z) + 8, spot.z, true);
        await h.until(() => g.forestFloor.chunks.size > 10, 120000);
        await h.frames(70);
        h.log(name, 'k', g.forestAir.k.toFixed(2), 'haze', (g.world.forestHaze || 0).toFixed(2), 'shafts', g.forestAir.shafts.count, 'leaves', g.forestAir.leafMeshes.map((m) => m.count).join('/'));
        const eye = data.heightAt(spot.x, spot.z) - 0.5 + 3.4;
        h.cam([spot.x, eye, spot.z], [spot.x + 30, eye + 2, spot.z + 8]);
        await h.frames(10); await h.shot(name + '-a', { settle: 3 });
        h.cam([spot.x, eye, spot.z], [spot.x - 10, eye + 3, spot.z - 28]);
        await h.frames(10); await h.shot(name + '-b', { settle: 3 });
    }
}
