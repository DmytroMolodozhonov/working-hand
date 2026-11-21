// The ordinary world, as the player sees it on foot (the author 21.11: «когда смотришь на обычный простор, на поляну… слишком игрушечно, теней не хватает»).
// From the hero's eyes over open land, each view twice in the same world: «before» (the old light, no corner shade) and «after».
//   node tools/shot.mjs meadow --mode freeworld [--args '{"n":3,"evening":1,"ultra":1}']
export default async function (h, args = {}) {
    const g = h.g, T = h.THREE, tr = g.world?.terrain || g.terrain;
    const { DAY_LIGHT } = await import('/src/world/World.js');
    const { SKY_LIGHT } = await import('/src/world/VoxelShading.js');
    const { CLOUD_SHADE: CLOUD, CLOUD_RULES } = await import('/src/world/CloudShade.js');
    const NEW = { ...DAY_LIGHT }, OLD = { amb: 0.3, hemi: 0.35, sun: 0.85, ground: 0x6a8f4e };
    const look = (L, shade) => { Object.assign(DAY_LIGHT, L); g.world.hemiLight.groundColor.set(L.ground); SKY_LIGHT.shade.value = shade; SKY_LIGHT.greenSat.value = shade ? 0.84 : 1; CLOUD.k.value = shade ? 0.5 : 0; CLOUD_RULES.K = shade ? 0.5 : 0; g.world._night = -1; };
    // an open, green, fairly flat place near the start (a meadow): sample around the hero
    const p0 = g.character.group.position.clone();
    let best = args.at ? { x: args.at[0], y: args.at[1], z: args.at[2] } : null;
    for (let r = 0; r <= 160 && !best; r += 20) for (let a = 0; a < 12; a++) {
        const x = p0.x + Math.cos(a / 12 * 6.283) * r, z = p0.z + Math.sin(a / 12 * 6.283) * r;
        if (!tr?.data?.landMade?.(x, z)) continue;
        const y = tr.data.surfaceY(x, z);
        if (!(y > 6)) continue;
        let flat = 0; for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) flat += Math.abs(tr.data.surfaceY(x + dx, z + dz) - y);
        if (flat < 3) { best = { x, y, z }; break; }
    }
    if (!best) best = { x: p0.x, y: p0.y - 2, z: p0.z };
    h.log('meadow at', best);
    await h.go(best.x, best.y + 6, best.z);
    await h.frames(20);
    h.bare();
    g.ultra?.set?.(!!args.ultra);
    for (const [tod, tn] of (args.evening ? [[0.3, 'day'], [0.6, 'evening']] : [[0.3, 'day']])) {
        h.time(tod);
        for (let k = 0; k < (args.n || 2); k++) {
            const a = k * 2.1, eye = new T.Vector3(best.x, best.y + 3.4, best.z);
            const at = eye.clone().add(new T.Vector3(Math.sin(a) * 40, -6, Math.cos(a) * 40));
            h.cam(eye.toArray(), at.toArray());
            look(OLD, 0); await h.shot(`${tn}-${k}-before`, { settle: 8 });
            look(NEW, 1); await h.shot(`${tn}-${k}-after`, { settle: 8 });
        }
    }
}
