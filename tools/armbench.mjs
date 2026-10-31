#!/usr/bin/env node
/**
 * armbench.mjs — how true to the player's arm the hero's arm is (ArmSolver vs the old getRelativeDirection), on human
 * arm movements seen by a noisy camera: a throw (wind-up behind the shoulder, release, follow-through), a T-pose, a reach,
 * arms overhead, a hand on the chest and across it, a hand behind the back, pointing, waving; both arms; people of
 * different builds and distances. The camera: picture points with noise, MediaPipe's depth weaker and much noisier.
 *   node tools/armbench.mjs [--check] [--v]
 * Metrics: the upper arm's / forearm's direction error (degrees), the hand's place error (game metres), how often a segment
 * far out of the picture's plane is put on the right side (in front / behind), and how often the cocked wind-up is drawn
 * behind the shoulder.
 */
import { ArmSolver, oldDirection } from '../src/entities/ArmSolver.js';
import { OneEuroFilter } from '../src/core/math.js';
import { POSE_ARM_DCUTOFF } from '../src/input/TrackingGuard.js';

export const LIMITS = { uP90: 25, fP90: 26.5, handP90: 0.6, sideOk: 0.97, cockBehind: 0.85 }; // (only ever tighten; the old way: 76°, 102°, 2.6 m, 69 %, 0 %)

const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const slerp = (a, b, k) => norm([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
const ease = (k) => k * k * (3 - 2 * k);

/** Right arm key poses (body space: x out to the right, y up, z back): [upper arm, forearm] directions. */
const K = {
    rest: [[0.1, -1, 0], [0.1, -1, -0.15]],
    tpose: [[1, 0, 0], [1, 0, 0]],
    reach: [[0.15, -0.1, -1], [0, 0, -1]],
    overhead: [[0.2, 1, 0], [0.1, 1, 0.05]],
    cocked: [[1, 0.15, 0.4], [-0.1, 0.75, 0.65]], // the throw's wind-up: elbow out and back, the hand up behind the head
    release: [[0.5, 0.4, -0.75], [0.2, 0.3, -0.95]],
    follow: [[-0.2, -0.5, -0.8], [-0.5, -0.6, -0.6]],
    across: [[0.3, -0.4, -0.85], [-1, 0.1, -0.1]],
    chest: [[0.2, -0.9, -0.4], [-0.6, 0.6, -0.5]],
    behindBack: [[0.2, -0.85, 0.5], [-0.8, 0.15, 0.55]],
    pointUp: [[0.8, 0.6, 0], [0.8, 0.6, 0]],
    wave: [[1, 0.1, 0], [0, 1, 0]],
    shield: [[0.3, 0, -1], [0.2, 0.4, -0.9]],
};
/** Movements: [pose, seconds to get there]. */
const MOVES = {
    throw: [['rest', 0], ['cocked', 0.5], ['cocked', 0.25], ['release', 0.13], ['follow', 0.18], ['rest', 0.5]],
    tpose: [['rest', 0], ['tpose', 0.5], ['tpose', 0.8], ['rest', 0.5]],
    reach: [['rest', 0], ['reach', 0.4], ['reach', 0.6], ['rest', 0.4]],
    overhead: [['rest', 0], ['overhead', 0.6], ['overhead', 0.5], ['rest', 0.5]],
    across: [['rest', 0], ['across', 0.5], ['across', 0.5], ['chest', 0.4], ['rest', 0.4]],
    behindBack: [['rest', 0], ['behindBack', 0.6], ['behindBack', 0.6], ['rest', 0.5]],
    point: [['rest', 0], ['pointUp', 0.4], ['pointUp', 0.5], ['shield', 0.5], ['rest', 0.4]],
    wave: [['rest', 0], ['wave', 0.4], ['tpose', 0.25], ['wave', 0.25], ['tpose', 0.25], ['wave', 0.25], ['rest', 0.4]],
};

function* frames(move, fps) {
    const seq = MOVES[move];
    let t = 0;
    for (let i = 1; i < seq.length; i++) {
        const a = K[seq[i - 1][0]], b = K[seq[i][0]], T = seq[i][1];
        const n = Math.max(1, Math.round(T * fps));
        for (let k = 1; k <= n; k++) { const e = ease(k / n); t += 1 / fps; yield { u: slerp(norm(a[0]), norm(b[0]), e), f: slerp(norm(a[1]), norm(b[1]), e), cock: seq[i][0] === 'cocked' && k === n, t }; }
    }
}

const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b.x + a[1] * b.y + a[2] * b.z))) * 180 / Math.PI;

export function bench({ seeds = 4, fps = 30, only = null } = {}) {
    const res = { old: { u: [], f: [], hand: [], side: [0, 0], cock: [0, 0] }, new: { u: [], f: [], hand: [], side: [0, 0], cock: [0, 0] } };
    for (let s = 0; s < seeds; s++) for (const move of (only ? [only] : Object.keys(MOVES))) for (const side of ['right', 'left']) {
        const r = rng(1000 + s * 97 + move.length * 13 + (side === 'left' ? 7 : 0));
        // a person: build, distance (picture scale), camera aspect
        const sw = 0.34 + 0.08 * r(), upper = sw * (0.72 + 0.12 * r()), fore = sw * (0.6 + 0.12 * r());
        const scale = 0.35 + 0.25 * r(), aspect = [4 / 3, 16 / 9][s % 2];
        const zScale = 0.45 + 0.3 * r(), zNoise = 0.03 + 0.02 * r(), xyNoise = 0.004 + 0.004 * r();
        const solver = new ArmSolver();
        const mx = side === 'left' ? -1 : 1;
        // the picture: hero +x → picture −x; height units → x by the width (÷ aspect); MediaPipe z by the width too, weaker
        // (then the game's own filter on each point — TrackingGuard.PoseStabilizer: 1€, the same numbers)
        const flt = {}, F = (k) => flt[k] || (flt[k] = [0, 1, 2].map((i) => new OneEuroFilter(i < 2 ? 2.0 : 1.5, i < 2 ? 3.0 : 1.0, k === 'S' || k === 'O' ? 1.0 : POSE_ARM_DCUTOFF)));
        let clock = 0;
        const P = (X, Y, Z, k) => {
            const f = F(k);
            return { x: f[0].filter(0.5 - (X * scale) / aspect + gauss(r) * xyNoise / aspect, clock), y: f[1].filter(0.4 - Y * scale + gauss(r) * xyNoise, clock), z: f[2].filter((Z * scale * zScale) / aspect + gauss(r) * zNoise / aspect, clock) };
        };
        const shR = [mx * sw / 2, 0, 0], shL = [-mx * sw / 2, 0, 0];
        for (const fr of frames(move, fps)) {
            const u = [fr.u[0] * mx, fr.u[1], fr.u[2]], f = [fr.f[0] * mx, fr.f[1], fr.f[2]];
            const el = [shR[0] + u[0] * upper, shR[1] + u[1] * upper, shR[2] + u[2] * upper];
            const wr = [el[0] + f[0] * fore, el[1] + f[1] * fore, el[2] + f[2] * fore];
            clock += 1 / fps;
            const S = P(...shR, 'S'), E = P(...el, 'E'), Wp = P(...wr, 'W'), O = P(...shL, 'O');
            solver.shoulders(side === 'right' ? O : S, side === 'right' ? S : O, aspect); // (left / right shoulders of the picture's person)
            const nw = solver.solve(side, S, E, Wp, aspect);
            const ou = oldDirection(S, E), of = oldDirection(E, Wp);
            for (const [k, U, F] of [['old', ou, of], ['new', nw.u, nw.f]]) {
                const R = res[k];
                R.u.push(ang(u, U)); R.f.push(ang(f, F));
                // the hand's place with the game's bones (1.0 + 0.9)
                const hx = U.x + F.x * 0.9 - (u[0] + f[0] * 0.9), hy = U.y + F.y * 0.9 - (u[1] + f[1] * 0.9), hz = U.z + F.z * 0.9 - (u[2] + f[2] * 0.9);
                R.hand.push(Math.hypot(hx, hy, hz));
                for (const [t, g] of [[u[2], U.z], [f[2], F.z]]) if (Math.abs(t) > 0.4) { R.side[1]++; if (Math.sign(t) === Math.sign(g)) R.side[0]++; }
                if (fr.cock) { R.cock[1]++; if (U.z + F.z * 0.9 > 0.2) R.cock[0]++; }
            }
        }
    }
    const pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const sum = (R) => ({ uMean: mean(R.u), uP90: pct(R.u, 0.9), fMean: mean(R.f), fP90: pct(R.f, 0.9), handMean: mean(R.hand), handP90: pct(R.hand, 0.9), sideOk: R.side[0] / R.side[1], cockBehind: R.cock[0] / Math.max(1, R.cock[1]) });
    return { old: sum(res.old), new: sum(res.new) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const oi = args.indexOf('--only');
    const r = bench({ only: oi >= 0 ? args[oi + 1] : null });
    const f = (x, d = 1) => x.toFixed(d);
    for (const k of ['old', 'new']) {
        const R = r[k];
        console.log(`${k === 'old' ? 'старая рука' : 'новая рука '}: плечо ${f(R.uMean)}° (90%: ${f(R.uP90)}°), предплечье ${f(R.fMean)}° (90%: ${f(R.fP90)}°), кисть мимо на ${f(R.handMean, 2)} м (90%: ${f(R.handP90, 2)}), сторона (перед/за) верно ${f(R.sideOk * 100)}%, замах за плечом ${f(R.cockBehind * 100)}%`);
    }
    if (args.includes('--check')) {
        const bad = [];
        for (const [k, lim] of Object.entries(LIMITS)) { const v = r.new[k]; if (k === 'sideOk' || k === 'cockBehind' ? v < lim : v > lim) bad.push(`${k} = ${f(v, 3)} (порог ${lim})`); }
        if (bad.length) { console.log('ПРОВАЛ:', bad.join('; ')); process.exit(1); }
        console.log('ok');
    }
}
