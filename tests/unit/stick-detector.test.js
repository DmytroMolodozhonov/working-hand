/**
 * The browser's stick finder (StickDetector.js) on drawn grey pictures: a hand (palm,
 * fingers, forearm from its 21 points) with a pen / a brush in it, or without.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectStick } from '../../src/input/StickDetector.js';

const W = 320, H = 240;

/** 21 hand points (pixels), fingers towards `angle` (0 = up), half closed (as tests/python/test_stick_detect.py). */
function handPoints(wx, wy, size = 28, angle = 0, curl = 0.5) {
    const bases = [[-0.35, -0.25], [-0.2, -0.85], [0, -0.9], [0.18, -0.85], [0.33, -0.75]];
    const lens = [0.45, 0.75, 0.82, 0.75, 0.6];
    const out = [[0, 0]];
    bases.forEach(([bx, by], f) => {
        let px = bx, py = by;
        out.push([px, py]);
        const L = lens[f] / 3;
        for (let j = 1; j < 4; j++) {
            const a = curl * (f === 0 ? 0.5 : 1) * Math.PI * 0.35 * j;
            px += Math.sin(a) * (f === 0 ? 0.6 : 0.25) * L; py -= Math.cos(a) * L;
            out.push([px, py]);
        }
    });
    const c = Math.cos(angle), s = Math.sin(angle);
    return out.map(([x, y]) => ({ x: wx + size * (x * c - y * s), y: wy + size * (x * s + y * c) }));
}

function picture(seed = 1) {
    let r = seed;
    const g = new Uint8Array(W * H);
    for (let i = 0; i < g.length; i++) g[i] = 105 + (((r = (r * 16807) % 2147483647) % 9) - 4);
    return g;
}
function line(g, ax, ay, bx, by, width, v) {
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - width)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + width));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - width)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + width));
    const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / L2));
        if (Math.hypot(x - ax - vx * t, y - ay - vy * t) <= width / 2) g[y * W + x] = v;
    }
}
function drawHand(g, p) {
    const skin = 160;
    const dx = p[0].x - p[9].x, dy = p[0].y - p[9].y, n = Math.hypot(dx, dy);
    line(g, p[0].x, p[0].y, p[0].x + dx / n * 120, p[0].y + dy / n * 120, 20, 150); // the forearm
    for (const [a, b] of [[0, 1], [1, 5], [5, 9], [9, 13], [13, 17], [17, 0], [0, 9], [5, 17], [1, 13]]) line(g, p[a].x, p[a].y, p[b].x, p[b].y, 9, skin);
    for (const ch of [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]) for (let i = 0; i < 3; i++) line(g, p[ch[i]].x, p[ch[i]].y, p[ch[i + 1]].x, p[ch[i + 1]].y, 5, skin);
}
function drawStick(g, p, ang, length = 95, width = 3, v = 30) {
    const x0 = (p[3].x + p[5].x) / 2, y0 = (p[3].y + p[5].y) / 2, dx = Math.sin(ang), dy = -Math.cos(ang);
    line(g, x0 - dx * length * 0.2, y0 - dy * length * 0.2, x0 + dx * length, y0 + dy * length, width, v);
}
const off = (d, ang) => Math.abs(Math.atan2(Math.sin(Math.atan2(d[0], -d[1]) - ang), Math.cos(Math.atan2(d[0], -d[1]) - ang))) * 180 / Math.PI;

test('browser stick finder: a pen / a brush in the hand at any angle, dark or light, under the fingers or over them', () => {
    for (const hang of [-0.6, 0, 0.5, 1.2]) {
        for (const rel of [-0.5, -0.2, 0.2, 0.5]) {
            for (const [v, under] of [[30, false], [235, true]]) {
                const p = handPoints(160, 150, 26, hang);
                const g = picture(3);
                if (under) drawStick(g, p, hang + rel, 95, 3, v);
                drawHand(g, p);
                if (!under) drawStick(g, p, hang + rel, 95, 3, v);
                const s = detectStick(g, W, H, p);
                assert.ok(s, `hand ${hang}, stick ${hang + rel} (${v}): not found`);
                assert.ok(off(s.dir, hang + rel) < 4, `hand ${hang}, stick ${hang + rel}: ${off(s.dir, hang + rel).toFixed(1)}° off`);
                assert.ok(s.out > 1 && s.conf >= 0.45);
            }
        }
    }
});

test('browser stick finder: no stick — nothing (open hand, half closed, fist; lines elsewhere in the room)', () => {
    for (const hang of [-0.6, 0, 0.5, 1.2]) {
        for (const curl of [0, 0.5, 1]) {
            const p = handPoints(160, 150, 26, hang, curl);
            const g = picture(5);
            line(g, 20, 0, 30, H, 3, 40); // a door frame
            line(g, 0, 40, W, 50, 2, 200); // a shelf behind
            drawHand(g, p);
            assert.equal(detectStick(g, W, H, p), null, `hand ${hang} curl ${curl}: a stick seen where none is`);
        }
    }
});

test('browser stick finder: a stub in the fist is not a stick; fast enough for every camera picture', () => {
    const p = handPoints(160, 150, 26, 0.2);
    const g = picture(7);
    drawHand(g, p);
    drawStick(g, p, 0.4, 18);
    assert.equal(detectStick(g, W, H, p), null);
    const g2 = picture(7);
    drawHand(g2, p);
    drawStick(g2, p, 0.4);
    const t = performance.now();
    for (let i = 0; i < 20; i++) detectStick(g2, W, H, p);
    assert.ok((performance.now() - t) / 20 < 8, 'under 8 ms');
});
