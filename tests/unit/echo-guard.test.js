// EchoGuard: a friend's voice from my speakers is never my spell; my own voice is never let go because of an echo.
// Synthetic 10 ms envelopes (syllables, pauses, a room's tail, noise); the real-audio stand is tools/voicebench/echobench.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EchoGuard, decide, ECHO } from '../../src/audio/EchoGuard.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** A voice's 10 ms levels (dB) over `n` frames: syllables of 100–250 ms, words, pauses; null where silent. */
function speech(n, r, { start = 0, talk = 0.6, level = -26 } = {}) {
    const out = new Array(n).fill(null);
    let i = start;
    while (i < n) {
        if (r() < talk) {
            const syl = 3 + Math.floor(r() * 4);
            for (let s = 0; s < syl && i < n; s++) {
                const len = 10 + Math.floor(r() * 15), peak = level + (r() - 0.5) * 8;
                for (let k = 0; k < len && i < n; k++, i++) out[i] = peak - 14 * Math.abs(k / len - 0.45) * 2 + (r() - 0.5) * 2;
                i += 2 + Math.floor(r() * 5);
            }
        }
        i += 15 + Math.floor(r() * 40);
    }
    return out;
}

const pw = (db) => (db == null ? 0 : 10 ** (db / 10));
const db = (p) => 10 * Math.log10(p + 1e-12);

/** The microphone: the echo (his voice `lag` frames later, `gain` dB, a room's tail), my voice, the room's hiss. */
function room(friend, mine, { lag = 12, gain = -12, rt = 1.2, noise = -62 }, r) {
    const n = friend.length, mic = new Array(n);
    let tail = 0;
    for (let i = 0; i < n; i++) {
        const f = i - lag >= 0 ? pw(friend[i - lag] == null ? null : friend[i - lag] + gain) : 0;
        tail = Math.max(f, tail * 10 ** (-rt / 10));
        mic[i] = db(tail + f * 0.3 + pw(mine[i]) + pw(noise + (r() - 0.5) * 3));
    }
    return mic;
}

function feed(g, mic, refs) {
    for (let i = 0; i < mic.length; i++) {
        g.mic(i * 10, mic[i]);
        for (const [id, kind, lv, shift = 0] of refs) {
            const k = i - shift;
            if (k >= 0) g.ref(id, kind, i * 10, lv[k] == null ? -120 : lv[k]);
        }
        if (i % 25 === 0) g.track(i * 10);
    }
}

/** The frames from…to of one burst of `v` around frame `near` (a phrase). */
function phraseAt(v, near) {
    let a = near, b = near;
    while (a > 0 && (v[a - 1] != null || v[a - 2] != null || v[a - 3] != null)) a--;
    while (b < v.length - 1 && (v[b + 1] != null || v[b + 2] != null || v[b + 3] != null)) b++;
    return [a * 10, b * 10 + 10];
}

const firstAfter = (v, i) => { while (i < v.length && v[i] == null) i++; return i; };

test('the friend alone in the speakers (the game chat plays him): his phrase is his echo', () => {
    for (const lag of [4, 12, 20, 30]) { // 40…300 ms
        const r = rng(lag), n = 1500;
        const friend = speech(n, r, { talk: 0.7 });
        const mine = new Array(n).fill(null);
        const mic = room(friend, mine, { lag, gain: -10 }, r);
        const g = new EchoGuard();
        feed(g, mic, [['play:F', 'play', friend]]);
        let echo = 0, tot = 0;
        for (let i = 600; i < n - 100;) {
            const s = firstAfter(friend, i);
            if (s >= n - 100) break;
            const [a, b] = phraseAt(friend, s);
            const j = g.judge(a + lag * 10, b + lag * 10);
            tot++;
            if (j.verdict === 'echo') echo++;
            assert.notEqual(j.verdict, 'mine', `задержка ${lag * 10} мс: эхо друга принято за мой голос ${JSON.stringify(j)}`);
            i = Math.floor(b / 10) + 5;
        }
        assert.ok(tot >= 5 && echo / tot >= 0.8, `задержка ${lag * 10} мс: эхом узнано ${echo} из ${tot}`);
    }
});

test('my voice over the friend\'s talk is mine (double talk), and alone it is not an echo', () => {
    const r = rng(3), n = 1500;
    const friend = speech(n, r, { talk: 0.9 });
    const mine = new Array(n).fill(null);
    const spells = [700, 950, 1200];
    const mr = rng(11);
    for (const at of spells) { const s = speech(40, mr, { talk: 1, level: -20 }); for (let k = 0; k < 40; k++) mine[at + k] = s[k]; }
    const mic = room(friend, mine, { lag: 15, gain: -9 }, r);
    const g = new EchoGuard();
    feed(g, mic, [['play:F', 'play', friend]]);
    for (const at of spells) {
        const j = g.judge(at * 10, at * 10 + 400);
        assert.equal(j.verdict, 'mine', JSON.stringify(j));
        assert.equal(decide(j).block, false);
    }
    // the friend silent: nothing to compare with — my voice goes on
    const g2 = new EchoGuard();
    const quiet = new Array(n).fill(null);
    feed(g2, room(quiet, mine, { lag: 15 }, r), [['play:F', 'play', quiet]]);
    assert.equal(g2.judge(spells[0] * 10, spells[0] * 10 + 400).verdict, 'none');
});

test('Discord: the friend\'s own voice comes over the network (his clock shifted), Discord\'s delay on top — still his echo', () => {
    const r = rng(5), n = 1800;
    const friend = speech(n, r, { talk: 0.7 });
    const mine = new Array(n).fill(null);
    const lag = 52; // (Discord 400 ms + the room 120 ms; his clock mapped 0 ms off)
    const mic = room(friend, mine, { lag, gain: -10 }, r);
    const g = new EchoGuard();
    feed(g, mic, [['net:F', 'net', friend]]);
    let echo = 0, tot = 0;
    for (let i = n - 850; i < n - 120;) {
        const s = firstAfter(friend, i);
        if (s >= n - 120) break;
        const [a, b] = phraseAt(friend, s);
        const j = g.judge(a + lag * 10, b + lag * 10);
        tot++; if (j.verdict === 'echo') echo++;
        assert.notEqual(j.verdict, 'mine', JSON.stringify({ a, j, ref: [...g.refs.values()].map((x) => ({ lag: x.lag, conf: x.conf, gain: x.gain, corr: x.corr })) }));
        i = Math.floor(b / 10) + 5;
    }
    assert.ok(echo / tot >= 0.8, `эхом узнано ${echo} из ${tot}`);
});

test('headphones: the friend is not in the microphone at all — my words while he talks are mine', () => {
    const r = rng(8), n = 1200;
    const friend = speech(n, r, { talk: 0.9 });
    const mine = new Array(n).fill(null);
    const mr = rng(2);
    const s = speech(40, mr, { talk: 1, level: -28 });
    for (let k = 0; k < 40; k++) mine[800 + k] = s[k];
    const mic = room(friend, mine, { lag: 10, gain: -80 }, r); // (nothing of him comes back)
    const g = new EchoGuard();
    feed(g, mic, [['play:F', 'play', friend]]);
    const j = g.judge(8000, 8400);
    assert.ok(j.verdict === 'mine' || j.verdict === 'none', JSON.stringify(j));
    assert.equal(decide(j, { talking: true }).block, false);
});

test('decide: the lips and «who said it first»', () => {
    const echo = { verdict: 'echo', share: 0.9, near: 0, nearRun: 0, lag: 120 };
    assert.equal(decide(echo).block, true);
    assert.equal(decide(echo, { lips: true }).block, false, 'рот двигался вместе с голосом — моё всегда');
    const mixed = { verdict: 'mixed', share: 0.5, near: 0.1, nearRun: 3 };
    assert.equal(decide(mixed, { talking: true }).hold, ECHO.HOLD, 'сомнительное ждёт слова друга');
    assert.equal(decide(mixed, { talking: true, held: true }).block, false, 'дождались — его слова не было: моё');
    assert.equal(decide(mixed, { said: 'F' }).block, true);
    const mine = { verdict: 'mine', share: 0.2, near: 0.7, nearRun: 30 };
    assert.equal(decide(mine, { said: 'F' }).block, false, 'мой голос не отсеивается');
    const g = new EchoGuard();
    g.friendWord('F', 'Bombardo', 1000, 1600);
    assert.equal(g.friendSaid('BombardoMaxima', 1200, 2200), 'F', 'его слово раньше моего — это его эхо');
    assert.equal(g.friendSaid('Bombardo', 400, 1000), null, 'его слово началось позже моего — это мой голос у него в микрофоне');
    assert.equal(g.friendSaid('Bombardo', 9000, 9500), null, 'давно');
});

test('the friend\'s clock: the smallest «arrival − sent» is his offset', () => {
    const g = new EchoGuard();
    g.clock('F', 1000, 5080);
    g.clock('F', 1100, 5150); // (this one came faster)
    assert.equal(g.mine('F', 2000), 6050);
    g.clock('F', 1200, 5400);
    assert.ok(g.mine('F', 2000) <= 6051);
});
