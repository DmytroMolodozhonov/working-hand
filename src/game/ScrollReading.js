/**
 * ScrollReading.js — opening a scroll with the hands and reading it.
 *
 * A scroll in one fist; the other (empty) hand comes open to an end of it and
 * closes its fingers on the other roller (a fist arriving, or a pointing hand —
 * the index out — takes nothing); pulling the hands apart unrolls the
 * parchment between them: exactly as much as the hands are apart. Its
 * pages look at the reader, the camera comes over the shoulder (as for the
 * book). Hands back together — it rolls up between them; the second hand opens
 * (or an arm drops, or the hands go further apart than the parchment is long —
 * the roller slips out of the fingers) — the roller is let go and the parchment
 * rolls itself back up onto the roller in the first fist.
 *
 * Anybody can read any scroll. Learning is only by burning it (Inferno):
 * whoever burns it gets it (Items.burnHeldScroll).
 */

import * as THREE from 'three';
import { describeItem, ITEM_SCALE } from './ItemTypes.js';
import { Steady } from '../entities/SimplifiedHand.js';
import { figureOf, figureLines } from './PentagramRules.js';

const MAX_W = 2.2; // m of parchment, fully unrolled
const PARCH_H = 0.95;
const END_NEAR = 0.35; // the free hand this near an end of the scroll can take that roller…
const GRAB_CURL = 0.5; // …by closing its fingers this much…
const GRAB_T = 0.2; // …for this long (s)
const OPEN_CURL = 0.3; // fingers opened this much: the roller is let go…
const LET_T = 0.3; // …after this long (s)
const SLIP = 0.6; // m further apart than the parchment is long: the roller slips out of the fingers
const ROLL_V = 7; // m/s: a let-go parchment rolls itself back up this fast
const SCROLL_END = 0.21; // the ends of the scroll model (local x)
const _v8 = new THREE.Vector3(), _v9 = new THREE.Vector3();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qs = new THREE.Quaternion();

/** The text of a scroll, in ink on parchment. */
/** A drawing-scroll: the figure to be drawn, in blood-red ink on dark paper (the circle first, then the star; the numbers show the order of the strokes). */
function drawPentagramParchment(item) {
    const P = figureOf(item.pent) || figureOf('devil');
    const css = (n) => '#' + n.toString(16).padStart(6, '0');
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 440;
    const x = c.getContext('2d');
    const grad = x.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, '#1a0c10'); grad.addColorStop(0.1, '#2b161b'); grad.addColorStop(0.9, '#2b161b'); grad.addColorStop(1, '#1a0c10');
    x.fillStyle = grad; x.fillRect(0, 0, 1024, 440);
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${90 + (i * 37) % 60},${40 + (i * 11) % 30},${40 + (i * 7) % 30},0.05)`; x.fillRect((i * 97) % 1024, (i * 53) % 440, 2 + (i % 5), 1 + (i % 3)); }
    x.strokeStyle = css(P.seal); x.lineWidth = 5; x.strokeRect(36, 16, 952, 408);
    x.strokeStyle = 'rgba(190,150,110,0.35)'; x.lineWidth = 1.5; x.strokeRect(46, 26, 932, 388);
    const cx = 690, cy = 228, R = 160;
    x.shadowColor = css(P.ink); x.shadowBlur = 14;
    x.strokeStyle = css(P.ink); x.lineWidth = 6; x.lineJoin = 'round'; x.lineCap = 'round';
    x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
    x.lineWidth = 5;
    for (const poly of figureLines(P.id)) {
        x.beginPath();
        poly.forEach((p, i) => { const px = cx + p[0] * R, py = cy - p[1] * R; if (i) x.lineTo(px, py); else x.moveTo(px, py); });
        x.closePath(); x.stroke();
    }
    x.shadowBlur = 0;
    // the order: 1 — the circle (an arrow along it), 2 — the star (from its top point on)
    x.fillStyle = '#e6c9a8'; x.font = 'bold 34px serif'; x.textAlign = 'center';
    x.fillText('1', cx + R + 40, cy - 6); x.fillText('2', cx + 6, cy - R * 0.42);
    x.strokeStyle = '#e6c9a8'; x.lineWidth = 3;
    x.beginPath(); x.arc(cx, cy, R + 24, -0.3, 0.5); x.stroke();
    x.beginPath(); x.moveTo(cx + (R + 24) * Math.cos(0.5), cy + (R + 24) * Math.sin(0.5)); x.lineTo(cx + (R + 24) * Math.cos(0.5) - 14, cy + (R + 24) * Math.sin(0.5) - 10); x.moveTo(cx + (R + 24) * Math.cos(0.5), cy + (R + 24) * Math.sin(0.5)); x.lineTo(cx + (R + 24) * Math.cos(0.5) + 4, cy + (R + 24) * Math.sin(0.5) - 16); x.stroke();
    x.fillStyle = css(P.ink); x.font = 'bold 28px serif'; x.textAlign = 'left';
    x.fillText(P.ru, 80, 76);
    x.fillStyle = '#c9b49a'; x.font = '24px serif';
    x.fillText('Скажите «Пентаграниум», обведите', 80, 130);
    x.fillText('палочкой круг на земле, а потом', 80, 162);
    x.fillText('соединяйте светящиеся точки:', 80, 194);
    x.fillText(P.id === 'devil' ? 'Так вы получите силу убитого мага.' : 'Тёмный знак для особого обряда.', 80, 238);
    x.fillStyle = css(P.seal); x.beginPath(); x.arc(170, 340, 38, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#e6a0a0'; x.lineWidth = 3; x.beginPath(); x.arc(170, 340, 28, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#e6a0a0'; x.font = 'bold 30px serif'; x.textAlign = 'center'; x.fillText('★', 170, 352);
    x.fillStyle = '#9a8a7a'; x.font = 'italic 22px serif'; x.fillText('Рисунок выучит тот, кто сожжёт свиток.', 512, 410);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    return tex;
}

export function drawParchment(item) {
    if (item?.stat === 'pentagram') return drawPentagramParchment(item);
    const info = describeItem(item) || { title: '📜 Свиток', lines: [] };
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 440;
    const x = c.getContext('2d');
    const grad = x.createLinearGradient(0, 0, 1024, 0);
    grad.addColorStop(0, '#d9c08a'); grad.addColorStop(0.08, '#f1e2b8'); grad.addColorStop(0.92, '#f1e2b8'); grad.addColorStop(1, '#d9c08a');
    x.fillStyle = grad; x.fillRect(0, 0, 1024, 440);
    x.strokeStyle = '#a7834a'; x.lineWidth = 4; x.strokeRect(40, 18, 944, 404);
    x.fillStyle = '#5a1a1a'; x.font = 'bold 40px serif'; x.textAlign = 'center';
    x.fillText(info.title.replace(/<[^>]+>/g, ''), 512, 80);
    x.textAlign = 'left';
    let y = 140;
    for (const line of info.lines) {
        let px = 80;
        for (const part of line.split(/(<b>.*?<\/b>)/)) {
            const bold = part.startsWith('<b>');
            x.font = (bold ? 'bold ' : '') + '30px serif';
            x.fillStyle = bold ? '#7a1a00' : '#3a2a1a';
            for (const word of part.replace(/<\/?b>/g, '').split(/(\s+)/)) {
                const w = x.measureText(word).width;
                if (px + w > 950) { y += 38; px = 80; if (!word.trim()) continue; }
                x.fillText(word, px, y);
                px += w;
            }
        }
        y += 50;
    }
    x.fillStyle = '#7a6a4a'; x.font = 'italic 24px serif'; x.textAlign = 'center';
    x.fillText('Прочитать может каждый — выучит тот, кто сожжёт свиток', 512, 404);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    return tex;
}

export class ScrollReading {
    constructor(game) {
        this.game = game;
        this.r = null; // {side, other, item, model, open, touchT, closeT, group, tex, mat}
        this.readingSide = null;
        this.readCam = null;
        this.input = null; // (tests) side → {G, curl, up}: instead of the tracked hands
    }

    /** How closed a hand is round a roller (the index too: a pointing hand holds nothing). */
    _curl(side) {
        if (this.input) return this.input(side).curl;
        const ch = this.game.character;
        return ch.getHoldCurl ? ch.getHoldCurl(side) : ch.getGripCurl ? ch.getGripCurl(side) : 0;
    }

    update(dt) {
        const g = this.game;
        const items = g.items;
        const ch = g.character;
        const r = this.r;
        // which scroll, and is the other hand free?
        const s = items?.heldOf('scroll');
        if (r && (!s || s.model !== r.model || g.combat.dead)) this._close();
        if (!s) return;
        const other = s.side === 'right' ? 'left' : 'right';
        const free = !items.held[other] && !g.weapons.hands[other].held;
        const ho = this._grip(other);
        const curl = this._curl(other);
        if (!this.r) {
            // the free hand takes the other roller: it comes to an end of the scroll OPEN and
            // closes its fingers on it (an open hand passing by, or a fist arriving at it, takes nothing)
            if (!free || !g.currentPose && !this.input) { this._touchT = 0; this._armed = false; return; }
            const d = this._endDist(s.model, ho);
            if (d > END_NEAR * 2) this._armed = false;
            else if (curl < OPEN_CURL) this._armed = true;
            const near = d < END_NEAR;
            const closing = curl > GRAB_CURL && this._armed;
            this._touchT = near && closing ? (this._touchT || 0) + dt : 0;
            if (this._touchT < GRAB_T) return;
            this._touchT = 0;
            this._begin(s, other);
            return;
        }
        const R = this.r;
        // the rollers are in the fists: where the closed fingers are (eased by speed: no tremble)
        const hs = this._steady(R, 'hs', this._grip(s.side), dt);
        if (R.rolling) { this._rollBack(R, hs, dt); return; }
        if (!free) { this._letGo(R); this._rollBack(R, hs, dt); return; }
        const hoG = this._steady(R, 'ho', ho, dt);
        // the fingers on the roller opened: that hand let it go
        R.letT = curl < OPEN_CURL ? (R.letT || 0) + dt : 0;
        // pulled further apart than the parchment is long: the roller slips out of the fingers
        const dist = hs.distanceTo(hoG);
        R.slipT = dist > MAX_W + SLIP ? (R.slipT || 0) + dt : 0;
        // an arm dropped to the side: it rolls up again (hands brought together only roll it up
        // between them — the other hand still holds its roller, so it does not jump closed and open)
        R.closeT = !this._up(hs) || !this._up(hoG) ? R.closeT + dt : 0;
        if (R.letT > LET_T || R.slipT > 0.15 || R.closeT > 0.4) { this._letGo(R); this._rollBack(R, hs, dt); return; }
        const want = Math.max(0, Math.min(1, (dist - 0.35) / 1.4));
        R.open += (want - R.open) * Math.min(1, dt * 8);
        this._place(R, hs, hoG, dt);
    }

    /** A hand eased steadily (a still hand's tremble smoothed, a real move followed at once). */
    _steady(R, key, p, dt) {
        const st = R.steady || (R.steady = {});
        if (!R[key]) { st[key] = new Steady({ minCutoff: 2, beta: 10 }); R[key] = p.clone(); return R[key]; }
        return R[key].lerp(p, st[key].alpha(dt > 0 ? R[key].distanceTo(p) / dt : 0, dt));
    }

    /** The second hand let the roller go: its fingers open, the parchment rolls back by itself. */
    _letGo(R) {
        if (R.rolling) return;
        R.rolling = true;
        this.readCam = null;
        const g = this.game;
        const hand = g.character.getActiveHands?.()[R.other];
        if (hand?.setGrip && !g.items.held[R.other] && !g.weapons.hands[R.other].held) hand.setGrip(null);
    }

    /** Rolling back up onto the roller in the first fist (that roller stays in the fist). */
    _rollBack(R, hs, dt) {
        R.w = Math.max(0.12, (R.w || 0.12) - ROLL_V * dt);
        const across = _v6.set(1, 0, 0).applyQuaternion(R.group.quaternion);
        R.group.position.copy(hs).addScaledVector(across, R.sSign * R.w / 2);
        this._unroll(R, R.w);
        if (R.w <= 0.12) this._close();
    }

    _begin(s, other) {
        const g = this.game;
        const tex = drawParchment(s.item);
        const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: 0x3a3020 });
        const parch = new THREE.Mesh(new THREE.PlaneGeometry(1, PARCH_H), mat);
        const rodMat = new THREE.MeshLambertMaterial({ color: 0xf3e2b3 });
        const knob = new THREE.MeshLambertMaterial({ color: 0x5a3a1e });
        const roller = () => {
            const r = new THREE.Group();
            const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, PARCH_H + 0.04, 10), rodMat);
            r.add(rod);
            for (const sy of [-1, 1]) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 8), knob); k.position.y = sy * (PARCH_H / 2 + 0.07); r.add(k); }
            return r;
        };
        const group = new THREE.Group();
        const rollA = roller(), rollB = roller();
        group.add(parch, rollA, rollB);
        g.scene.add(group);
        s.model.visible = false; // (it is the open one now)
        this.r = { side: s.side, other, item: s.item, model: s.model, open: 0, closeT: 0, w: 0.12, sSign: 1, group, parch, rollA, rollB, tex, mat, c: null };
        this.readingSide = s.side;
        const hand = g.character.getActiveHands?.()[other];
        if (hand?.setGrip) hand.setGrip(0.5);
        g.hud.setVoice?.('📜 Разведите руки — свиток раскроется; разожмите вторую руку — свернётся', true);
    }

    /** The parchment between the hands, its face to the reader; the camera comes to it. */
    _place(R, hs, ho, dt) {
        const g = this.game;
        const k = R.open;
        // the parchment between the fists, the rollers in them (the arms come from outside its edges)
        const eye = this._eye(_v4);
        const mid = _v3.addVectors(hs, ho).multiplyScalar(0.5);
        R.c = (R.c || new THREE.Vector3()).copy(mid);
        // across: from fist to fist (as the reader sees it left → right); the face: to the reader
        const across = _v6.subVectors(ho, hs);
        const camRight = _v7.set(1, 0, 0).applyQuaternion(g.camera.quaternion);
        // (which end is in the first fist: −w/2 when the parchment runs from it to the other hand)
        R.sSign = 1;
        if (across.dot(camRight) < 0) { across.negate(); R.sSign = -1; }
        if (across.lengthSq() < 1e-4) across.copy(camRight);
        across.normalize();
        const n = _v5.subVectors(eye, R.c);
        n.addScaledVector(across, -n.dot(across));
        if (n.lengthSq() < 1e-6) n.set(0, 1, 0).cross(across);
        n.normalize();
        const up = _v7.crossVectors(n, across).normalize();
        _m4.makeBasis(across, up, n);
        _q.setFromRotationMatrix(_m4);
        R.group.position.copy(R.c);
        R.group.quaternion.copy(_q);
        // unrolled as far as the hands are apart (at most MAX_W); the text shows as it unrolls
        const w = Math.max(0.12, Math.min(MAX_W, hs.distanceTo(ho)));
        R.w = w;
        this._unroll(R, w);
        // the camera: over the shoulder, the whole parchment in view
        if (g.cameraMode !== 'fpv' && k > 0.15) {
            const cam = g.camera;
            const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect);
            const dist = MAX_W / 0.75 / (2 * Math.tan(hfov / 2));
            this.readCam = { at: R.c, from: (this._from || (this._from = new THREE.Vector3())).copy(R.c).addScaledVector(n, dist), k: Math.min(1, (k - 0.15) * 1.5) };
        } else this.readCam = null;
        if (k > 0.6 && !R.told) {
            R.told = true;
            g.hud.setVoice?.('📜 Свиток раскрыт. Чтобы выучить — сожгите его («Инферно»); разожмите вторую руку — свернётся', true);
        }
    }

    /** The parchment w long between the rollers; the text shows as it unrolls. */
    _unroll(R, w) {
        const seen = Math.max(0.05, Math.min(1, w / MAX_W));
        R.parch.scale.x = w;
        R.tex.repeat.x = seen;
        R.tex.offset.x = (1 - seen) / 2;
        R.rollA.position.x = -w / 2;
        R.rollB.position.x = w / 2;
        // the rollers grow thinner as the parchment comes off them
        const thick = 1 - seen * 0.4;
        R.rollA.scale.set(thick, 1, thick);
        R.rollB.scale.set(thick, 1, thick);
    }

    /** How far a point is from the nearer end of a rolled scroll. */
    _endDist(model, p) {
        model.updateMatrixWorld(true);
        const a = model.localToWorld(_v1.set(-SCROLL_END, 0, 0)).distanceTo(p);
        const b = model.localToWorld(_v1.set(SCROLL_END, 0, 0)).distanceTo(p);
        return Math.min(a, b);
    }

    /** Where a hand's closed fingers are (a roller in the fist). */
    _grip(side) {
        if (this.input) return this.input(side).G;
        const pf = this._pf || (this._pf = { left: {}, right: {} });
        return this.game.weapons.palmFrame(side, pf[side]).G;
    }

    /** A hand held up (not hanging at the side). */
    _up(p) {
        const ch = this.game.character;
        ch.group.updateMatrixWorld(true);
        return _v9.copy(p).applyMatrix4(_m4.copy(ch.group.matrixWorld).invert()).y > 0.2;
    }

    _eye(out) {
        const g = this.game, ch = g.character;
        ch.head.getWorldPosition(out);
        if (g.cameraMode === 'fpv') return out;
        const yaw = ch.group.rotation.y;
        return out.add(_v8.set(Math.sin(yaw) * 1.4, 1.1, Math.cos(yaw) * 1.4));
    }

    _close() {
        const R = this.r;
        this.readingSide = null;
        this.readCam = null;
        this._armed = false; // (to take it again the hand opens and closes again)
        if (!R) return;
        this.r = null;
        const g = this.game;
        g.scene.remove(R.group);
        R.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
        R.mat.dispose(); R.tex.dispose();
        R.rollA.children[0].material.dispose(); R.rollA.children[1].material.dispose();
        R.model.visible = true;
        R.model.scale.setScalar(ITEM_SCALE.scroll || 2);
        const hand = g.character.getActiveHands?.()[R.other];
        if (hand?.setGrip && !g.items.held[R.other] && !g.weapons.hands[R.other].held) hand.setGrip(null);
    }

    dispose() { this._close(); }
}
