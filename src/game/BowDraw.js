/**
 * BowDraw.js — the drawing hand on a bow's string (pure logic: the game feeds
 * what the camera sees each frame; tests feed it noisy poses).
 *
 * As with a real bow: the fingers close on the string at the bow (the hand by
 * the bow fist) — the string is taken; the hand goes back towards the chin and
 * the string follows it all the way (how far it is drawn = how far the hand went
 * from where it took the string to the anchor at the chin). The fingers open —
 * the arrow flies, as strong as it was drawn. The hand brought forward again
 * lets the string down; opening it then (hardly drawn) shoots nothing.
 *
 * The camera is noisy: the drawn amount is smoothed, a moment of open fingers is
 * not a release (they must stay open a little), and a hand the camera loses (by
 * the face) never lets go — it keeps the string as it was.
 */

/** Fingers closed on the string (the grip curl, 0 open … 1 fist). */
export const PINCH = 0.5;
/** Fingers opened: let go. */
export const OPEN = 0.3;
/** How long the fingers must stay open to let go (s): a flicker of the tracking is not a shot. */
export const OPEN_HOLD = 0.1;
/** Drawn less than this the string just goes back: no shot. */
export const MIN_SHOT = 0.15;
/** At this part of the way to the chin the bow is fully drawn (nobody has to touch the chin exactly). */
export const FULL_AT = 0.85;
/** The string can be taken only with the hand at the bow (this little of the way to the chin). */
export const TAKE_BELOW = 0.4;
/** Smoothing of the drawn amount (s). */
const TAU = 0.07;
/** The shot's power: the most it was drawn this long before the fingers opened (s). */
const PEAK_WINDOW = 0.2;

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export class BowDraw {
    constructor() { this.reset(); }

    reset() {
        this.held = false; // the fingers hold the string
        this.draw = 0; // 0 … 1, smoothed
        this.p0 = 0; // where the string was taken (part of the way to the chin)
        this.open = 0; // how long the fingers have been open (s)
        this.t = 0;
        this.recent = []; // [t, draw] of the last moments
    }

    /** The most it was drawn in the last moments (the shot's power). */
    peak() {
        let m = this.draw;
        for (const [t, d] of this.recent) if (this.t - t <= PEAK_WINDOW) m = Math.max(m, d);
        return m;
    }

    /**
     * One frame.
     * @param {object} f
     * @param {number|null} f.progress  the drawing hand's way from the bow to the chin (0 at the bow … 1 at the chin); null: not known
     * @param {boolean} [f.take]         the hand is where it can take the string (at the bow, not by the chin); default: near and little of the way
     * @param {boolean} f.near           the hand is at the bow (it can take the string)
     * @param {number|null} f.curl       the drawing fingers (0 open … 1 closed); null: the camera does not see the hand
     * @param {number} dt
     * @returns {null|{type:'take'}|{type:'shoot', power:number}|{type:'letdown'}}
     */
    step(f, dt) {
        this.t += dt;
        const seen = f.curl != null;
        if (!this.held) {
            // (the string goes back by itself, quickly)
            this.draw = Math.max(0, this.draw - dt * 6);
            const take = f.take ?? (f.near && (f.progress == null || f.progress < TAKE_BELOW));
            if (seen && f.curl > PINCH && take) {
                this.held = true;
                // (from where the string is taken: a camera's steady bias in depth is not a draw)
                this.p0 = Math.min(0.6, Math.max(0, f.progress ?? 0));
                this.open = 0;
                this.recent.length = 0;
                return { type: 'take' };
            }
            return null;
        }
        // held: the string follows the hand, from where it was taken to the chin
        if (f.progress != null) {
            const raw = clamp01((f.progress - this.p0) / Math.max(0.3, FULL_AT - this.p0));
            this.draw += (raw - this.draw) * (1 - Math.exp(-dt / TAU));
        }
        this.recent.push([this.t, this.draw]);
        while (this.recent.length && this.t - this.recent[0][0] > PEAK_WINDOW) this.recent.shift();
        // a hand the camera does not see keeps the string as it was
        if (!seen) { this.open = 0; return null; }
        this.open = f.curl < OPEN ? this.open + dt : 0;
        if (this.open < OPEN_HOLD) return null;
        const power = this.peak();
        this.held = false;
        this.open = 0;
        this.recent.length = 0;
        if (power >= MIN_SHOT) { this.draw = 0; return { type: 'shoot', power }; }
        return { type: 'letdown' };
    }
}

/**
 * Where the drawing hand is on its way from the bow to the chin. The camera's
 * picture shows it well when the bow fist is away from the face in the picture
 * (an archer standing sideways, or the bow held out to one side); an arm pointed
 * at the camera is seen short — the bow fist comes out close to the face and the
 * way back goes mostly in depth, which only the hero's 3D arms show: the less
 * room the picture has, the more the 3D way counts (whichever shows more).
 * @param {object|null} pic  picture points (x already times the picture's aspect): {hand, bow, anchor, sw}
 * @param {number|null} dist3  the drawing hand's 3D distance from the bow's grip (m)
 * @returns {{progress:number|null, near:boolean, take:boolean}}
 *   progress: the way (0 at the bow … 1 at the chin); near: the hand at the bow (an arrow goes on the
 *   string); take: there the fingers can take the string (never by the chin: in the picture a bow fist
 *   seen short may be close to the face, but the hand by the chin is far along the way from it)
 */
export function drawProgress(pic, dist3) {
    let pp = null, nearPic = false, room = 1;
    if (pic && pic.hand && pic.bow && pic.sw > 1e-3) {
        const hx = pic.hand.x - pic.bow.x, hy = pic.hand.y - pic.bow.y;
        nearPic = Math.hypot(hx, hy) / pic.sw < 0.45;
        if (pic.anchor) {
            let ux = pic.anchor.x - pic.bow.x, uy = pic.anchor.y - pic.bow.y;
            const L = Math.hypot(ux, uy);
            if (L > 1e-4) {
                ux /= L; uy /= L;
                // (a bow fist right by the face in the picture: the way is never counted shorter than this)
                pp = (hx * ux + hy * uy) / Math.max(L, 0.4 * pic.sw);
                room = L / pic.sw;
            }
        }
    }
    // the 3D arms: the hand by the bow fist ~0.6 m from its grip, drawn to the chin ~1.15 m
    const p3 = dist3 == null ? null : (dist3 - 0.6) / 0.55;
    let progress;
    if (pp == null) progress = p3;
    else if (p3 == null) progress = pp;
    else {
        const w = Math.max(0, Math.min(1, (0.7 - room) / 0.4));
        progress = Math.max(pp, pp + (p3 - pp) * w);
    }
    const near3 = dist3 != null && dist3 < 0.8;
    return { progress, near: nearPic || near3, take: (nearPic && (pp == null || pp < TAKE_BELOW)) || (dist3 != null && dist3 < 0.7) };
}
