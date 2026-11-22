// The living ground up close (the author 21.11: «следы ног, взаимодействие с землёй, в зависимости от погоды; лужи; трава колышется»):
// the hero walks a path through the meadow — the trail of pressed grass behind him and his prints; then the rain: mud prints, puddles.
//   node tools/shot.mjs ground --mode freeworld
export default async function (h) {
    const g = h.g, T = h.THREE, tr = g.world.terrain, data = tr.data;
    const p0 = g.character.group.position.clone();
    await h.go(p0.x, p0.y + 4, p0.z);
    await h.frames(60);
    // a grass spot, fairly flat
    let at = null;
    for (let r = 0; r <= 160 && !at; r += 8) for (let a = 0; a < 16 && !at; a++) {
        const x = Math.round(p0.x + Math.cos(a / 16 * 6.283) * r), z = Math.round(p0.z + Math.sin(a / 16 * 6.283) * r);
        if (!data.landMade(x, z)) continue;
        const L = data.topLayer(x, z);
        if (L < 2 || data.get(x, L, z) !== 1) continue;
        let flat = true; for (let k = 0; k < 8; k++) if (Math.abs(data.topLayer(x + k, z) - L) > 1) flat = false;
        if (flat) at = { x, z, L };
    }
    if (!at) { h.log('no flat grass'); return; }
    h.log('ground at', at);
    const feetY = at.L + 0.5, eyeY = feetY + 2.0;
    window.__pin = null;
    g.character.group.position.set(at.x, eyeY + 0.2, at.z);
    await h.frames(30);
    h.bare();
    h.time(0.32);
    // walk 10 m east, step by step (the footprints and the trample follow the hero's real moves)
    const walk = async () => { for (let s = 0; s <= 50; s++) { window.__pin = [at.x + s * 0.2, eyeY, at.z]; await h.frames(1); } };
    await walk();
    h.cam([at.x + 13, feetY + 3.2, at.z + 2.5], [at.x + 4, feetY, at.z]);
    await h.shot('1-trail-dry', { settle: 4 });
    // the rain: the land soaks, puddles fill; walk back — mud prints
    g.storm?.startRain?.(120);
    const { ULTRA } = await import('/src/fx/UltraUniforms.js');
    for (let k = 0; k < 40; k++) { ULTRA.wet.value = 1; await h.frames(1); }
    for (let s = 0; s <= 50; s++) { ULTRA.wet.value = 1; window.__pin = [at.x + 10 - s * 0.2, eyeY, at.z + 1.2]; await h.frames(1); }
    h.cam([at.x + 13, feetY + 3.2, at.z + 3.5], [at.x + 4, feetY, at.z + 0.6]);
    ULTRA.wet.value = 1;
    await h.shot('2-trail-rain', { settle: 4 });
    h.cam([at.x - 6, feetY + 7, at.z - 6], [at.x + 4, feetY, at.z + 4]);
    await h.shot('3-meadow-rain', { settle: 4 });
}
