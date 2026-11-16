// The element rings round the mages (NPC) and round the hero (an element mage); the fire mage's hanging beam.   node tools/shot.mjs element-aura --mode creative
export default async function (h, args) { h.args = args;
    const g = h.g, L = g.castleLife, T = h.THREE;
    g.dayPhase = () => 0.3; await h.frames(60);
    for (const el of (h.args?.only || ['air', 'fire', 'water'])) {
        const def = L.extra.get('creative-' + el); if (!def) { h.log(el, 'no site'); continue; }
        const cs = L._runtime(def); if (!cs.awake) L._wake(cs);
        const v = L.byId.get('creative-' + el + ':1'); if (!v) { h.log(el, 'no mage'); continue; }
        v.foe = g.localId; if (v.elemental && v.elemental.phase === 'rest') v.elemental.phase = 'Coil'; // (auras only show in a fight)
        g.character.group.position.set(v.x, v.y + 1.95, v.z + 12);
        let calls = 0; const hf = g.hellfire, o = hf._auraRing; hf._auraRing = function (...a) { calls++; return o.apply(this, a); };
        const t0 = hf._t; await h.frames(50);
        h.log(el, 'hf._t advanced', (hf._t - t0).toFixed(2), 'auraRing', typeof hf._auraRing);
        h.log(el, 'ring calls', calls, 'foe', String(v.foe), 'phase', v.elemental?.phase, 'pool', hf.pool?.active, 'v', v.x | 0, v.y | 0, v.z | 0, 'p0', JSON.stringify(Array.from(hf.pool.pos.slice(0, 9)).map((x) => Math.round(x))), 'meshvis', hf.pool.mesh.visible, hf.pool.mesh.count, 'parent', !!hf.pool.mesh.parent); hf._auraRing = o;
        h.cam([v.x + 3, v.y + 3.2, v.z + 7], [v.x, v.y + 2.2, v.z]);
        await h.shot('mage-' + el, { settle: 5 });
        h.log(el, 'aura draws', JSON.stringify(g.elementAura.cnt));
    }
    g.airVortex = g.airVortex || {}; const av0 = g.airVortex.on; g.airVortex.on = true; // (the hero's aura shows only while he works)
    for (const el of ['air', 'fire', 'water', 'earth']) {
        g.heroElement.set(el, { say: false });
        const p = g.character.group.position;
        await h.frames(40);
        h.cam([p.x + 2.5, p.y + 0.8, p.z - 5], [p.x, p.y + 0.4, p.z]);
        await h.shot('hero-' + el, { settle: 5 });
        h.log('hero', el, JSON.stringify(g.elementAura.cnt));
    }
    h.log('done');
}
