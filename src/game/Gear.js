/**
 * Gear.js — shields, the bow, Thor's hammer and the weather.
 *
 * Shield (in a hand, held in front): spells and blows from the front stop
 * on it. A plain shield breaks under a strong spell (it still stops that
 * one); a magic shield has its own strength (20–50, comes back by itself)
 * and breaks only when it is nearly spent and a strong spell hits.
 *
 * Bow (in one hand): bring the other hand to the bow (or reach over the
 * shoulder for the quiver and bring the arrow to the bow) — an arrow is on the
 * string. Close the fingers on the string at the bow and draw the hand back to
 * the chin: the string and the arrow follow the hand all the way (BowDraw.js);
 * open the fingers — the arrow flies, as strong as it was drawn. The hand
 * brought forward again lets the string down without a shot. Fully drawn, a
 * faint line of dots shows where the arrow will fly. The arrow flies along the
 * bow, where the bow arm points (shoulder → bow hand); the bow turns to it. The
 * arrow rests on top of the bow fist and the drawing fingers hold the string at
 * its nock. Everybody sees a drawn bow (netBow). Creative: the quiver never
 * runs out.
 *
 * Thor's hammer: only in a thunderstorm. Raise it above the head — lightning
 * strikes it; then aim it at a creature for up to 5 s (like «Lightning
 * Strike», but it never hurts you). 7 strength. A success can be repeated
 * up to 3 times per storm; a miss loses the charge until the next storm.
 *
 * Weather: every 5 minutes there is a 17% chance of a thunderstorm (2–3
 * minutes of rain and dark clouds). The host decides; everybody sees it.
 */

import * as THREE from 'three';
import { arrowModel, disposeModel, setBowString, ARROW_SCALE } from './ItemTypes.js';
import { enchantMul, shieldMul, shieldPlain, enchantAdd } from './Enchant.js';
import { shieldsNow, bounceOffShields } from './ShieldBounce.js';
import { SPELL_COST } from './Combat.js';
import { spiderDist } from './Spider.js';
import { dragonDist } from './Dragons.js';
import { phoenixDist } from './Phoenixes.js';
import { owlDist } from './Owls.js';
import { spencerBody } from './SpencerBirds.js';
const _spCap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }, _spV = new THREE.Vector3();
import { gargoyleDist } from './GargoyleModel.js';
import { iceBody } from './IceQueen.js';
import { segmentSegmentDistSq } from '../core/math.js';
import { BowDraw, drawProgress } from './BowDraw.js';

const _cc = new THREE.Vector3();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _ba = new THREE.Vector3();
const _bu = new THREE.Vector3();
const _fw = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const STRONG = 15; // spells costing this much break a plain shield
const HINT_NOCKED = '🏹 Стрела на тетиве — сожмите пальцы на тетиве и отведите руку к подбородку, разожмите — выстрел';

/** The arrow rests on top of the bow fist: this far above the grip's middle (bow-local units). */
export const ARROW_REST = 0.1;
/** The string is in the drawing fingers: this far beyond the wrist (world). */
const HOLD_FINGERS = 0.35;

/**
 * Where a drawn arrow lies: along `dir`, resting on top of the bow fist
 * (ARROW_REST above the grip, the bow standing upright as Items turns it) — so
 * the shaft runs beside the bow hand and along the top of the bow arm, never
 * through them; its nock on the string, `pull` behind the string's rest line.
 * @param {THREE.Vector3} grip   the bow's grip (the bow hand)
 * @param {THREE.Vector3} dir    the aim (unit)
 * @param {number} scale         the bow model's scale
 * @param {number} tipX          the string's rest line (bow-local x)
 * @param {number} pull          how far the string is drawn (world)
 * @param {THREE.Vector3} fwd    the hero's facing (the bow's up when aiming straight up or down)
 * @param {THREE.Vector3} outRest  where the shaft passes the bow
 * @param {THREE.Vector3} outNock  the nock (on the string, in the drawing fingers)
 */
export function arrowOnBow(grip, dir, scale, tipX, pull, fwd, outRest, outNock) {
    const up = _bu.set(0, 1, 0).addScaledVector(dir, -dir.y);
    if (up.lengthSq() < 1e-3) up.copy(fwd).addScaledVector(dir, -fwd.dot(dir));
    up.normalize();
    outRest.copy(grip).addScaledVector(up, ARROW_REST * scale);
    outNock.copy(outRest).addScaledVector(dir, tipX * scale - pull);
    return outNock;
}

/** How far (rad) the drawing hand may disagree with the bow arm and still refine the aim. */
export const BOW_AGREE = (25 * Math.PI) / 180;

/**
 * Where an arrow on the string flies. In real archery the arrow lies from the
 * anchor (the drawing hand at the face) through the bow grip — nearly the bow
 * arm's own line from the shoulder. The camera hardly sees depth, so the two
 * hands often come out side by side and the line between them would go
 * sideways: the bow arm (shoulder → bow hand) is the aim, and the drawing hand
 * only refines it a little when it agrees (within BOW_AGREE), fading out
 * smoothly as it disagrees more.
 * @param {THREE.Vector3} shoulder  the bow arm's shoulder
 * @param {THREE.Vector3} bowHand   the bow hand (the end of the bow arm)
 * @param {THREE.Vector3} grip      the bow's grip (where the arrow passes)
 * @param {THREE.Vector3} drawHand  the drawing hand (on the string)
 * @param {THREE.Vector3} out
 * @param {THREE.Vector3|null} fallback  (a degenerate arm: e.g. the hero's facing)
 */
export function bowAim(shoulder, bowHand, grip, drawHand, out = new THREE.Vector3(), fallback = null) {
    out.subVectors(bowHand, shoulder);
    if (out.lengthSq() < 1e-6) { if (fallback) out.copy(fallback); else out.set(0, 0, -1); }
    out.normalize();
    const pull = _ba.subVectors(grip, drawHand);
    const len = pull.length();
    if (len > 0.05) {
        pull.divideScalar(len);
        const w = 0.5 * Math.max(0, 1 - out.angleTo(pull) / BOW_AGREE);
        if (w > 0) out.lerp(pull, w).normalize();
    }
    return out;
}

export class Gear {
    constructor(game) {
        this.game = game;
        this.arrows = []; // flying / stuck arrows
        this.nock = null; // {side, model, state: 'hand'|'nocked', draw}
        this.shieldPower = new Map(); // shield uid -> current strength (magic ones)
        this._weatherT = 0;
        this.hammer = { uses: 0, failed: false, storm: 0 };
    }

    // ================================================================ shields
    _heldShield() {
        return this.game.items?.heldOf('shield') || null;
    }

    /** Does my held shield face `from`? (spells / blows from the front) */
    shieldFaces(from) {
        const s = this._heldShield();
        if (!s) return false;
        const ch = this.game.character;
        const c = ch.group.position;
        const fwd = _v.set(-Math.sin(ch.group.rotation.y), 0, -Math.cos(ch.group.rotation.y));
        const to = _v2.subVectors(from, c).setY(0).normalize();
        return fwd.dot(to) > 0.3;
    }

    /** A spell (or a blow) stopped on the shield: it wears it (and may break it). */
    shieldTook(kind) {
        const s = this._heldShield();
        if (!s) return;
        const g = this.game;
        const cost = SPELL_COST[kind] ?? (kind === 'melee' ? 2 : 8);
        const it = s.item;
        let broken = false;
        if (it.magic) {
            const left = this.shieldPower.get(it.uid) ?? it.max * shieldMul(it);
            if (left < 5 && cost >= STRONG) broken = true;
            this.shieldPower.set(it.uid, Math.max(0, left - cost));
        } else if (cost >= STRONG + shieldPlain(it)) broken = true;
        const p = s.model.position;
        for (let i = 0; i < 18; i++) g.fx.spark(p, it.magic ? 0x9fd8ff : 0xffe0a0, 0.1, _v.set((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6), 0.5);
        if (broken) {
            g.items.releaseHand(s.side);
            for (let i = 0; i < 30; i++) g.fx.spark(p, 0x8b5a2b, 0.18, _v.set((Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8), 0.9);
            g.hud.setVoice('💥 Щит разбит!', true);
        } else g.hud.setVoice(it.magic ? `🛡️ Щит выдержал (сила ${Math.round(this.shieldPower.get(it.uid))})` : '🛡️ Щит выдержал', true);
    }

    // =================================================================== bow
    /** Creative: the quiver never runs out. */
    _endless() { return this.game.config.mode === 'creative'; }

    _updateBow(dt) {
        const g = this.game;
        const ch = g.character;
        const bow = g.items.heldOf('bow');
        if (!bow) { this._dropNock(); return; }
        const other = bow.side === 'right' ? 'left' : 'right';
        const held = g.items.held[bow.side];
        // into the other hand: grab the bow with that fist and open the bow hand (not while drawing)
        if (this._switchBow(bow, other, dt)) return;
        if (g.items.held[other] || g.weapons.hands[other].held) {
            this._dropNock(); if (held) held.aim = null;
            // (the drawing hand is busy: say so once when it comes to the bow — not just nothing happening)
            const pic = this._picApart(bow.side, other);
            const atBow = ch.getHandWorldPosition(other, _v).distanceTo(bow.model.position) < 1.0 || (pic != null && pic < 0.6);
            if (atBow && !this._busySaid) {
                this._busySaid = true;
                const what = g.items.held[other] ? (g.items.held[other].item.kind === 'wand' ? 'палочка' : 'вещь') : 'оружие';
                g.hud.setVoice(`🏹 В другой руке ${what} — уберите её (в карман), чтобы натянуть тетиву`, true);
            }
            return;
        }
        this._busySaid = false;
        const it = bow.item;
        ch.group.updateMatrixWorld(true);
        _inv.copy(ch.group.matrixWorld).invert();
        const hand = ch.getHandWorldPosition(other, new THREE.Vector3());
        const local = hand.clone().applyMatrix4(_inv);
        const bowPos = bow.model.position;
        const has = this._endless() || it.arrows > 0;
        // where the drawing hand is on its way from the bow to the chin (see BowDraw)
        const way = drawProgress(this._picBow(bow.side, other), hand.distanceTo(bowPos));
        // 1) an arrow: from the quiver (the hand over the shoulder) or simply by
        //    bringing the other hand to the bow — it is on the string at once
        if (!this.nock) {
            if (held) held.aim = null;
            const quiver = local.y > 0.9 && local.z > 0.1;
            const atBow = way.near;
            if (quiver || atBow) {
                if (!has) { if (!this._noArrowsSaid) { this._noArrowsSaid = true; g.hud.setVoice('🏹 Стрел больше нет — найдите стрелы', true); } return; }
                this._noArrowsSaid = false;
                const model = arrowModel();
                g.scene.add(model);
                this.nock = { side: other, model, state: atBow ? 'nocked' : 'hand', draw: 0, t: 0, string: new BowDraw() };
                g.hud.setVoice(atBow ? HINT_NOCKED : '🏹 Стрела в руке — поднесите её к луку', true);
            }
            this._bowString(bow);
            return;
        }
        const n = this.nock;
        n.t += dt;
        if (n.state === 'hand') {
            n.model.position.copy(hand);
            n.model.quaternion.setFromUnitVectors(_v.set(0, 1, 0), _v2.subVectors(bowPos, hand).normalize());
            if (way.near) { n.state = 'nocked'; n.t = 0; g.hud.setVoice(HINT_NOCKED, true); }
            return;
        }
        // 2) the fingers on the string: it follows the hand back to the chin (see BowDraw)
        const tracked = ch.isHandTracked ? ch.isHandTracked(other) : true;
        const curl = tracked ? (ch.getGripCurl ? ch.getGripCurl(other) : 1) : null;
        const was = n.draw;
        const ev = n.string.step({ progress: way.progress, near: way.near, take: way.take, curl }, dt);
        n.draw = n.string.draw;
        if (ev?.type === 'take') g.sound?.playBowDraw?.(0.5);
        if (was < 0.9 && n.draw >= 0.9) g.sound?.playBowDraw?.(1);
        // the arrow goes along the bow arm (shoulder → bow hand), refined by the drawing hand
        // only when it agrees — never along the hands' sideways line (see bowAim)
        const shoulder = (bow.side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor).getWorldPosition(_v4);
        const yaw = ch.group.rotation.y;
        const fwd = _fw.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        const dir = bowAim(shoulder, ch.getHandWorldPosition(bow.side, _v5), bowPos, n.string.held ? hand : bowPos, _v3, fwd);
        // the bow turns to where the arrow goes; the string follows the drawing fingers back
        // (a «V» from the tips), the arrow lies on top of the bow fist with its nock on the string
        if (held) held.aim = dir.clone();
        const S = bow.model.userData.bowString;
        const sc = bow.model.scale.x;
        const pull = n.draw * (S ? S.R * 1.1 * sc : 1.2);
        if (S) setBowString(bow.model, S.tipX - pull / sc, ARROW_REST, n.draw);
        const nock = arrowOnBow(bowPos, dir, sc, S ? S.tipX : 0, pull, fwd, n.rest || (n.rest = new THREE.Vector3()), n.at || (n.at = new THREE.Vector3()));
        const half = 0.4 * ARROW_SCALE;
        n.model.position.copy(nock).addScaledVector(dir, half);
        n.model.quaternion.setFromUnitVectors(_v.set(0, 1, 0), dir);
        // 3) the fingers open: the arrow flies, as strong as it was drawn (hardly drawn: the string just goes back)
        if (ev?.type === 'shoot') {
            this._shoot(bow, ev.power, dir.clone());
            if (held) held.aim = null;
            return;
        }
        if (ev?.type === 'letdown') g.hud.setVoice('🏹 Тетива отпущена без выстрела', true);
        this._aimLine(n.string.held ? n.draw : 0, n.rest, dir);
    }

    /** My drawn bow for the others: [the bow hand (0 right, 1 left), how far drawn] or undefined. */
    netBow() {
        const n = this.nock, bow = n && this.game.items?.heldOf('bow');
        if (!bow || n.state !== 'nocked') return undefined;
        return [bow.side === 'left' ? 1 : 0, Math.round(n.draw * 100) / 100];
    }

    /**
     * Other players' bows: an arrow on the string, the bow turned along the bow arm and
     * the string drawn as far as they draw it (their own computer says how far).
     */
    _updateRemoteBows(dt) {
        const g = this.game;
        const rb = this._rbows || (this._rbows = new Map()); // id -> {model (the arrow), bow}
        for (const [id, r] of g.remotes || []) {
            const bw = r.target?.bw;
            const cur = g.items?.remoteHeld?.get(id);
            const side = Array.isArray(bw) ? (bw[0] ? 'left' : 'right') : null;
            const h = side && cur?.[side];
            let e = rb.get(id);
            if (!h || h.item.kind !== 'bow' || r.dead) {
                if (e) { if (e.bow.model) setBowString(e.bow.model, null); g.scene.remove(e.model); disposeModel(e.model); rb.delete(id); }
                continue;
            }
            if (!e || e.bow !== h) {
                if (e) { g.scene.remove(e.model); disposeModel(e.model); }
                e = { model: arrowModel(), bow: h, draw: 0, rest: new THREE.Vector3(), at: new THREE.Vector3() };
                g.scene.add(e.model);
                rb.set(id, e);
            }
            // (smoothly between their messages)
            const want = Math.max(0, Math.min(1, +bw[1] || 0));
            e.draw += (want - e.draw) * Math.min(1, dt * 12);
            const ch = r.character;
            const shoulder = (side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor).getWorldPosition(_v4);
            const yaw = ch.group.rotation.y;
            const fwd = _fw.set(-Math.sin(yaw), 0, -Math.cos(yaw));
            const dir = bowAim(shoulder, ch.getHandWorldPosition(side, _v5), h.model.position, h.model.position, _v3, fwd);
            const up = _v2.set(0, 1, 0).addScaledVector(dir, -dir.y);
            if (up.lengthSq() < 1e-3) up.copy(fwd); else up.normalize();
            h.model.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, up, _v.crossVectors(dir, up)));
            const S = h.model.userData.bowString, sc = h.model.scale.x;
            const pull = e.draw * (S ? S.R * 1.1 * sc : 1.2);
            if (S) setBowString(h.model, S.tipX - pull / sc, ARROW_REST, e.draw);
            const nock = arrowOnBow(h.model.position, dir, sc, S ? S.tipX : 0, pull, fwd, e.rest, e.at);
            e.model.position.copy(nock).addScaledVector(dir, 0.4 * ARROW_SCALE);
            e.model.quaternion.setFromUnitVectors(_v.set(0, 1, 0), dir);
        }
        for (const [id, e] of rb) if (!g.remotes?.has(id)) { g.scene.remove(e.model); disposeModel(e.model); rb.delete(id); }
    }

    /**
     * The drawing hand and the bow in the camera's picture (x times the picture's aspect,
     * so distances are true), with the anchor just under the mouth; null: not seen.
     */
    _picBow(bowSide, other) {
        const p = this.game.currentPose;
        const wb = p?.[bowSide + 'Wrist'], wh = p?.[other + 'Wrist'], sl = p?.leftShoulder, sr = p?.rightShoulder;
        if (!wb || !wh || !sl || !sr) return null;
        const a = p.aspect || 4 / 3;
        const sw = Math.hypot((sl.x - sr.x) * a, sl.y - sr.y);
        const m = p.mouth || (p.nose ? { x: p.nose.x, y: p.nose.y + 0.25 * sw } : null);
        return {
            hand: { x: wh.x * a, y: wh.y }, bow: { x: wb.x * a, y: wb.y }, sw,
            anchor: m ? { x: m.x * a, y: m.y + 0.15 * sw } : null,
        };
    }

    /**
     * A faint line of dots where the arrow will fly — only while the bow is fully drawn
     * (the same flight as the arrow's: its speed, its fall).
     */
    _aimLine(draw, rest, dir) {
        const k = Math.max(0, Math.min(1, (draw - 0.85) / 0.12));
        let L = this._sight;
        if (!k) { if (L) L.visible = false; return; }
        const N = 18;
        if (!L) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
            L = this._sight = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff4d6, size: 0.07, transparent: true, opacity: 0, depthWrite: false }));
            L.frustumCulled = false;
            this.game.scene.add(L);
        }
        L.visible = true;
        L.material.opacity = 0.35 * k;
        const arr = L.geometry.attributes.position.array;
        const speed = 22 + draw * 58;
        for (let i = 0; i < N; i++) {
            const t = (0.03 + i * 0.022); // (s of flight: ~2 … 30 m ahead)
            arr[i * 3] = rest.x + dir.x * (0.8 + speed * t);
            arr[i * 3 + 1] = rest.y + dir.y * (0.8 + speed * t) - 4.9 * t * t;
            arr[i * 3 + 2] = rest.z + dir.z * (0.8 + speed * t);
        }
        L.geometry.attributes.position.needsUpdate = true;
    }

    _bowString(bow) { setBowString(bow.model, null); } // (at rest: straight)

    /**
     * The drawing fingers hold the string: the hero's drawing hand is shown at the
     * nock. (The camera hardly sees how far a hand is, so the tracked hand at the
     * chin comes out far off the arrow's line; only the picture is bent to the
     * string — the draw and the release still read the tracked hand.) Eased in as
     * the arrow goes on the string, eased out after the shot.
     */
    _updateDrawHand(dt) {
        const h = this._hold || (this._hold = { side: null, w: 0, at: new THREE.Vector3() });
        const n = this.nock;
        if (n && n.state === 'nocked' && n.string?.held && n.at && !this.game.combat?.dead) {
            if (h.side !== n.side) h.w = 0;
            h.side = n.side;
            h.at.copy(n.at);
            h.w = Math.min(1, h.w + dt * 8);
        } else h.w = Math.max(0, h.w - dt * 5);
        if (h.w > 0 && h.side) this.game.character.reachHand?.(h.side, h.at, h.w * h.w * (3 - 2 * h.w), HOLD_FINGERS);
    }

    /**
     * The bow into the other hand: that hand's fist on the bow and the bow hand
     * opened for a moment (not while an arrow is drawn).
     */
    _switchBow(bow, other, dt) {
        const g = this.game;
        const ch = g.character;
        // (never with an arrow on the string or in the hand: a bow fist the camera sees edge-on often
        // reads "open" — the drawing hand at the string must not take the bow away from it)
        if (this.nock) { this._swT = 0; return false; }
        const near = ch.getGripObject(other).getWorldPosition(_v).distanceTo(bow.model.position) < 0.6;
        const fist = (ch.getGripCurl?.(other) ?? 0) > 0.6, open = (ch.getGripCurl?.(bow.side) ?? 1) < 0.25;
        this._swT = near && fist && open ? (this._swT || 0) + dt : 0;
        if (this._swT < 0.6) return false;
        this._swT = 0;
        this._dropNock();
        const item = g.items.releaseHand(bow.side);
        g.items.takeIntoHand(item, other);
        g.hud.setVoice('🏹 Лук в другой руке', true);
        return true;
    }

    /**
     * How far apart the two wrists are in the camera's picture, in shoulder widths (null: not seen).
     * The picture is sure of it, unlike the arm's depth.
     */
    _picApart(a, b) {
        const p = this.game.currentPose;
        const wa = p?.[a + 'Wrist'], wb = p?.[b + 'Wrist'], sl = p?.leftShoulder, sr = p?.rightShoulder;
        if (!wa || !wb || !sl || !sr) return null;
        const sw = Math.hypot(sl.x - sr.x, sl.y - sr.y);
        if (sw < 0.02) return null;
        return Math.hypot(wa.x - wb.x, wa.y - wb.y) / sw;
    }

    _dropNock() {
        if (!this.nock) return;
        this.game.scene.remove(this.nock.model);
        disposeModel(this.nock.model);
        this.nock = null;
    }

    _shoot(bow, draw, dir) {
        const g = this.game;
        const it = bow.item;
        // from where it lay on the bow (on top of the fist), a little in front of it
        const from = (this.nock?.rest || bow.model.position).clone().addScaledVector(dir, 0.8);
        this._dropNock();
        setBowString(bow.model, null); // (the string snaps back)
        if (!this._endless()) it.arrows = Math.max(0, (it.arrows || 0) - 1);
        const speed = 22 + draw * 58;
        const dmg = (2 + draw * 7) * (it.magic ? 1 + (it.bonus || 0) / 100 : 1) * enchantMul(it);
        this.fire(from, dir.multiplyScalar(speed), dmg, g.localId);
        if (g.sync) g.sync.arrow?.(from, dir, dmg);
        g.sound?.playBowRelease?.(draw);
        g.hud.setVoice(`🏹 Выстрел! (сила ${Math.round(draw * 100)}%${this._endless() ? '' : `, стрел: ${it.arrows}`})`, true);
    }

    /** An arrow flies (on every machine; the host hurts zombies, everybody hurts only himself). */
    fire(from, vel, dmg, by) {
        const model = arrowModel();
        model.position.copy(from);
        this.game.scene.add(model);
        this.arrows.push({ model, vel: vel.clone(), dmg, by, life: 30, stuck: false, hit: new Set() });
    }

    _updateArrows(dt) {
        const g = this.game;
        // the shields of light up now (a «Protection» / a dome mirrors an arrow: ShieldBounce.js)
        const shields = this.arrows.some((a) => !a.stuck) ? shieldsNow(g) : [];
        for (let i = this.arrows.length - 1; i >= 0; i--) {
            const a = this.arrows[i];
            a.life -= dt;
            if (a.life <= 0) { g.scene.remove(a.model); disposeModel(a.model); this.arrows.splice(i, 1); continue; }
            if (a.stuck) continue;
            const p = a.model.position;
            a.vel.y -= 9.8 * dt;
            const steps = Math.max(1, Math.ceil(a.vel.length() * dt / 0.4));
            for (let s = 0; s < steps && !a.stuck; s++) {
                const was = _v3.copy(p);
                p.addScaledVector(a.vel, dt / steps);
                // a house's sphere of protection: the arrow stops on it and falls (HouseWards.js)
                const ward = g.wards?.segmentHit(was, p);
                if (ward) { p.copy(ward); a.vel.set(0, -2, 0); a.stuck = true; a.life = Math.min(a.life, 4); break; }
                // a «Protection» / «Protection Maxima»: the arrow is mirrored off it (no mana: it is no spell)
                if (shields.length && bounceOffShields(shields, was, p, a.vel, a.by)) {
                    for (let k = 0; k < 8; k++) g.fx.spark(p, k % 2 ? 0x9fd8ff : 0xffffff, 0.1, _v2.set((Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5), 0.35);
                    g.sound?.playFrozenHit?.();
                    a.by = null; // (mirrored: it may now hit anybody — its shooter too)
                    break;
                }
                // creatures
                if (g.authority) {
                    for (const z of g.zombies) {
                        if (z.isDead || a.hit.has(z)) continue;
                        if (_v.copy(z.group.position).add(_v2.set(0, 0.6, 0)).distanceTo(p) < 0.9) {
                            a.hit.add(z);
                            g.damageZombie(z, a.dmg, true, a.vel.clone().normalize(), a.by);
                            this._stick(a, z.group);
                        }
                    }
                }
                if (g.authority) for (const sp of g.spiders?.targets() || []) {
                    if (a.hit.has(sp) || spiderDist(sp, p) > 0.3) continue; // (it touched the big body)
                    a.hit.add(sp);
                    g.spiders.hit(sp, a.dmg, 'arrow');
                    this._stick(a, sp.model);
                }
                // a dragon: the arrows almost bounce off its scales (DragonKinds.ON_DRAGON.arrow)
                if (g.authority) for (const dr of g.dragons?.targets() || []) {
                    if (a.hit.has(dr) || dragonDist(dr, p) > 0.3) continue;
                    a.hit.add(dr);
                    g.dragons.hit(dr, a.dmg, 'arrow', a.by);
                    this._stick(a, dr.model);
                }
                // the Ice Castle's creatures: an arrow in ice (IceQueen.iceDamage: the monsters' ice — half)
                if (g.authority) for (const c of g.iceCastle?.targets() || []) {
                    if (a.hit.has(c)) continue;
                    const e = iceBody(c, this._iceCap || (this._iceCap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }));
                    if (Math.sqrt(segmentSegmentDistSq([p.x, p.y, p.z], [p.x, p.y, p.z], [e.a.x, e.a.y, e.a.z], [e.b.x, e.b.y, e.b.z])) > e.r + 0.15) continue;
                    a.hit.add(c);
                    g.iceCastle.hit(c, a.dmg, 'arrow', a.by);
                    if (!c.dead) this._stick(a, c.model);
                }
                // a phoenix (Phoenixes.js): the arrow goes in, it is hurt (and mostly flies off)
                if (g.authority) for (const f of g.phoenixes?.targets() || []) {
                    if (a.hit.has(f) || phoenixDist(f, p) > 0.2) continue;
                    a.hit.add(f);
                    g.phoenixes.hit(f, a.dmg, 'arrow', a.by);
                    if (!f.dead) this._stick(a, f.model);
                }
                // a clever owl (Owls.js): it senses the arrow and slips aside — no harm; it flies off
                if (g.authority) for (const o of g.owls?.targets() || []) {
                    if (a.hit.has(o) || owlDist(o, p) > 0.2) continue;
                    a.hit.add(o);
                    g.owls.hit(o, a.dmg, 'arrow', a.by);
                }
                // a creature of one's own («Да пусть создастся»): an arrow hurts it (CustomCreatures.hit)
                if (g.authority) for (const o of g.customCreatures?.targets() || []) {
                    if (a.hit.has(o) || g.customCreatures.centre(o, _cc).distanceTo(p) > o.r + 0.3) continue;
                    a.hit.add(o);
                    g.customCreatures.hit(o, a.dmg, 'arrow', a.by);
                }
                // a swamp canary (Canaries.js): an arrow hurts it; its camp turns on the shooter
                if (g.authority) for (const o of g.canaries?.targets() || []) {
                    if (a.hit.has(o)) continue;
                    const cp = o.model.position;
                    if (Math.hypot(cp.x - p.x, cp.z - p.z) > 0.7 || p.y < cp.y || p.y > cp.y + 2.2) continue;
                    a.hit.add(o);
                    g.canaries.hit(o, a.dmg, 'arrow', a.by);
                    if (!o.dead) this._stick(a, o.model);
                }
                // the invisible bird of Spencer (SpencerBirds.js): an arrow kills it (the little body is hit wherever the shaft passes it)
                if (g.authority) for (const o of g.spencers?.targets() || []) {
                    if (a.hit.has(o)) continue;
                    const c = spencerBody(o, _spCap);
                    _spV.copy(c.a).lerp(c.b, 0.5);
                    if (_spV.distanceTo(p) > c.r + 0.2) continue;
                    a.hit.add(o);
                    g.spencers.hit(o, a.dmg, 'arrow', a.by);
                }
                // an infernal gargoyle (Gargoyles.js): stone — an arrow hurts it a little (×0.6) and sticks in nothing
                if (g.authority) for (const o of g.gargoyles?.targets() || []) {
                    if (a.hit.has(o) || gargoyleDist(o, p) > 0.2) continue;
                    a.hit.add(o);
                    g.gargoyles.hit(o, a.dmg, 'arrow', a.by);
                }
                if (g.authority) for (const bd of g.books?.birds?.values() || []) {
                    if (bd.state === 'fall' || a.hit.has(bd) || bd.model.position.distanceTo(p) > 1.2) continue;
                    a.hit.add(bd);
                    g.books.hitBird(bd, 2);
                }
                for (const an of g.animals?.targets() || []) {
                    if (a.hit.has(an)) continue;
                    if (_v.copy(an.group.position).add(_v2.set(0, 0.9, 0)).distanceTo(p) < 1.0) { a.hit.add(an); if (a.by === g.localId) g.animals.hit(an, a.dmg, a.vel.clone(), a.by); this._stick(a, an.group); }
                }
                if (a.by !== g.localId && !g.combat.dead && g.combat.center(_v).distanceTo(p) < 1.0 && !a.hit.has('me')) {
                    a.hit.add('me');
                    const from = _v2.copy(p).addScaledVector(a.vel, -0.1);
                    if (this.shieldFaces(from)) { this.shieldTook('melee'); a.stuck = true; continue; }
                    // magic steel: the arrow just bounces off it (Armor.js) — it flies back a little and falls
                    if (g.armor?.arrowBounces()) {
                        a.vel.set(-a.vel.x * 0.25 + (Math.random() - 0.5) * 2, 2 + Math.random() * 2, -a.vel.z * 0.25 + (Math.random() - 0.5) * 2);
                        a.life = Math.min(a.life, 10);
                        for (let k = 0; k < 8; k++) g.fx?.spark(p, 0x9fd8ff, 0.06, _v.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.3);
                        g.sound?.playFrozenHit?.();
                        continue;
                    }
                    if (g.combat.enabled) g.combat.damage(Math.round(a.dmg), a.by, 'arrow');
                    else g.damageLocalPlayer(Math.round(a.dmg));
                    // the arrow's blow: a small shove (in the head: the head jerks)
                    g.impact?.apply({ v: a.vel.clone().setY(0).setLength(2), from: from.clone(), by: a.by, kind: 'arrow', noShield: true, jolt: p.y > g.character.group.position.y + 1.2 ? 1.5 : 0 });
                    this._stick(a, g.character.group);
                }
                // the ground / walls
                if (g.collision.pointBlocked(p.x, p.y, p.z)) { a.stuck = true; a.life = Math.min(a.life, 12); }
            }
            if (!a.stuck) a.model.quaternion.setFromUnitVectors(_v.set(0, 1, 0), _v2.copy(a.vel).normalize());
        }
    }

    _stick(a, group) {
        a.stuck = true;
        a.life = Math.min(a.life, 8);
        group.attach(a.model);
    }

    // ================================================================ hammer
    _updateHammer(dt) {
        const g = this.game;
        const hm = g.items.heldOf('hammer');
        const storm = g.storm?.k > 0.5 && g.storm.thunder; // (any thunderstorm, «Let it rain»'s too)
        if (!storm) { if (this.hammer.storm) this.hammer = { uses: 0, failed: false, storm: 0 }; return; }
        this.hammer.storm = 1;
        if (!hm || g.lightning || this.hammer.failed || this.hammer.uses >= 3 + enchantAdd(hm.item, 'uses')) return;
        const ch = g.character;
        const head = ch.head.getWorldPosition(_v);
        if (hm.model.position.y < head.y + 0.3) return; // raise it above the head
        const tired = g.combat.check('Hammer');
        if (tired) { g.hud.setVoice(tired, true); return; }
        g.combat.pay('Hammer');
        // lightning strikes the hammer: aim it within 5 s
        g.spells.cast('LightningHold', ch.group.position, _v2.set(0, 1, 0), hm.side, g.localId);
        if (g.sync) g.sync.spell('LightningHold', ch.group.position, _v2.set(0, 1, 0), hm.side);
        g.fx.lightFlash(hm.model.position, 0xdde8ff, 6, 0.3, 40);
        g.lightning = { phase: 'hold', t: 0, aimT: 0, aim: null, side: hm.side, hammer: true };
        g.hud.setVoice('⚡🔨 Молния в молоте! Наведите его на цель (5 секунд)', true);
    }

    /** (from Game) the hammer's lightning hit / missed. */
    hammerResult(ok) {
        if (ok) this.hammer.uses++;
        else this.hammer.failed = true;
        const g = this.game;
        if (!ok) g.hud.setVoice('🔨 Молния ушла в землю — молот зарядится только в следующую грозу', true);
        else {
            const max = 3 + enchantAdd(g.items.heldOf('hammer')?.item, 'uses');
            if (this.hammer.uses < max) g.hud.setVoice(`🔨 Ещё ${max - this.hammer.uses} раз(а) в эту грозу`, true);
        }
    }

    // =============================================================== weather
    _updateWeather(dt) {
        const g = this.game;
        if (!g.authority || g.config.map || g.config.mode === 'test' || !g.dayCycle) return;
        this._weatherT += dt;
        if (this._weatherT < 300) return;
        this._weatherT = 0;
        if (Math.random() >= 0.17) return;
        const seconds = 120 + Math.random() * 60;
        this.startWeather(seconds);
        if (g.sync) g.sync.weather?.(seconds);
    }

    startWeather(seconds) {
        const g = this.game;
        g.storm?.gatherThenRain(seconds);
        g.hud.notify?.('☁️ Собираются тучи — скоро будет гроза');
    }

    // ================================================================= frame
    update(dt) {
        const g = this.game;
        // magic shields recover their strength
        for (const [uid, v] of this.shieldPower) {
            const s = this._heldShield();
            const max = s && s.item.uid === uid ? s.item.max : 50;
            this.shieldPower.set(uid, Math.min(max, v + dt));
        }
        const s = this._heldShield();
        if (s?.model.userData.halo) s.model.userData.halo.material.opacity = 0.3 + 0.5 * Math.min(1, (this.shieldPower.get(s.item.uid) ?? s.item.max * shieldMul(s.item)) / (s.item.max * shieldMul(s.item)));
        if (g.currentPose && !g.combat.dead) {
            this._updateBow(dt);
            this._updateHammer(dt);
        }
        if (this._sight && !this.nock?.string?.held) this._sight.visible = false;
        this._updateDrawHand(dt);
        this._updateRemoteBows(dt);
        this._updateArrows(dt);
        this._updateWeather(dt);
    }

    dispose() {
        this._dropNock();
        for (const e of this._rbows?.values() || []) { this.game.scene.remove(e.model); disposeModel(e.model); }
        this._rbows?.clear();
        if (this._sight) { this.game.scene.remove(this._sight); this._sight.geometry.dispose(); this._sight.material.dispose(); this._sight = null; }
        for (const a of this.arrows) { a.model.parent?.remove(a.model); disposeModel(a.model); }
        this.arrows.length = 0;
    }
}
