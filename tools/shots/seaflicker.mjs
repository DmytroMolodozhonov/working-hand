// The sea far away (the author 22.11: «в океане было мигание, мы его, кажется, не решили»): a view over the sea from its shore, the same
// picture twice with the camera moved 2 cm and the waves' time frozen — what differs beyond a pixel's shift is flicker.
//   node tools/shot.mjs seaflicker --mode freeworld
export default async function (h) {
    const g = h.g, seas = g.world?.seas || g.world?.terrain?.data?.seas;
    const p0 = g.character.group.position.clone();
    // the nearest sea (Terrain's SeaIndex): stand on its shore, 25 m inland, looking out over it
    const data = g.world.terrain.data, S = data.seas;
    const near = S?.nearest(p0.x, p0.z, 12);
    let at = null, look = null;
    if (near) { const a = Math.atan2(p0.z - near.z, p0.x - near.x); at = S.pointAt(near, a, -25); look = { x: near.x, z: near.z }; }
    if (!at) { h.log('no sea near'); return; }
    h.log('sea at', at);
    const sea = g.sea?.level ?? 0;
    await h.go(at.x, 30, at.z);
    await h.frames(90);
    h.bare();
    h.time(0.3);
    const freeze = g.seaTime; g.seaTime = () => 100; // (the waves stand still between the two pictures)
    const eye = [at.x, 14, at.z];
    for (const k of [0, 1]) {
        const lx = look.x - at.x, lz = look.z - at.z, ll = Math.hypot(lx, lz) || 1, side = k ? 0.6 : 0;
        const tgt = [at.x + (lx / ll + side * (-lz / ll)) * 300, 0, at.z + (lz / ll + side * (lx / ll)) * 300];
        h.cam(eye, tgt);
        await h.shot(`s${k}-a`, { settle: 30 });
        h.cam([eye[0] + 0.02, eye[1] + 0.01, eye[2]], tgt);
        await h.shot(`s${k}-b`, { settle: 2 });
    }
    g.seaTime = freeze;
    void seas; void sea;
}
