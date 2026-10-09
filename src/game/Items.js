/**
 * Items.js — things in the world and in the hands (wands, scrolls, shields,
 * backpacks, bows, Thor's hammer, food…).
 *
 *  - Lying / hovering things: touch one with an empty hand — it is in the hand.
 *  - In the hand it stays (an open hand doesn't drop it: you can run with it).
 *    Strike the right pocket — it goes into a slot.
 *  - Throw: swing and stop the hand — it flies with the hand's speed; heavy
 *    things fly worse (a book flutters down, a shield barely goes).
 *  - Hand to hand: bring it to another player's empty hand — it is theirs.
 *  - Food: bring it to the mouth and hold — eaten (+HP).
 *  - Backpack: hold it and put both hands behind the back — worn, +slots.
 *  - Scroll: hold it and burn it (Inferno) — its power is yours, for good.
 *
 * Multiplayer: the host owns the lying things (spawn, pick-up); everybody
 * sees what the others hold.
 */

import * as THREE from 'three';
import { ITEM_INFO, makeItemModel, disposeModel, rollLoot, rollHouseLoot, SPELL_RU, SCROLL_SPELL_COLOR } from './ItemTypes.js';

const PICK_RADIUS = 0.9;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _inv = new THREE.Matrix4();

const AIMED = new Set(['bow', 'wand', 'hammer', 'shield']);
/** Held in the fist like the sword: handle (model y, before scaling) at the fingers, the axis across the palm. */
const GRIPPED = {
    wand: { axis: 'y', handle: 0.1 },
    hammer: { axis: 'y', handle: 0.12 },
    bow: { axis: 'y', handle: 0 },
    scroll: { axis: 'x', handle: 0, curl: 0.5 },
    shield: { axis: 'y', handle: 0, face: 'back' },
    book: { axis: 'book', handle: 0, curl: 0.55 }, // by the spine: the covers between the thumb and the fingers
};
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _UPY = new THREE.Vector3(0, 1, 0);

export class ItemSystem {
    constructor(game) {
        this.game = game;
        this.loose = new Map(); // uid -> {item, model, vel, spin, hover, until, noPick}
        this.held = { right: null, left: null }; // {item, model}
        this.worn = { backpack: null }; // {item, model}
        this._netT = 0;
        this._eatT = 0;
        this._wearT = 0;
        this._handHist = { right: [], left: [] };
        this._giveT = 0;
        this.remoteHeld = new Map(); // playerId -> {right, left, backpack}: models on other players
    }

    get auth() { return this.game.authority; }

    // ----------------------------------------------------------- the world
    /** A thing appears lying / hovering (authority; the others are told). */
    spawnLoose(item, pos, { vel = null, hover = false, broadcast = true } = {}) {
        if (this.loose.has(item.uid)) return this.loose.get(item.uid);
        const model = makeItemModel(item);
        model.position.copy(pos);
        this.game.scene.add(model);
        const L = { item, model, vel: vel ? vel.clone() : new THREE.Vector3(), spin: new THREE.Vector3(), hover: hover ? pos.clone() : null, t: Math.random() * 6, noPick: performance.now() + (vel ? 700 : 0), rest: false };
        if (vel) L.spin.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        this.loose.set(item.uid, L);
        if (broadcast && this.game.sync) this.game.sync.itemNew?.(item, pos, vel, hover);
        return L;
    }

    removeLoose(uid) {
        const L = this.loose.get(uid);
        if (!L) return null;
        this.loose.delete(uid);
        this.game.scene.remove(L.model);
        disposeModel(L.model);
        return L.item;
    }

    /** A chest opens: its things float up above it. */
    lootChest(pos, rng = Math.random, house = null) {
        const items = house ? rollHouseLoot(rng, house.rich) : rollLoot(rng);
        items.forEach((it, i) => {
            const p = pos.clone().add(_v.set((i - (items.length - 1) / 2) * 0.8, 2.2, 0));
            if (it.kind === 'weapon') {
                const w = this.game.weapons.spawnHovering(it.type, p, it.uid);
                w.magic = !!it.magic; w.bonus = it.magic ? it.bonus : 0;
                w.applyMagicLook?.();
                if (this.game.sync) this.game.sync.weaponAppeared?.(w);
            } else this.spawnLoose(it, p, { hover: true });
        });
        return items;
    }

    // ------------------------------------------------------------ the hands
    /** A thing (from a slot / the ground / another player) into a hand. */
    takeIntoHand(item, side = 'right') {
        if (this.held[side]) return false;
        if (!item.uid) item.uid = 'it' + Math.random().toString(36).slice(2, 10); // (old saves: a book had none)
        const model = makeItemModel(item);
        this.game.scene.add(model);
        this.held[side] = { item, model, since: performance.now() };
        if (this.game.sync) this.game.sync.itemHold?.(side, item);
        return true;
    }

    /** Out of a hand (into a slot, eaten, thrown…): returns the item. */
    releaseHand(side) {
        const h = this.held[side];
        if (!h) return null;
        this.held[side] = null;
        if (h.gripped) { const hand = this.game.character.getActiveHands?.()[side]; if (hand && hand.setGrip) hand.setGrip(null); }
        if (this.game.character.aim) this.game.character.aim[side] = null; // (spells follow the arm again)
        this.game.scene.remove(h.model);
        disposeModel(h.model);
        if (this.game.sync) this.game.sync.itemHold?.(side, null);
        return h.item;
    }

    /**
     * A thing in the fist, like the sword: its handle lies across the palm in the
     * closed fingers (out past the thumb), and it turns with the wrist. The hand's
     * fingers close round it.
     */
    _gripHold(side, h, dt) {
        const g = this.game;
        const f = g.weapons.palmFrame(side, this._pf || (this._pf = {}));
        const spec = GRIPPED[h.item.kind];
        const s = h.thumb ?? (h.thumb = f.thumb); // (the side the thumb was on when taken)
        // the item's axis out of the thumb side; its "front" towards the knuckles
        const ax = _a.copy(f.X).multiplyScalar(s);
        let x, y, z;
        if (h.item.kind === 'wand') {
            // a wand is the arm's continuation: along the forearm, bent a little by the wrist —
            // and the spells of this hand fly exactly along it, out of its tip
            const ch = g.character;
            y = ch.getForearmDirection(side, _a).multiplyScalar(0.6).addScaledVector(f.Y, 0.4).normalize();
            x = _b.copy(f.X).addScaledVector(y, -f.X.dot(y));
            if (x.lengthSq() < 1e-4) x.set(1, 0, 0);
            x.normalize();
            z = _c.crossVectors(x, y);
        } else if (spec.axis === 'book') {
            // the spine across the palm (like a handle), the book standing out of the palm
            y = ax; z = _c.copy(f.Z).negate(); x = _b.crossVectors(y, z);
        } else if (spec.axis === 'y') { y = ax; x = _b.copy(f.Y); z = _c.crossVectors(x, y); } // hammer, bow (limbs), shield (upright)
        else { x = ax; y = _b.copy(f.Y).negate(); z = _c.crossVectors(x, y); } // scroll: rolled along X
        if (spec.face === 'back') { z = _c.copy(f.Z); x = _b.crossVectors(y, z); } // shield: the face where the back of the hand looks
        _m4.makeBasis(x, y, z);
        _q.setFromRotationMatrix(_m4);
        if (!h.q) h.q = _q.clone(); else h.q.slerp(_q, Math.min(1, dt * 28));
        h.model.quaternion.copy(h.q);
        if (h.item.kind === 'wand') {
            const a = g.character.aim[side] || (g.character.aim[side] = { dir: new THREE.Vector3(), at: 0 });
            a.dir.set(0, 1, 0).applyQuaternion(h.q).normalize();
            a.at = performance.now();
        }
        // the handle point in the fingers
        const sc = h.model.scale.x;
        h.model.position.copy(f.G).sub(_d.set(0, spec.handle * sc, 0).applyQuaternion(h.q));
        if (spec.face === 'back') h.model.position.addScaledVector(f.Z, 0.25);
        if (!h.gripped) {
            h.gripped = true;
            const hand = g.character.getActiveHands()[side];
            if (hand && hand.setGrip) hand.setGrip(spec.curl ?? 0.62);
        }
    }

    /** Where a held bow / wand / hammer / shield points (world quaternion into `out`). */
    _aimQuat(side, kind, h, out) {
        const ch = this.game.character;
        const anchor = side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor;
        const shoulder = anchor.getWorldPosition(_a);
        const hand = ch.getGripObject(side).getWorldPosition(_b);
        const arm = _c.subVectors(hand, shoulder);
        if (arm.lengthSq() < 1e-4) arm.set(0, -1, 0);
        arm.normalize();
        const yaw = ch.group.rotation.y;
        _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        if (kind === 'bow') {
            // X: where the arrow flies (the arm; a hanging arm carries it pointing ahead);
            // when an arrow is drawn — from the drawing hand through the bow
            const x = h.aim ? _d.copy(h.aim) : _d.copy(arm).lerp(_fwd, Math.max(0, Math.min(1, (-arm.y - 0.25) / 0.45)));
            x.normalize();
            const y = _e.set(0, 1, 0).addScaledVector(x, -x.y);
            if (y.lengthSq() < 1e-3) y.copy(_fwd); else y.normalize();
            const z = _f.crossVectors(x, y);
            _m4.makeBasis(x, y, z);
            return out.setFromRotationMatrix(_m4);
        }
        if (kind === 'shield') {
            // the face looks ahead, a little to the shield arm's side, upright
            const sx = side === 'left' ? -1 : 1;
            const z = _d.copy(_fwd).addScaledVector(_e.set(-_fwd.z, 0, _fwd.x), sx * 0.25).normalize();
            const y = _e.set(0, 1, 0);
            const x = _f.crossVectors(y, z);
            _m4.makeBasis(x, y, z);
            return out.setFromRotationMatrix(_m4);
        }
        // wand / hammer: the tip along the arm and the pointing hand
        const dir = ch.getHandDirection(side, _d);
        const tip = _e.copy(arm).multiplyScalar(0.55).addScaledVector(dir, 0.45).normalize();
        return out.setFromUnitVectors(_UPY, tip);
    }

    heldOf(kind) {
        for (const side of ['right', 'left']) if (this.held[side]?.item.kind === kind) return { side, ...this.held[side] };
        return null;
    }

    /** The wand in a hand (if any). */
    get wand() {
        return this.heldOf('wand')?.item || null;
    }

    _throw(side, vel) {
        const h = this.held[side];
        if (!h) return;
        const item = h.item;
        const pos = h.model.position.clone();
        this.releaseHand(side);
        const w = ITEM_INFO[item.kind]?.weight ?? 1;
        // a heavy thing leaves the hand slower; a light one at the hand's speed
        const v = vel.clone().multiplyScalar(Math.max(0.25, Math.min(1.3, 1.2 / (0.4 + w * 0.5))));
        if (this.auth) {
            const L = this.spawnLoose(item, pos, { vel: v });
            L.thrower = this.game.localId;
        } else this.game.sync?.itemThrow?.(item, pos, v);
        this.game.hud.setVoice?.(`✋ ${ITEM_INFO[item.kind]?.name || 'Предмет'} брошен`, true);
    }

    // ------------------------------------------------------------- frame
    update(dt) {
        const g = this.game;
        const ch = g.character;
        // loose things: fall, bounce, settle; hovering ones bob
        for (const L of this.loose.values()) this._physics(L, dt);
        // held things follow the hand
        for (const side of ['right', 'left']) {
            const h = this.held[side];
            if (!h) continue;
            const grip = ch.getGripObject(side);
            grip.getWorldPosition(h.model.position);
            const kind = h.item.kind;
            if (GRIPPED[kind] && g.weapons?.palmFrame && !h.aim) {
                // held in the fist like the sword: the handle across the palm, turning with the wrist
                this._gripHold(side, h, dt);
            } else if (AIMED.has(kind)) {
                // a bow, a wand, a hammer, a shield: set by the arm (shoulder → hand,
                // steady) rather than by the shaky palm, and smoothed
                this._aimQuat(side, kind, h, _q);
                if (!h.q) h.q = _q.clone(); else h.q.slerp(_q, Math.min(1, dt * 16));
                h.model.quaternion.copy(h.q);
                if (kind === 'shield') h.model.position.addScaledVector(_fwd, 0.35);
            } else {
                grip.getWorldQuaternion(_q);
                h.model.quaternion.copy(_q);
            }
        }
        if (this.worn.backpack) this._placeBackpack(this.worn.backpack.model, ch);
        if (!g.currentPose || g.combat.dead) { this._netSend(dt); return; }
        const now = performance.now();
        // pick up: an empty hand touching a thing
        for (const side of ['right', 'left']) {
            if (this.held[side] || g.weapons.hands[side].held) continue;
            const hand = ch.getHandWorldPosition(side, _v);
            for (const L of this.loose.values()) {
                if (now < L.noPick || L.asked) continue;
                if (L.model.position.distanceTo(hand) > PICK_RADIUS) continue;
                if (this.auth) this.pickUp(L.item.uid, g.localId, side);
                else { L.asked = true; g.sync?.itemTake?.(L.item.uid, side); setTimeout(() => { L.asked = false; }, 1500); }
                break;
            }
        }
        // throwing: a fast swing that suddenly stops
        for (const side of ['right', 'left']) {
            const hist = this._handHist[side];
            const v = ch.handVelocity[side];
            hist.push({ t: now, s: v.length(), v: v.clone() });
            while (hist.length && now - hist[0].t > 250) hist.shift();
            const h = this.held[side];
            if (!h) continue;
            // (not just after taking it; never a bow with an arrow on the string)
            if (now - (h.since || 0) < 1000 || (h.item.kind === 'bow' && g.gear?.nock) || (h.item.kind === 'book' && g.books?.readingSide)) continue;
            let peak = null;
            for (const e of hist) if (!peak || e.s > peak.s) peak = e;
            // a real throw: a fast swing (several fast moments, one way) that suddenly stops —
            // the jitter of the camera makes single fast jumps, not swings; heavy things need more
            // (and the fingers let go — a flick of a wand in the fist is a spell, not a throw)
            if ((ch.getGripCurl ? ch.getGripCurl(side) : 0) > 0.45) continue;
            const need = 7 + Math.min(4, (ITEM_INFO[h.item.kind]?.weight ?? 1) * 1.2);
            if (!peak || peak.s < need || v.length() > peak.s * 0.35 || now - peak.t > 200) continue;
            let swing = 0;
            for (const e of hist) if (e.s > need * 0.55 && e.v.dot(peak.v) > 0.7 * e.s * peak.s) swing++;
            if (swing >= 3) {
                hist.length = 0;
                this._throw(side, peak.v);
            }
        }
        this._eat(dt, ch);
        this._wear(dt, ch);
        this._give(dt, ch);
        this._netSend(dt);
    }

    _physics(L, dt) {
        const m = L.model;
        L.t += dt;
        if (L.hover) {
            m.position.set(L.hover.x, L.hover.y + Math.sin(L.t * 2) * 0.12, L.hover.z);
            m.rotation.y += dt * 1.2;
            if (Math.random() < dt * 3) this.game.fx.spark(m.position, 0xffe9a8, 0.06, _v.set(0, 0.6, 0), 0.7);
            return;
        }
        if (L.rest || L.accio) return; // («Акцио» carries it)
        if (L.remote) { m.position.lerp(L.remote, Math.min(1, dt * 8)); return; }
        const w = ITEM_INFO[L.item.kind]?.weight ?? 1;
        L.vel.y -= 14 * dt;
        // light, flat things (books, scrolls) feel the air
        const drag = w < 0.7 ? 1.6 : 0.15;
        L.vel.multiplyScalar(Math.max(0, 1 - drag * dt));
        m.position.addScaledVector(L.vel, dt);
        m.rotation.x += L.spin.x * dt; m.rotation.y += L.spin.y * dt; m.rotation.z += L.spin.z * dt;
        const ground = this.game.collision.groundAt ? this.game.collision.groundAt(m.position.x, m.position.z, m.position.y + 0.5) : this.game.collision.groundY(m.position.x, m.position.z);
        if (m.position.y < ground + 0.12) {
            m.position.y = ground + 0.12;
            if (L.vel.y < -3) { L.vel.y *= -0.25; L.vel.x *= 0.5; L.vel.z *= 0.5; L.spin.multiplyScalar(0.4); }
            else { L.vel.set(0, 0, 0); L.spin.set(0, 0, 0); L.rest = true; m.rotation.x = L.item.kind === 'shield' || L.item.kind === 'bow' ? -Math.PI / 2 : 0; m.rotation.z = L.item.kind === 'book' ? Math.PI / 2 : 0; } // (a shield / a bow / a book lies flat)
        }
    }

    /** (host) Somebody's hand reached a thing first. */
    pickUp(uid, toId, side) {
        const L = this.loose.get(uid);
        if (!L) return;
        const item = this.removeLoose(uid);
        if (this.game.sync) this.game.sync.itemGone?.(uid, toId, side);
        if (toId === this.game.localId) this._gotItem(item, side);
    }

    _gotItem(item, side) {
        // a bundle of logs goes back into the wood stack (Beds.js)
        if (this.game.beds?.gotItem(item)) return;
        // money goes into the purse (a slot, up to 500 coins)
        if (item.kind === 'coins') {
            const g = this.game;
            const n = item.count || 0;
            if (g.inventory.storeItem(item)) { g.hud.setVoice?.(`💰 +${n} монет (всего ${g.inventory.coins()})`, true); return; }
        }
        // a good from a market stall: the merchant names the price
        if (item.shop) this.game.castleLife?.talk?.tookGood(item);
        // arrows go straight into a bow's quiver (in a hand or in a slot), up to 25
        if (item.kind === 'arrows') {
            const g = this.game;
            const bow = this.heldOf('bow')?.item || g.inventory.slots.find((s) => s && s.kind === 'bow');
            if (bow && (bow.arrows || 0) < 25) {
                const n = Math.min(25 - (bow.arrows || 0), item.count || 1);
                bow.arrows = (bow.arrows || 0) + n;
                item.count -= n;
                g.inventory._render?.();
                g.hud.setVoice?.(`🏹 +${n} стрел (в колчане ${bow.arrows})`, true);
                if (item.count <= 0) return;
            }
        }
        // a bow goes into the spell hand (the hand that casts; the other one draws)
        if (item.kind === 'bow') {
            const g = this.game;
            const bowHand = g.lastMagicHand || 'left';
            if (bowHand !== side && !this.held[bowHand] && !g.weapons.hands[bowHand].held) side = bowHand;
        }
        if (!this.takeIntoHand(item, side) && !this.takeIntoHand(item, side === 'right' ? 'left' : 'right')) {
            this.game.inventory.storeItem?.(item);
            return;
        }
        this.game.hud.setVoice?.(`✋ ${ITEM_INFO[item.kind]?.name || 'Предмет'} в руке${item.kind === 'wand' ? ' — скажите «Раскрой свои секреты»' : ''}`, true);
    }

    // --------------------------------------------------------- eat / wear
    _eat(dt, ch) {
        const g = this.game;
        let food = null;
        for (const side of ['right', 'left']) { const h = this.held[side]; if (h && (h.item.kind === 'apple' || h.item.kind === 'meat' || h.item.kind === 'steak' || ITEM_INFO[h.item.kind]?.heal)) food = { side, h }; }
        if (!food) { this._eatT = 0; return; }
        const mouth = ch.head.getWorldPosition(_v).add(_v2.set(0, -0.25, 0));
        if (food.h.model.position.distanceTo(mouth) < 0.55) this._eatT += dt; else this._eatT = 0;
        if (this._eatT < 0.6) return;
        this._eatT = 0;
        if (food.h.item.shop) { g.hud.setVoice?.('💰 Сначала заплатите торговцу (скажите «да»)', true); return; }
        const heal = { apple: 10, meat: 2, steak: 4 }[food.h.item.kind] ?? ITEM_INFO[food.h.item.kind]?.heal ?? 1;
        g.playerHP = Math.min(g.maxHP, g.playerHP + heal);
        g.hud.update(g.playerHP, g.maxHP, g.killCount, g.punchCount);
        g.hud.setVoice?.(`😋 +${heal} HP`, true);
        for (let i = 0; i < 10; i++) g.fx.spark(mouth, food.h.item.kind === 'apple' ? 0xffd700 : 0xd9534f, 0.07, _v2.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0.5);
        food.h.item.count = (food.h.item.count || 1) - 1;
        if (food.h.item.count <= 0) this.releaseHand(food.side);
    }

    _wear(dt, ch) {
        const bp = this.heldOf('backpack');
        if (!bp) { this._wearT = 0; return; }
        ch.group.updateMatrixWorld(true);
        _inv.copy(ch.group.matrixWorld).invert();
        const l = ch.getHandWorldPosition('left', _v).applyMatrix4(_inv);
        const r = ch.getHandWorldPosition('right', _v2).applyMatrix4(_inv);
        // both hands behind the back (the body looks along −Z)
        if (l.z > 0.25 && r.z > 0.25) this._wearT += dt; else this._wearT = 0;
        if (this._wearT < 0.4) return;
        this._wearT = 0;
        const item = this.releaseHand(bp.side);
        this.wear(item);
    }

    wear(item) {
        const g = this.game;
        if (this.worn.backpack) { const old = this.worn.backpack; this.game.scene.remove(old.model); disposeModel(old.model); g.inventory.storeItem?.(old.item); }
        const model = makeItemModel(item);
        g.scene.add(model);
        this.worn.backpack = { item, model };
        g.inventory.setExtraSlots(item.slots || 3);
        g.hud.setVoice?.(`🎒 Рюкзак надет: +${item.slots} ячейки`, true);
        if (g.sync) g.sync.itemHold?.('back', item);
    }

    _placeBackpack(model, ch) {
        ch.torso.getWorldPosition(model.position);
        ch.group.getWorldQuaternion(model.quaternion);
        model.position.add(_v.set(0, 0.1, 0.62).applyQuaternion(model.quaternion));
    }

    /** Inferno (or fire) reached a scroll in my hand: it burns and its power is mine. */
    burnHeldScroll() {
        const s = this.heldOf('scroll');
        if (!s) return false;
        const item = this.releaseHand(s.side);
        this.applyScroll(item);
        return true;
    }

    applyScroll(item) {
        const g = this.game;
        g.bonus = g.bonus || { hp: 0, fatigue: 0 };
        if (item.stat === 'flight') {
            g.bonus.flight = true;
            g.hud.setVoice?.('📜🔥 Свиток полёта сгорел: теперь вы умеете летать! Поднимите обе руки и скажите «Флайн»', true);
            const c = g.character.group.position;
            for (let i = 0; i < 60; i++) {
                const a = (i / 60) * Math.PI * 6;
                g.fx.spark(_v.set(c.x + Math.cos(a) * 1.2, c.y - 1.5 + i * 0.07, c.z + Math.sin(a) * 1.2), 0x9fd8ff, 0.12, _v2.set(-Math.sin(a) * 2, 2.5, Math.cos(a) * 2), 1.2);
            }
            return;
        }
        if (item.stat === 'spell') {
            g.bonus.spells = { ...(g.bonus.spells || {}), [item.spell]: true };
            const ru = SPELL_RU[item.spell] || item.spell;
            g.hud.setVoice?.(`📜🔥 Свиток сгорел: теперь вы знаете заклинание «${ru}»!`, true);
            const c = g.character.group.position;
            const col = SCROLL_SPELL_COLOR[item.spell] || 0xffe9a8;
            for (let i = 0; i < 60; i++) {
                const a = (i / 60) * Math.PI * 6;
                g.fx.spark(_v.set(c.x + Math.cos(a) * 1.2, c.y - 1.5 + i * 0.07, c.z + Math.sin(a) * 1.2), col, 0.12, _v2.set(-Math.sin(a) * 2, 2.5, Math.cos(a) * 2), 1.2);
            }
            return;
        }
        if (item.stat === 'hp') {
            g.bonus.hp += item.amount;
            g.maxHP += item.amount;
            g.playerHP += item.amount;
        } else {
            g.bonus.fatigue += item.amount;
            g.combat.addMaxFatigue?.(item.amount);
        }
        g.hud.update(g.playerHP, g.maxHP, g.killCount, g.punchCount);
        g.hud.setVoice?.(item.stat === 'hp' ? `📜🔥 Свиток сгорел: здоровье +${item.amount} навсегда` : `📜🔥 Свиток сгорел: сила +${item.amount} навсегда`, true);
        // the magic of the scroll swirls around the hero
        const c = g.character.group.position;
        for (let i = 0; i < 60; i++) {
            const a = (i / 60) * Math.PI * 6;
            g.fx.spark(_v.set(c.x + Math.cos(a) * 1.2, c.y - 1.5 + i * 0.07, c.z + Math.sin(a) * 1.2), item.stat === 'hp' ? 0xff6b6b : 0x9fd8ff, 0.12, _v2.set(-Math.sin(a) * 2, 1.5, Math.cos(a) * 2), 1.2);
        }
    }

    // ------------------------------------------------------- hand to hand
    _give(dt, ch) {
        const g = this.game;
        if (!g.sync || !g.remotes.size) return;
        for (const side of ['right', 'left']) {
            const h = this.held[side];
            if (!h) continue;
            let near = null;
            for (const [id, r] of g.remotes) {
                if (r.dead) continue;
                for (const rs of ['right', 'left']) {
                    if (this.remoteHeld.get(id)?.[rs]) continue; // their hand is busy
                    const rh = r.character.getHandWorldPosition(rs, _v2);
                    if (rh.distanceTo(h.model.position) < 0.45) near = { id, rs };
                }
            }
            if (near) this._giveT += dt; else this._giveT = 0;
            if (this._giveT > 0.6 && near) {
                this._giveT = 0;
                const item = this.releaseHand(side);
                g.sync.itemGive?.(near.id, item, near.rs);
                g.hud.setVoice?.(`🤝 Передано: ${ITEM_INFO[item.kind]?.name || 'предмет'}`, true);
                return;
            }
        }
    }

    // ------------------------------------------------------------ network
    _netSend(dt) {
        if (!this.auth || !this.game.sync) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.25;
        const moving = [];
        const r = (v) => Math.round(v * 100) / 100;
        for (const L of this.loose.values()) if (!L.hover && !L.sentRest) { moving.push([L.item.uid, r(L.model.position.x), r(L.model.position.y), r(L.model.position.z)]); if (L.rest) L.sentRest = true; }
        if (moving.length) this.game.sync.itemPositions?.(moving);
    }

    /** (guests) Positions of the host's lying things. */
    applyPositions(list) {
        for (const [uid, x, y, z] of list || []) {
            const L = this.loose.get(uid);
            if (!L) continue;
            L.remote = (L.remote || new THREE.Vector3()).set(x, y, z);
            L.rest = false;
        }
    }

    /** Somebody else's hands: show what they hold (and their backpack). */
    setRemoteHeld(id, side, item) {
        const g = this.game;
        const r = g.remotes.get(id);
        if (!r) return;
        const cur = this.remoteHeld.get(id) || {};
        if (cur[side]) { g.scene.remove(cur[side].model); disposeModel(cur[side].model); cur[side] = null; }
        if (item) { const model = makeItemModel(item); g.scene.add(model); cur[side] = { item, model }; }
        this.remoteHeld.set(id, cur);
    }

    updateRemote() {
        for (const [id, cur] of this.remoteHeld) {
            const r = this.game.remotes.get(id);
            if (!r) { for (const k of Object.keys(cur)) if (cur[k]) { this.game.scene.remove(cur[k].model); disposeModel(cur[k].model); } this.remoteHeld.delete(id); continue; }
            const ch = r.character;
            for (const side of ['right', 'left']) {
                const h = cur[side];
                if (!h) continue;
                const grip = ch.getGripObject(side);
                grip.getWorldPosition(h.model.position);
                grip.getWorldQuaternion(h.model.quaternion);
                if (h.item.kind === 'wand' || h.item.kind === 'hammer') h.model.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), Math.PI / 2));
            }
            if (cur.back) this._placeBackpack(cur.back.model, ch);
        }
    }

    /** One model of each kind, for compiling the shaders while loading. */
    sampleModels() {
        return [{ kind: 'wand', model: 4, color: 0x8844ff }, { kind: 'scroll' }, { kind: 'shield', type: 2, magic: true }, { kind: 'backpack', color: 0x7a4a24 }, { kind: 'bow', type: 0, magic: true }, { kind: 'hammer' }, { kind: 'apple' }, { kind: 'meat' }, { kind: 'coins' }, { kind: 'bread' }, { kind: 'cheese' }, { kind: 'pie' }].map((it) => makeItemModel(it));
    }

    /** Everything this player carries (for the save). */
    snapshot() {
        return {
            held: ['right', 'left'].map((s) => this.held[s]?.item || null),
            backpack: this.worn.backpack?.item || null,
        };
    }

    restore(s) {
        if (!s) return;
        if (s.backpack) this.wear(s.backpack);
        if (s.held) s.held.forEach((it, i) => { if (it) this.takeIntoHand(it, i ? 'left' : 'right'); });
    }

    dispose() {
        for (const uid of [...this.loose.keys()]) this.removeLoose(uid);
        for (const side of ['right', 'left']) this.releaseHand(side);
        if (this.worn.backpack) { this.game.scene.remove(this.worn.backpack.model); disposeModel(this.worn.backpack.model); }
        for (const cur of this.remoteHeld.values()) for (const k of Object.keys(cur)) if (cur[k]) { this.game.scene.remove(cur[k].model); disposeModel(cur[k].model); }
    }
}
