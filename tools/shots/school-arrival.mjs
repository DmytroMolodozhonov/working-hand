// «Школа Акселдорф», the arrival (School.js): the carriage up the road, the gates, the walk, the hall — and the castle on its land.
//   node tools/shot.mjs school-arrival --mode school
export default async function (h) {
    const g = h.g, S = g.school, P = S?.plan;
    h.log('plan', !!P, P && JSON.stringify({ c: P.centre, F: P.F, arrive: P.arrive, gate: P.gate }));
    if (!P) return;
    const X = P.centre.x, Z = P.centre.z, F = P.F;
    // the castle on its land, from afar (before the scene moves the hero)
    for (const [n, cam, at] of [['0-air', [X - 200, F + 120, Z + 260], [X, F + 10, Z]], ['0-side', [X + 280, F + 50, Z + 30], [X, F + 15, Z - 10]]]) {
        h.cam(cam, at); await h.shot(n, { settle: 60 });
    }
    window.__shotCam = null; g.character.group.visible = true;
    const t0 = performance.now();
    let last = '';
    while (performance.now() - t0 < 240000) {
        await h.frames(30);
        const ph = S.phase;
        if (ph !== last) { last = ph; h.log('phase', ph, 'hero', [g.character.group.position.x, g.character.group.position.z].map(Math.round), 'people', S.people.size, 'cart', !!S.cart); }
        if (ph === 'ride' && S.cart && !h._r) { h._r = 1; await h.frames(90); await h.shot('1-ride', { settle: 5 }); }
        if (ph === 'gate' && !h._g) { h._g = 1; await h.frames(120); await h.shot('2-gate', { settle: 5 }); }
        if (ph === 'walk') { g.character.group.position.set(P.hall.door.x, P.hall.door.y + 2.2, P.hall.door.z - 6); }
        if (ph === 'speech' && !h._s) { h._s = 1; await h.frames(200); h.cam([X + 6, F + 6, P.hall.z1 - 6], [X, F + 4, P.hall.z0]); await h.shot('3-hall', { settle: 20 }); window.__shotCam = null; }
        if (ph === 'free') break;
    }
    h.log('end phase', S.phase, 'line', S._line);
}
