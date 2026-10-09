/**
 * ScrollReading.js — opening a scroll with the hands and reading it.
 *
 * A scroll in one fist; the other (empty) hand comes to it and takes the
 * other roller; pulling the hands apart unrolls the parchment between them
 * (the further apart, the more of it is seen). Its pages look at the reader,
 * the camera comes over the shoulder (as for the book). Hands back together —
 * it rolls up again in the first fist.
 *
 * Anybody can read any scroll. Learning is only by burning it (Inferno):
 * whoever burns it gets it (Items.burnHeldScroll).
 */

import * as THREE from 'three';
import { describeItem, ITEM_SCALE } from './ItemTypes.js';

const MAX_W = 2.2; // m of parchment, fully unrolled
const PARCH_H = 0.95;
const TOUCH = 0.6; // the free hand this near the scroll: it takes the other roller
const _v8 = new THREE.Vector3(), _v9 = new THREE.Vector3();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();

/** The text of a scroll, in ink on parchment. */
function drawParchment(item) {
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
        const ho = ch.getHandWorldPosition(other, _v1);
        if (!this.r) {
            // the free hand comes to the scroll: it takes the other roller
            if (!free || !g.currentPose) { this._touchT = 0; return; }
            this._touchT = ho.distanceTo(s.model.position) < TOUCH ? (this._touchT || 0) + dt : 0;
            if (this._touchT < 0.3) return;
            this._touchT = 0;
            this._begin(s, other);
            return;
        }
        if (!free) { this._close(); return; }
        const R = this.r;
        const hs = ch.getHandWorldPosition(s.side, _v2);
        const dist = hs.distanceTo(ho);
        // hands back together (or one dropped to the side): it rolls up again
        R.closeT = dist < 0.4 || !this._up(hs) || !this._up(ho) ? R.closeT + dt : 0;
        if (R.closeT > 0.4) { this._close(); return; }
        const want = Math.max(0, Math.min(1, (dist - 0.35) / 1.4));
        R.open += (want - R.open) * Math.min(1, dt * 8);
        this._place(R, hs, ho, dt);
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
        this.r = { side: s.side, other, item: s.item, model: s.model, open: 0, closeT: 0, group, parch, rollA, rollB, tex, mat, c: null };
        this.readingSide = s.side;
        const hand = g.character.getActiveHands?.()[other];
        if (hand?.setGrip) hand.setGrip(0.5);
        g.hud.setVoice?.('📜 Разведите руки — свиток раскроется; сведите — свернётся', true);
    }

    /** The parchment between the hands, its face to the reader; the camera comes to it. */
    _place(R, hs, ho, dt) {
        const g = this.game;
        const k = R.open;
        // (the fists hold the rollers low; the parchment a little beyond them, so the arms don't hide it)
        const eye = this._eye(_v4);
        const mid = _v3.addVectors(hs, ho).multiplyScalar(0.5);
        mid.addScaledVector(_v5.subVectors(mid, eye).setY(0).normalize(), 0.3);
        mid.y += 0.4;
        if (!R.c) R.c = mid.clone(); else R.c.lerp(mid, Math.min(1, dt * 12));
        const n = _v5.subVectors(eye, R.c).normalize();
        // across: from hand to hand, as the reader sees it left → right
        const across = _v6.subVectors(ho, hs).addScaledVector(n, -_v6.dot(n));
        const camRight = _v7.set(1, 0, 0).applyQuaternion(g.camera.quaternion);
        if (across.dot(camRight) < 0) across.negate();
        if (across.lengthSq() < 1e-4) across.copy(camRight);
        across.normalize();
        const up = _v7.crossVectors(n, across).normalize();
        _m4.makeBasis(across, up, n);
        _q.setFromRotationMatrix(_m4);
        R.group.position.copy(R.c);
        R.group.quaternion.copy(_q);
        // unrolled as far as the hands are apart (at most MAX_W); the text shows as it unrolls
        const w = Math.max(0.12, Math.min(MAX_W, hs.distanceTo(ho)));
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
        // the camera: over the shoulder, the whole parchment in view
        if (g.cameraMode !== 'fpv' && k > 0.15) {
            const cam = g.camera;
            const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect);
            const dist = MAX_W / 0.75 / (2 * Math.tan(hfov / 2));
            this.readCam = { at: R.c, from: (this._from || (this._from = new THREE.Vector3())).copy(R.c).addScaledVector(n, dist), k: Math.min(1, (k - 0.15) * 1.5) };
        } else this.readCam = null;
        if (k > 0.6 && !R.told) {
            R.told = true;
            g.hud.setVoice?.('📜 Свиток раскрыт. Чтобы выучить — сожгите его («Инферно»); сведите руки — свернётся', true);
        }
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
