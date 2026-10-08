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
import { ITEM_INFO, makeItemModel, disposeModel, rollLoot } from './ItemTypes.js';

const PICK_RADIUS = 0.9;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _inv = new THREE.Matrix4();

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
    lootChest(pos, rng = Math.random) {
        const items = rollLoot(rng);
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
        const model = makeItemModel(item);
        this.game.scene.add(model);
        this.held[side] = { item, model };
        if (this.game.sync) this.game.sync.itemHold?.(side, item);
        return true;
    }

    /** Out of a hand (into a slot, eaten, thrown…): returns the item. */
    releaseHand(side) {
        const h = this.held[side];
        if (!h) return null;
        this.held[side] = null;
        this.game.scene.remove(h.model);
        disposeModel(h.model);
        if (this.game.sync) this.game.sync.itemHold?.(side, null);
        return h.item;
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
            grip.getWorldQuaternion(_q);
            h.model.quaternion.copy(_q);
            if (h.item.kind === 'wand' || h.item.kind === 'hammer') h.model.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), Math.PI / 2));
            if (h.item.kind === 'shield') h.model.position.addScaledVector(_v.set(0, 0, 1).applyQuaternion(h.model.quaternion), 0.05);
        }
        if (this.worn.backpack) this._placeBackpack(this.worn.backpack.model, ch);
        if (!g.currentPose || g.combat.dead) { this._netSend(dt); return; }
        const now = performance.now();
        // pick up: an empty hand touching a thing
        for (const side of ['right', 'left']) {
            if (this.held[side] || g.weapons.hands[side].held || (side === 'right' && g.books?.inHand)) continue;
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
            if (!this.held[side]) continue;
            let peak = null;
            for (const e of hist) if (!peak || e.s > peak.s) peak = e;
            if (peak && peak.s > 6.5 && v.length() < peak.s * 0.35 && now - peak.t < 200) {
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
        if (L.rest) return;
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
            else { L.vel.set(0, 0, 0); L.spin.set(0, 0, 0); L.rest = true; m.rotation.x = 0; m.rotation.z = Math.PI / 2 * (L.item.kind === 'shield' ? 1 : 0); }
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
        for (const side of ['right', 'left']) { const h = this.held[side]; if (h && (h.item.kind === 'apple' || h.item.kind === 'meat' || h.item.kind === 'steak')) food = { side, h }; }
        if (!food) { this._eatT = 0; return; }
        const mouth = ch.head.getWorldPosition(_v).add(_v2.set(0, -0.25, 0));
        if (food.h.model.position.distanceTo(mouth) < 0.55) this._eatT += dt; else this._eatT = 0;
        if (this._eatT < 0.6) return;
        this._eatT = 0;
        const heal = { apple: 10, meat: 2, steak: 4 }[food.h.item.kind];
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
        return [{ kind: 'wand', model: 4, color: 0x8844ff }, { kind: 'scroll' }, { kind: 'shield', type: 2, magic: true }, { kind: 'backpack', color: 0x7a4a24 }, { kind: 'bow', type: 0, magic: true }, { kind: 'hammer' }, { kind: 'apple' }, { kind: 'meat' }].map((it) => makeItemModel(it));
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
