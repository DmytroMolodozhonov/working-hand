/**
 * HandRecorder.js — a 10-second recording of the player's hands (F9 in the game), to
 * be sent to the developer: what the camera network really gives for a real hand (a
 * hand holding a wand, a brush, a pen…), a few camera pictures, and what the game made
 * of it every drawn frame (the drawn palm's turn, the wand's direction, the grip, a
 * real stick seen). The hands are then tuned on real hands instead of guessed ones.
 *
 * Saved by the game's server into the game folder → recordings/zns-hands-….json, and
 * also downloaded by the browser (the Downloads folder).
 */

import * as THREE from 'three';

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const pts = (lm) => (Array.isArray(lm) ? lm.map((p) => [r4(p.x), r4(p.y), r4(p.z || 0)]) : null);

export class HandRecorder {
    constructor(game, poseService) {
        this.game = game;
        this.ps = poseService;
        this.active = false;
    }

    /** Start (10 s). onDone(text) tells the player where it is. */
    start(seconds = 10, onDone = null) {
        if (this.active || !this.ps) return false;
        this.active = true;
        const t0 = performance.now();
        const rec = this.rec = {
            kind: 'zns-hands', version: 1, at: new Date().toISOString(), seconds,
            mode: this.ps.native ? 'native' : 'browser', backend: this.ps.stats?.backend || this.ps.stats?.mode || null,
            video: this.ps.native ? this.ps._nativeVideo : (this.ps.videoElement ? { videoWidth: this.ps.videoElement.videoWidth, videoHeight: this.ps.videoElement.videoHeight } : null),
            held: { right: this.game.items?.held?.right?.item?.kind || null, left: this.game.items?.held?.left?.item?.kind || null },
            camera: [], frames: [], pictures: [],
        };
        // every camera result as the network gave it
        this.ps.recordSink = (r) => {
            const hands = Array.isArray(r.hands) ? r.hands.map((h) => ({ lm: pts(h.landmarks), label: h.label, score: h.score })) : null;
            rec.camera.push({
                t: Math.round(performance.now() - t0), pose: pts(r.poseLandmarks)?.slice(0, 25) || null,
                vis: Array.isArray(r.poseLandmarks) ? r.poseLandmarks.slice(0, 25).map((p) => r4(p.visibility ?? 1)) : null,
                hands, left: pts(r.leftHandLandmarks), right: pts(r.rightHandLandmarks), sticks: r.sticks || null,
            });
        };
        // what the game drew, every frame
        const q = new THREE.Quaternion(), v = new THREE.Vector3(), tip = new THREE.Vector3();
        const frame = () => {
            if (!this.active) return;
            const g = this.game, ch = g.character;
            const row = { t: Math.round(performance.now() - t0) };
            try {
                const hands = ch.getActiveHands();
                for (const side of ['left', 'right']) {
                    const h = hands[side];
                    if (!h?.palm) continue;
                    h.palm.getWorldQuaternion(q);
                    row[side] = {
                        palm: [r4(q.x), r4(q.y), r4(q.z), r4(q.w)],
                        fore: ch.getForearmDirection(side, v).toArray().map(r4),
                        curl: r4(ch.getGripCurl(side)), lost: !!h._lost, penT: h.penT != null ? r4(h.penT) : null,
                        stick: ch.realStick?.[side] ? { dx: r4(ch.realStick[side].dx), dy: r4(ch.realStick[side].dy), out: r4(ch.realStick[side].out) } : null,
                    };
                }
                if (g.wandMagic?.wand) { const d = new THREE.Vector3(); g.wandMagic.tip(tip, d); row.wand = d.toArray().map(r4); }
                ch.group.getWorldQuaternion(q);
                row.body = [r4(q.x), r4(q.y), r4(q.z), r4(q.w)];
            } catch (e) { row.err = String(e?.message || e); }
            rec.frames.push(row);
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        // a camera picture twice a second
        const shoot = async () => {
            if (!this.active) return;
            const t = Math.round(performance.now() - t0);
            try {
                if (this.ps.native) {
                    const res = await fetch('/api/pose/snap', { cache: 'no-store' });
                    if (res.status === 200) rec.pictures.push({ t, jpg: await blobToData(await res.blob()) });
                } else if (this.ps.videoElement?.videoWidth) {
                    const vEl = this.ps.videoElement, w = 480, h = Math.round(vEl.videoHeight * w / vEl.videoWidth);
                    const c = this._c || (this._c = document.createElement('canvas'));
                    c.width = w; c.height = h;
                    c.getContext('2d').drawImage(vEl, 0, 0, w, h);
                    rec.pictures.push({ t, jpg: c.toDataURL('image/jpeg', 0.7) });
                }
            } catch (e) { /* (a picture is a bonus) */ }
            if (this.active) setTimeout(shoot, 500);
        };
        shoot();
        setTimeout(() => this._finish(onDone), seconds * 1000);
        return true;
    }

    async _finish(onDone) {
        this.active = false;
        this.ps.recordSink = null;
        const body = JSON.stringify(this.rec);
        let where = null;
        try {
            const res = await fetch('/api/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
            if (res.ok) where = (await res.json()).file;
        } catch (e) { /* (no server: the download below) */ }
        try {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
            a.download = `zns-hands-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        } catch (e) { /* (a browser that won't download) */ }
        this.last = { file: where, camera: this.rec.camera.length, frames: this.rec.frames.length, pictures: this.rec.pictures.length, bytes: body.length };
        onDone?.(where ? `✅ Запись руки сохранена: ${where} (и в «Загрузки»). Пришлите этот файл разработчику.` : '✅ Запись руки сохранена в «Загрузки». Пришлите этот файл разработчику.');
    }
}

function blobToData(blob) {
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
}
