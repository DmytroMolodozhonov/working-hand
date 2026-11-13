/** Places where the authoritative world must stay alive; rendering uses the local camera. */
export function worldPlayers(g) {
    const out = [], p = g.character?.group?.position;
    if (p && !g.isDeadLocal && !g.space?.offEarth) out.push(p);
    if (g.authority !== false) {
        for (const r of g.remotes?.values?.() || []) if (!r.dead && r.position) out.push(r.position);
    }
    return out;
}

export function nearWorldPlayer(players, x, z, radius) {
    return players.some(p => Math.abs(x - p.x) <= radius && Math.abs(z - p.z) <= radius);
}
