#!/usr/bin/env node
/**
 * armreplay.mjs - a real recording of the player's camera (F9 in the game: recordings/zns-hands-….json) played through the
 * game's own arm chain - TrackingGuard.PoseStabilizer (ArmGuard) → PoseInterpreter → PoseSmoother → VoxelCharacter
 * (ArmSolver, the bones) - at 60 frames a second, and every jerk of the drawn arm found: the moment, which bone, how far it
 * turned in one frame, how fast the camera's own wrist moved then (a jerk while the arm itself is calm is the game's, not
 * the player's), and what the camera saw (the elbow's and the wrist's visibility).
 * The author 02.11: «когда я прицеливаюсь, она может делать мелкие подёргивания, или резко, если я сгибаю влево,
 * вытянув руку, уйти сильнее влево» - the arms are tuned on his real camera instead of a guessed one.
 *
 *   node tools/armreplay.mjs recordings/zns-hands-….json [--side right|left] [--min 12]
 */
import fs from 'node:fs';
import * as THREE from 'three';
import { PoseStabilizer } from '../src/input/TrackingGuard.js';
import { PoseInterpreter } from '../src/input/PoseInterpreter.js';
import { PoseSmoother } from '../src/input/PoseSmoother.js';
import { VoxelCharacter } from '../src/entities/Character.js';

/** Replay `rec` (a parsed recording). Returns { frames, jerks, summary }. */
export function replay(rec, { side = 'right', min = 12, gameHz = 60, age = 55 } = {}) {
    const video = rec.video || { videoWidth: 640, videoHeight: 480 };
    const guard = new PoseStabilizer({ log: null }), interp = new PoseInterpreter(), sm = new PoseSmoother();
    const ch = new VoxelCharacter(new THREE.Scene(), { remote: true });
    let clock = 0;
    ch.handNow = () => clock;
    const cams = (rec.camera || []).filter((c) => Array.isArray(c.pose) && c.pose.length >= 17);
    const out = [];
    const toLm = (c) => {
        const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
        c.pose.forEach((p, i) => { lm[i] = { x: p[0], y: p[1], z: p[2] || 0, visibility: c.vis ? c.vis[i] : 1 }; });
        return lm;
    };
    const E = side === 'left' ? 13 : 14, W = side === 'left' ? 15 : 16;
    const anchor = (k) => (side === 'left' ? (k ? ch.leftElbowAnchor : ch.leftArmAnchor) : (k ? ch.rightElbowAnchor : ch.rightArmAnchor));
    let ci = 0, lastRaw = null, rawSpeed = 0;
    const end = cams.length ? cams[cams.length - 1].t + 300 : 0;
    const dt = 1000 / gameHz;
    for (clock = cams.length ? cams[0].t : 0; clock < end; clock += dt) {
        while (ci < cams.length && cams[ci].t <= clock) {
            const c = cams[ci++], lm = toLm(c);
            const sw = Math.max(0.05, Math.hypot(lm[11].x - lm[12].x, lm[11].y - lm[12].y));
            if (lastRaw) rawSpeed = Math.hypot(lm[W].x - lastRaw.x, lm[W].y - lastRaw.y) / sw / Math.max(0.01, (c.t - lastRaw.t) / 1000);
            lastRaw = { x: lm[W].x, y: lm[W].y, t: c.t, ve: lm[E].visibility, vw: lm[W].visibility };
            const g = guard.process(lm, c.t);
            if (g) {
                const pose = interp.process({ poseLandmarks: g }, video);
                // (the picture's own time, as PoseService gives it: taken `age` ms before it reached the game - PoseSmoother carries the
                // arms ahead by it, as in the game: «руки показаны вперёд на 140 мс»)
                pose.ts = c.t - age;
                sm.push(pose, c.t);
            }
        }
        const pose = sm.sample(clock);
        if (!pose) continue;
        ch.updateArmsLookAt(pose, dt / 1000);
        ch.group.updateMatrixWorld(true);
        out.push({
            t: clock, hand: ch.getHandWorldPosition(side, new THREE.Vector3()),
            qU: anchor(0).getWorldQuaternion(new THREE.Quaternion()), qE: anchor(1).getWorldQuaternion(new THREE.Quaternion()),
            raw: rawSpeed, ve: lastRaw?.ve ?? 1, vw: lastRaw?.vw ?? 1, rw: lastRaw ? { x: lastRaw.x, y: lastRaw.y } : null,
        });
    }
    const jerks = [];
    let s2 = 0;
    const t0 = out.length ? out[0].t + 1000 : 0; // (the first second: the hero's arm comes from its idle pose to the player's)
    for (let i = 1; i < out.length; i++) {
        const a = out[i], b = out[i - 1];
        if (a.t < t0) continue;
        const u = a.qU.angleTo(b.qU) * 57.2958, e = a.qE.angleTo(b.qE) * 57.2958, cm = a.hand.distanceTo(b.hand) * 100;
        s2 += cm * cm;
        if (Math.max(u, e) >= min) jerks.push({ t: Math.round(a.t), u: +u.toFixed(1), e: +e.toFixed(1), cm: +cm.toFixed(1), raw: +a.raw.toFixed(2), ve: a.ve, vw: a.vw });
    }
    const calm = jerks.filter((j) => j.raw < 3);
    // back and forth: the drawn hand turns back (its way over ~0.1 s against its way the 0.1 s before) by more than 3 cm while the
    // camera's wrist went on one way (or stood) - an overshoot the game made, not the player
    const back = [];
    const k = Math.round(gameHz * 0.1);
    for (let i = 2 * k; i < out.length; i++) {
        if (out[i].t < t0) continue;
        const a = out[i - 2 * k], b = out[i - k], c = out[i];
        const d1 = b.hand.clone().sub(a.hand), d2 = c.hand.clone().sub(b.hand);
        if (d1.length() < 0.03 || d2.length() < 0.03 || d1.dot(d2) > -0.5 * d1.length() * d2.length()) continue;
        const ra = a.rw, rb = b.rw, rc = c.rw;
        if (!ra || !rb || !rc) continue;
        const r1x = rb.x - ra.x, r1y = rb.y - ra.y, r2x = rc.x - rb.x, r2y = rc.y - rb.y;
        if (r1x * r2x + r1y * r2y < -1e-5) continue; // (the player's own wrist turned back too)
        back.push({ t: Math.round(c.t), cm: +Math.min(d1.length(), d2.length()).toFixed(3) * 100 });
    }
    const backN = back.filter((x, j) => j === 0 || x.t - back[j - 1].t > 150).length; // (one per turn, not every frame of it)
    return { frames: out.length, jerks, calm, back, backN, rmsStepCm: Math.sqrt(s2 / Math.max(1, out.length - 1)) };
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/armreplay.mjs')) {
    const args = process.argv.slice(2);
    const file = args.find((a) => a.endsWith('.json'));
    if (!file) { console.log('usage: node tools/armreplay.mjs recordings/zns-hands-….json [--side right|left] [--min 12]'); process.exit(1); }
    const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    // (a jerk the game caught by itself - SkeletonRecorder.js: where it was, as the game saw it)
    if (rec.jerk) console.log(`пойман рывок: ${(rec.jerk.t - (rec.camera?.[0]?.t ?? 0)) / 1000} с от начала записи, рука ${rec.jerk.side === 'left' ? 'левая' : 'правая'}, повернулась ${rec.jerk.turn}° за кадр (подъём ${rec.jerk.lift}°)`);
    for (const side of opt('--side', null) ? [opt('--side')] : ['right', 'left']) {
        const r = replay(rec, { side, min: Number(opt('--min', 12)) });
        console.log(`${side === 'left' ? 'левая' : 'правая'}: ${r.frames} кадров, шаг кисти RMS ${r.rmsStepCm.toFixed(2)} см; рывков ≥${opt('--min', 12)}°/кадр: ${r.jerks.length}, из них при спокойной руке (камера < 3 ш/с): ${r.calm.length}; перелётов туда-обратно (рука на камере не возвращалась): ${r.backN}${r.back.length ? ' (' + r.back.filter((x, j) => j === 0 || x.t - r.back[j - 1].t > 150).slice(0, 8).map((x) => (x.t / 1000).toFixed(2) + 'с').join(', ') + ')' : ''}`);
        for (const j of r.calm.slice(0, 25)) console.log(`  ${(j.t / 1000).toFixed(2)} с: плечо ${j.u}°, предплечье ${j.e}°, кисть ${j.cm} см; запястье на камере ${j.raw} ш/с, видимость локтя ${j.ve}, запястья ${j.vw}`);
    }
}
