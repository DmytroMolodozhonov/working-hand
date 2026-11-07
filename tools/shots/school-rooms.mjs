// «Школа Акселдорф»: each room as it is furnished (SchoolLand: the rooms; School: the cauldrons, the things on the tables, the beds; SchoolDecor: the wisps).
//   node tools/shot.mjs school-rooms --mode school
export default async function (h) {
    const g = h.g, S = g.school, P = S?.plan;
    if (!P) { h.log('no plan'); return; }
    g.cine?.skip?.(); S.phase = 'free'; S.record.arrived = true; S._dayLesson = null; S.dayT = -1e9; S._sky(0.2);
    const F = P.F;
    const only = (window.__shotArgs || '').split(',').filter(Boolean);
    const shots = [['hall', P.hall], ...Object.entries(P.rooms)].filter(([n]) => !only.length || only.includes(n));
    for (const [name, R] of shots) {
        const cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
        g.character.group.position.set(cx, F + 3, cz); g.character.verticalVelocity = 0;
        window.__pin = [cx, F + 3, cz];
        await h.until(() => g.world?.terrain?.data?.landMade?.(cx, cz), 60000);
        await h.frames(40);
        h.cam([R.x0 + 1.5, F + 6.5, R.z1 - 1.5], [cx, F + 2, cz]);
        await h.shot(name, { settle: 30 });
        window.__shotCam = null;
    }
    window.__pin = null;
}
