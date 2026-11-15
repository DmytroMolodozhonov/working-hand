// The new Earthquake picture, plain and Maxima, at several moments.   node tools/shot.mjs earthquake --mode creative
export default async function (h) {
    const g = h.g, ch = g.character;
    await h.frames(40);
    for (const [name, tag] of [['Earthquake', 'q'], ['EarthquakeMaxima', 'qm']]) {
        const p = ch.group.position.clone(); const gy = g.collision.surfaceY(p.x, p.z);
        const o = new h.THREE.Vector3(p.x, gy, p.z), d = new h.THREE.Vector3(0, 0, -1);
        g.spells.cast(name, o, d, 'right', g.localId);
        let t = 0;
        for (const [n, label] of [[6, 'a-stomp'], [20, 'b-run'], [30, 'c-front'], [60, 'd-open'], [120, 'e-after']]) {
            await h.frames(n);
            h.cam([p.x + 9, gy + 5, p.z + 2], [p.x, gy + 0.5, p.z - 14]);
            await h.shot(tag + '-' + label, { settle: 1 });
        }
        await h.frames(500);
    }
    h.log('done');
}
