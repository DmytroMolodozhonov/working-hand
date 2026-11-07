// «Let it rain»: the calling (beam, gathering clouds, curtains of rain), by day, and the blood version.   node tools/shot.mjs rain
export default async function (h) {
    const g = h.g, THREE = h.THREE;
    await h.frames(20);
    h.time(0.3); h.bare();
    { const q = g.character.group.position; await h.go(q.x + 180, q.y + 25, q.z + 90); } // (the Creative start stands under an awning: out into the open)
    const p = g.character.group.position, o = new THREE.Vector3(p.x, p.y + 1.5, p.z);
    const fwd = new THREE.Vector3(-Math.sin(g.character.group.rotation.y), 0, -Math.cos(g.character.group.rotation.y));
    const look = (y) => h.cam([p.x - fwd.x * 14, p.y + 4, p.z - fwd.z * 14], [p.x + fwd.x * 10, p.y + y, p.z + fwd.z * 10]);
    const run = async (blood, tag) => {
        g.rainFx.cast(o, null, null, blood);
        g.storm.startRain();
        for (const [t, y] of [[1.2, 25], [2.4, 40], [3.8, 35], [5.6, 20]]) {
            while (g.rainFx.t < t) g.rainFx.update(0.1);
            look(y); await h.frames(3);
            await h.shot(`${tag}-${t}`, { settle: 1 });
        }
        while (g.rainFx.t >= 0) g.rainFx.update(0.5);
        g.storm.clearSky(); await h.frames(5);
    };
    await run(false, 'rain');
    await run(true, 'blood');
}
