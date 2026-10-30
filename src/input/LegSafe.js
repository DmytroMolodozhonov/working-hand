/**
 * LegSafe.js — what the camera may say about the legs, made safe before it is drawn or sent.
 * The camera gives a leg only as «lifted this much» (0…1) and «heel kicked up»; a stranger's number (a bad packet, a camera
 * guessing the legs it cannot see) must never bend a knee backwards or throw a thigh round: the knee bends one way only
 * (0…150°), the thigh stays within ±100° of the body, and one frame cannot jump the leg by more than 60°.
 * Pure (Node-testable).
 */

export const LEG_SAFE = {
    RAISE_MAX: 1, // 0…1 (RealisticBody turns it into ≤ 74° of thigh and ≤ 92° of knee)
    JUMP_RAD: Math.PI / 3, // one frame moves the leg this far at most (60°)
    THIGH_K: 1.3, // rad of thigh per 1.0 of raise (RealisticBody)
    FADE_S: 0.3, // s to blend between «the animation» and «the camera»
    KNEE_MAX: 150 * Math.PI / 180,
    THIGH_MAX: 100 * Math.PI / 180,
    LOG_GAP: 1, // s between two journal lines
};

const num = (v) => (Number.isFinite(+v) ? +v : 0);

/** One raise: a number in 0…1, whatever came. */
export function safeRaise(v) {
    return Math.max(0, Math.min(LEG_SAFE.RAISE_MAX, num(v)));
}

/** {l, lh, r, rh} from anywhere: raises clamped, heels booleans, null stays null. */
export function safeLegs(L) {
    if (!L || typeof L !== 'object') return null;
    return { l: safeRaise(L.l), lh: !!L.lh, r: safeRaise(L.r), rh: !!L.rh };
}

/**
 * The raise a frame later: a jump bigger than 60° of thigh in one frame is a flicker — kept as it was (a real lift goes
 * on over several frames and gets through). `held` counts the frames a jump is kept so a real fast change wins at the 3rd.
 */
export function slewRaise(prev, next, state = {}) {
    const lim = LEG_SAFE.JUMP_RAD / LEG_SAFE.THIGH_K;
    next = safeRaise(next);
    if (Math.abs(next - prev) <= lim) { state.held = 0; return next; }
    state.held = (state.held || 0) + 1;
    if (state.held >= 3) { state.held = 0; return next; }
    return prev;
}

/** The knee and the thigh angles the raise asks for (RealisticBody: kneeFlex = raise·1.6, thigh = raise·1.3), clamped. */
export function legAngles(raise) {
    const r = safeRaise(raise);
    return {
        knee: Math.min(LEG_SAFE.KNEE_MAX, r * 1.6),
        thigh: Math.min(LEG_SAFE.THIGH_MAX, r * LEG_SAFE.THIGH_K),
    };
}

/**
 * The legs of one hero between the camera and the body: clamps, throws away a one-frame flicker, and says (once a second
 * at most) what it did — `log(line)` goes to the journal under «Ноги».
 */
export class LegFilter {
    constructor(log = null) { this.prev = { l: 0, r: 0 }; this.st = { l: {}, r: {} }; this.log = log; this._t = 0; }

    /** @param {object|null} lg the reader's legs ({seen, hipsOnly, left:{up, raise, heel}, right}) @returns {{l, lh, r, rh}|null} */
    step(lg, dt = 1 / 60) {
        this._t = Math.max(0, this._t - dt);
        if (!lg || !lg.seen) { this.prev.l = this.prev.r = 0; return null; } // (legs not in the picture: no camera legs — the walk's animation)
        const raw = { l: lg.left?.up ? lg.left.raise : 0, r: lg.right?.up ? lg.right.raise : 0 };
        const out = { l: slewRaise(this.prev.l, raw.l, this.st.l), r: slewRaise(this.prev.r, raw.r, this.st.r), lh: !!lg.left?.heel, rh: !!lg.right?.heel };
        const bad = out.l !== safeRaise(raw.l) || out.r !== safeRaise(raw.r) || raw.l !== safeRaise(raw.l) || raw.r !== safeRaise(raw.r);
        if (bad && this._t <= 0 && this.log) {
            this._t = LEG_SAFE.LOG_GAP;
            this.log(`ноги: камера ${lg.hipsOnly ? 'видит до бёдер' : 'видит ноги'}, подъём л/п ${raw.l.toFixed(2)}/${raw.r.toFixed(2)}, применено ${out.l.toFixed(2)}/${out.r.toFixed(2)}`);
        }
        this.prev.l = out.l; this.prev.r = out.r;
        return out;
    }
}

/** A line to the journal (settings → «Журнал», tag «Ноги») and the console; never on the screen. */
export function legLog(line) {
    try { console.info('[Ноги]', line); } catch (_) { /* ignore */ }
    try {
        if (typeof fetch !== 'function' || typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return;
        fetch('/api/gamelog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag: 'Ноги', line: String(line) }) }).catch(() => {});
    } catch (_) { /* ignore */ }
}
