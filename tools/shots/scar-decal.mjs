// Wounds on a villager (torso / arm / leg, hands at them) and on a horse.   node tools/shot.mjs scar-decal --mode creative
export default async function (h) {
    const g = h.g, T = h.THREE;
    await h.frames(60);
    let v = null; for (const x of g.castleLife.byId.values()) if (x.group && !x.dead && x.model) { v = x; break; }
    const horse = g.animals.byId.get('cH1');
    const cases = [];
    if (v) for (const [tag, fy, lat] of [['torso', 0.5, 0], ['arm', 0.55, 0.8], ['leg', 0.25, 0.2]]) cases.push([tag, v, fy, lat, 'villager']);
    if (horse) cases.push(['flank', horse, 0.55, 0.1, 'horse'], ['leg', horse, 0.2, 0.3, 'horse']);
    for (const [tag, t, fy, lat, kind] of cases) {
        g.scars.dispose();
        if (kind === 'villager') { t.bleed = 0; t.woundHold = false; t.woundAt = null; }
        const grp = t.group; grp.updateMatrixWorld(true);
        const yaw = kind === 'horse' ? grp.rotation.y : t.yaw;
        const fr = new T.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new T.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const b = new T.Box3().setFromObject(grp);
        const half = Math.max(0.3, ((b.max.x - b.min.x) * Math.abs(right.x) + (b.max.z - b.min.z) * Math.abs(right.z)) / 2);
        const c = new T.Vector3((b.min.x + b.max.x) / 2, b.min.y + (b.max.y - b.min.y) * fy, (b.min.z + b.max.z) / 2).addScaledVector(right, lat * half);
        const o = c.clone().addScaledVector(fr, 8), f = fr.clone().negate(), s = right.clone();
        const ok = g.scars.mark(t, { o, f, s }, { a: c.clone(), b: c.clone(), r: Math.max(0.5, half * 0.7) }, 5);
        h.log(kind, tag, 'mark', ok, 'decal', JSON.stringify(g.scars.lastDecal), 'region', JSON.stringify(t.woundAt), 'parts', g.scars.list.at(-1)?.objs.length);
        if (kind === 'villager') { t.bleed = 20; await h.frames(30); h.log('  hold', t.woundHold, t.woundReg, 'both', t.woundBoth); }
        const cam = c.clone().addScaledVector(fr, kind === 'horse' ? 4.2 : 3.2); cam.y += 0.2;
        h.cam([cam.x, cam.y, cam.z], [c.x, c.y, c.z]);
        await h.frames(4);
        await h.shot(`${kind}-${tag}`, { settle: 4 });
    }
    h.log('done');
}
