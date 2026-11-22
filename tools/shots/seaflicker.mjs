// The sea far away (the author 22.11: «в океане было мигание, мы его, кажется, не решили»): a view over the sea from its shore, the same
// picture twice with the camera moved 2 cm and the waves' time frozen — what differs beyond a pixel's shift is flicker.
//   node tools/shot.mjs seaflicker --mode freeworld
export default async function (h) {
    const g = h.g, seas = g.world?.seas || g.world?.terrain?.data?.seas;
    const p0 = g.character.group.position.clone();
    // the nearest sea: walk out in rings until a column is sea
    const data = g.world.terrain.data;
    let at = null;
    for (let r = 40; r <= 1600 && !at; r += 40) for (let a = 0; a < 24 && !at; a++) {
        const x = p0.x + Math.cos(a / 24 * 6.283) * r, z = p0.z + Math.sin(a / 24 * 6.283) * r;
        if (data.isSeaColumn?.(Math.round(x), Math.round(z))) at = { x, z };
    }
    if (!at) { h.log('no sea near'); return; }
    h.log('sea at', at);
    const sea = g.sea?.level ?? 0;
    await h.go(at.x, 30, at.z);
    await h.frames(90);
    h.bare();
    h.time(0.3);
    const freeze = g.seaTime; g.seaTime = () => 100; // (the waves stand still between the two pictures)
    const eye = [at.x, 14, at.z];
    for (const [k, dir] of [[0, [1, 0]], [1, [0, 1]]]) {
        const tgt = [at.x + dir[0] * 300, 0, at.z + dir[1] * 300];
        h.cam(eye, tgt);
        await h.shot(`s${k}-a`, { settle: 30 });
        h.cam([eye[0] + 0.02, eye[1] + 0.01, eye[2]], tgt);
        await h.shot(`s${k}-b`, { settle: 2 });
    }
    g.seaTime = freeze;
    void seas; void sea;
}
