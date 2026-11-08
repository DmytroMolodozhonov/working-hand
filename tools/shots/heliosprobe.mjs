export default async function (h) {
    const g = h.g, THREE = h.THREE;
    await h.frames(20); h.time(0.6); h.bare();
    { const q = g.character.group.position; await h.go(q.x + 180, q.y + 25, q.z + 90); }
    const p = g.character.group.position, o = new THREE.Vector3(p.x, p.y - 1.9, p.z);
    g.helios.fire(o, new THREE.Vector3(0, 1, 0), 'me', 'right');
    for (let i = 0; i < 70; i++) g.helios.update(0.05);
    const H = g.helios, S = H.suns.get('me');
    const sp = H.group.position;
    h.cam([p.x, p.y + 3, p.z - 22], [sp.x, sp.y, sp.z]);
    await h.frames(4);
    await h.shot('sun-direct', { settle: 2, light: 0 });
    h.cam([p.x, p.y + 3, p.z - 22], [p.x + 40, p.y + 120, p.z]);
    await h.frames(3);
    await h.shot('sun-offcentre', { settle: 2, light: 0 });
    h.log({ age: S?.age, size: S && H.group.visible, vis: H.group.visible, pos: H.group.position.toArray().map(Math.round), disc: H.disc.scale.toArray(), far: g.camera.far, cam: g.camera.position.toArray().map(Math.round), hero: [p.x, p.y, p.z].map(Math.round), fov: g.camera.fov, inSpace: g.space?.inSpace, discOp: H.discMat.uniforms.uK.value, discVis: H.disc.visible, coronaVis: H.corona.visible, haloVis: H.halo.visible, rq: H.group.quaternion.toArray().map((x) => +x.toFixed(2)), camq: g.camera.quaternion.toArray().map((x) => +x.toFixed(2)), parent: !!H.group.parent });
}
