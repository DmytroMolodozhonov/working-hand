// Порт морского замка: край причала у воды, пирс, корабль у пирса (автор 19.11: «прозрачная полоса между портом и водой»)
//   node tools/shot.mjs port
export default async function (h) {
    const g = h.g, idx = g.world.terrain.data.castles;
    let best = null;
    for (let gz = -8; gz <= 8; gz++) for (let gx = -8; gx <= 8; gx++) {
        const c = idx.cellOf(gx, gz);
        if (c && c.variant === 'sea' && (!best || Math.hypot(c.x, c.z) < Math.hypot(best.x, best.z))) best = c;
    }
    if (!best) { h.log('no sea castle'); return; }
    const P = best.port, pr = P.piers[0], b0 = P.berths[0];
    h.log('castle', best.id, 'ships', P.ships.join(','), 'pier', JSON.stringify(pr.a), JSON.stringify(pr.b), 'berth', JSON.stringify(b0).slice(0, 200));
    const q = { x: (pr.a.x + pr.b.x) / 2, z: (pr.a.z + pr.b.z) / 2 };
    await h.go(q.x, pr.y + 6, q.z, true);
    g.seaSurface?.flush(q.x, q.z);
    await h.frames(60);
    h.bare();
    // the quay's edge: from the pier's root, looking along the quay line over the water
    const dx = pr.b.x - pr.a.x, dz = pr.b.z - pr.a.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, sx = -uz, sz = ux;
    for (const [name, f, side, up, back] of [['1-pier-from-root', 0.1, 0, 5, 14], ['2-pier-side', 0.5, 14, 7, 0], ['3-pier-side-low', 0.5, 9, 3.5, 0]]) {
        const cx = pr.a.x + dx * f, cz = pr.a.z + dz * f;
        h.cam([cx + sx * side - ux * back, pr.y + up, cz + sz * side - uz * back], [cx - sx * (side ? 2 : 0) + ux * (back ? 8 : 0), pr.y - 1, cz - sz * (side ? 2 : 0) + uz * (back ? 8 : 0)]);
        await h.shot(name, { settle: 30 });
    }
    // ground profile along the pier's axis from the quay out: every step of the stair and the deck
    const col = g.collision; let prof = '';
    for (let t = -10; t <= 2; t += 0.25) { const x = pr.a.x + ux * t, z = pr.a.z + uz * t; prof += (col.groundAt ? col.groundAt(x, z, 1e4) : col.surfaceY(x, z)).toFixed(1) + ' '; }
    h.log('profile', prof);
    // the quay: the line where the land ends and the harbour water begins
    const qz = P.quay; h.log('quay', JSON.stringify(qz).slice(0, 200));
}
