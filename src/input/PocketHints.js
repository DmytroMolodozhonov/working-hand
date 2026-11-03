/**
 * PocketHints.js — the quiet hint in the camera's window (bottom right): where the body's «pockets» are, as the
 * camera sees the player — the things' pocket (the coins are taken there too) and the wand at the belt — so one can
 * check WHERE to put the hand. Clearly seen (the author: «видно очень плохо, почти не видно»): bright outlined marks, no
 * words (the author: «подписывать не нужно, достаточно значка») - PocketHintsDraw.js; the places
 * follow the player's body in the picture (shoulders and hips of the pose), they are not fixed on the screen.
 *
 * Only the rules are here (pure, no canvas): the places from the pose, the one place the hand is nearest to,
 * the soft fade in and out. The picture is drawn by PocketHintsDraw.js. The centres are the middles of the zones the
 * game really reads (PoseInterpreter: OFF_POCKET, BELT_AT), so a hand on the hint is a hand in the zone.
 *
 * A right-hander: the things' pocket (and the coins) on the right half of the belt (the LEFT hand reaches across to
 * them), the wand in front of the belly a little to the left (the RIGHT hand takes it). A left-hander: all mirrored.
 * The numbers are in torso heights (shoulder → hip), so the distance to the camera does not matter.
 */
import { OFF_POCKET, OFF_POCKET_DY, BELT_AT, beltHips } from './PoseInterpreter.js';

/** The middles of the places, torso heights: `out` — outwards of the leading hand's hip (the pocket - the coins too: one place), `u` — towards the person's other side from the hips' middle (the wand); `dy` — below the hip line. */
export const HINT_AT = {
    pocket: { out: (OFF_POCKET[0] + OFF_POCKET[1]) / 2, dy: (OFF_POCKET_DY[0] + OFF_POCKET_DY[1]) / 2 },
    wand: { u: (BELT_AT.u[0] + BELT_AT.u[1]) / 2, dy: (BELT_AT.dy[0] + BELT_AT.dy[1]) / 2 },
};
/** The hand is «going to» a place when it is nearer than this (torso heights); the glow grows as it comes. */
export const REACH = 0.5;
/** The icon at most this share of the window's height (the author: small, not loud), and at most this share of the torso's height. */
export const ICON_H = 0.09;
export const ICON_T = 0.3;
/** Below this many pixels an icon is not drawn at all (the window is tiny): only the small rings. */
export const ICON_MIN_PX = 10;
/** See-through: the usual and the nearest-to-the-hand level (the author: ~35–50 %, a little more where the hand goes). */
// (the author: «видно очень плохо, почти не видно» - now solid enough to read at a glance over the skeleton)
export const ALPHA = { base: 0.85, near: 1, shut: 0.45, empty: 0.7 };

// (no mark of its own for the coin pouch: it is taken at the things' place - the author: «сам значок отрисовывать не нужно»)
export const IDS = ['pocket', 'wand'];
const MIN_VIS = 0.5;

const vis = (p) => (p?.visibility ?? 1);

/**
 * The places in the picture's own coordinates (0…1) from the pose's points. Fills `out`
 * ({pocket:{x,y}, wand:{x,y}, T}) and says whether the body is seen well enough: shoulders and hips seen,
 * the torso upright enough (lying, bent right over, upside down — nothing). No allocations.
 */
export function placesFrom(out, lm, leftHanded = false, aspect = 4 / 3) {
    if (!lm || lm.length < 25) return false;
    // (the leading hand's side: a right-hander's right hip is point 24, a left-hander's — 23; the shoulders mirror likewise)
    const hp = beltHips(lm, aspect);
    const hip = leftHanded ? hp?.lh : hp?.rh, hipO = leftHanded ? hp?.rh : hp?.lh;
    const shO = lm[leftHanded ? 12 : 11], shL = lm[leftHanded ? 11 : 12];
    if (!hip || !hipO || !shO || !shL) return false;
    if (vis(shO) < MIN_VIS || vis(shL) < MIN_VIS) return false;
    const mx = (hip.x + hipO.x) / 2, my = (hip.y + hipO.y) / 2;
    const sx = (shO.x + shL.x) / 2, sy = (shO.y + shL.y) / 2;
    // (each place measured as the game reads it: the pocket and the pouch as offHip - the other hand's shoulder to the leading
    // hip; the wand as beltPose - the leading shoulder to the hips' middle; with the camera's own picture shape `aspect`)
    const T = hip.y - shO.y, Tw = my - shL.y;
    if (!(T > 0.05) || !(Tw > 0.05)) return false;
    // upright: the torso's slant from the vertical at most ~55° (sitting up, leaning — yes; lying — no)
    const lean = Math.abs((mx - sx) * aspect), down = my - sy;
    if (down <= 0.05 || lean > down * 1.4) return false;
    const sgn = leftHanded ? -1 : 1;
    // (outwards of the leading hip is the picture's left for a right-hander: x = hip.x − out·T/aspect)
    out.pocket.x = hip.x - sgn * HINT_AT.pocket.out * T / aspect;
    out.pocket.y = hip.y + HINT_AT.pocket.dy * T;
    out.wand.x = mx + sgn * HINT_AT.wand.u * Tw / aspect;
    out.wand.y = my + HINT_AT.wand.dy * Tw;
    out.T = T;
    return true;
}

/** How near a wrist is to a place, torso heights (the picture's aspect is in the x). */
export const reachDist = (wr, p, T, aspect = 4 / 3) => Math.hypot((wr.x - p.x) * aspect, wr.y - p.y) / T;

const mk = () => ({ x: 0, y: 0, tx: 0, ty: 0, a: 0, glow: 0, shown: false });

/**
 * The hints over time: smooth places, the fade in and out, one glowing place. One per camera window.
 * `step(dt, lm, info)` → true while anything should be drawn; then `items` (pocket, wand) are ready.
 * `info`: {on, leftHanded, shut, wand (is on the belt), aspect}.
 */
export class PocketHints {
    constructor() {
        this.items = { pocket: mk(), wand: mk() };
        this._pl = { pocket: { x: 0, y: 0 }, wand: { x: 0, y: 0 }, T: 0 };
        this.T = 0;
        this.k = 0; // (how much of it is shown: 0…1)
        this.shut = false;
        this.near = null; // (the place the hand is going to: 'pocket' | 'wand' | null)
        this._lastLeft = false;
    }

    step(dt, lm, info) {
        dt = Math.max(0, Math.min(0.2, dt || 0));
        const I = this.items, P = this._pl;
        const aspect = info?.aspect || 4 / 3;
        const ok = !!(info && info.on) && placesFrom(P, lm, !!info.leftHanded, aspect);
        // fade: in over 0.3 s, out over 0.35 s (the pose lost, the camera off, the body not seen — it never blinks away)
        this.k = ok ? Math.min(1, this.k + dt / 0.3) : Math.max(0, this.k - dt / 0.35);
        if (!ok) { this.near = null; for (const id of IDS) I[id].glow = 0; this.shut = !!info?.shut; return this.k > 0.01; }
        if (!!info.leftHanded !== this._lastLeft) { this._lastLeft = !!info.leftHanded; for (const id of IDS) I[id].shown = false; } // (the hand changed: the places jump, not slide across the body)
        this.shut = !!info.shut;
        this.T = P.T;
        const want = this._want || (this._want = { pocket: true, wand: false });
        want.wand = !!info.wand;
        // the hand that goes to a place: the other hand to the pocket, the leading one to the wand
        const off = lm[info.leftHanded ? 16 : 15], dom = lm[info.leftHanded ? 15 : 16];
        let best = null, bd = REACH;
        if (!this.shut) {
            for (const id of IDS) {
                if (!want[id]) continue;
                const wr = id === 'wand' ? dom : off;
                if (!wr || vis(wr) < 0.3) continue;
                const d = reachDist(wr, P[id], P.T, aspect);
                if (d < bd) { bd = d; best = id; }
            }
        }
        this.near = best;
        const kp = Math.min(1, dt * 14), kg = Math.min(1, dt * 8);
        for (const id of IDS) {
            const it = I[id];
            it.tx = P[id].x; it.ty = P[id].y;
            if (!it.shown) { it.x = it.tx; it.y = it.ty; it.shown = true; } else { it.x += (it.tx - it.x) * kp; it.y += (it.ty - it.y) * kp; }
            const wantA = !want[id] ? 0 : this.shut ? ALPHA.shut : ALPHA.base;
            const g = id === best ? 1 - bd / REACH : 0;
            it.glow += (g - it.glow) * kg;
            const target = wantA + (ALPHA.near - wantA) * it.glow;
            it.a += (target - it.a) * kg;
        }
        return true;
    }
}

/** The size of an icon, canvas pixels: small (≤ ICON_H of the window's height and ≤ ICON_T of the torso's), 0 — too small to draw. */
export function iconPx(H, T) {
    const px = Math.min(ICON_H * H, ICON_T * T * H);
    return px >= ICON_MIN_PX ? px : 0;
}
