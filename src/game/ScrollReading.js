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
import { holoParts, holoPlain } from './HoloText.js';
import { Steady } from '../entities/SimplifiedHand.js';
import { figureOf, figureLines } from './PentagramRules.js';
import { pentagramSpell } from './PentagramWords.js';
import { encode, decode, Throttle } from './ScrollNet.js';
import { paintParchment, schoolOf, artKey } from '../fx/ScrollArt.js';

const MAX_W = 2.2; // m of parchment, fully unrolled
const PARCH_H = 0.95;
const END_NEAR = 0.5; // the free hand this near an end of the scroll can take that roller…
const GRAB_CURL = 0.4; // …by closing its fingers this much…
const GRAB_T = 0.1; // …for this long (s)
const OPEN_CURL = 0.22; // fingers opened this much: the roller is let go…
const ARM_CURL = 0.45; // …and a hand open this much, coming to the end, is ready to take it (the author: «должен открываться легче»)
const LET_T = 0.4; // …after this long (s)
const SLIP = 0.6; // m further apart than the parchment is long: the roller slips out of the fingers
const ROLL_V = 7; // m/s: a let-go parchment rolls itself back up this fast
const SCROLL_END = 0.21; // the ends of the scroll model (local x)
const _v8 = new THREE.Vector3(), _v9 = new THREE.Vector3();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qs = new THREE.Quaternion();

/** Faces already drawn (a kind of scroll, not a frame: ~70 spells at most; the oldest go first). */
const _faces = new Map();
const FACES_MAX = 48;

/** The face of a scroll as a canvas: the school's colours, a drop cap, runes, a picture of the spell (ScrollArt.js). Cached by kind. */
function faceOf(item) {
    const school = schoolOf(item);
    let spec;
    if (item?.stat === 'pentagram') {
        // a drawing-scroll: the pentagram's own figure as the picture, its words beside it
        const P = figureOf(item.pent) || figureOf('devil');
        const css = (n) => '#' + n.toString(16).padStart(6, '0');
        spec = {
            school, title: P.ru,
            lines: [
                [{ text: 'Чтобы создать её, направьте палочку на землю и скажите: ', bold: false }, { text: pentagramSpell(P.id) || '', bold: true }],
                [{ text: P.id === 'devil' ? 'Так вы получите силу убитого мага.' : P.def?.dark ? 'Тёмный знак для особого обряда.' : 'Светлый знак с особой пользой.', bold: false }],
            ],
            note: 'Пентаграмму выучит тот, кто сожжёт свиток',
            custom: (x, { cx, cy, R }) => {
                const g = x.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
                g.addColorStop(0, 'rgba(255,248,226,0.95)'); g.addColorStop(1, 'rgba(228,205,150,0.85)');
                x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
                x.strokeStyle = '#b8862a'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
                const r = R * 0.78;
                x.shadowColor = css(P.ink); x.shadowBlur = 10; x.strokeStyle = '#6a0a22'; x.lineWidth = 4.5; x.lineJoin = 'round'; x.lineCap = 'round';
                x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
                x.lineWidth = 3.5;
                for (const poly of figureLines(P.id)) {
                    x.beginPath();
                    poly.forEach((p, i) => { const px = cx + p[0] * r, py = cy - p[1] * r; if (i) x.lineTo(px, py); else x.moveTo(px, py); });
                    x.closePath(); x.stroke();
                }
                x.shadowBlur = 0;
            },
        };
    } else {
        const info = describeItem(item) || { title: '📜 Свиток', lines: [] };
        spec = {
            school, title: holoPlain(info.title).replace(/^📜\s*/u, ''),
            lines: info.lines.filter((l) => holoPlain(l).trim()).map((l) => holoParts(l)), // (a scroll without a kind: no empty gap)
            note: 'Прочитать может каждый — выучит тот, кто сожжёт свиток',
        };
    }
    const key = artKey(spec);
    let c = _faces.get(key);
    if (!c) {
        c = document.createElement('canvas');
        c.width = 1024; c.height = 440;
        paintParchment(c.getContext('2d'), c.width, c.height, spec);
        if (_faces.size >= FACES_MAX) _faces.delete(_faces.keys().next().value);
        _faces.set(key, c);
    }
    return c;
}

export function drawParchment(item) {
    const tex = new THREE.CanvasTexture(faceOf(item));
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 4;
    return tex;
}

/** The parchment between two rollers (the same for the reader and for everybody who watches). */
function buildParchment(item) {
    const tex = drawParchment(item);
    const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: 0x3a3020 });
    const parch = new THREE.Mesh(new THREE.PlaneGeometry(1, PARCH_H), mat);
    const rodMat = new THREE.MeshLambertMaterial({ color: 0xf3e2b3 });
    const knob = new THREE.MeshLambertMaterial({ color: 0x5a3a1e });
    const roller = () => {
        const r = new THREE.Group();
        r.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, PARCH_H + 0.04, 10), rodMat));
        for (const sy of [-1, 1]) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 8), knob); k.position.y = sy * (PARCH_H / 2 + 0.07); r.add(k); }
        return r;
    };
    const group = new THREE.Group();
    const rollA = roller(), rollB = roller();
    group.add(parch, rollA, rollB);
    return { group, parch, rollA, rollB, tex, mat };
}

function unrollParts(R, w) {
    const seen = Math.max(0.05, Math.min(1, w / MAX_W));
    R.parch.scale.x = w;
    R.tex.repeat.x = seen;
    R.tex.offset.x = (1 - seen) / 2;
    R.rollA.position.x = -w / 2;
    R.rollB.position.x = w / 2;
    const thick = 1 - seen * 0.4;
    R.rollA.scale.set(thick, 1, thick);
    R.rollB.scale.set(thick, 1, thick);
}

function disposeParchment(R) {
    R.group.parent?.remove(R.group);
    R.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    R.mat.dispose(); R.tex.dispose();
    R.rollA.children[0].material.dispose(); R.rollA.children[1].material.dispose();
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
            else if (curl < ARM_CURL) this._armed = true;
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
        // (a hand the camera lost for a moment: the parchment stays where it was — it neither jerks nor closes)
        const lostS = this._lost(s.side), lostO = this._lost(other);
        const hs = lostS && R.hs ? R.hs : this._steady(R, 'hs', this._grip(s.side), dt);
        if (R.rolling) { this._rollBack(R, hs, dt); return; }
        if (!free) { this._letGo(R); this._rollBack(R, hs, dt); return; }
        const hoG = lostO && R.ho ? R.ho : this._steady(R, 'ho', ho, dt);
        // the fingers on the roller opened: that hand let it go
        R.letT = curl < OPEN_CURL && !lostO ? (R.letT || 0) + dt : 0;
        // pulled further apart than the parchment is long: the roller slips out of the fingers
        const dist = hs.distanceTo(hoG);
        R.slipT = dist > MAX_W + SLIP ? (R.slipT || 0) + dt : 0;
        // an arm dropped to the side: it rolls up again (hands brought together only roll it up
        // between them — the other hand still holds its roller, so it does not jump closed and open)
        R.closeT = !lostS && !lostO && (!this._up(hs, s.side) || !this._up(hoG, other)) ? R.closeT + dt : 0;
        if (R.letT > LET_T || R.slipT > 0.15 || R.closeT > 0.4) { this._letGo(R); this._rollBack(R, hs, dt); return; }
        const want = Math.max(0, Math.min(1, (dist - 0.3) / 1.1));
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
        const { group, parch, rollA, rollB, tex, mat } = buildParchment(s.item);
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
        // across: from fist to fist, along ANY line between the hands (sideways, up-down, slanted);
        // which end reads first: the one that keeps the text nearest to upright (sideways: left → right,
        // up-down: bottom → top), kept steady (no flipping while the line passes through the tie)
        const across = _v6.subVectors(ho, hs);
        const camRight = _v7.set(1, 0, 0).applyQuaternion(g.camera.quaternion);
        const camUp = _v8.set(0, 1, 0).applyQuaternion(g.camera.quaternion);
        if (across.lengthSq() < 1e-4) across.copy(camRight);
        across.normalize();
        const score = across.dot(camRight) + 0.5 * across.dot(camUp);
        if (R.flip === undefined) R.flip = score < 0;
        else if (R.flip && score > 0.15) R.flip = false;
        else if (!R.flip && score < -0.15) R.flip = true;
        // (which end is in the first fist: −w/2 when the parchment runs from it to the other hand)
        R.sSign = R.flip ? -1 : 1;
        if (R.flip) across.negate();
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
            // (the parchment may stand upright: fit its extent along the screen's width AND height)
            const vt = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), ht = vt * cam.aspect;
            const cr = _v1.set(1, 0, 0).applyQuaternion(cam.quaternion), cu = _v2.set(0, 1, 0).applyQuaternion(cam.quaternion);
            const ex = MAX_W * Math.abs(across.dot(cr)) + PARCH_H * Math.abs(up.dot(cr));
            const ey = MAX_W * Math.abs(across.dot(cu)) + PARCH_H * Math.abs(up.dot(cu));
            const dist = Math.max(ex / 0.75 / (2 * ht), ey / 0.8 / (2 * vt), MAX_W * 0.4);
            this.readCam = { at: R.c, from: (this._from || (this._from = new THREE.Vector3())).copy(R.c).addScaledVector(n, dist), k: Math.min(1, (k - 0.15) * 1.5) };
        } else this.readCam = null;
        if (k > 0.6 && !R.told) {
            R.told = true;
            g.hud.setVoice?.('📜 Свиток раскрыт. Чтобы выучить — сожгите его («Инферно»); разожмите вторую руку — свернётся', true);
        }
    }

    /** The parchment w long between the rollers; the text shows as it unrolls. */
    _unroll(R, w) { unrollParts(R, w); }

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
    _up(p, side) {
        const ch = this.game.character;
        if (!this.input && ch.isArmRaised) return ch.isArmRaised(side);
        ch.group.updateMatrixWorld(true);
        // (the lower hand of an up-down spread is at the belt: only a hand hanging at the side counts as dropped)
        return _v9.copy(p).applyMatrix4(_m4.copy(ch.group.matrixWorld).invert()).y > -0.6;
    }

    /** The camera lost this hand just now. */
    _lost(side) {
        if (this.input) return !!this.input(side).lost;
        const ch = this.game.character;
        return !!ch.handLost?.(side);
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
        disposeParchment(R);
        R.model.visible = true;
        R.model.scale.setScalar(ITEM_SCALE.scroll || 2);
        const hand = g.character.getActiveHands?.()[R.other];
        if (hand?.setGrip && !g.items.held[R.other] && !g.weapons.hands[R.other].held) hand.setGrip(null);
    }

    // ------------------------------------------------------------ others see it
    /** For the others: [second hand 1/2, width cm] while the scroll is open in my hands (also while it rolls back), else undefined. */
    netState(now = performance.now()) {
        const R = this.r;
        const th = this._th || (this._th = new Throttle());
        return th.value(R ? encode(R.other, R.w) : null, now);
    }

    /**
     * Another player's scroll open in their hands (st: netState): the parchment between their fists,
     * as wide as they have unrolled it. `side` — the hand the scroll is held in. Returns false if it is not open.
     */
    placeRemote(ch, model, item, side, st, dt = 0.016) {
        const u = model.userData;
        const d = decode(st);
        if (!d || d.other === side) { this.releaseRemote(model); return false; }
        let rr = u.remoteScroll;
        if (!rr) {
            rr = u.remoteScroll = buildParchment(item);
            rr.w = d.w; rr.pf = { left: {}, right: {} };
            this.game.scene.add(rr.group);
            model.visible = false;
        }
        const w0 = this.game.weapons;
        const hs = _v1.copy(w0.palmFrame(side, rr.pf[side], ch).G);
        const ho = _v2.copy(w0.palmFrame(d.other, rr.pf[d.other], ch).G);
        rr.w += (d.w - rr.w) * Math.min(1, dt * 12);
        const across = _v6.subVectors(ho, hs);
        if (across.lengthSq() < 1e-4) across.set(1, 0, 0);
        across.normalize();
        // which way the text reads: kept like the reader's (upright for whoever looks at it)
        const cam = this.game.camera;
        const camRight = _v7.set(1, 0, 0).applyQuaternion(cam.quaternion);
        if (across.dot(camRight) < -0.15) rr.flip = true; else if (across.dot(camRight) > 0.15) rr.flip = false;
        const dir = rr.flip ? _v8.copy(across).negate() : across;
        const eye = ch.head.getWorldPosition(_v4);
        const centre = _v3.copy(hs).addScaledVector(across, rr.w / 2);
        const n = _v5.subVectors(eye, centre);
        n.addScaledVector(dir, -n.dot(dir));
        if (n.lengthSq() < 1e-6) n.set(0, 1, 0).cross(dir);
        n.normalize();
        const up = _v9.crossVectors(n, dir).normalize();
        _m4.makeBasis(dir, up, n);
        rr.group.quaternion.setFromRotationMatrix(_m4);
        rr.group.position.copy(centre);
        unrollParts(rr, rr.w);
        return true;
    }

    releaseRemote(model) {
        const rr = model.userData.remoteScroll;
        if (!rr) return;
        model.userData.remoteScroll = null;
        disposeParchment(rr);
        model.visible = true;
    }

    dispose() { this._close(); }
}
