// Where the far world flickers (the author 22.11: «мир вдали мигает… как когда-то в океане»): the same far view twice, the camera moved
// by 2 cm — what changes between the two pictures beyond a pixel's shift is flicker (z-fighting, alpha shimmer, sparkle).
//   node tools/shot.mjs flicker --mode freeworld   → then diff the pairs (ffmpeg blend=difference)
export default async function (h, args = {}) {
    const g = h.g;
    const p0 = g.character.group.position.clone();
    await h.go(p0.x, p0.y + 30, p0.z);
    await h.frames(80);
    h.bare();
    h.time(0.3);
    const views = [[1, 0], [0, 1], [-1, -0.3]];
    for (let k = 0; k < views.length; k++) {
        const [dx, dz] = views[k];
        const eye = [p0.x, p0.y + 30, p0.z], at = [p0.x + dx * 200, p0.y + 5, p0.z + dz * 200];
        h.cam(eye, at);
        await h.shot(`v${k}-a`, { settle: 30 });
        h.cam([eye[0] + 0.02, eye[1] + 0.01, eye[2]], at);
        await h.shot(`v${k}-b`, { settle: 2 });
    }
}
