// The hero in space opposite the Earth and Jupiter (the author 20.11: проверить, что планеты в космосе не мелкие): same altitude
// over each planet, the camera at the hero's side, the planet behind him. → space-earth.png, space-jupiter.png
//   node tools/shot.mjs space-planets [--args '{"alt":1800,"only":["earth","jupiter"]}']
export default async function (h, args) {
    const g = h.g, S = g.space, THREE = h.THREE;
    const { planetPosition, SPACE } = await import('/src/world/Planets.js');
    await h.frames(20); h.bare();
    g.character.setFirstPerson(false); // (the hero's body is in the picture)
    if (!g.flight.active) g.startFlight(true);
    S.cast?.(true);
    S._enterSpace('earth');
    S.testHold = true;
    const t0 = S.now(); S.now = () => t0; // (the planets stand still for the pictures)
    S._askTextures(); // (the planets' maps are made by a worker: waited for below)
    await h.until(() => S.realm === 'space', 20000);
    await h.frames(10);
    const ids = args?.only || ['earth', 'jupiter'];
    h.log('radii', Object.fromEntries(S.planets.list.map((d) => [d.id, d.radius])));
    for (const id of ids) {
        const def = S.planets.get(id), t = S.now(), c = { x: 0, y: 0, z: 0 };
        planetPosition(def, t, c, S.planets);
        const alt = args?.alt ?? 5000, R = def.radius;
        // the hero over the planet's day side, towards the Sun (the Sun is the origin of the plane)
        const sx = -c.x, sy = -c.y, sz = -c.z, sl = Math.hypot(sx, sy, sz);
        const d = { x: sx / sl, y: sy / sl, z: sz / sl };
        S.P.x = c.x + d.x * (R + alt); S.P.y = c.y + d.y * (R + alt); S.P.z = c.z + d.z * (R + alt);
        S.O.x = S.P.x; S.O.y = S.P.y; S.O.z = S.P.z;
        S.vel.x = S.vel.y = S.vel.z = 0; S.speed = 0; S._v = 0; S._exitDir = null;
        S._place();
        h.log(id, 'radius', R, 'alt', alt, 'dist', Math.round(R + alt));
        await h.until(() => S._tex.get(id) === 'done' && ids.every((q) => S._tex.get(q) === 'done'), 600000); // (the planets' pictures come from the workers)
        h.log(id, 'map', S._tex.get(id));
        await h.frames(30);
        const p = g.character.group.position;
        // the planet's centre in the local frame: where the hero is, minus the way back down to it
        const cl = new THREE.Vector3(p.x - d.x * (R + alt), p.y - d.y * (R + alt), p.z - d.z * (R + alt));
        const to = new THREE.Vector3().subVectors(cl, p).normalize();
        const up = Math.abs(to.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        const side = new THREE.Vector3().crossVectors(to, up).normalize();
        const cam = p.clone().addScaledVector(side, 11).addScaledVector(to, -9).addScaledVector(up, 3);
        const look = p.clone().addScaledVector(to, 40);
        g.character.group.rotation.y = Math.atan2(to.x, to.z);
        h.cam(cam.toArray(), look.toArray());
        await h.frames(30);
        await h.shot('space-' + id, { settle: 10, light: 0 });
    }
}
