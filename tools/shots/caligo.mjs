// «Caligo» — the dark mage's smoke: the jet from the wand, the dome from outside, its rim, and the view from inside (as one who did not cast it).
//   node tools/shot.mjs caligo --mode creative   → docs/media/shots/caligo/*.png
export default async function (h) {
    const g = h.g, T = h.THREE, F = g.darkFog;
    const p = g.character.group.position, x0 = Math.round(p.x), z0 = Math.round(p.z);
    await h.go(x0, p.y + 2, z0, true);
    h.time(0.3);
    const gy = (x, z) => (g.collision?.groundY ? g.collision.groundY(x, z) : p.y - 2);
    const cx = x0 + 70, cz = z0, cy = gy(cx, cz);
    h.bare();
    const at = (t, by = 'other') => {
        for (const f of F.fogs.slice()) F._drop(F.fogs.indexOf(f));
        F.fire(new T.Vector3(cx, cy, cz), new T.Vector3(x0 + 4 - cx, p.y + 1 - cy, 0), by, 'right');
        F.fogs[0].t = t;
    };
    // 1. the jet leaving the wand (t = 4 s)
    at(4);
    await h.frames(40);
    h.cam([x0 - 6, p.y + 4, z0 - 12], [x0 + 30, p.y + 6, z0]);
    await h.shot('1-jet', { settle: 20 });
    // 2. the whole dome from afar, grown
    at(14);
    await h.frames(10);
    h.cam([cx - 130, cy + 30, cz - 90], [cx, cy + 14, cz]);
    await h.shot('2-dome', { settle: 20 });
    // 3. the rim close up
    h.cam([cx - 90, cy + 12, cz - 25], [cx - 60, cy + 12, cz]);
    await h.shot('3-rim', { settle: 20 });
    // 4. from inside (one who did not cast it)
    at(14);
    h.cam([cx - 20, cy + 3, cz], [cx + 20, cy + 6, cz + 6]);
    await h.shot('4-inside', { settle: 40 });
    h.cam([cx - 52, cy + 4, cz], [cx + 20, cy + 8, cz + 6]);
    await h.shot('5-edge-in', { settle: 30 });
}
