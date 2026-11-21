export default async function (h) {
    const g = h.g, B = g.bandits, L = g.castleLife;
    g.combat.enabled = true;
    await h.go(0, 9, 40);
    await h.frames(60);
    const me = g.character.group.position;
    const x = me.x + 70, z = me.z;
    const idx = L.index;
    const origMount = B.riders.mount.bind(B.riders);
    B.riders.mount = (v, P, ax, az, yaw) => { const r = origMount(v, P, ax, az, yaw); h.log('mount', v.id, !!r, 'spawnFn', typeof g.animals?._spawn); return r; };
    const origAct = L._activate.bind(L);
    L._activate = (cs, i, at, job, ex) => { const v = origAct(cs, i, at, job, ex); h.log('activate', i, !!v, v && v.role, job); return v; };
    const pl = L._players()[0];
    h.log('pre', !!idx?.towers?.wanderDef, typeof g.animals?._spawn, L._players().length, !!pl, pl && JSON.stringify(pl.p), 'land', idx.landAt?.(Math.round(x), Math.round(z)), 'free', g.travelers?._placeFree?.(x, z, 0, false, { into: null }));
    h.log('state', 'pl', g.localId, JSON.stringify(L._players().map((q)=>q.id)), 'offEarth', g.space?.offEarth, 'cave', g._inCave, 'night', g.isNight);
    const om = B._make.bind(B); B._make = (...a) => { const r = om(...a); h.log('_make', !!r); return r; };
    try {
        let P = false; for (let k = 0; k < 24 && !P; k++) { const a = k * 0.55, d = 60 + (k % 3) * 12; P = B.spawnNear({ at: { x: me.x + Math.cos(a) * d, z: me.z + Math.sin(a) * d }, n: 3, strategy: 'charge' }); h.log('try', k, !!P); }
        h.log('spawn', !!P, P && { n: P.n, ph: P.phase, members: P.members.map((v) => [v.title, v.name, v.seated, v.mode, !!v.horse]) });
        if (P) {
            for (let t = 0; t < 12; t++) { await h.frames(30); h.log(`t${t}`, P.phase, P.members.map((v) => `${v.bandit?.role}:${Math.round(Math.hypot(v.x - me.x, v.z - me.z))}:${v.mode}`).join(' ')); }
        }
    } catch (e) { h.log('ERR', e.message, e.stack.split('\n').slice(0, 5).join(' | ')); }
}
