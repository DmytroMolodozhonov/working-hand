// Coral reef formations under the sea (ReefStructures.js): the nearest few from a distance, from close up, and the shallows (no corals there).   node tools/shot.mjs reef
export default async function (h) {
    const g = h.g, THREE = h.THREE;
    await h.frames(20);
    h.time(0.3); h.bare();
    const S = g.world.terrain.data.seas, me = g.character.group.position;
    // deep sea points: out from the shore
    const spots = [];
    for (let r = 60; r < 4000 && spots.length < 4; r += 40) for (let a = 0; a < 6.28 && spots.length < 4; a += 0.35) {
        const x = me.x + Math.cos(a) * r, z = me.z + Math.sin(a) * r;
        if (S.signedDist(x, z) > 160 && spots.every((q) => Math.hypot(q.x - x, q.z - z) > 700)) spots.push({ x, z });
    }
    h.log('spots', JSON.stringify(spots));
    let shots = 0;
    for (const sp of spots) {
        await h.go(sp.x, -7, sp.z);
        g.world.terrain.flushAround?.(sp.x, sp.z); g.seaSurface?.flush?.(sp.x, sp.z);
        const hold = setInterval(() => { g.character.group.position.set(sp.x, -7, sp.z); g.character.verticalVelocity = 0; }, 5);
        await h.until(() => g.seaFloor?.center && !g.seaFloor?.job, 120000);
        await h.frames(10);
        const list = (g.seaFloor.structs || []).slice().sort((a, b) => Math.hypot(a.x - sp.x, a.z - sp.z) - Math.hypot(b.x - sp.x, b.z - sp.z));
        h.log('structures', list.length, JSON.stringify(list.slice(0, 5).map((s) => [s.kind, Math.round(s.s * 100) / 100])));
        for (const st of list.slice(0, 2)) {
            const t = g.world.terrain.data, bottom = t.topLayer(Math.round(st.x), Math.round(st.z)) - 0.5;
            const dist = st.foot * 1.9 + 8;
            for (const [tag, k, up] of [['far', 1, 0.5], ['near', 0.55, 0.35]]) {
                const cx = st.x + Math.cos(0.9) * dist * k, cz = st.z + Math.sin(0.9) * dist * k, cy = Math.min(-2, bottom + 4 + up * 8);
                clearInterval(hold);
                g.character.group.position.set(cx, cy - 1.6, cz); g.character.verticalVelocity = 0;
                h.cam([cx, cy, cz], [st.x, bottom + 3.5, st.z]);
                await h.frames(6);
                await h.shot(`${shots++}-${st.kind}-${tag}`, { settle: 3, light: 1.5 });
            }
        }
        clearInterval(hold);
        if (shots >= 8) break;
    }
}
