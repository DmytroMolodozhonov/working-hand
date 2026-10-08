/**
 * Synthetic camera results (what the vision worker would output) so tests can
 * drive the player's body and hands deterministically.
 * Image coordinates: x→right, y→down, the person faces the camera (not mirrored),
 * so the person's LEFT side appears on the image RIGHT.
 */

export function hand(wx, wy, { size = 0.09, curl = 0 } = {}) {
    const lm = [{ x: wx, y: wy, z: 0 }];
    const bases = [[-0.35, -0.25], [-0.2, -0.85], [0, -0.9], [0.18, -0.85], [0.33, -0.75]];
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
    return lm;
}

/**
 * @param {object} o
 *   arms: 'forward' | 'down' | 'up'
 *   leftCurl / rightCurl: 0 open … 1 fist, null = hand not detected
 *   noseY: 0.25 standing, 0.6 crouching
 *   bob: shoulder vertical offset (for running animation)
 */
export function frame({ arms = 'forward', leftCurl = 0, rightCurl = 0, noseY = 0.25, bob = 0, wristOffset = [0, 0], lean = 0, forward = 0 } = {}) {
    // lean: + = person leans to THEIR left (image right); forward: + = shoulders towards the camera
    const p = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.8, z: 0, visibility: 0.95 }));
    const sh = 0.42 + bob;
    const sz = -forward;
    p[0] = { x: 0.5 + lean * 1.3, y: noseY, z: -0.4 + sz, visibility: 0.99 };
    p[11] = { x: 0.6 + lean, y: sh, z: sz, visibility: 0.99 };
    p[12] = { x: 0.4 + lean, y: sh, z: sz, visibility: 0.99 };
    let lElbow, lWrist, rElbow, rWrist;
    if (arms === 'forward') {
        lElbow = [0.6, sh + 0.03]; lWrist = [0.6 + wristOffset[0], sh + 0.02 + wristOffset[1]];
        rElbow = [0.4, sh + 0.03]; rWrist = [0.4 - wristOffset[0], sh + 0.02 + wristOffset[1]];
    } else if (arms === 'up') {
        lElbow = [0.64, sh - 0.12]; lWrist = [0.65, sh - 0.25];
        rElbow = [0.36, sh - 0.12]; rWrist = [0.35, sh - 0.25];
    } else {
        lElbow = [0.64, sh + 0.15]; lWrist = [0.65, sh + 0.3];
        rElbow = [0.36, sh + 0.15]; rWrist = [0.35, sh + 0.3];
    }
    if (lean) { lElbow[0] += lean; lWrist[0] += lean; rElbow[0] += lean; rWrist[0] += lean; }
    p[13] = { x: lElbow[0], y: lElbow[1], z: -0.2, visibility: 0.99 };
    p[14] = { x: rElbow[0], y: rElbow[1], z: -0.2, visibility: 0.99 };
    p[15] = { x: lWrist[0], y: lWrist[1], z: -0.4, visibility: 0.99 };
    p[16] = { x: rWrist[0], y: rWrist[1], z: -0.4, visibility: 0.99 };
    p[23] = { x: 0.57, y: 0.8, z: 0, visibility: 0.9 };
    p[24] = { x: 0.43, y: 0.8, z: 0, visibility: 0.9 };
    const hands = [];
    if (leftCurl != null) hands.push({ landmarks: hand(p[15].x, p[15].y, { curl: leftCurl }), label: 'Right', score: 0.95 });
    if (rightCurl != null) hands.push({ landmarks: hand(p[16].x, p[16].y, { curl: rightCurl }), label: 'Left', score: 0.95 });
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
