/**
 * SkeletonRecorder.js - the skeleton's diary: no video, only what the camera network saw of the body and what every stage
 * of the game made of it, so the arms' jerks can be found on the player's real camera (tools/armreplay.mjs plays it).
 * The author 02.11: «запиши не само видео на F9, а, допустим, когда я бегаю, расшифровку самого скелета персонажа и того,
 * как нейронка отслеживает» - «проблема дрожания точечная и не всегда понятно почему».
 *
 * Two ways:
 *   - ALWAYS (by itself): the last BUFFER_S seconds are kept; when the drawn arm jerks while the camera's arm is calm
 *     (ArmLog's «рывок … при спокойной руке»), those seconds and AFTER_S more are saved - recordings/zns-jerk-….json
 *     (at most one per GAP_S, MAX_AUTO a game);
 *   - F10: a long recording (up to LONG_S seconds; F10 again stops it) - recordings/zns-skel-….json.
 *
 * camera rows (every camera result): t, pose (25 points [x, y, z]), vis, hands seen (l/r), the guarded arms (11…16 after
 * TrackingGuard: [x, y, z, trust]). frame rows (every drawn frame): t, the shown arms (after PoseSmoother: blended and
 * carried ahead), lead (ms ahead), armMove, the hero (position, body turn, running), and per arm the drawn upper arm and
 * forearm directions and the hand, all in the body's frame (x right, y up, z back).
 */

import * as THREE from 'three';

export const SKEL = { BUFFER_S: 4, AFTER_S: 1.2, GAP_S: 15, MAX_AUTO: 15, LONG_S: 60 };

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const pts = (lm, n = 25) => (Array.isArray(lm) ? lm.slice(0, n).map((p) => [r4(p.x), r4(p.y), r4(p.z || 0)]) : null);
const p3 = (p) => (p ? [r4(p.x), r4(p.y), r4(p.z || 0)] : null);
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _h = new THREE.Vector3();

export class SkeletonRecorder {
    constructor(game, poseService, { save = true } = {}) {
        this.game = game;
        this.ps = poseService;
        this.save = save;
        this.camera = [];
        this.frames = [];
        this.t0 = performance.now();
        this.long = null; // {from, camera, frames}
        this.pending = null; // an auto capture waiting for its «after» seconds
        this.lastAuto = -1e9;
        this.autoN = 0;
        this.saved = [];
        this.active = true;
        this._tap = (r) => this._onCamera(r);
        if (poseService) (poseService.recordTaps || (poseService.recordTaps = [])).push(this._tap);
        const loop = () => { if (!this.active) return; this._onFrame(); requestAnimationFrame(loop); };
        if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(loop); // (tests call _onFrame themselves)
    }

    stop() {
        this.active = false;
        const taps = this.ps?.recordTaps;
        if (taps) { const i = taps.indexOf(this._tap); if (i >= 0) taps.splice(i, 1); }
    }

    _now() { return Math.round(performance.now() - this.t0); }

    _onCamera(r) {
        const row = {
            t: this._now(), pose: pts(r.poseLandmarks),
            vis: Array.isArray(r.poseLandmarks) ? r.poseLandmarks.slice(0, 25).map((p) => r4(p.visibility ?? 1)) : null,
            hands: { l: !!(r.leftHandLandmarks || r.hands?.length), r: !!(r.rightHandLandmarks || r.hands?.length > 1) },
        };
        this._push(this.camera, row, 'camera');
    }

    _push(list, row, key) {
        list.push(row);
        const keep = row.t - SKEL.BUFFER_S * 1000 - SKEL.AFTER_S * 1000;
        while (list.length && list[0].t < keep) list.shift();
        if (this.long) {
            this.long[key].push(row);
            if (row.t - this.long.from > SKEL.LONG_S * 1000) this.stopLong();
        }
    }

    _onFrame() {
        const g = this.game, ch = g?.character;
        if (!ch || !g.active) return;
        const t = this._now();
        const row = { t };
        try {
            // the guarded arms (TrackingGuard, the newest camera result)
            const gp = this.ps?.lastResults?.poseLandmarks;
            if (Array.isArray(gp)) row.guard = [11, 12, 13, 14, 15, 16].map((i) => (gp[i] ? [r4(gp[i].x), r4(gp[i].y), r4(gp[i].z || 0), r4(gp[i].trust ?? gp[i].visibility ?? 1)] : null));
            // the shown pose (PoseSmoother: blended between the pictures, carried ahead)
            const sp = g.currentPose;
            if (sp) {
                row.shown = ['leftShoulder', 'leftElbow', 'leftWrist', 'rightShoulder', 'rightElbow', 'rightWrist'].map((k) => p3(sp[k]));
                if (sp.armMove) row.move = [r4(sp.armMove.left ?? -1), r4(sp.armMove.right ?? -1)];
                row.running = sp.isRunning ? r4(sp.runIntensity || 0) : 0;
            }
            if (g.poseSmoother) row.lead = Math.round((g.poseSmoother.lead || 0) * 1000);
            // the hero
            ch.group.updateMatrixWorld(true);
            ch.group.getWorldQuaternion(_q);
            _qi.copy(_q).invert();
            const pos = ch.group.position;
            row.hero = [r4(pos.x), r4(pos.y), r4(pos.z), r4(ch.group.rotation.y)];
            for (const side of ['left', 'right']) {
                const A = side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor, E = side === 'left' ? ch.leftElbowAnchor : ch.rightElbowAnchor;
                A.getWorldPosition(_a); E.getWorldPosition(_b);
                const hand = ch.getHandWorldPosition(side, _h);
                const up = _b.clone().sub(_a).normalize().applyQuaternion(_qi);
                const fo = hand.clone().sub(_b).normalize().applyQuaternion(_qi);
                const hb = hand.clone().sub(pos).applyQuaternion(_qi);
                row[side] = { up: p3(up), fore: p3(fo), hand: p3(hb) };
            }
            const so = ch._armOut;
            if (so) row.behind = [so.behindU ? 1 : 0, so.behindF ? 1 : 0];
        } catch (e) { row.err = String(e?.message || e); }
        this._push(this.frames, row, 'frames');
        if (this.pending && t >= this.pending.until) this._finishAuto();
    }

    /** ArmLog saw a jerk of the drawn arm while the camera's arm was calm: keep these seconds (auto). */
    jerk(side, info) {
        const t = this._now();
        if (this.pending || t - this.lastAuto < SKEL.GAP_S * 1000 || this.autoN >= SKEL.MAX_AUTO) return;
        this.lastAuto = t;
        this.autoN++;
        this.pending = { at: t, until: t + SKEL.AFTER_S * 1000, side, info: { ...info } };
    }

    _finishAuto() {
        const P = this.pending;
        this.pending = null;
        const from = P.at - SKEL.BUFFER_S * 1000;
        this._send('zns-jerk', { jerk: { t: P.at, side: P.side, ...P.info }, camera: this.camera.filter((c) => c.t >= from), frames: this.frames.filter((f) => f.t >= from) });
    }

    /** F10: start / stop a long recording. Returns true when it started. */
    toggleLong() {
        if (this.long) { this.stopLong(); return false; }
        this.long = { from: this._now(), camera: [], frames: [] };
        return true;
    }

    stopLong() {
        const L = this.long;
        this.long = null;
        if (L) this._send('zns-skel', { camera: L.camera, frames: L.frames });
    }

    _rec(kind, body) {
        const ps = this.ps;
        return {
            kind, version: 1, at: new Date().toISOString(),
            mode: ps?.native ? 'native' : 'browser', backend: ps?.stats?.backend || ps?.stats?.mode || null,
            video: ps?.native ? ps._nativeVideo : (ps?.videoElement ? { videoWidth: ps.videoElement.videoWidth, videoHeight: ps.videoElement.videoHeight } : null),
            held: { right: this.game.items?.held?.right?.item?.kind || null, left: this.game.items?.held?.left?.item?.kind || null },
            ...body,
        };
    }

    _send(kind, body) {
        const rec = this._rec(kind, body);
        this.saved.push({ kind, at: rec.at, camera: rec.camera.length, frames: rec.frames.length });
        if (!this.save || typeof fetch === 'undefined') { this.lastRec = rec; return rec; }
        fetch('/api/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec) })
            .then((r) => r.json()).then((j) => { this.lastFile = j?.file || null; this.onSaved?.(kind, this.lastFile); }).catch(() => {});
        return rec;
    }
}
