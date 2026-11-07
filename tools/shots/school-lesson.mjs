// «Школа Акселдорф», the first lesson (SchoolLesson.js): the arrival skipped — the call, the room, the teacher's shield, the charges held
// on the hero's shield (raised by script: there is no camera here), the lesson counted. Also the Great Hall's candles (SchoolDecor.js).
//   node tools/shot.mjs school-lesson --mode school
export default async function (h) {
    const g = h.g, S = g.school, P = S?.plan;
    if (!P) { h.log('no plan'); return; }
    // the arrival skipped: the people made where the speech leaves them
    await h.until(() => g.castleLife?.castles?.get('akseldorf')?.awake, 60000);
    if (S.cart) { try { g.carriages.remove(S.cart); } catch { /* */ } S.cart = null; }
    S._toGate?.(); S._startWalk?.();
    h.log('people', S.people.size, 'knows Protection before', g.knowsSpell('Protection'));
    // the Great Hall: the floating candles
    const H = P.hall;
    g.character.group.position.set(P.centre.x, P.F + 3, (H.z0 + H.z1) / 2);
    h.cam([P.centre.x + 8, P.F + 5, H.z1 - 4], [P.centre.x, P.F + 11, H.z0 + 8]); await h.shot('0-hall-candles', { settle: 60 });
    window.__shotCam = null;
    S.phase = 'free'; S.t = 9;
    const t0 = performance.now();
    let last = '', shots = {};
    while (performance.now() - t0 < 1200000) {
        await h.frames(10);
        const L = S.lesson;
        const ph = L ? L.phase : 'none';
        if (ph !== last) { last = ph; h.log('lesson', ph, 'ok', L?.ok, 'tries', L?.tries, 'attended', L?.attended, 'knows', g.knowsSpell('Protection')); }
        if (ph === 'gather') { const R = L.room; g.character.group.position.set((R.x0 + R.x1) / 2, P.F + 3, R.z0 + 12); }
        if (ph === 'intro' && !shots.i) { shots.i = 1; await h.frames(120); await h.page('1-room'); }
        if (ph === 'demo' && !shots.d) { shots.d = 1; await h.frames(60); const tea = L.teacher; if (tea) { h.cam([tea.x + 5, P.F + 4.5, tea.z + 9], [tea.x, P.F + 3, tea.z]); await h.shot('2-demo', { settle: 5 }); window.__shotCam = null; } }
        if (ph === 'task') {
            // the hero raises the shield when a charge is in the air (by script: Combat's shield — no camera here)
            const flying = L._bolt && L._bolt.state === 'flying';
            if (flying && !g.combat.shield) g.combat.castProtection?.(false);
            if (!flying && g.combat.shield && L.t - (L._boltAt || 0) > 1) g.combat.dropShield?.();
            if (flying && !shots.b) { shots.b = 1; await h.page('3-block'); }
        }
        if (ph === 'outro' && !shots.o) { shots.o = 1; await h.page('4-outro'); }
        if (!L && S.record.seen.length) break;
    }
    h.log('end', JSON.stringify(S.record));
}
