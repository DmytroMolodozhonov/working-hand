/**
 * Synthetic camera results (what the vision worker would output) so tests can
 * drive the player's body and hands deterministically.
 * Image coordinates: x→right, y→down, the person faces the camera (not mirrored),
 * so the person's LEFT side appears on the image RIGHT.
 */

let _seed = 12345;
const rnd = () => ((_seed = (_seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

export function hand(wx, wy, { size = 0.09, curl = 0, rot = 0, tilt = 0, bend = 0, mirror = false, back = false } = {}) {
    const lm = [{ x: wx, y: wy, z: 0 }];
    // (a left hand, its palm to the camera: the thumb on the picture's left; `mirror` — a right hand)
    const bases = [[-0.35, -0.25], [-0.2, -0.85], [0, -0.9], [0.18, -0.85], [0.33, -0.75]].map(([x, y]) => [mirror ? -x : x, y]);
    const lens = [0.45, 0.75, 0.82, 0.75, 0.6];
    bases.forEach(([bx, by], f) => {
        const mx = wx + bx * size, my = wy + by * size;
        const L = (lens[f] * size) / 3;
        for (let j = 0; j < 4; j++) {
            if (j === 0) { lm.push({ x: mx, y: my, z: 0 }); continue; }
            const prev = lm[lm.length - 1];
            const fold = f === 0 ? curl * 0.6 : curl;
            // folded fingers come back down towards the wrist
            const ang = fold * Math.PI * 0.62 * j;
            lm.push({ x: prev.x, y: prev.y - L * Math.cos(ang), z: (back ? 1 : -1) * L * Math.sin(ang) }); // (`back`: the back of the hand to the camera — the fingers fold away from it)
        }
    });
    // the fingers tipped towards the camera (tilt rad round the wrist: the hand along an arm pointing at it)
    if (tilt) {
        const c = Math.cos(tilt), s = Math.sin(tilt);
        for (const p of lm) { const y = p.y - wy, z = p.z; p.y = wy + y * c - z * s; p.z = z * c + y * s; }
    }
    // the wrist bent to the little finger's side (+) / the thumb's (−), bend rad: as the camera sees
    // it with the arm pointing at it, the whole hand slides along the knuckle line from the wrist
    if (bend) {
        const ix = lm[5].x, iy = lm[5].y, px = lm[17].x, py = lm[17].y, L = Math.hypot(px - ix, py - iy);
        const d = 1.1 * L * Math.sin(bend);
        for (let k = 1; k < lm.length; k++) { lm[k].x += (px - ix) / L * d; lm[k].y += (py - iy) / L * d; }
    }
    // the hand bent aside at the wrist (in the picture's plane): rot rad round the wrist
    if (rot) {
        const c = Math.cos(rot), s = Math.sin(rot);
        for (const p of lm) { const x = p.x - wx, y = p.y - wy; p.x = wx + x * c - y * s; p.y = wy + x * s + y * c; }
    }
    return lm;
}

/**
 * @param {object} o
 *   arms: 'forward' | 'down' | 'up' | 'hang'
 *   raise: degrees — both arms lifted sideways this far from hanging (overrides `arms`)
 *   archer: 'left' | 'right' — the bow arm stretched at the camera; draw: 0 (the other hand
 *     at the bow) … 1 (drawn back to the chin), null (that arm hangs)
 *   windup: 'left' | 'right' — that hand drawn back for a throw: up by the head, the elbow out,
 *     the wrist behind the shoulder (the camera sees it further away)
 *   leftCurl / rightCurl: 0 open … 1 fist, null = hand not detected
 *   palmsIn: the palms towards the person (the camera sees the backs of the hands — as when holding a book)
 *   noseY: 0.25 standing, 0.6 crouching
 *   bob: shoulder vertical offset (for running animation)
 *   legs: {left, right}: 'stand' | 'up' | 'heel' | 'off' (opt-in; see below)
 *   scale: the person's size in the picture (< 1 further from the camera, > 1 closer: the legs
 *     go out of the picture's bottom, seen there with a low visibility, as a real camera does)
 *   jitter: a real camera's shake — every point moved randomly by up to this much (repeatable)
 */
export function frame({ arms = 'forward', raise = null, pocket = null, toMouth = null, archer = null, draw = 0, windup = null, leftCurl = 0, rightCurl = 0, leftRot = 0, rightRot = 0, leftTilt = 0, rightTilt = 0, leftBend = 0, rightBend = 0, palmsIn = false, noseY = 0.25, bob = 0, wristOffset = [0, 0], lean = 0, forward = 0, rightStick = null, leftStick = null, belt = null, purse = null, legs = null, lowLeft = false, scale = 1, jitter = 0, mirror = false } = {}) {
    // lean: + = person leans to THEIR left (image right); forward: + = shoulders towards the camera
    const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.8, z: 0, visibility: 0.95 }));
    const sh = 0.42 + bob;
    const sz = -forward;
    p[0] = { x: 0.5 + lean * 1.3, y: noseY, z: -0.4 + sz, visibility: 0.99 };
    // the mouth (its corners)
    p[9] = { x: 0.49 + lean * 1.3, y: noseY + 0.05, z: -0.4 + sz, visibility: 0.99 };
    p[10] = { x: 0.51 + lean * 1.3, y: noseY + 0.05, z: -0.4 + sz, visibility: 0.99 };
    p[11] = { x: 0.6 + lean, y: sh, z: sz, visibility: 0.99 };
    p[12] = { x: 0.4 + lean, y: sh, z: sz, visibility: 0.99 };
    let lElbow, lWrist, rElbow, rWrist;
    if (raise != null) {
        // straight arms lifted sideways by `raise` degrees from hanging (0.15 + 0.15 long)
        const a = raise * Math.PI / 180, dx = Math.sin(a) * 0.15, dy = Math.cos(a) * 0.15;
        lElbow = [0.6 + dx, sh + dy]; lWrist = [0.6 + 2 * dx, sh + 2 * dy];
        rElbow = [0.4 - dx, sh + dy]; rWrist = [0.4 - 2 * dx, sh + 2 * dy];
    } else if (arms === 'forward') {
        lElbow = [0.6, sh + 0.03]; lWrist = [0.6 + wristOffset[0], sh + 0.02 + wristOffset[1]];
        rElbow = [0.4, sh + 0.03]; rWrist = [0.4 - wristOffset[0], sh + 0.02 + wristOffset[1]];
    } else if (arms === 'hang') {
        // relaxed arms hanging at the sides (real proportions: the wrist at the hip, outside the thigh)
        lElbow = [0.64, sh + 0.18]; lWrist = [0.66, sh + 0.4];
        rElbow = [0.36, sh + 0.18]; rWrist = [0.34, sh + 0.4];
    } else if (arms === 'up') {
        lElbow = [0.64, sh - 0.12]; lWrist = [0.65, sh - 0.25];
        rElbow = [0.36, sh - 0.12]; rWrist = [0.35, sh - 0.25];
    } else {
        lElbow = [0.64, sh + 0.15]; lWrist = [0.65, sh + 0.3];
        rElbow = [0.36, sh + 0.15]; rWrist = [0.35, sh + 0.3];
    }
    // a hand put into its front trouser pocket: the wrist at the hip, the elbow bent out (the hand not seen)
    if (pocket === 'left' || pocket === 'both') { lElbow = [0.67, sh + 0.18]; lWrist = [0.58, sh + 0.37]; leftCurl = null; }
    if (pocket === 'right' || pocket === 'both') { rElbow = [0.33, sh + 0.18]; rWrist = [0.42, sh + 0.37]; rightCurl = null; }
    // a hand at the wand's place on the waistband: in front, at the person's left of the middle
    // (the right hand reaching across; the left one just in front of its hip), in front of the body
    // the right arm lowered and relaxed, a little to the left (in front of the body, straight)
    if (lowLeft) { rElbow = [0.42, sh + 0.2]; rWrist = [0.47, sh + 0.42]; }
    if (belt === 'right') { rElbow = [0.43, sh + 0.2]; rWrist = [0.525, sh + 0.31]; }
    if (belt === 'left') { lElbow = [0.62, sh + 0.2]; lWrist = [0.54, sh + 0.31]; }
    // the right hand at the coin pouches' place: on the right side of the belt, the elbow bent
    // out to the side, the fist at the waist beside the hip (not in front, not hanging)
    if (purse === 'right') { rElbow = [0.3, sh + 0.16]; rWrist = [0.345, sh + 0.28]; }
    // (or as people really do it: the fist at the belt by the hip, a little in front, the elbow bent back)
    if (purse === 'hip') { rElbow = [0.335, sh + 0.19]; rWrist = [0.4, sh + 0.35]; }
    // (the left hand reaching across to the right hip)
    // (as the author asked: the things and the pouches are taken by the OTHER hand, across the body —
    // the pouches beside the right hip, the wrist out at the body's side; the pocket in front of it)
    if (purse === 'cross') { lElbow = [0.53, sh + 0.22]; lWrist = [0.375, sh + 0.31]; }
    if (pocket === 'cross') { lElbow = [0.54, sh + 0.24]; lWrist = [0.44, sh + 0.37]; leftCurl = null; }
    // a hand brought to the mouth (eating): the elbow down in front, the hand at the mouth
    if (toMouth === 'right') { rElbow = [0.42, sh + 0.12]; rWrist = [0.485, noseY + 0.1]; }
    if (toMouth === 'left') { lElbow = [0.58, sh + 0.12]; lWrist = [0.515, noseY + 0.1]; }
    // an archer shooting at the camera: the bow arm (`archer`: its side) stretched straight at
    // the camera (seen short, by the shoulder); the other hand draws the string from the bow
    // (draw 0) back to the chin (draw 1), its elbow going out to the side at shoulder height
    // (draw null: that arm just hangs)
    let z = null;
    if (archer === 'left' || archer === 'right') {
        const m = (x) => (archer === 'left' ? x : 1 - x); // (the bow's side on the picture)
        const lerp = (a, b) => a + (b - a) * Math.max(0, Math.min(1, draw ?? 0));
        const bowE = [m(0.59), sh + 0.005], bowW = [m(0.575), sh + 0.01];
        let drawE = [m(lerp(0.49, 0.31)), sh + lerp(0.02, -0.01)], drawW = [m(lerp(0.565, 0.48)), lerp(sh + 0.01, noseY + 0.09)];
        let dz = [lerp(-0.25, 0.1), lerp(-0.45, -0.15)];
        if (draw == null) { drawE = [m(0.36), sh + 0.18]; drawW = [m(0.34), sh + 0.4]; dz = [0, 0]; }
        if (archer === 'left') { lElbow = bowE; lWrist = bowW; rElbow = drawE; rWrist = drawW; } else { rElbow = bowE; rWrist = bowW; lElbow = drawE; lWrist = drawW; }
        const bz = [-0.25, -0.5];
        z = archer === 'left' ? { le: bz[0], lw: bz[1], re: dz[0], rw: dz[1] } : { re: bz[0], rw: bz[1], le: dz[0], lw: dz[1] };
    }
    // a hand drawn back for a throw (overhand): up by the head, the elbow out to the side, behind the shoulder
    if (windup === 'right') { rElbow = [0.31, sh - 0.02]; rWrist = [0.36, sh - 0.17]; z = { le: -0.2, lw: -0.4, re: 0.08, rw: 0.22, ...(z || {}) }; }
    if (windup === 'left') { lElbow = [0.69, sh - 0.02]; lWrist = [0.64, sh - 0.17]; z = { re: -0.2, rw: -0.4, le: 0.08, lw: 0.22, ...(z || {}) }; }
    if (lean) { lElbow[0] += lean; lWrist[0] += lean; rElbow[0] += lean; rWrist[0] += lean; }
    // (raised sideways: the arm stays in the body's plane, no depth)
    const ez = raise != null ? 0 : -0.2, wz = raise != null ? 0 : -0.4;
    p[13] = { x: lElbow[0], y: lElbow[1], z: z ? z.le : ez, visibility: 0.99 };
    p[14] = { x: rElbow[0], y: rElbow[1], z: z ? z.re : ez, visibility: 0.99 };
    p[15] = { x: lWrist[0], y: lWrist[1], z: z ? z.lw : wz, visibility: 0.99 };
    p[16] = { x: rWrist[0], y: rWrist[1], z: z ? z.rw : wz, visibility: 0.99 };
    if (belt === 'right') { p[14].z = -0.15; p[16].z = -0.35; }
    if (belt === 'left') { p[13].z = -0.15; p[15].z = -0.35; }
    if (purse === 'right' || purse === 'hip') { p[14].z = 0.05; p[16].z = -0.1; }
    if (purse === 'cross' || pocket === 'cross') { p[13].z = -0.1; p[15].z = -0.3; }
    p[23] = { x: 0.57, y: 0.8, z: 0, visibility: 0.9 };
    p[24] = { x: 0.43, y: 0.8, z: 0, visibility: 0.9 };
    // legs: {left, right}: 'stand' | 'up' (the knee to the hip) | 'heel' (the foot kicked up behind) | 'off' (not seen)
    // (opt-in: without it the knees stay at the hips, as every older test had them)
    if (legs) {
        const T = 0.8 - sh;
        for (const [side, kneeI, ankleI, hx] of [['left', 25, 27, 0.57], ['right', 26, 28, 0.43]]) {
            const st = legs[side] || 'stand', vis = st === 'off' ? 0.1 : 0.95;
            const knee = st === 'up' ? { x: hx, y: 0.8 + 0.05 * T, z: -0.3 } : { x: hx, y: 0.8 + 0.5 * T, z: 0 };
            const ay = st === 'heel' ? knee.y + 0.12 * T : knee.y + 0.5 * T;
            p[kneeI] = { ...knee, visibility: vis };
            p[ankleI] = { x: hx, y: ay, z: st === 'heel' ? 0.25 : knee.z, visibility: ay < 1 ? vis : 0.3 };
        }
    }
    if (scale !== 1 || jitter) {
        const n = () => (rnd() - 0.5) * 2 * jitter;
        for (const q of p) { q.x = 0.5 + (q.x - 0.5) * scale + n(); q.y = 0.42 + (q.y - 0.42) * scale + n(); q.z *= scale; if (q.y > 1) q.visibility = Math.min(q.visibility, 0.1); }
    }
    const size = 0.09 * scale;
    const hands = [];
    if (leftCurl != null) hands.push({ landmarks: hand(p[15].x, p[15].y, { size, curl: leftCurl, rot: leftRot, tilt: leftTilt, bend: leftBend, mirror: palmsIn, back: palmsIn }), label: 'Right', score: 0.95 });
    if (rightCurl != null) hands.push({ landmarks: hand(p[16].x, p[16].y, { size, curl: rightCurl, rot: rightRot, tilt: rightTilt, bend: rightBend, mirror: !palmsIn, back: palmsIn }), label: 'Left', score: 0.95 });
    // a real stick held in the hand, as the camera program finds it (stick_detect.py):
    // `rightStick` / `leftStick`: its angle in the picture (rad, 0 = up, + = towards the picture's right)
    // or {angle, out, conf}
    const sticks = [];
    for (const [st, w] of [[rightStick, p[16]], [leftStick, p[15]]]) {
        if (st == null) continue;
        const o = typeof st === 'number' ? { angle: st } : st;
        sticks.push({ wrist: [w.x, w.y], dir: [Math.sin(o.angle), -Math.cos(o.angle)], out: o.out ?? 2.5, len: (o.out ?? 2.5) + 1, conf: o.conf ?? 0.9 });
    }
    // `mirror`: the same person seen in a mirror — a left-hander doing what a right-hander does
    // (x → 1 − x, the left and the right points and hands swapped)
    if (mirror) {
        for (const q of p) q.x = 1 - q.x;
        for (const [i, j] of [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]]) [p[i], p[j]] = [p[j], p[i]];
        for (const h of hands) { for (const q of h.landmarks) q.x = 1 - q.x; h.label = h.label === 'Right' ? 'Left' : 'Right'; }
    }
    return { poseLandmarks: p, hands, faceLandmarks: undefined, cost: 5, ...(sticks.length ? { sticks } : {}) };
}

/** Feed `count` frames (~30 FPS) into the page. */
export async function feed(page, opts, count = 10, intervalMs = 33) {
    for (let i = 0; i < count; i++) {
        const f = frame(typeof opts === 'function' ? opts(i) : opts);
        await page.evaluate((raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); }, f);
        if (intervalMs) await new Promise((r) => setTimeout(r, intervalMs));
    }
}
