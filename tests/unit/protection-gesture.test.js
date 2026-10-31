// «Protection» by crossed arms — the fast path (CrossedArms.CrossTrack + CrossedShield): the shield within a camera picture of the
// pose, a guess ahead of it (unseen, paid back if it does not come true), and no shield from the moves that look like it.
// The whole bench: tools/protectbench.mjs --check (thresholds there — only ever tighten them).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CrossTrack, CrossedShield, CROSS } from '../../src/game/CrossedArms.js';
import { KEYS, picture, rng, realMove, FALSE, run, bench } from '../../tools/protectsim.mjs';


const CAM = { cx: 0.5, sy: 0.4, W: 0.18, dir: 1 };
const mir = (k) => ({ e: [-k.e[0], k.e[1]], w: [-k.w[0], k.w[1]] });
const body = (L, Rk = mir(L)) => ({ le: L.e, lw: L.w, re: Rk.e, rw: Rk.w });
const CROSSED = { e: [0.7, 0.85], w: [-0.3, 0.55] };

/** Pictures every 1/fps of `bodies` (a function of t) from t0 to t1 into a track; → the events with their times. */
function feedAll(T, at, t0, t1, fps = 30, noise = 0, seed = 1, lost = () => null) {
    const r = rng(seed), out = [];
    for (let t = t0; t < t1 - 1e-9; t += 1 / fps) {
        const e = T.feed(t, picture(at(t), CAM, r, noise, lost(t)));
        if (e) out.push({ e, t });
    }
    return out;
}

test('a cross already held when the camera sees it: up by the 3rd picture (the jump in, a guess, confirmed)', () => {
    const T = new CrossTrack();
    feedAll(T, () => body(KEYS.hang), 0, 0.5);
    const ev = feedAll(T, () => body(CROSSED), 0.5, 0.7);
    assert.equal(ev.find((x) => x.e === 'on')?.t <= 0.5 + 2 / 30 + 1e-6, true, JSON.stringify(ev));
});

test('crossing at a human speed: the guess comes ahead of the strict pose, then it is confirmed — no gap', () => {
    for (const fps of [15, 30, 60]) {
        const r = rng(3);
        const mv = realMove(r, { start: 'hang', style: 'chest', dur: 0.35, hold: 1 });
        const T = new CrossTrack();
        const ev = feedAll(T, (t) => mv.mv.at(t), 0, mv.len, fps, 0.003);
        const tent = ev.findIndex((x) => x.e === 'tent'), on = ev.findIndex((x) => x.e === 'on');
        assert.ok(on >= 0, `${fps}: up ${JSON.stringify(ev)}`);
        assert.ok(tent >= 0 && tent < on && !ev.slice(tent, on).some((x) => x.e === 'cancel'), `${fps}: guessed, then confirmed: ${JSON.stringify(ev)}`);
        const off = ev.findIndex((x) => x.e === 'off');
        assert.ok(off > on && ev[off].t > mv.holdEnd, `${fps}: held until the arms opened`);
    }
});

test('a wrist lost for 1–3 pictures while crossed keeps the shield', () => {
    const T = new CrossTrack();
    feedAll(T, () => body(KEYS.hang), 0, 0.3);
    feedAll(T, () => body(CROSSED), 0.3, 0.8);
    assert.equal(T.state, 'on');
    const ev = feedAll(T, () => body(CROSSED), 0.8, 1.6, 30, 0, 2, (t) => (Math.floor(t * 30) % 5 < 3 ? { l: 0.1 } : null));
    assert.deepEqual(ev, []);
    assert.equal(T.state, 'on');
    // (no camera at all for more than a second: open)
    assert.equal(T.idle(CROSS.STALE + 0.1), 'off');
});

test('the arms swung through the cross fast (no stop): a guess at most, taken back — never a shield', () => {
    const T = new CrossTrack();
    const a = KEYS.T, b = { e: [0.75, 0.8], w: [-1.1, 0.9] }; // (left arm sweeps from the side across the body and on)
    const at = (t) => { const k = Math.min(1, Math.max(0, (t - 0.2) / 0.3)), L = { e: [a.e[0] + (b.e[0] - a.e[0]) * k, a.e[1] + (b.e[1] - a.e[1]) * k], w: [a.w[0] + (b.w[0] - a.w[0]) * k, a.w[1] + (b.w[1] - a.w[1]) * k] }; return body(L); };
    const ev = feedAll(T, at, 0, 1.2, 60);
    assert.ok(!ev.some((x) => x.e === 'on'), JSON.stringify(ev));
});

test('not crossed arms: T, a dome\'s spread, straight arms crossed over the chest, the hands over the head, one arm across', () => {
    const poses = {
        T: body(KEYS.T), spread: body(KEYS.spread), clap: body(KEYS.clap),
        straightAcross: body({ e: [-0.05, 0.25], w: [-0.75, 0.45] }), // (the warm-up's turn: crossed, but straight — the elbow midway, high)
        overhead: body({ e: [0.5, -0.75], w: [-0.15, -1.65] }),
        oneAcross: body({ e: [0.55, 0.95], w: [-0.45, 1.0] }, mir(KEYS.hang)),
    };
    for (const [name, b] of Object.entries(poses)) {
        const T = new CrossTrack();
        const ev = feedAll(T, () => b, 0, 1.5, 30, 0.003);
        assert.ok(!ev.some((x) => x.e === 'on'), `${name}: ${JSON.stringify(ev)}`);
    }
});

test('every false move of the bench, a few cameras: no shield', () => {
    for (const [kind, make] of Object.entries(FALSE)) for (const fps of [15, 30, 60]) {
        const r = rng(fps * 31 + kind.length);
        const res = run(make(r), r, { fps, lat: 0.1, jit: 0.006, noise: 0.005, drop: 0.03, occl: false, gameFps: 60 }, { old: false });
        assert.ok(!res.ev.some((x) => x.e === 'on'), `${kind} @${fps}: ${res.ev.map((x) => x.e)}`);
    }
});

// ---- the game's part with a stand-in game: what it pays, shows, gives back
function fakeGame({ mana = 100 } = {}) {
    const said = [];
    const g = {
        active: true, paused: false, hud: { hintFilter: null }, sound: { ice: 0, playIce() { this.ice++; } },
        sync: { soon: 0, poseSoon() { this.soon++; } }, spellLog: { lines: [], note(l) { this.lines.push(l); } },
        _lastShieldCast: 12345,
        combat: {
            shield: null, manaOn: true, fatigue: mana, frozen: false, stunned: false, dead: false,
            costOf: () => 5,
            _refund() { this.fatigue += 5; },
            dropShield(t) { said.push(t); this.shield = null; return true; },
        },
        castLocalSpell(text) {
            const c = g.combat;
            if (g._lastShieldCast) return null; // (the voice's «heard twice» guard must be cleared by the gesture)
            if (c.fatigue < 5) { said.push('no mana'); return null; }
            c.fatigue -= 5; c.shield = { type: 1, side: 'right', left: 99 };
            if (!g.crossedShield.quiet) g.sound.playIce();
            return 'Protection';
        },
    };
    g.crossedShield = new CrossedShield(g);
    return { g, said };
}
const pic = (b) => picture(b, CAM, null, 0, null);
function feedGame(g, at, t0, t1, fps = 30) { for (let t = t0; t < t1 - 1e-9; t += 1 / fps) g.crossedShield.onPose(pic(at(t)), t * 1000); }

test('the game: the picture itself puts the shield up (before the frame\'s blows), paid once, heard once, sent at once', () => {
    const { g } = fakeGame();
    feedGame(g, () => body(KEYS.hang), 0, 0.3);
    feedGame(g, () => body(CROSSED), 0.3, 0.45);
    assert.equal(g.combat.shield?.gesture, true);
    assert.equal(!!g.combat.shield.tent, false);
    assert.equal(g.combat.fatigue, 95);
    assert.equal(g.sound.ice, 1);
    assert.ok(g.sync.soon >= 1);
    assert.match(g.spellLog.lines[0], /Protection жестом: .*кадр → щит/);
    // again while up: nothing more paid
    feedGame(g, () => body(CROSSED), 0.45, 1.0);
    assert.equal(g.combat.fatigue, 95);
    // opened: down; crossed again at once — up again (the voice's 0.8 s guard is not for the arms)
    feedGame(g, () => body(KEYS.hang), 1.0, 1.4);
    assert.equal(g.combat.shield, null);
    g._lastShieldCast = 999;
    feedGame(g, () => body(CROSSED), 1.4, 1.6);
    assert.equal(g.combat.shield?.gesture, true);
});

test('the game: a guess that does not come true is unseen, silent and paid back; one that held a blow is kept', () => {
    const { g } = fakeGame();
    const T = g.crossedShield.track;
    feedGame(g, () => body(KEYS.hang), 0, 0.3);
    // force a guess, then the arms go away
    g.crossedShield._act('tent', 300);
    assert.equal(g.combat.shield?.tent, true);
    assert.equal(g.combat.fatigue, 95);
    assert.equal(g.sound.ice, 0, 'a guess is silent');
    assert.equal(g.hud.hintFilter, null, 'the hint filter put back');
    T.state = 'tent';
    g.crossedShield._act('cancel', 400);
    assert.equal(g.combat.shield, null);
    assert.equal(g.combat.fatigue, 100, 'paid back');
    // a guess that took a blow (Combat._blocked clears .tent): kept and paid
    g.crossedShield._act('tent', 500);
    g.combat.shield.tent = false;
    g.crossedShield.update(0);
    g.crossedShield._act('cancel', 600);
    assert.ok(g.combat.shield, 'kept');
    assert.equal(g.combat.fatigue, 95);
});

test('the game: no mana — no guess, the «no mana» said once at the real cross, not asked again until the arms open', () => {
    const { g, said } = fakeGame({ mana: 3 });
    feedGame(g, () => body(KEYS.hang), 0, 0.3);
    feedGame(g, () => body(CROSSED), 0.3, 1.0);
    assert.equal(g.combat.shield, null);
    assert.deepEqual(said, ['no mana']);
    assert.equal(g.combat.fatigue, 3);
});

test('the game: a shield already up (the voice\'s, the dome) — the gesture adds nothing and opening the arms leaves it', () => {
    const { g } = fakeGame();
    g.combat.shield = { type: 2, left: 99 };
    feedGame(g, () => body(KEYS.hang), 0, 0.3);
    feedGame(g, () => body(CROSSED), 0.3, 1.0);
    feedGame(g, () => body(KEYS.hang), 1.0, 1.5);
    assert.equal(g.combat.shield?.type, 2);
    assert.equal(g.combat.fatigue, 100);
});

test('the bench (quick): every real cross up within a picture, no false shield', () => {
    const r = bench({ seeds: 1, quick: true, old: false });
    assert.ok(r.okShare >= 0.98, `real: ${r.okShare}`);
    assert.ok(r.lagFramesP95 <= 1.05, `lag: ${r.lagFramesP95} pictures`);
    assert.equal(r.falseOn, 0, JSON.stringify(r.falseWhy));
    assert.equal(r.hourOn, 0, JSON.stringify(r.hourWhy));
});
