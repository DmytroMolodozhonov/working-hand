/**
 * opushka-hands.js — the game's hands in the world «Опушка» (the author 23.11: «перенести систему взаимодействия игрока со своим скином —
 * чтобы ходил, управлял руками и всё такое; скин я не просто так сделал новый»).
 *
 * The same camera as in the game (PoseService: the camera program next to the game — native MediaPipe — or the browser's network), the same
 * arm solving (ArmSolver: this player's arm lengths, in front of / behind the body, the shoulder girdle) — and its answer drives the new
 * wanderer's bones instead of his walking swing: the upper arm and the forearm along the solved directions, the hand turned by the hand's
 * own points (the wrist, the knuckles: which way the fingers point, which way the palm faces). Without a camera (or with the arms out of
 * the picture for a moment) the wanderer swings his arms as he walks, as before.
 *
 * Spaces: ArmSolver answers in the body's space (x the hero's right, y up, z back); the wanderer's own space has +X his left, +Z forward —
 * so a direction (x, y, z) is (−x, y, −z) for him.
 */
import { PoseService } from '../src/input/PoseService.js';
import { ArmSolver } from '../src/entities/ArmSolver.js';

const LIVE_MS = 600; // a pose older than this: the camera stopped — the walking swing comes back
const SIDE = { L: 'left', R: 'right' };

export class ZnsArms {
    constructor() {
        this.pose = null; this.at = 0; this.status = 'камера не запущена';
        this.solver = new ArmSolver();
        this.dirs = { L: mk(), R: mk() }; // char-space unit directions: u (upper arm), f (forearm), h (fingers), n (palm), ok
        this._frame = -1;
    }

    /** Start the game's camera (the same as the game uses: the camera program if it runs, else the browser). */
    async start() {
        try {
            const svc = new PoseService({ baseUrl: new URL('../', location.href).href });
            svc.onPoseUpdate = (p) => { this.pose = p; this.at = performance.now(); };
            svc.onStatus = (t) => { this.status = t; };
            await svc.initialize('zns-webcam', 'zns-preview', {});
            await svc.start();
            this.svc = svc;
            this.status = svc.native ? 'камера: программа камеры' : 'камера: в браузере';
        } catch (e) {
            this.status = 'камера недоступна: ' + (e?.message || e);
            console.warn('[Опушка] camera', e);
        }
    }

    /** Is there a fresh pose with both arms? */
    live() {
        const p = this.pose;
        return !!(p && performance.now() - this.at < LIVE_MS && p.leftShoulder && p.leftElbow && p.leftWrist && p.rightShoulder && p.rightElbow && p.rightWrist);
    }

    /** Once a frame: solve both arms (and the hands' turn) from the newest pose. */
    solve(frame, dt) {
        if (frame === this._frame) return;
        this._frame = frame;
        for (const K of ['L', 'R']) this.dirs[K].ok = false;
        if (!this.live()) return;
        const p = this.pose, aspect = p.aspect || 1, adt = Math.min(0.2, Math.max(0.001, dt));
        const AS = this.solver;
        AS.shoulders(p.rightShoulder, p.leftShoulder, aspect, adt);
        for (const K of ['L', 'R']) {
            const side = SIDE[K], D = this.dirs[K];
            const out = D._o || (D._o = { u: { x: 0, y: 0, z: 0 }, f: { x: 0, y: 0, z: 0 }, g: { x: 0, y: 0, z: 0 } });
            AS.solve(side, p[side + 'Shoulder'], p[side + 'Elbow'], p[side + 'Wrist'], aspect, out, adt, p.armMove ? p.armMove[side] : -1);
            if (!Number.isFinite(out.u.x + out.f.x)) continue;
            set(D.u, -out.u.x, out.u.y, -out.u.z); set(D.f, -out.f.x, out.f.y, -out.f.z);
            D.ok = true;
            // the hand: fingers from the wrist to the middle knuckle, the palm's normal across the knuckles (the picture mirrored, as the arms)
            const lm = p[side + 'HandLandmarks'];
            D.hand = false;
            if (lm && lm.length >= 18) {
                const w = lm[0], m = lm[9], i5 = lm[5], p17 = lm[17];
                const b = (q) => ({ x: -(q.x - w.x) * aspect, y: -(q.y - w.y), z: (q.z - w.z) * aspect }); // body space (x right, y up, z back)
                const fm = b(m), a = b(i5), c = b(p17);
                let nx = a.y * c.z - a.z * c.y, ny = a.z * c.x - a.x * c.z, nz = a.x * c.y - a.y * c.x; // index × pinky
                if (side === 'left') { nx = -nx; ny = -ny; nz = -nz; } // (the two hands are mirror images: one formula for «out of the palm»)
                const fl = Math.hypot(fm.x, fm.y, fm.z), nl = Math.hypot(nx, ny, nz);
                if (fl > 1e-4 && nl > 1e-6) { set(D.h, -fm.x / fl, fm.y / fl, -fm.z / fl); set(D.n, -nx / nl, ny / nl, -nz / nl); D.hand = true; }
            }
        }
    }
}

function mk() { return { u: { x: 0, y: -1, z: 0 }, f: { x: 0, y: -1, z: 0 }, h: { x: 0, y: -1, z: 0 }, n: { x: 1, y: 0, z: 0 }, ok: false, hand: false }; }
function set(v, x, y, z) { const l = Math.hypot(x, y, z) || 1; v.x = x / l; v.y = y / l; v.z = z / l; }
