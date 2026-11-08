// «Helios»: the ignition (runes, forked lightning, helix, a Sun born) and the Sun over the land.   node tools/shot.mjs helios
export default async function (h) {
    const g = h.g, THREE = h.THREE;
    await h.frames(20);
    h.time(0.6); h.bare(); // (evening: the Sun's light is seen)
    { const q = g.character.group.position; await h.go(q.x + 180, q.y + 25, q.z + 90); }
    const p = g.character.group.position, o = new THREE.Vector3(p.x, p.y - 1.9, p.z);
    const fwd = new THREE.Vector3(-Math.sin(g.character.group.rotation.y), 0, -Math.cos(g.character.group.rotation.y));
    g.helios.fire(o, new THREE.Vector3(0, 1, 0), 'me', 'right');
    const look = (y) => h.cam([p.x - fwd.x * 22, p.y + 3, p.z - fwd.z * 22], [p.x, p.y + y, p.z]);
    for (const [t, y] of [[0.6, 20], [1.2, 60], [1.9, 120], [2.6, 150], [3.4, 120], [6, 100]]) {
        while ((g.helios.ign?.t ?? 99) < t && g.helios.suns.get('me')?.age < t) g.helios.update(0.05);
        look(y); await h.frames(3);
        await h.shot(`helios-${t}`, { settle: 1, light: 0 });
    }
}
