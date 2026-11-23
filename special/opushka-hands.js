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
import { headTurnStep } from '../src/game/HeadTurn.js';
import { lookPitch } from '../src/input/PoseInterpreter.js';
import { setHandSmoothness } from '../src/input/HandSmooth.js';
import { AimSteady, V5_WAND } from '../src/game/V5WandAim.js';
import * as THREE from 'three';
import { PoseSmoother } from '../src/input/PoseSmoother.js';

/** The game's settings for the camera (the menu's «Камера» tab, kept in this browser): smoothness, sensitivity, the pose networks. */
export function gameCameraSettings() {
    let saved = {}, cfg = null;
    try { saved = JSON.parse(localStorage.getItem('zns-settings') || '{}') || {}; } catch (e) { /* */ }
    try { cfg = JSON.parse(sessionStorage.getItem('zns-opushka-cfg') || 'null'); } catch (e) { /* */ }
    const num = (v, d) => (Number.isFinite(+v) ? +v : d);
    const sm = num(saved['cam-smooth'], 70), se = num(saved['cam-sens'], 100);
    const config = cfg || {
        modelComplexity: parseInt(saved['model-quality'] ?? 1, 10), delegate: saved['vision-delegate'] || 'auto', engine: saved['vision-engine'] || 'classic',
        resolution: saved['camera-res'] || '640', handQuality: String(saved['hand-quality'] || 'high').includes('high') ? 'high' : 'low', leftHanded: saved.handedness === 'left',
    };
    return { config, smoothness: Math.max(0.05, 1 - sm / 100), sensitivity: se / 100, handSmooth: sm, drifting: saved['drift-camera'] !== false && saved['drift-camera'] !== 'false' };
}

const LIVE_MS = 600; // a pose older than this: the camera stopped — the walking swing comes back
const SIDE = { L: 'left', R: 'right' };

export class ZnsArms {
    _wandAim(D, p, dt) {
        const lm = p.rightHandLandmarks, has = !!(lm && lm.length >= 18);
        const k = has ? V5_WAND.PALM : 0, T = this._aimT;
        // (D.hand is solved just below; the previous frame's hand direction serves — one frame late is nothing next to the steadying)
        const H = D.hs || D.h;
        T.set(H.x * k + D.f.x * (1 - k), H.y * k + D.f.y * (1 - k), H.z * k + D.f.z * (1 - k)).normalize();
        if (!D.aim) { D.aim = T.clone(); D.np = new THREE.Vector3(D.n.x, D.n.y, D.n.z); }
        const a = this.steady.alpha(D.aim, T, dt, !!p.isRunning);
        D.aim.lerp(T, a).normalize();
        if (has) D.np.lerp(this._aimA.set(D.n.x, D.n.y, D.n.z), 0.12).normalize();
    }

    constructor() {
        this.pose = null; this.at = 0; this.status = 'камера не запущена';
        this.solver = new ArmSolver();
        this.dirs = { L: mk(), R: mk() }; // char-space unit directions: u (upper arm), f (forearm), h (fingers), n (palm), ok
        this._frame = -1;
        this.set = gameCameraSettings();
        this.steady = new AimSteady(); this._aimT = new THREE.Vector3(); this._aimA = new THREE.Vector3();
        this.head = { yaw: 0, pitch: 0 }; this.turn = {}; this.base = null; this.jumpSeen = null;
    }

    /** The body from the camera, as in the game: the head looks round (past a small dead zone it turns the body — HeadTurn), stepping on
     *  the spot walks, faster steps run, a squat crouches, a jump jumps. → {run, k, crouch, jump} or null (no camera: the keys and the mouse). */
    drive(P, dt) {
        const p = this.pose;
        if (!p || !p.hasPose || performance.now() - this.at > LIVE_MS || !p.headRotation) { this.base = null; return null; }
        const S = this.set, a = 1 - Math.pow(1 - Math.min(1, p.isRunning ? Math.min(S.smoothness, 0.1) : S.smoothness), Math.min(0.1, dt) * 60);
        const ty = p.headRotation.yaw * S.sensitivity, tp = lookPitch(p.headRotation.pitch * S.sensitivity);
        if (Number.isFinite(ty)) this.head.yaw += (ty - this.head.yaw) * a;
        if (Number.isFinite(tp)) this.head.pitch += (tp - this.head.pitch) * a;
        if (this.base === null) { this.base = P.yaw - (this.head.yaw - (this.turn.neutral || 0)); }
        const t = headTurnStep(this.turn, this.head.yaw, dt);
        if (S.drifting) this.base += t.rate * dt;
        P.walkYaw = this.base;
        P.yaw = this.base + (this.head.yaw - (this.turn.neutral || 0));
        P.pitch = Math.max(-1.35, Math.min(1.35, this.head.pitch));
        const J = p.jump;
        let jump = false;
        if (J) { if (this.jumpSeen !== null && J.jumps !== this.jumpSeen) jump = true; this.jumpSeen = J.jumps; }
        return { run: !!p.isRunning, k: p.runIntensity || 0, crouch: !!p.isCrouching, jump };
    }

    captureNotice(detail) {
        if (!detail && !this.cameraNotice) return;
        if (!this.cameraNotice) {
            const notice = document.createElement('aside');
            notice.setAttribute('role', 'status');
            notice.style.cssText = 'position:fixed;z-index:7;left:50%;top:max(32px,env(safe-area-inset-top,0px));transform:translateX(-50%);width:max-content;max-width:min(88vw,420px);padding:10px 16px;border:1px solid #b89962;border-radius:12px;background:#1d211eeb;color:#fff2d9;font:14px/1.4 system-ui,sans-serif;text-align:center;pointer-events:none';
            document.body.append(notice);
            this.cameraNotice = notice;
        }
        this.cameraNotice.hidden = !detail;
        if (detail) this.cameraNotice.textContent = '📷 ' + detail + '. Переподключаем камеру…';
    }

    /** Start the game's camera (the same as the game uses: the camera program if it runs, else the browser). */
    async start() {
        try {
            const svc = new PoseService({ baseUrl: new URL('../', location.href).href });
            // (as the game: every picture goes through the game's PoseSmoother — the blend between pictures and the hands carried forward by the
            //  picture's age — and the hero is drawn from its sample each frame, not from the raw picture: the author, «стабильность в разы лучше»)
            this.smoother = new PoseSmoother();
            svc.onPoseUpdate = (p) => { this.smoother.push(p); this.raw = p; this.at = performance.now(); this.heardAt = this.at; };
            svc.onStatus = (t) => { this.status = t; };
            svc.onCaptureState = (detail) => this.captureNotice(detail);
            await svc.initialize('zns-webcam', 'zns-preview', this.set.config);
            try { setHandSmoothness(this.set.handSmooth, svc); } catch (e) { /* */ }
            // (the camera busy or not given yet: tried again every few seconds — as the game's camera panel does)
            for (let i = 0; ; i++) {
                try { await svc.start(); break; } catch (e) { this.status = 'камера: ' + (e?.name === 'NotAllowedError' ? 'нет разрешения' : e?.name === 'NotReadableError' ? 'занята другой программой' : 'не найдена') + ' — пробую снова'; if (i > 40) throw e; await new Promise((r) => setTimeout(r, 3000)); }
            }
            this.svc = svc;
            const pv = document.getElementById('webcam-preview'); if (pv) pv.hidden = false; // (the camera's window in the corner, as in the game)
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
        if (this.smoother?.to) { const sp = this.smoother.sample(); if (sp) this.pose = sp; }
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
            const sm = (v, x, y, z) => { const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l; if (!D.ok0 || v.x * x + v.y * y + v.z * z < 0.94) { v.x = x; v.y = y; v.z = z; return; } const k = 1 - Math.pow(0.5, adt * 60); set(v, v.x + (x - v.x) * k, v.y + (y - v.y) * k, v.z + (z - v.z) * k); };
            sm(D.u, -out.u.x, out.u.y, -out.u.z); sm(D.f, -out.f.x, out.f.y, -out.f.z); D.ok0 = true;
            D.ok = true;
            // (the author 23.11: «палочка смотрит вверх и не такая стабильная, как V3»): the wand hand's aim as in the game's V3 — where the real
            // hand points mixed with the forearm (V5_WAND.PALM), then the game's own steadying (AimSteady; calmer while running)
            if (K === 'R') this._wandAim(D, p, adt);
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
                if (fl > 1e-4 && nl > 1e-6) { set(D.h, -fm.x / fl, fm.y / fl, -fm.z / fl); set(D.n, -nx / nl, ny / nl, -nz / nl); D.hand = true;
                    // (the hand's own pointing, read off a fist of ~50 px, trembles most: steadied on its own before it joins the forearm in the wand's aim)
                    const hs = D.hs || (D.hs = { x: D.h.x, y: D.h.y, z: D.h.z }), kh = 1 - Math.exp(-adt * 7);
                    set(hs, hs.x + (D.h.x - hs.x) * kh, hs.y + (D.h.y - hs.y) * kh, hs.z + (D.h.z - hs.z) * kh); }
                // the fingers' bends (rad, each of 3 joints of index, middle, ring, little and the thumb): the angle between one bone of the
                // finger and the next, as the camera sees it in depth too; a straight finger shows ~0.1, a fist ~1.5 at each joint
                const curl = D.curl || (D.curl = new Float32Array(15));
                const V = (i, j) => { const A = lm[i], B = lm[j]; return [(B.x - A.x) * aspect, B.y - A.y, (B.z - A.z) * aspect]; };
                const angle = (u, v) => { const lu = Math.hypot(u[0], u[1], u[2]) || 1, lv = Math.hypot(v[0], v[1], v[2]) || 1; return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv)))); };
                const FING = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
                for (let f = 0; f < 4; f++) {
                    const [a0, a1, a2, a3] = FING[f];
                    const bends = [angle(V(0, a0), V(a0, a1)), angle(V(a0, a1), V(a1, a2)), angle(V(a1, a2), V(a2, a3))];
                    for (let j = 0; j < 3; j++) curl[f * 3 + j] = Math.max(0, Math.min(1.7, bends[j] - 0.12));
                }
                const t0 = angle(V(1, 2), V(2, 3)), t1 = angle(V(2, 3), V(3, 4));
                curl[12] = Math.max(0, Math.min(1.2, t0 - 0.1)); curl[13] = Math.max(0, Math.min(1.4, t1 - 0.1)); curl[14] = curl[13] * 0.6;
            }
        }
    }
}

function mk() { return { u: { x: 0, y: -1, z: 0 }, f: { x: 0, y: -1, z: 0 }, h: { x: 0, y: -1, z: 0 }, n: { x: 1, y: 0, z: 0 }, ok: false, hand: false }; }
function set(v, x, y, z) { const l = Math.hypot(x, y, z) || 1; v.x = x / l; v.y = y / l; v.z = z / l; }
