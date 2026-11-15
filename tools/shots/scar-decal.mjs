// The new wound decal on a horse and a villager.   node tools/shot.mjs scar-decal --mode creative
export default async function (h) {
    const g = h.g, T = h.THREE;
    await h.frames(60);
    const targets = [];
    const horse = g.animals.byId.get('cH1'); if (horse) targets.push(['horse', horse, horse.group.position]);
    for (const v of g.castleLife.byId.values()) { if (v.group && !v.dead) { targets.push(['villager', v, new T.Vector3(v.x, v.y, v.z)]); break; } }
    for (const [name, t, pos] of targets) {
        const c = pos.clone(); c.y += name === 'horse' ? 1.6 : 2.2;
        // a level swing across the body, from the north (the caster looks along +z)
        const o = new T.Vector3(c.x, c.y, c.z - 8), f = new T.Vector3(0, 0, 1), s = new T.Vector3(1, 0, 0);
        const ok = g.scars.mark(t, { o, f, s }, { a: c.clone(), b: c.clone().add(new T.Vector3(0, 0, name === 'horse' ? 1.5 : 0)), r: name === 'horse' ? 1.1 : 1.0 }, 5);
        h.log(name, 'scar made:', ok, 'objs', g.scars.list.at(-1)?.objs.length, g.scars.list.at(-1)?.objs.map((m) => m.isSkinnedMesh ? 'skinned' : 'mesh').join(','));
        h.hold?.([t]);
        h.cam([c.x + 0.3, c.y + 0.4, c.z - 2.6], [c.x, c.y - 0.2, c.z]); // (the caster's side: from the north, looking along +z — the same side the cut was made from)
        await h.frames(3);
        await h.shot('scar-' + name, { settle: 6 });
    }
    h.log('done');
}
