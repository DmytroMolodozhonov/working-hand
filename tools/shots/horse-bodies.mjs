// Diagnostics: the Creative start's horses — their measured size and the bodies a charge is tested against (Duel._bodies).   node tools/shot.mjs horse-bodies --mode creative
export default async function (h) {
    const g = h.g;
    await h.frames(40);
    const hs = [...g.animals.byId.values()].filter((a) => a.type === 'horse');
    h.log('horses', hs.length);
    for (const a of hs) {
        const p = a.group.position;
        h.log(a.id, 'pos', p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1), 'scale', a.group.scale.x.toFixed(2), 'dims', JSON.stringify(a.dims, (k, v) => typeof v === 'number' ? +v.toFixed(2) : v));
    }
    const bodies = g.duel._bodies(g.duel.me);
    for (const b of bodies) {
        if (b.kind !== 'a') continue;
        const len = Math.hypot(b.a.x - b.b.x, b.a.y - b.b.y, b.a.z - b.b.z);
        h.log('body a', b.id, 'len', len.toFixed(1), 'r', b.r.toFixed(2), 'a', [b.a.x, b.a.y, b.a.z].map((n) => n.toFixed(1)).join(','), 'b', [b.b.x, b.b.y, b.b.z].map((n) => n.toFixed(1)).join(','));
    }
}
