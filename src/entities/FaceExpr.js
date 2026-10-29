/**
 * FaceExpr.js — the player's face as the camera sees it (MediaPipe's 478 face points), read as a few muscles' worth
 * of numbers for the «Реалистичный» hero: the eyes closing (each), the brows (each, and the inner ends: worried /
 * frowning), where the eyes look, the jaw, the smile (each corner), the mouth wide («И», «Э») or rounded («О», «У»),
 * the upper lip raised, the cheeks raised (a squint), the head's tilt to a shoulder.
 *
 * Measured in the face's OWN frame (from the eyes' corners and the forehead–chin line): a turned or tilted head does
 * not read as a smile or a frown. Every person's face is different — the neutral face is learnt on the go (slowly,
 * and only while the face is near it), so a wide mouth or high brows by nature are «calm».
 *
 * Over the network a face is 14 numbers of 64 steps each: a 14-letter string (`encodeFace`), then only what changed
 * (`faceDiff`: two letters a number) — a few bytes a frame.
 */

export const FACE_KEYS = ['blinkL', 'blinkR', 'browL', 'browR', 'browIn', 'gazeX', 'gazeY', 'jaw', 'smileL', 'smileR', 'wide', 'lipUp', 'roll', 'squint'];
/** Signed channels go −1…1, the rest 0…1. */
const SIGNED = new Set(['browL', 'browR', 'browIn', 'gazeX', 'gazeY', 'smileL', 'smileR', 'wide', 'roll']);
export function neutralFace() { return Object.fromEntries(FACE_KEYS.map((k) => [k, 0])); }

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const q6 = (k, v) => clamp(Math.round(SIGNED.has(k) ? (v + 1) * 31.5 : v * 63), 0, 63);
const dq6 = (k, n) => (SIGNED.has(k) ? n / 31.5 - 1 : n / 63);

/** The face as 14 letters. */
export function encodeFace(f) {
    let s = '';
    for (const k of FACE_KEYS) s += ABC[q6(k, +f[k] || 0)];
    return s;
}
/** Back from 14 letters (null: not a face). */
export function decodeFace(s, out = neutralFace()) {
    if (typeof s !== 'string' || s.length !== FACE_KEYS.length) return null;
    for (let i = 0; i < FACE_KEYS.length; i++) {
        const n = ABC.indexOf(s[i]);
        if (n < 0) return null;
        out[FACE_KEYS[i]] = dq6(FACE_KEYS[i], n);
    }
    return out;
}
/** Only what changed between two encoded faces: pairs (which number, its new value); '' when nothing did. */
export function faceDiff(prev, next, minStep = 1) {
    if (!prev || prev.length !== next.length) return null; // (send it whole)
    let out = '';
    for (let i = 0; i < next.length; i++) {
        if (prev[i] === next[i]) continue;
        if (Math.abs(ABC.indexOf(prev[i]) - ABC.indexOf(next[i])) < minStep) continue;
        out += ABC[i] + next[i];
    }
    return out;
}
/** An encoded face with a diff applied (the diff from `faceDiff`). */
export function applyFaceDiff(cur, diff) {
    if (typeof cur !== 'string' || cur.length !== FACE_KEYS.length || typeof diff !== 'string') return cur;
    const a = cur.split('');
    for (let i = 0; i + 1 < diff.length; i += 2) {
        const k = ABC.indexOf(diff[i]);
        if (k >= 0 && k < a.length && ABC.indexOf(diff[i + 1]) >= 0) a[k] = diff[i + 1];
    }
    return a.join('');
}

// ------------------------------------------------------------------ reading the camera's face
// (MediaPipe face mesh: the subject's right eye is 33 (outer) / 133 (inner), its lids 159 / 145, its iris 468;
//  the left eye 263 / 362, lids 386 / 374, iris 473; brows 70…107 (right, outer → inner) and 300…336 (left);
//  the mouth's corners 61 (right) / 291 (left), the lips' inner middles 13 / 14, the upper lip's top 0, the nose's foot 2,
//  the forehead 10, the chin 152)
const BROW_R = [70, 63, 105, 66, 107], BROW_L = [300, 293, 334, 296, 336];

/**
 * new FaceReader().read(points, aspect, t) → the face's numbers (FACE_KEYS), or null when the points are not a face.
 * `t` in seconds (the neutral face is learnt over time).
 */
export class FaceReader {
    constructor() {
        this.base = null; // the learnt neutral measures
        this.out = neutralFace();
        this._t = null;
        this._m = {};
    }

    _p(lm, i, A, o) { const p = lm[i]; o[0] = p.x * A; o[1] = -p.y; o[2] = -(Number.isFinite(p.z) ? p.z : 0) * A; return o; }

    read(lm, aspect = 4 / 3, t = 0) {
        if (!Array.isArray(lm) || lm.length < 468) return null;
        const A = aspect || 4 / 3;
        // the face's frame: X from the right eye's corner to the left's, Y the forehead over the chin, Z out of the face
        const P = (i) => this._p(lm, i, A, [0, 0, 0]);
        const r = P(33), l = P(263), top = P(10), chin = P(152);
        const X = norm([l[0] - r[0], l[1] - r[1], l[2] - r[2]]);
        let up = [top[0] - chin[0], top[1] - chin[1], top[2] - chin[2]];
        const d = dot(up, X);
        up = norm([up[0] - X[0] * d, up[1] - X[1] * d, up[2] - X[2] * d]);
        const Z = cross(X, up);
        const s = Math.hypot(l[0] - r[0], l[1] - r[1], l[2] - r[2]);
        if (!(s > 1e-4)) return null;
        const o = [(r[0] + l[0]) / 2, (r[1] + l[1]) / 2, (r[2] + l[2]) / 2];
        // a point in the face's frame, in eye-corner widths
        const F = (i) => { const p = P(i), v = [p[0] - o[0], p[1] - o[1], p[2] - o[2]]; return [dot(v, X) / s, dot(v, up) / s, dot(v, Z) / s]; };
        const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
        const m = this._m;
        // the eyes
        const rO = F(33), rI = F(133), rU = F(159), rD = F(145), lO = F(263), lI = F(362), lU = F(386), lD = F(374);
        m.openR = dist(rU, rD) / Math.max(1e-3, dist(rO, rI));
        m.openL = dist(lU, lD) / Math.max(1e-3, dist(lO, lI));
        // the brows over the upper lids
        const browY = (ids) => ids.reduce((a, i) => a + F(i)[1], 0) / ids.length;
        m.browR = browY(BROW_R) - rU[1];
        m.browL = browY(BROW_L) - lU[1];
        m.inR = F(107)[1] - rU[1]; m.inL = F(336)[1] - lU[1];
        m.knit = dist(F(107), F(336));
        // the mouth
        const cR = F(61), cL = F(291), mu = F(13), md = F(14);
        m.jaw = dist(mu, md);
        m.width = dist(cR, cL);
        const midY = (mu[1] + md[1]) / 2;
        m.smR = cR[1] - midY; m.smL = cL[1] - midY;
        m.lip = dist(F(0), F(2));
        // the irises (refined points; without them the eyes look ahead)
        let gx = 0, gy = 0;
        if (lm.length >= 478) {
            const iR = F(468), iL = F(473);
            const ex = (iR[0] - (rO[0] + rI[0]) / 2) / Math.max(1e-3, dist(rO, rI)) + (iL[0] - (lO[0] + lI[0]) / 2) / Math.max(1e-3, dist(lO, lI));
            const ey = (iR[1] - (rU[1] + rD[1]) / 2) / Math.max(1e-3, dist(rO, rI)) + (iL[1] - (lU[1] + lD[1]) / 2) / Math.max(1e-3, dist(lO, lI));
            gx = -ex * 2.2; gy = ey * 2.6;
        }
        const roll = Math.atan2(l[1] - r[1], l[0] - r[0]);
        // the neutral face: learnt slowly, only from pictures near it (the open eyes: from the open ones)
        const dt = this._t == null ? 0.05 : clamp(t - this._t, 0, 0.5);
        this._t = t;
        if (!this.base) this.base = { openR: m.openR, openL: m.openL, browR: m.browR, browL: m.browL, inR: m.inR, inL: m.inL, knit: m.knit, jaw: Math.min(m.jaw, 0.05), width: m.width, smR: Math.min(m.smR, 0), smL: Math.min(m.smL, 0), lip: m.lip }; // (a face smiling from the first picture: its calm corners are not that high)
        const b = this.base, k = 1 - Math.exp(-dt / 6);
        const learn = (key, band) => { if (Math.abs(m[key] - b[key]) < band) b[key] += (m[key] - b[key]) * k; };
        for (const [key, band] of [['browR', 0.05], ['browL', 0.05], ['inR', 0.05], ['inL', 0.05], ['knit', 0.05], ['width', 0.06], ['smR', 0.03], ['smL', 0.03], ['lip', 0.04]]) learn(key, band);
        if (m.jaw < b.jaw + 0.03) b.jaw += (m.jaw - b.jaw) * k;
        for (const key of ['openR', 'openL']) if (m[key] > b[key] * 0.75) b[key] += (m[key] - b[key]) * k * 2;
        // the numbers
        const f = this.out, ease = 1 - Math.exp(-dt / 0.05);
        const set = (key, v) => { f[key] += (v - f[key]) * ease; };
        const blink = (open, base) => clamp(1 - (open - base * 0.25) / Math.max(1e-3, base * 0.75), 0, 1);
        set('blinkR', blink(m.openR, b.openR));
        set('blinkL', blink(m.openL, b.openL));
        set('browR', clamp((m.browR - b.browR) / 0.09, -1, 1));
        set('browL', clamp((m.browL - b.browL) / 0.09, -1, 1));
        const inner = ((m.inR - b.inR) + (m.inL - b.inL)) / 2 - ((m.browR - b.browR) + (m.browL - b.browL)) / 4;
        set('browIn', clamp(inner / 0.06 + (m.knit - b.knit) / 0.08, -1, 1));
        set('gazeX', clamp(gx, -1, 1));
        set('gazeY', clamp(gy, -1, 1));
        set('jaw', clamp((m.jaw - b.jaw) / 0.42, 0, 1));
        set('smileR', clamp((m.smR - b.smR) / 0.08, -1, 1));
        set('smileL', clamp((m.smL - b.smL) / 0.08, -1, 1));
        set('wide', clamp((m.width - b.width) / 0.16, -1, 1));
        set('lipUp', clamp((b.lip - m.lip) / 0.06, 0, 1));
        set('roll', clamp(roll / 0.5, -1, 1));
        set('squint', clamp(Math.max(0, (f.smileL + f.smileR) / 2) * 0.8 + Math.max(0, 0.5 - (m.openL / b.openL + m.openR / b.openR) / 2) * 0.6, 0, 1));
        return f;
    }
}

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

// ------------------------------------------------------------------ a face nobody tracks: alive anyway
/**
 * The look's face at rest (Appearance: 6 eye styles × 5 mouths) as numbers: an angry one frowns a little, a kind one
 * lifts the brows' inner ends, a happy one smiles with the eyes; the mouth smiles, rests, grins, droops, is an «о».
 */
export function restFace(lookFace = 0, out = neutralFace()) {
    const eye = lookFace % 6, mouth = Math.floor(lookFace / 6) % 5;
    for (const k of FACE_KEYS) out[k] = 0;
    if (eye === 3) { out.browIn = -0.55; out.browL = out.browR = -0.25; }
    if (eye === 4) { out.browIn = 0.35; }
    if (eye === 2) { out.squint = 0.6; out.blinkL = out.blinkR = 0.35; }
    if (eye === 5) { out.browL = out.browR = 0.2; }
    if (mouth === 0) { out.smileL = out.smileR = 0.35; }
    if (mouth === 2) { out.smileL = out.smileR = 0.7; out.jaw = 0.12; out.wide = 0.35; out.squint = Math.max(out.squint, 0.35); }
    if (mouth === 3) { out.smileL = out.smileR = -0.4; }
    if (mouth === 4) { out.jaw = 0.18; out.wide = -0.7; }
    return out;
}

/**
 * The eyes blink by themselves and glance about (every 2–6 s a blink of ~0.15 s, a small look aside now and then):
 * `idleFace(state, dt, base)` writes into state.f the base face with them.
 */
export function idleFace(st, dt, base) {
    st.t = (st.t || 0) + dt;
    st.next ??= 2 + Math.random() * 3;
    st.gaze ??= { x: 0, y: 0, tx: 0, ty: 0, at: 0 };
    if (st.t > st.next) { st.blinkT = 0; st.next = st.t + 2 + Math.random() * 4; }
    let blink = 0;
    if (st.blinkT != null) {
        st.blinkT += dt;
        const k = st.blinkT / 0.16;
        blink = k < 0.4 ? k / 0.4 : k < 1 ? 1 - (k - 0.4) / 0.6 : 0;
        if (k >= 1) st.blinkT = null;
    }
    if (st.t > st.gaze.at) { st.gaze.tx = (Math.random() - 0.5) * 0.5; st.gaze.ty = (Math.random() - 0.5) * 0.25; st.gaze.at = st.t + 1 + Math.random() * 3; }
    const g = st.gaze, kk = 1 - Math.exp(-dt / 0.06);
    g.x += (g.tx - g.x) * kk; g.y += (g.ty - g.y) * kk;
    const f = st.f || (st.f = neutralFace());
    for (const k of FACE_KEYS) f[k] = base[k];
    f.blinkL = Math.max(f.blinkL, blink); f.blinkR = Math.max(f.blinkR, blink);
    f.gazeX += g.x; f.gazeY += g.y;
    return f;
}
