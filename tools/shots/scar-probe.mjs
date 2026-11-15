// Why does the wound decal find no triangles?   node tools/shot.mjs scar-probe --mode creative
export default async function (h) {
    const g = h.g, T = h.THREE;
    const { projectOnMesh } = await import('/src/fx/Scars.js');
    await h.frames(60);
    const list = [];
    for (const v of g.castleLife.byId.values()) if (v.group && !v.dead) { list.push(['villager', v, v.group]); break; }
    const horse = g.animals.byId.get('cH1'); if (horse) list.push(['horse', horse, horse.group]);
    for (const [name, t, grp] of list) {
        grp.updateMatrixWorld(true);
        const b = new T.Box3().setFromObject(grp), c = b.getCenter(new T.Vector3());
        h.log(name, 'bbox', b.min.toArray().map((x) => +x.toFixed(2)), b.max.toArray().map((x) => +x.toFixed(2)), 'yaw', t.yaw ?? grp.rotation.y);
        const meshes = []; grp.traverse((o) => { if (o.isMesh) meshes.push(o); });
        for (const m of meshes) {
            const bb = new T.Box3().setFromObject(m);
            h.log('  mesh', m.name || m.type, 'skinned', !!m.isSkinnedMesh, 'vis', m.visible, 'tris', (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 'bboxMid', bb.getCenter(new T.Vector3()).toArray().map((x) => +x.toFixed(2)), 'sz', bb.getSize(new T.Vector3()).toArray().map((x) => +x.toFixed(2)), 'matVis', m.material?.visible, 'scale', m.scale.toArray().map((x) => +x.toFixed(2)));
        }
        // try from 4 sides
        for (const [label, az] of [['+x', [1, 0, 0]], ['-x', [-1, 0, 0]], ['+z', [0, 0, 1]], ['-z', [0, 0, -1]]]) {
            const A = new T.Vector3(...az), ax = new T.Vector3(0, 1, 0).cross(A).normalize(), ay = A.clone().cross(ax).normalize();
            const box = { c: c.clone(), ax, ay, az: A, hx: 0.8, hy: 0.12, hz: 4, reach: 6 };
            let tot = 0, ms = 0;
            for (const m of meshes) { const r = projectOnMesh(m, box); if (r) { ms++; tot += r.pos.length / 9; } }
            h.log('  side', label, 'meshes hit', ms, 'triangles', tot);
        }
    }
    h.log('done');
}
