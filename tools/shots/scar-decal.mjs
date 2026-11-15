// The new wound decal on a horse and a villager.   node tools/shot.mjs scar-decal --mode creative
export default async function (h) {
    const g = h.g, T = h.THREE;
    await h.frames(60);
    const targets = [];
    const horse = g.animals.byId.get('cH1'); if (horse) targets.push(['horse', horse, horse.group.position]);
    for (const v of g.castleLife.byId.values()) { if (v.group && !v.dead) { targets.push(['villager', v, new T.Vector3(v.x, v.y, v.z)]); break; } }
    for (const [name, t, pos] of targets) {
        const box3 = new T.Box3().setFromObject(t.group), c = box3.getCenter(new T.Vector3()); // (the middle of the creature's real body)
        const rr = Math.max(box3.max.x - box3.min.x, box3.max.z - box3.min.z) * 0.5;
        // a level swing across the body, from the north (the caster looks along +z)
        const yaw = name === 'horse' ? t.group.rotation.y : t.yaw; // (the creature's FRONT: the cut is made from where it looks, and shot from there — not its back)
        const fr = new T.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const o = c.clone().addScaledVector(fr, 8), f = fr.clone().negate(), s = new T.Vector3(-fr.z, 0, fr.x);
        const ok = g.scars.mark(t, { o, f, s }, { a: c.clone(), b: c.clone(), r: Math.max(0.6, rr) }, 5);
        h.log(name, 'decal', JSON.stringify(g.scars.lastDecal), 'anchor', !!g.scars.list.at(-1)?.anchor, 'scar made:', ok, 'objs', g.scars.list.at(-1)?.objs.length, g.scars.list.at(-1)?.objs.map((m) => m.isSkinnedMesh ? 'skinned' : 'mesh').join(','));
        h.hold?.([t]);
        h.cam([c.x + fr.x * 2.6 + s.x * 0.3, c.y + 0.4, c.z + fr.z * 2.6 + s.z * 0.3], [c.x, c.y - 0.2, c.z]); // (the caster's side: from the north, looking along +z — the same side the cut was made from)
        await h.frames(3);
        await h.shot('scar-' + name, { settle: 6 });
    }
    h.log('done');
}
