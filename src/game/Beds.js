/**
 * Beds.js — beds, «Create a Bed», «Change a color», sleeping through the night,
 * and throwing wood out of the hand (bundles of logs).
 *
 *  - Wood: hold the wood of a tree in the hand (the chosen slot) and throw
 *    (a fast swing that stops): a bundle of 4 logs flies out. Touch a bundle
 *    with the hand — the wood goes back into the slot.
 *  - Wool: a killed sheep leaves 2–3 balls of wool.
 *  - «Create a Bed»: 4 logs and 3 wool lying together (within 3 m), point the
 *    hand / the wand at them and say the words — they turn into a white bed,
 *    its length along your view. Something missing — the hint says what.
 *  - «Change a color синий» pointed at a bed (up to 12 m): repainted at once.
 *  - Sleeping: stand at the bed and crouch (sit down) for 1.5 s — the hero
 *    lies down. Stand up (or walk) — he gets up. At night, when every living
 *    player lies in a bed and keeps still for 3 s, the night passes: the
 *    screen fades, «💤 Вы заснули…», and it's morning. By day lying heals
 *    (+1 HP every 5 s).
 *
 * API (castles / houses):
 *   game.beds.spawnBed(pos, yaw = 0, color = 'white', { id }) → bed
 *       pos: the floor point under the bed's centre (THREE.Vector3 or {x,y,z});
 *       yaw: like the hero's rotation.y — the pillow is towards −Z after the turn
 *       (the bed's length goes along the view of a hero with that yaw);
 *       color: a key of BED_COLORS (white, red, blue, green, yellow, orange,
 *       purple, pink, cyan, black, brown, gray) or a hex number;
 *       id: give a stable id (e.g. 'castle7-bed2') when the bed is generated
 *       with the world on every computer — an existing id is kept as it is
 *       (a saved / recoloured bed is not reset). Without an id the host
 *       creates it and tells the others.
 *   game.beds.list — Map id → {id, x, y, z, ry, color, model}.
 *   game.beds.lying — the id of the bed I lie in (or null).
 *
 * Multiplayer: the host owns the beds (creating consumes its loose things,
 * recolouring, the night skip); guests ask. Beds are in the world snapshot.
 * The lying pose is seen by the others through the body tilt of the pose.
 */

import * as THREE from 'three';
import { BLOCK, isWood } from '../world/Terrain.js';
import { RESOURCE } from './Inventory.js';
import { newUid } from './ItemTypes.js';
import { PVP } from './Combat.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';
import { bedModel, paintBed, woolModel, logsModel, BED } from './BedModels.js';
import { BED_COLORS, DEFAULT_BED_COLOR, parseColor, bedColorName, checkRecipe, planConsumption, everyoneAsleep, RECIPE_RADIUS } from './BedRules.js';

const DAY_MS = 24 * 60 * 1000; // (Game.DAY_CYCLE_MS)
const LIE_AFTER = 1.5; // s of crouching at a bed
const STILL_NEEDED = 3; // s of keeping still in bed for the night to pass
const LOGS_PER_THROW = 4;
const AIM_RANGE = 16, COLOR_RANGE = 12;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class Beds {
    constructor(game) {
        this.game = game;
        this.list = new Map(); // id -> bed
        this.lying = null; // the bed I lie in
        this.others = new Map(); // playerId -> {bed, ready}: the others' beds
        this.sleeping = null; // the night is passing: {t, dayStart, switched}
        this.testAim = null; // (tests) a point to aim the spells at instead of the hand
        this._crouchT = 0; this._upT = 0; this._walkT = 0; this._stillT = 0; this._healT = 0;
        this._standAt = 0;
        this._sent = '';
        this._waitSaid = false;
        this._hist = [];
        this._throwAt = 0;
        this._interim = null;
        this._lastCast = 0;
        this._overlay = null;
    }

    get auth() { return this.game.authority; }

    // ================================================================ beds
    /** A bed appears (see the API above). */
    spawnBed(pos, yaw = 0, color = DEFAULT_BED_COLOR, { id = null, broadcast = true, poof = false } = {}) {
        if (id && this.list.has(id)) return this.list.get(id);
        id = id || 'bed' + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);
        const b = this._place({ id, x: pos.x, y: pos.y, z: pos.z, ry: yaw, color });
        if (poof) this._poof(b);
        if (broadcast && this.auth) this.game.sync?.bed?.({ a: 'set', d: this._data(b), poof: poof ? 1 : 0 });
        return b;
    }

    _data(b) { return { id: b.id, x: r2(b.x), y: r2(b.y), z: r2(b.z), ry: r3(b.ry), color: b.color }; }

    _place(d) {
        const g = this.game;
        let b = this.list.get(d.id);
        if (!b) {
            const model = bedModel(d.color);
            g.scene.add(model);
            b = { id: d.id, model, boxId: null };
            this.list.set(d.id, b);
        }
        b.x = d.x; b.y = d.y; b.z = d.z; b.ry = d.ry || 0;
        if (b.color !== d.color) { b.color = d.color ?? DEFAULT_BED_COLOR; paintBed(b.model, b.color); }
        b.model.position.set(b.x, b.y, b.z);
        b.model.rotation.y = b.ry;
        // a solid box (the frame and the mattress), axis-aligned around the turned bed
        if (b.boxId != null) g.collision.removeBox(b.boxId);
        const c = Math.abs(Math.cos(b.ry)), s = Math.abs(Math.sin(b.ry));
        const hw = (BED.W / 2) * c + (BED.L / 2) * s, hd = (BED.W / 2) * s + (BED.L / 2) * c;
        b.boxId = g.collision.addBox({ minX: b.x - hw, maxX: b.x + hw, minY: b.y, maxY: b.y + BED.top, minZ: b.z - hd, maxZ: b.z + hd, kind: 'bed' });
        return b;
    }

    /** (host) A bed changes its colour; the others are told. */
    setColor(id, color) {
        const b = this.list.get(id);
        if (!b || !BED_COLORS[color]) return false;
        b.color = color;
        paintBed(b.model, color);
        for (let i = 0; i < 24; i++) this.game.fx.spark(_v.set(b.x + (Math.random() - 0.5) * BED.W, b.y + BED.top + 0.3, b.z + (Math.random() - 0.5) * BED.L), BED_COLORS[color].hex, 0.12, _v2.set(0, 1.5 + Math.random(), 0), 0.8);
        if (this.auth) this.game.sync?.bed?.({ a: 'set', d: this._data(b) });
        return true;
    }

    _poof(b) {
        const fx = this.game.fx;
        for (let i = 0; i < 50; i++) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * 2.6;
            fx.spark(_v.set(b.x + Math.cos(a) * r, b.y + 0.4 + Math.random() * 1.5, b.z + Math.sin(a) * r), i % 3 ? 0xfff2c4 : 0xc9a8ff, 0.14, _v2.set(Math.cos(a) * 1.5, 2 + Math.random() * 2, Math.sin(a) * 1.5), 1.0);
        }
        this.game.sound?.playMagic?.();
    }

    // ============================================================== spells
    /** «Create a Bed» / «Change a color …» (from Game.castLocalSpell). */
    cast(name, text, isFinal = true) {
        const g = this.game;
        const now = Date.now();
        const early = this._interim;
        if (isFinal && early && early.name === name && now - early.at < 3000) { this._interim = null; return null; }
        if (now - this._lastCast < 1200) return null;
        const say = (t) => { if (isFinal && t) g.hud.setVoice(t, true); return null; };
        let res;
        if (name === 'ChangeColor') {
            const color = parseColor(text);
            if (!color) return say('🎨 Назовите цвет: «Change a color синий» — белый, красный, синий, зелёный, жёлтый, оранжевый, фиолетовый, розовый, голубой, чёрный');
            const tired = g.combat.check(name);
            if (tired) return say(tired);
            res = this.recolorAimed(color);
        } else {
            const tired = g.combat.check(name);
            if (tired) return say(tired);
            res = this.createAimed();
        }
        if (res !== true) return say(res);
        g.combat.pay(name);
        this._lastCast = now;
        this._interim = isFinal ? null : { name, at: now };
        return name;
    }

    /** Where the spell hand points: {hand, dir}. */
    _aimRay() {
        const g = this.game, ch = g.character;
        const wand = g.items?.heldOf?.('wand');
        const side = wand ? wand.side : (['right', 'left'].find((s) => ch.isArmRaised(s)) || g.magicHand || g.lastMagicHand || 'right');
        return { hand: ch.getHandWorldPosition(side, new THREE.Vector3()), dir: ch.getHandDirection(side, new THREE.Vector3()) };
    }

    /** Loose logs / wool around a point. */
    _materialsAt(p, radius = RECIPE_RADIUS) {
        const out = [];
        for (const L of this.game.items.loose.values()) {
            if (L.hover || (L.item.kind !== 'logs' && L.item.kind !== 'wool')) continue;
            const m = L.model.position;
            if (Math.hypot(m.x - p.x, m.z - p.z) <= radius && Math.abs(m.y - p.y) < 3) out.push(L.item);
        }
        return out;
    }

    /** The point the hand aims at: the ground it points to, or the pile nearest to the ray. */
    _aimPoint() {
        if (this.testAim) return new THREE.Vector3(this.testAim.x, this.testAim.y ?? this.game.collision.groundY(this.testAim.x, this.testAim.z), this.testAim.z);
        const g = this.game;
        const { hand, dir } = this._aimRay();
        let hit = null;
        for (let k = 0.5; k < AIM_RANGE; k += 0.25) {
            const p = _v.copy(hand).addScaledVector(dir, k);
            const gy = g.collision.groundAt ? g.collision.groundAt(p.x, p.z, p.y) : g.collision.groundY(p.x, p.z);
            if (p.y <= gy + 0.2) { hit = new THREE.Vector3(p.x, gy, p.z); break; }
        }
        if (hit && this._materialsAt(hit).length) return hit;
        // forgiving: the pile closest to where the hand points
        let best = null;
        for (const L of g.items.loose.values()) {
            if (L.hover || (L.item.kind !== 'logs' && L.item.kind !== 'wool')) continue;
            const to = _v2.subVectors(L.model.position, hand);
            const d = to.length();
            if (d > AIM_RANGE) continue;
            const ang = dir.angleTo(to.normalize());
            if (ang < 0.45 && (!best || ang < best.ang)) best = { ang, p: L.model.position.clone() };
        }
        return best ? best.p : hit;
    }

    /** «Create a Bed»: true, or a hint what is wrong. */
    createAimed() {
        const g = this.game;
        const at = this._aimPoint();
        if (!at) return '🛏️ Покажите рукой (или палочкой) на брёвна и шерсть, лежащие на земле';
        const chk = checkRecipe(this._materialsAt(at));
        if (!chk.ok) return chk.message;
        const yaw = g.character.group.rotation.y;
        if (!this.auth) {
            g.sync?.bed?.({ a: 'create', p: [r2(at.x), r2(at.y), r2(at.z)], ry: r3(yaw) });
            return true;
        }
        const res = this._hostCreate(at, yaw);
        if (res !== true) return res;
        g.hud.setVoice('🛏️ Кровать готова! Сядьте на неё (присядьте рядом) — и герой ляжет. «Change a color …» — перекрасить', true);
        return true;
    }

    /** (host) Use up the things around `at` and put a white bed there. */
    _hostCreate(at, yaw) {
        const g = this.game;
        const near = this._materialsAt(at);
        const chk = checkRecipe(near);
        if (!chk.ok) return chk.message;
        const plan = planConsumption(near);
        if (!plan) return chk.message || '🛏️ Не хватает материалов';
        // the bed stands in the middle of the pile
        let cx = 0, cz = 0, n = 0;
        for (const step of plan) {
            const L = g.items.loose.get(step.uid);
            if (!L) continue;
            cx += L.model.position.x; cz += L.model.position.z; n++;
            const item = L.item;
            const pos = L.model.position.clone();
            g.items.removeLoose(step.uid);
            g.sync?.itemGone?.(step.uid, null, null);
            if (step.left > 0) g.items.spawnLoose({ ...item, uid: newUid(), count: step.left }, pos.add(_v.set(0, 0.3, 0)));
        }
        const x = n ? (cx / n + at.x) / 2 : at.x, z = n ? (cz / n + at.z) / 2 : at.z;
        const y = g.collision.groundAt ? g.collision.groundAt(x, z, at.y + 0.5) : g.collision.groundY(x, z);
        this.spawnBed(new THREE.Vector3(x, y, z), yaw, DEFAULT_BED_COLOR, { poof: true });
        return true;
    }

    /** The bed the hand points at (or the one I lie in / stand at). */
    _aimedBed() {
        if (this.lying && this.list.has(this.lying)) return this.list.get(this.lying);
        if (this.testAim) {
            let best = null;
            for (const b of this.list.values()) { const d = Math.hypot(b.x - this.testAim.x, b.z - this.testAim.z); if (d < 4 && (!best || d < best.d)) best = { b, d }; }
            return best?.b || null;
        }
        const { hand, dir } = this._aimRay();
        let best = null;
        for (const b of this.list.values()) {
            const c = _v.set(b.x, b.y + BED.top * 0.8, b.z);
            const to = _v2.subVectors(c, hand);
            const d = to.length();
            if (d > COLOR_RANGE + 3) continue;
            const along = to.dot(dir);
            if (along < -1) continue;
            const off = _v3.copy(hand).addScaledVector(dir, Math.max(0, along)).distanceTo(c); // miss distance of the ray
            const score = off / Math.max(1, d) + (off < 2.4 ? 0 : 1);
            if (off < 3 && d <= COLOR_RANGE + 3 && (!best || score < best.score)) best = { b, score };
        }
        if (best) return best.b;
        // standing right at a bed: that one
        const me = this.game.character.group.position;
        for (const b of this.list.values()) if (this._nearBed(b, me, 0.8)) return b;
        return null;
    }

    /** «Change a color»: true, or a hint. */
    recolorAimed(color) {
        const g = this.game;
        const b = this._aimedBed();
        if (!b) return '🎨 Покажите рукой на кровать (до 12 м) и назовите цвет';
        if (b.color === color) return `🎨 Кровать уже ${bedColorName(color)}`;
        if (this.auth) this.setColor(b.id, color);
        else g.sync?.bed?.({ a: 'color', id: b.id, color });
        g.hud.setVoice(`🎨 Кровать стала: ${bedColorName(color)}`, true);
        return true;
    }

    // =========================================================== materials
    /** (host) A sheep died: 2–3 balls of wool roll out of it. */
    dropWool(pos) {
        if (!this.auth || !this.game.items) return;
        const n = 2 + (Math.random() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const p = new THREE.Vector3(pos.x + Math.cos(a) * 0.8, pos.y + 1.0, pos.z + Math.sin(a) * 0.8);
            this.game.items.spawnLoose({ kind: 'wool', uid: newUid(), count: 1 }, p, { vel: new THREE.Vector3(Math.cos(a) * 1.6, 3.5, Math.sin(a) * 1.6) });
        }
    }

    /** A bundle of logs (or anything of mine) reached a hand: true if it was handled here. */
    gotItem(item) {
        if (!item || item.kind !== 'logs') return false;
        const g = this.game;
        const n = item.count || 1;
        const left = g.inventory.addResource(item.block ?? BLOCK.WOOD, n);
        if (n - left > 0) g.hud.toast?.(`🪵 +${n - left} дерева`);
        if (left > 0) {
            // no room in the slots: it falls back to the ground
            const back = { ...item, uid: newUid(), count: left };
            const p = g.character.group.position.clone().add(_v.set(0, -1, 0));
            if (this.auth) g.items.spawnLoose(back, p, { vel: new THREE.Vector3(0, 2, 0) });
            else g.sync?.itemThrow?.(back, p, new THREE.Vector3(0, 2, 0));
            g.hud.setVoice('🪵 Нет места в ячейках — брёвна упали', true);
        }
        return true;
    }

    /** Throwing wood out of the hand: a fast swing that stops (like any thing). */
    _updateWoodThrow() {
        const g = this.game;
        const inv = g.inventory;
        const s = inv?.inHand?.kind === 'res' ? inv.inHand.stack : null;
        const now = performance.now();
        const v = g.character.handVelocity.right;
        this._hist.push({ t: now, s: v.length(), v: v.clone() });
        while (this._hist.length && now - this._hist[0].t > 250) this._hist.shift();
        if (!s || !isWood(s.block) || s.count <= 0 || !inv.slots.includes(s) || !g.currentPose || g.combat.dead || this.lying) return;
        if (now - this._throwAt < 600) return;
        let peak = null;
        for (const e of this._hist) if (!peak || e.s > peak.s) peak = e;
        if (peak && peak.s > 6.5 && v.length() < peak.s * 0.35 && now - peak.t < 200) {
            this._hist.length = 0;
            // a strike down onto the right pocket (putting the wood away) is not a throw
            const ch = g.character;
            ch.group.updateMatrixWorld(true);
            const local = ch.getHandWorldPosition('right', _v).applyMatrix4(_m.copy(ch.group.matrixWorld).invert());
            const pocket = local.x > 0.3 && local.y < 0.55 && Math.abs(local.z) < 0.85 && peak.v.y < -0.6 * peak.s;
            if (!pocket) this.throwWood(peak.v);
        }
    }

    /** A bundle of logs leaves the right hand (up to 4 wood from the chosen stack). */
    throwWood(vel = null) {
        const g = this.game;
        const s = g.inventory?.inHand?.kind === 'res' ? g.inventory.inHand.stack : null;
        if (!s || !isWood(s.block) || s.count <= 0) return null;
        const n = Math.min(LOGS_PER_THROW, s.count);
        if (!g.inventory.take(s, n)) return null;
        this._throwAt = performance.now();
        const item = { kind: 'logs', uid: newUid(), count: n, block: s.block, color: RESOURCE[s.block]?.color ?? 0x8b5a2b };
        const pos = g.character.getGripObject('right').getWorldPosition(new THREE.Vector3());
        const v = (vel ? vel.clone() : g.character.getHandDirection('right', new THREE.Vector3()).multiplyScalar(5)).clampLength(0, 14);
        if (this.auth) { const L = g.items.spawnLoose(item, pos, { vel: v }); L.thrower = g.localId; }
        else g.sync?.itemThrow?.(item, pos, v);
        g.hud.setVoice(`🪵 Брёвна брошены (${n})${s.count > 0 ? `, осталось ${s.count}` : ''}`, true);
        return item;
    }

    // ============================================================ sleeping
    /** Is a point (the hero's position) at / on a bed? `pad`: how far from its edges. */
    _nearBed(b, p, pad = 1.3) {
        const dx = p.x - b.x, dz = p.z - b.z;
        const c = Math.cos(b.ry), s = Math.sin(b.ry);
        const lx = dx * c - dz * s, lz = dx * s + dz * c; // into the bed's own axes
        return Math.abs(lx) < BED.W / 2 + pad && Math.abs(lz) < BED.L / 2 + pad * 0.7 && Math.abs(p.y - PLAYER_GROUND_OFFSET - b.y) < 3;
    }

    _bedAt(p) {
        let best = null;
        for (const b of this.list.values()) {
            if (!this._nearBed(b, p)) continue;
            const d = Math.hypot(p.x - b.x, p.z - b.z);
            if (!best || d < best.d) best = { b, d };
        }
        return best?.b || null;
    }

    _isNight() { const g = this.game; return !!g.dayCycle && g.world.nightAmount > 0.4; }

    /** The hero lies down in a bed. */
    lieDown(b) {
        if (!b) return;
        this.lying = b.id;
        this._upT = 0; this._walkT = 0; this._stillT = 0; this._healT = 0; this._waitSaid = false;
        this._holdLying(b);
        this.game.hud.setVoice(this._isNight() ? '🛏️ Вы легли спать. Не двигайтесь — и ночь пройдёт' : '🛏️ Вы прилегли отдохнуть: здоровье понемногу восстанавливается. Встаньте, чтобы подняться', true);
    }

    /** On the back, the head on the pillow (the body origin is 2 m from the feet). */
    _holdLying(b) {
        const ch = this.game.character;
        const c = Math.cos(b.ry), s = Math.sin(b.ry), lz = 0.15;
        ch.group.position.set(b.x + lz * s, b.y + BED.top + 0.4, b.z + lz * c);
        ch.group.rotation.y = b.ry + Math.PI;
        ch.group.rotation.x = Math.PI / 2;
        ch.verticalVelocity = 0;
        ch.leftLegPivot.rotation.x = 0;
        ch.rightLegPivot.rotation.x = 0;
    }

    /** Up from the bed: the hero stands beside it. */
    standUp() {
        const g = this.game, ch = g.character;
        const b = this.list.get(this.lying);
        this.lying = null;
        this._crouchT = 0;
        this._stillT = 0;
        this._standAt = performance.now();
        ch.group.rotation.x = 0;
        if (b) {
            const c = Math.cos(b.ry), s = Math.sin(b.ry), lx = BED.W / 2 + 1.2;
            const x = b.x + lx * c, z = b.z - lx * s;
            const gy = g.collision.groundAt ? g.collision.groundAt(x, z, b.y + 1) : g.collision.groundY(x, z);
            ch.group.position.set(x, gy + PLAYER_GROUND_OFFSET, z);
        }
    }

    update(dt) {
        const g = this.game;
        const ch = g.character;
        this._updateWoodThrow();
        const dead = g.combat.dead || g.isDeadLocal;
        if (this.lying) {
            const b = this.list.get(this.lying);
            if (!b || dead || g.flight?.active) this.standUp();
            else {
                this._holdLying(b);
                // getting up: clearly standing (not crouching) or walking for a moment
                this._upT = ch.isCrouching ? Math.max(0, this._upT - dt * 2) : this._upT + dt;
                this._walkT = ch.isRunning ? this._walkT + dt : 0;
                const moving = ch.isRunning || ch.handVelocity.right.length() > 2.5 || ch.handVelocity.left.length() > 2.5;
                this._stillT = moving ? 0 : this._stillT + dt;
                if (this._upT > 1.2 || this._walkT > 0.7) { this.standUp(); g.hud.setVoice('🛏️ Вы встали с кровати', true); }
                else if (!this._isNight() && !this.sleeping) this._heal(dt);
            }
        } else if (!dead && !g.flight?.active && performance.now() - this._standAt > 2000) {
            const b = this._bedAt(ch.group.position);
            this._crouchT = b && ch.isCrouching ? this._crouchT + dt : Math.max(0, this._crouchT - dt * 2);
            if (b && this._crouchT >= LIE_AFTER) this.lieDown(b);
        } else this._crouchT = 0;
        // tell the others whether I lie (and sleep)
        const ready = !!this.lying && this._stillT >= STILL_NEEDED;
        const key = (this.lying || '') + '|' + (ready ? 1 : 0);
        if (key !== this._sent) { this._sent = key; g.sync?.bed?.({ a: 'lie', bed: this.lying, ready: ready ? 1 : 0 }); }
        // the host: everybody asleep at night → morning
        if (this.auth && !this.sleeping && this._isNight()) {
            const players = [{ dead, lying: !!this.lying, still: this._stillT }];
            for (const [id, r] of g.remotes || []) { const o = this.others.get(id); players.push({ dead: r.dead, lying: !!o?.bed, still: o?.ready ? 99 : 0 }); }
            if (everyoneAsleep(players, STILL_NEEDED)) this.skipNight();
            else if (ready && !this._waitSaid && players.length > 1) {
                this._waitSaid = true;
                const n = players.filter((p) => !p.dead && p.lying && p.still >= STILL_NEEDED).length, all = players.filter((p) => !p.dead).length;
                g.hud.setVoice(`💤 Ждём остальных: спят ${n} из ${all}`, true);
            }
        }
        this._updateFade(dt);
    }

    _heal(dt) {
        const g = this.game;
        this._healT += dt;
        if (this._healT < 5) return;
        this._healT = 0;
        if (g.combat.enabled) { if (g.combat.hp < PVP.MAX_HP) { g.combat.hp = Math.min(PVP.MAX_HP, g.combat.hp + 1); g.hud.toast?.('❤️ +1'); } return; }
        if (g.playerHP < g.maxHP) {
            g.playerHP = Math.min(g.maxHP, g.playerHP + 1);
            g.hud.update(g.playerHP, g.maxHP, g.killCount, g.punchCount);
            g.hud.toast?.('❤️ +1');
        }
    }

    /** (host) The night passes for everybody. */
    skipNight() {
        const dayStart = Date.now() + 2200 - DAY_MS * 0.05; // at the switch it's early morning
        this._beginSleep(dayStart);
        this.game.sync?.bed?.({ a: 'sleep', dayStart });
    }

    _beginSleep(dayStart) {
        if (this.sleeping) return;
        this.sleeping = { t: 0, dayStart, switched: false };
        this._showOverlay('💤 Вы заснули…', 0);
    }

    _updateFade(dt) {
        const S = this.sleeping;
        if (!S) return;
        S.t += dt;
        const o = S.t < 1.5 ? S.t / 1.5 : S.t < 3 ? 1 : Math.max(0, 1 - (S.t - 3) / 1.5);
        if (!S.switched && S.t >= 2.2) {
            S.switched = true;
            const g = this.game;
            g.dayStart = S.dayStart;
            if (g.dayCycle) g.world.setDayPhase(g.dayPhase());
            this._stillT = 0;
            this._showOverlay('☀️ Доброе утро!', 1);
            g.hud.setVoice('☀️ Доброе утро!', true);
        }
        this._showOverlay(null, o);
        if (S.t > 4.6) { this.sleeping = null; this._showOverlay(null, 0); }
    }

    _showOverlay(text, opacity) {
        if (typeof document === 'undefined') return;
        let el = this._overlay;
        if (!el) {
            el = this._overlay = document.createElement('div');
            el.id = 'sleep-fade';
            el.style.cssText = 'position:fixed;inset:0;background:#05060d;color:#f3f0e6;display:flex;align-items:center;justify-content:center;font:600 2.4rem system-ui,sans-serif;pointer-events:none;z-index:9000;opacity:0;text-shadow:0 2px 12px #000';
            document.body.appendChild(el);
        }
        if (text != null) el.textContent = text;
        el.style.opacity = String(opacity);
        el.style.display = opacity > 0.001 ? 'flex' : 'none';
    }

    // ===================================================== network / save
    onNet(m) {
        const g = this.game;
        const host = this.auth;
        switch (m.a) {
            case 'set': if (!host && m.d) { const b = this._place(m.d); if (m.poof) this._poof(b); } break;
            case 'create': {
                if (!host || !Array.isArray(m.p)) break;
                const res = this._hostCreate(new THREE.Vector3(m.p[0], m.p[1], m.p[2]), m.ry || 0);
                g.sync?.bed?.({ a: 'msg', text: res === true ? '🛏️ Кровать готова! Присядьте рядом с ней — и герой ляжет' : res }, m.from);
                break;
            }
            case 'color': if (host && BED_COLORS[m.color]) this.setColor(m.id, m.color); break;
            case 'msg': if (m.text) g.hud.setVoice(m.text, true); break;
            case 'lie': if (m.from) { if (m.bed) this.others.set(m.from, { bed: m.bed, ready: !!m.ready }); else this.others.delete(m.from); } break;
            case 'sleep': if (!host && m.dayStart) this._beginSleep(m.dayStart); break;
            default: break;
        }
    }

    /** A house bed far from everybody leaves the scene (it comes back with the house). */
    removeBed(id) {
        const b = this.list.get(id);
        if (!b || this.lying === id) return;
        this.game.scene.remove(b.model);
        if (b.boxId != null) this.game.collision.removeBox(b.boxId);
        this.list.delete(id);
    }

    // (house beds are part of the generated world: saved only when repainted)
    snapshot() { return [...this.list.values()].filter((b) => !b.gen || b.color !== b.genColor).map((b) => this._data(b)); }

    restore(list) { for (const d of list || []) if (d && d.id) this._place(d); }

    /** One sample of each model (shader warm-up). */
    sampleModels() { return [bedModel('white'), woolModel(), logsModel()]; }

    dispose() {
        const g = this.game;
        for (const b of this.list.values()) { g.scene.remove(b.model); if (b.boxId != null) g.collision.removeBox(b.boxId); }
        this.list.clear();
        this._overlay?.remove();
        this._overlay = null;
    }
}

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
