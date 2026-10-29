// Multiplayer QA (docs/qa/multiplayer-report.md, V-01): two players duel and talk over Discord; the friend's voice comes
// out of my speakers into my microphone. When the camera can't see my mouth (and the voice program has no echo canceller:
// a Mac, the browser's recognizer), VoiceGate tells a friend's echo from my own spell by the network's word «he said X».
// It threw away my own spell whenever the friend had said the same one in the last 3.5 s — in a duel both answer with the
// same spells all the time. A simulation of the timings (Discord's delay, the network, both recognizers): the echo of the
// friend must still never cast, and my own answer must not be lost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceGate, GATE } from '../../src/game/VoiceGate.js';

/** Seeded random numbers: the same timings at every run. */
function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const U = (r, a, b) => a + (b - a) * r();

/** One spell of the friend and the timings of its way to me (ms). */
function friendSpell(r, f) {
    const len = U(r, 450, 900); // (the spell's sound)
    const recog = U(r, 200, 900); // (his recognizer writes it after he finished)
    const net = U(r, 20, 150); // (the game's network: his «say» to me)
    const discord = U(r, 100, 500); // (his voice through Discord to my speakers)
    // (his «say» tells how long ago he began: ago, by his clock; his cast's own message comes with it and knows nothing of that)
    const sent = f + len + recog, ago = sent - (f - 200);
    return { said: sent + net, ago, castAt: sent + net + U(r, 0, 60), echoFrom: f + discord - 200, echoHeard: f + discord + len + U(r, 200, 900) };
}

/** As main.js: the lips unseen — check; no echo yet: hold GATE.HOLD for the friend's word, check again. → cast? */
function casts(gate, fr, t, from, useFrom) {
    const seen = (at) => {
        gate.remote = [];
        const notes = [{ t: fr.castAt, o: { by: 'friend' } }, { t: fr.said, o: { by: 'friend', began: useFrom ? fr.said - fr.ago : null } }].sort((a, b) => a.t - b.t);
        for (const n of notes) if (n.t <= at) gate.noteRemote('Expelliarmus', n.t, useFrom ? n.o : {});
    };
    seen(t);
    let g = gate.check('Expelliarmus', t, null, useFrom ? from : null);
    if (!g.ok) return false;
    if (g.sure) return true;
    seen(t + GATE.HOLD);
    g = gate.check('Expelliarmus', t + GATE.HOLD, null, useFrom ? from : null);
    return g.ok;
}

function duel(useFrom, n = 600) {
    const r = rng(7);
    let echoCast = 0, mineLost = 0, mineTotal = 0;
    for (let i = 0; i < n; i++) {
        const gate = new VoiceGate();
        const f = 10000;
        const fr = friendSpell(r, f);
        // 1) the friend's own spell from my speakers: never mine
        if (casts(gate, fr, fr.echoHeard, fr.echoFrom, useFrom)) echoCast++;
        // 2) my answer with the same spell, 0.3–4 s after he began his (a duel)
        const m = f + U(r, 300, 4000);
        const len = U(r, 450, 900);
        mineTotal++;
        if (!casts(gate, fr, m + len + U(r, 200, 900), m - 200, useFrom)) mineLost++;
    }
    return { echoCast, mineLost, mineTotal };
}

test('Discord-дуэль без камеры на губах: эхо друга не колдует, мои ответы тем же заклинанием не теряются', () => {
    const before = duel(false), after = duel(true);
    // (measured 29.10.2026: before — 0 echoes cast, 523 of 600 of my answers lost; after — 0 echoes, 177 lost: those I began within
    // 1.3 s of his own beginning, where his voice from my speakers may be just then — without the camera they can't be told apart)
    assert.equal(after.echoCast, 0, `эхо друга сработало ${after.echoCast} раз`);
    assert.ok(before.mineLost > after.mineLost * 2.5, `было потеряно ${before.mineLost}, стало ${after.mineLost}`);
    assert.ok(after.mineLost / after.mineTotal <= 0.3, `теряется ${after.mineLost} из ${after.mineTotal} моих заклинаний`);
});

test('эхо и без времени фразы (распознавание браузера) — как раньше', () => {
    const gate = new VoiceGate();
    gate.noteRemote('Expelliarmus', 1000);
    assert.equal(gate.echoes('Expelliarmus', 2500), true);
    assert.equal(gate.echoes('Expelliarmus', 2500, null), true);
    assert.equal(gate.echoes('Expelliarmus', 2500, 900), true, 'began before his word came: maybe his echo');
    assert.equal(gate.echoes('Expelliarmus', 3500, 1000 + GATE.SAID_AFTER + 50), false, 'began well after his word came: mine');
    // his «say» told when he began: only round that moment is it his echo
    const g2 = new VoiceGate();
    g2.noteRemote('Expelliarmus', 5000, { by: 'f' }); // (his cast: no beginning)
    g2.noteRemote('Expelliarmus', 5050, { by: 'f', began: 3800 }); // (his word: began at 3800 — replaces the note above)
    assert.equal(g2.remote.length, 1);
    assert.equal(g2.echoes('Expelliarmus', 6000, 4000), true, 'began 0.2 s after him: his voice from my speakers');
    assert.equal(g2.echoes('Expelliarmus', 6500, 5400), false, 'began 1.6 s after him: my answer');
    assert.equal(g2.echoes('Expelliarmus', 6500, 3000), false, 'began before him: mine');
    g2.noteRemote('Expelliarmus', 5100, { by: 'f' }); // (a late cast message of the same spell: no second, looser note)
    assert.equal(g2.remote.length, 1);
});
