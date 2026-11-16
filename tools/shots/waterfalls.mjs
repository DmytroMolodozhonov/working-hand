// The rivers' waterfalls: one of each size.   node tools/shot.mjs waterfalls --mode creative [--args '{"kinds":["great"]}']
export default async function (h, args) {
    const g = h.g, data = g.terrain?.data || g.world.terrain.data;
    h.log('falls on', !!data.falls, 'gen', g.gen);
    if (!data.falls) return;
    const want = args?.kinds || ['great', 'fall', 'cascade'];
    const seen = {};
    outer: for (let r = 0; r < 12; r++) for (let gz = -r; gz <= r; gz++) for (let gx = -r; gx <= r; gx++) {
        if (Math.max(Math.abs(gx), Math.abs(gz)) !== r) continue;
        const p = data.falls.cell(gx, gz);
        if (p && want.includes(p.kind) && !seen[p.kind]) { seen[p.kind] = p; if (Object.keys(seen).length === want.length) break outer; }
    }
    h.log('found', Object.values(seen).map((p) => p.kind + ' ' + p.x + ',' + p.z + ' H' + p.H + ' W' + p.W));
    g.dayPhase = () => 0.3; // (a slow shot would drift into night: the day is held)
    for (const k of want) {
        const p = seen[k]; if (!p) continue;
        h.time(0.3);
        await h.go(p.x - p.nx * 22, p.gE + 14, p.z - p.nz * 22, true);
        await h.frames(120);
        const cx = p.x + p.nx * 2, cz = p.z + p.nz * 2;
        h.cam([p.x - p.nx * (14 + p.H * 0.4), p.gE + 5 + p.H * 0.35, p.z - p.nz * (14 + p.H * 0.4)], [cx, p.gE + p.H * 0.5, cz]);
        await h.frames(60);
        await h.shot(k + '-front', { settle: 20 });
        h.cam([p.x - p.nx * 8 + -p.nz * 14, p.gE + 4, p.z - p.nz * 8 + p.nx * 14], [cx, p.gE + p.H * 0.5, cz]);
        await h.frames(40);
        await h.shot(k + '-side', { settle: 10 });
        h.cam([p.x + p.nx * (p.D * 0.5) - p.nz * 22, p.P + 14, p.z + p.nz * (p.D * 0.5) + p.nx * 22], [p.x + p.nx * (p.D * 0.5), p.P - 1, p.z + p.nz * (p.D * 0.5)]);
        await h.frames(40);
        await h.shot(k + '-top', { settle: 10 });
    }
}
