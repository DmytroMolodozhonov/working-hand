/**
 * StickDetector.js — a real stick in the hand, found in the browser (when the camera
 * program pose_native.py with stick_detect.py isn't there).
 *
 * From the grip (between the thumb and the index finger) rays go out every few
 * degrees; along each, past the hand (beyond every one of its 21 points), a thin
 * thing shows as a line of pixels that differ from both their sides the same way
 * (darker or lighter than the background on both sides: a bar, not an edge). The ray
 * whose bar runs on furthest from the hand is the stick — if it runs past the hand
 * by more than half a palm, and not back along the forearm. The same answer as
 * stick_detect.py: {dir: [dx, dy] (picture pixels, from the hand to the tip), out
 * (palm sizes past the hand), conf 0…1}. Pure: works on a grey picture (Uint8 array).
 */

const MIN_OUT = 0.6; // palm sizes past the hand
const REACH = 2.8; // how far past the hand to look (palm sizes)

/** The picture's grey value at (x, y) (bilinear; −1 outside). */
function grey(g, W, H, x, y) {
    if (x < 0 || y < 0 || x > W - 2 || y > H - 2) return -1;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * W + x0;
    return (g[i] * (1 - fx) + g[i + 1] * fx) * (1 - fy) + (g[i + W] * (1 - fx) + g[i + W + 1] * fx) * fy;
}

/**
 * @param {Uint8Array|Uint8ClampedArray} g  grey picture, W×H
 * @param {Array<{x,y}>} hand  the 21 points in this picture's pixels
 * @returns {{dir: number[], out: number, conf: number}|null}
 */
export function detectStick(g, W, H, hand, { contrast = 14 } = {}) {
    if (!hand || hand.length < 21) return null;
    const d = (a, b) => Math.hypot(hand[a].x - hand[b].x, hand[a].y - hand[b].y);
    const palm = d(0, 9) + 0.5 * d(5, 17);
    if (!(palm >= 12)) return null;
    let gx = 0, gy = 0;
    for (const i of [2, 3, 4, 5, 6]) { gx += hand[i].x / 5; gy += hand[i].y / 5; }
    const fx = hand[9].x - hand[0].x, fy = hand[9].y - hand[0].y, fl = Math.hypot(fx, fy) || 1;
    const side = Math.max(3, palm * 0.16); // (the bar's sides: just past a pen's or a brush's edge)
    const step = Math.max(1.5, palm * 0.05);

    const scan = (ang) => {
        const dx = Math.sin(ang), dy = -Math.cos(ang), nx = -dy, ny = dx;
        // past the hand along this ray
        let r0 = 0;
        for (const p of hand) r0 = Math.max(r0, (p.x - gx) * dx + (p.y - gy) * dy);
        r0 += palm * 0.08;
        let run = 0, miss = 0, sign = 0, sum = 0;
        for (let r = r0; r < r0 + REACH * palm; r += step) {
            const x = gx + dx * r, y = gy + dy * r;
            const c = grey(g, W, H, x, y), a = grey(g, W, H, x + nx * side, y + ny * side), b = grey(g, W, H, x - nx * side, y - ny * side);
            if (c < 0 || a < 0 || b < 0) break;
            const da = c - a, db = c - b;
            const resp = Math.sign(da) === Math.sign(db) ? Math.min(Math.abs(da), Math.abs(db)) : 0;
            const s = Math.sign(da);
            if (resp > contrast && (!sign || s === sign)) { sign = s; run = r - r0 + step; miss = 0; sum += resp; }
            else if (++miss * step > palm * 0.2) break; // (a gap longer than a fifth of a palm: it ended)
        }
        return { run, dx, dy, sum };
    };

    let best = null;
    for (let deg = 0; deg < 360; deg += 3) {
        const ang = deg * Math.PI / 180;
        const s = scan(ang);
        if (!best || s.run > best.run || (s.run === best.run && s.sum > best.sum)) best = { ...s, ang };
    }
    if (!best || best.run < MIN_OUT * palm) return null;
    // finer, round the best
    for (let k = -2.5; k <= 2.5; k += 0.5) {
        const ang = best.ang + k * Math.PI / 180;
        const s = scan(ang);
        if (s.run > best.run || (s.run >= best.run * 0.97 && s.sum > best.sum)) best = { ...s, ang };
    }
    // not the forearm
    if ((best.dx * fx + best.dy * fy) / fl < -0.3) return null;
    const out = best.run / palm;
    const conf = Math.max(0, Math.min(1, 0.35 + 0.25 * (out - MIN_OUT) + 0.15));
    return { dir: [best.dx, best.dy], out, len: out, conf };
}
