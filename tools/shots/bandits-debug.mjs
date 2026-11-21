export default async function (h) {
    const g = h.g, B = g.bandits, L = g.castleLife;
    g.combat.enabled = true;
    await h.go(0, 9, 40);
    await h.frames(60);
    const me = g.character.group.position;
    const x = me.x + 70, z = me.z;
    const idx = L.index;
    h.log('life', { enabled: L.enabled, hasIdx: !!idx, wander: !!idx?.towers?.wanderDef, animals: !!g.animals?._spawn, travelers: !!g.travelers, players: L._players().length });
    h.log('land', idx?.landAt?.(Math.round(x), Math.round(z)));
    h.log('placeFree', g.travelers?._placeFree(x, z, 0, false, { into: null }));
    for (const dx of [70, 90, -70, 110]) h.log('placeFree', dx, g.travelers?._placeFree(me.x + dx, me.z, 0, false, { into: null }), idx?.landAt?.(Math.round(me.x + dx), Math.round(me.z)));
    try {
        const P = B.spawnNear({ at: { x, z }, n: 3, strategy: 'charge' });
        h.log('spawn', !!P);
    } catch (e) { h.log('ERR', e.message, e.stack.split('\n').slice(0, 4).join(' | ')); }
    // call the inside steps by hand
    const def = idx.towers.wanderDef(0, 77, 'wb');
    h.log('def', !!def, def?.id, def?.kind);
}
