// «Tornado» through the real spell path (the author 08.11: «сам вихрь не создаётся»): cast on land by a pond, step the weather clock —
// it must not wander into the water and fall apart; a tornado put straight on water still does.
export default async function (h) {
    const g = h.g, p = g.character.group.position, L = g.landTornado;
    const at = L.placeFor(p, g.character.group.rotation.y);
    h.log('place', JSON.stringify(at));
    if (!at) return;
    const data = g.terrain.data, { BLOCK } = await import('/src/world/Terrain.js');
    // a pond 22 m from the place (inside its 40 × 30 m loop)
    const wx = Math.round(at.x + 22), wz = Math.round(at.z), wy = data.topLayer(wx, wz);
    for (let dx = -12; dx <= 12; dx++) for (let dz = -30; dz <= 30; dz++) for (let Ly = wy - 1; Ly <= wy; Ly++) data.set(wx + dx, Ly, wz + dz, BLOCK.WATER);
    const t0 = Date.now() / 1000; g.weatherClock = t0;
    g.spells.cast('Tornado', p.clone(), new h.THREE.Vector3(at.x, 1, at.z), 'right', g.localId);
    let minGap = 1e9, alive = 0;
    for (let s = 0; s <= 240; s += 2) {
        g.weatherClock = t0 + s; L._t4 = 0;
        await h.frames(2);
        const tn = L.list[0];
        if (tn && tn.k > 0.05) { alive = s; minGap = Math.min(minGap, Math.abs(tn.x - wx) - 12); }
        if (s % 20 === 0) h.log(`s${s}`, 'list', L.list.length, 'k', tn?.k?.toFixed(2), 'dead', L.dead.size, tn ? `x ${tn.x.toFixed(1)} (pond edge ${wx - 12})` : '');
    }
    h.log('RESULT alive until', alive, 'dead', L.dead.size, 'closest to the pond', minGap.toFixed(1));
    // straight on the water: falls apart
    L.summon({ x: wx, z: wz }, 'wet', 0);
    for (let s = 241; s <= 250; s++) { g.weatherClock = t0 + s; L._t4 = 0; await h.frames(2); }
    h.log('RESULT on water', L.list.filter((t) => t.id.startsWith('twister:wet')).length, 'dead', L.dead.size);
}
