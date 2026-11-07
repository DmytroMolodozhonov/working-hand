// «Школа Акселдорф», the opening (School.js + Cine.js): one picture per cut-scene shot (the whole page: bars, title, words), then the
// bridge walk (the hero carried to the gate and to the hall), then the Director's speech shots.
//   node tools/shot.mjs school-arrival --mode school
export default async function (h) {
    const g = h.g, S = g.school, P = S?.plan;
    h.log('plan', !!P, P && JSON.stringify({ c: P.centre, F: P.F, M: P.M, arrive: P.arrive, coachFrom: P.coachFrom }));
    if (!P) return;
    window.__shotCam = null;
    const t0 = performance.now();
    let last = '', shotI = -2, n = 0;
    while (performance.now() - t0 < 1500000) {
        await h.frames(3);
        const ph = S.phase, ci = g.cine?.active ? g.cine.i : -1;
        if (ph !== last) { last = ph; h.log('phase', ph, Math.round((performance.now() - t0) / 1000) + 's'); }
        if (ci !== shotI) {
            shotI = ci;
            if (ci >= 0) { await h.frames(ci === 0 ? 2 : 12); await h.page(`${String(++n).padStart(2, '0')}-${ph}-${ci}`); }
        }
        if (ph === 'bridge' && !g.cine?.active) {
            if (!h._b) { h._b = 1; await h.frames(30); await h.page(`${String(++n).padStart(2, '0')}-bridge-start`); }
            const tea = S.people.get(22);
            // (the hero follows the teacher: put a few metres behind her)
            if (tea) g.character.group.position.set(tea.x + 1.5, tea.y + 2.2, tea.z + 4);
            if (S._step === 1 && tea && tea.z < P.bridge.v0 + 30 && !h._m) { h._m = 1; await h.page(`${String(++n).padStart(2, '0')}-bridge-mid`); }
        }
        if (ph === 'free') break;
    }
    h.log('end', S.phase);
}
