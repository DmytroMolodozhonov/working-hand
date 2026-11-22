// The grass up close (the author 22.11: «соскринь траву сверху — каждая травинка как крест»): from above and from the eyes, on a meadow.
//   node tools/shot.mjs grassclose --mode freeworld
export default async function (h) {
    const g = h.g, data = g.world.terrain.data;
    const p0 = g.character.group.position.clone();
    await h.go(p0.x, p0.y + 4, p0.z);
    await h.frames(60);
    let at = null;
    for (let r = 0; r <= 160 && !at; r += 8) for (let a = 0; a < 16 && !at; a++) {
        const x = Math.round(p0.x + Math.cos(a / 16 * 6.283) * r), z = Math.round(p0.z + Math.sin(a / 16 * 6.283) * r);
        if (!data.landMade(x, z)) continue;
        const L = data.topLayer(x, z);
        if (L < 2 || data.get(x, L, z) !== 1) continue;
        let flat = true; for (let k = -4; k <= 4; k++) if (Math.abs(data.topLayer(x + k, z) - L) > 1 || Math.abs(data.topLayer(x, z + k) - L) > 1) flat = false;
        if (flat) at = { x, z, L };
    }
    if (!at) { h.log('no flat grass'); return; }
    const y = at.L + 0.5;
    await h.go(at.x, y + 2.2, at.z);
    await h.frames(40);
    h.bare();
    h.time(0.3);
    h.cam([at.x + 0.5, y + 4.5, at.z + 0.5], [at.x + 2.5, y, at.z + 2.5]);
    await h.shot('1-from-above', { settle: 20 });
    h.cam([at.x - 1, y + 3.4, at.z - 1], [at.x + 10, y + 1.2, at.z + 10]);
    await h.shot('2-eyes', { settle: 6 });
    h.cam([at.x, y + 1.2, at.z], [at.x + 6, y + 0.6, at.z + 6]);
    await h.shot('3-low', { settle: 6 });
}
