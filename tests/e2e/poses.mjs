/**
 * Synthetic camera results (what the vision worker would output) so tests can
 * drive the player's body and hands deterministically.
 * Image coordinates: x→right, y→down, the person faces the camera (not mirrored),
 * so the person's LEFT side appears on the image RIGHT.
 */

export function hand(wx, wy, { size = 0.09, curl = 0, rot = 0, tilt = 0, mirror = false } = {}) {
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
            lm.push({ x: prev.x, y: prev.y - L * Math.cos(ang), z: -L * Math.sin(ang) });
        }
    });
    // the fingers tipped towards the camera (tilt rad round the wrist: the hand along an arm pointing at it)
    if (tilt) {
        const c = Math.cos(tilt), s = Math.sin(tilt);
        for (const p of lm) { const y = p.y - wy, z = p.z; p.y = wy + y * c - z * s; p.z = z * c + y * s; }
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
 *   arms: 'forward' | 'down' | 'up'
 *   raise: degrees — both arms lifted sideways this far from hanging (overrides `arms`)
 *   leftCurl / rightCurl: 0 open … 1 fist, null = hand not detected
 *   noseY: 0.25 standing, 0.6 crouching
 *   bob: shoulder vertical offset (for running animation)
 */
export function frame({ arms = 'forward', raise = null, pocket = null, toMouth = null, leftCurl = 0, rightCurl = 0, leftRot = 0, rightRot = 0, leftTilt = 0, rightTilt = 0, noseY = 0.25, bob = 0, wristOffset = [0, 0], lean = 0, forward = 0 } = {}) {
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
    // a hand brought to the mouth (eating): the elbow down in front, the hand at the mouth
    if (toMouth === 'right') { rElbow = [0.42, sh + 0.12]; rWrist = [0.485, noseY + 0.1]; }
    if (toMouth === 'left') { lElbow = [0.58, sh + 0.12]; lWrist = [0.515, noseY + 0.1]; }
    if (lean) { lElbow[0] += lean; lWrist[0] += lean; rElbow[0] += lean; rWrist[0] += lean; }
    // (raised sideways: the arm stays in the body's plane, no depth)
    const ez = raise != null ? 0 : -0.2, wz = raise != null ? 0 : -0.4;
    p[13] = { x: lElbow[0], y: lElbow[1], z: ez, visibility: 0.99 };
    p[14] = { x: rElbow[0], y: rElbow[1], z: ez, visibility: 0.99 };
    p[15] = { x: lWrist[0], y: lWrist[1], z: wz, visibility: 0.99 };
    p[16] = { x: rWrist[0], y: rWrist[1], z: wz, visibility: 0.99 };
    p[23] = { x: 0.57, y: 0.8, z: 0, visibility: 0.9 };
    p[24] = { x: 0.43, y: 0.8, z: 0, visibility: 0.9 };
    const hands = [];
    if (leftCurl != null) hands.push({ landmarks: hand(p[15].x, p[15].y, { curl: leftCurl, rot: leftRot, tilt: leftTilt }), label: 'Right', score: 0.95 });
    if (rightCurl != null) hands.push({ landmarks: hand(p[16].x, p[16].y, { curl: rightCurl, rot: rightRot, tilt: rightTilt, mirror: true }), label: 'Left', score: 0.95 });
    return { poseLandmarks: p, hands, faceLandmarks: undefined, cost: 5 };
}

/** Feed `count` frames (~30 FPS) into the page. */
export async function feed(page, opts, count = 10, intervalMs = 33) {
    for (let i = 0; i < count; i++) {
        const f = frame(typeof opts === 'function' ? opts(i) : opts);
        await page.evaluate((raw) => { raw.ts = performance.now(); window.__zns.poseService.injectRaw(raw); }, f);
        if (intervalMs) await new Promise((r) => setTimeout(r, intervalMs));
    }
}
