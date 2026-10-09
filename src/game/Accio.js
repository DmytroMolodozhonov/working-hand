/**
 * Accio.js — «Акцио»: summon a thing into your hand.
 *
 * Raise a hand, point it at a loose object (a sword, an axe…) up to 30 m away
 * and say «Акцио»: the object flies to the hand and lands in it, held. It
 * stays in the hand even though the hand was open when it arrived — opening
 * the hand drops it only after it has been closed around it once.
 */

import * as THREE from 'three';

export const ACCIO = {
    RANGE: 30, // m
    CONE: 0.45, // rad around the pointing direction
    SPEED: 18, // m/s the object flies at
    CATCH: 0.8, // m from the hand: caught
    MAX_TIME: 4, // s: gives up if it can't get there (stuck behind a wall)
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Accio {
    constructor(game) {
        this.game = game;
        this.state = null; // {w, side, t}
    }

    get active() {
        return !!this.state;
    }

    /** Cast: returns a hint (string) when nothing can be summoned, else null. */
    cast() {
        const g = this.game;
        const ch = g.character;
        let best = null;
        for (const side of ['right', 'left']) {
            if (!ch.isArmRaised(side)) continue;
            if (g.weapons.hands[side].held) continue;
            const hand = ch.getHandWorldPosition(side, new THREE.Vector3());
            const dir = ch.getHandDirection(side, new THREE.Vector3());
            for (const w of g.weapons.weapons) {
                if (w.holder || w.remoteTarget) continue;
                const to = _v1.subVectors(w.position, hand);
                const d = to.length();
                if (d > ACCIO.RANGE || d < 0.3) continue;
                const ang = dir.angleTo(to.normalize());
                if (ang > ACCIO.CONE) continue;
                const score = ang * 5 + d * 0.05;
                if (!best || score < best.score) best = { w, side, score };
            }
            // any other thing lying about (a bow, a shield, a wand, a scroll, food, coins…)
            if (g.items?.held[side]) continue;
            for (const L of g.items?.loose.values() || []) {
                if (L.asked || L.accio) continue;
                const to = _v1.subVectors(L.model.position, hand);
                const d = to.length();
                if (d > ACCIO.RANGE || d < 0.3) continue;
                const ang = dir.angleTo(to.normalize());
                if (ang > ACCIO.CONE) continue;
                const score = ang * 5 + d * 0.05;
                if (!best || score < best.score) best = { L, side, score };
            }
            // a fallen book-bird's book
            for (const bk of g.books?.books?.values() || []) {
                const to = _v1.subVectors(bk.model.position, hand);
                const d = to.length();
                if (d > ACCIO.RANGE || d < 0.3) continue;
                const ang = dir.angleTo(to.normalize());
                if (ang > ACCIO.CONE) continue;
                const score = ang * 5 + d * 0.05;
                if (!best || score < best.score) best = { bk, side, score };
            }
        }
        if (!best) {
            const busy = g.weapons.hands.left.held && g.weapons.hands.right.held;
            return busy ? '🪄 Обе руки заняты — отпустите что-нибудь' : '🪄 Поднимите руку и направьте её на предмет (меч, лук, щит, палочку…) не дальше 30 м — и скажите «Акцио»';
        }
        if (best.L) return this._castItem(best.L, best.side);
        if (best.bk) {
            // the book flies into the hand (the host gives it, as when a hand reaches it)
            const from = best.bk.model.position.clone();
            const hand = ch.getHandWorldPosition(best.side, new THREE.Vector3());
            for (let i = 0; i < 24; i++) g.fx.spark(_v2.copy(from).lerp(hand, i / 24), i % 2 ? 0xfff2a8 : 0xa8d8ff, 0.1, _v1.set(0, 0.5, 0), 0.5);
            if (g.books.auth) g.books._take(best.bk.id, g.localId, best.side);
            else g.sync?.bookTake?.(best.bk.id);
            if (g.sound) g.sound.playWhoosh?.();
            return null;
        }
        const w = best.w;
        w.hover = null;
        w.attach({ levitate: true, side: null }); // flies under my control (others see it fly)
        if (g.sync) g.sync._localGrab(w, 'levitate');
        this.state = { w, side: best.side, t: 0 };
        for (let i = 0; i < 16; i++) g.fx.spark(w.position, i % 2 ? 0xfff2a8 : 0xa8d8ff, 0.1, _v2.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.5);
        if (g.sound) g.sound.playWhoosh?.();
        return null;
    }

    /** A loose thing flies to the hand (the host moves it; a guest asks the host for it). */
    _castItem(L, side) {
        const g = this.game;
        for (let i = 0; i < 16; i++) g.fx.spark(L.model.position, i % 2 ? 0xfff2a8 : 0xa8d8ff, 0.1, _v2.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.5);
        if (g.sound) g.sound.playWhoosh?.();
        if (!g.items.auth) {
            L.asked = true;
            g.sync?.itemTake?.(L.item.uid, side);
            setTimeout(() => { L.asked = false; }, 1500);
            return null;
        }
        L.hover = null;
        L.rest = false;
        L.accio = true;
        this.state = { L, side, t: 0 };
        return null;
    }

    _updateItem(dt) {
        const s = this.state;
        const g = this.game;
        const L = s.L;
        s.t += dt;
        if (!g.items.loose.has(L.item.uid)) { this.state = null; return; }
        const hand = g.character.getGripObject(s.side).getWorldPosition(_v1);
        const p = L.model.position;
        const to = _v2.subVectors(hand, p);
        const d = to.length();
        if (d > 1e-3) p.addScaledVector(to, Math.min(1, (ACCIO.SPEED * dt) / d));
        L.model.rotation.y += dt * 6;
        if (Math.random() < 0.5) g.fx.spark(p, 0xfff2a8, 0.07, _v2.set(0, 0.4, 0), 0.3);
        if (d < ACCIO.CATCH || s.t > ACCIO.MAX_TIME) {
            this.state = null;
            L.accio = false;
            if (d < ACCIO.CATCH && !g.items.held[s.side]) g.items.pickUp(L.item.uid, g.localId, s.side);
            else { L.vel = L.vel || new THREE.Vector3(); L.vel.set(0, 0, 0); }
        }
    }

    update(dt) {
        const s = this.state;
        if (!s) return;
        if (s.L) { this._updateItem(dt); return; }
        const g = this.game;
        const w = s.w;
        s.t += dt;
        if (w.holder?.levitate !== true || !g.weapons.byId.has(w.id)) { this.state = null; return; }
        const hand = g.character.getGripObject(s.side).getWorldPosition(_v1);
        const to = _v2.subVectors(hand, w.drive.position);
        const d = to.length();
        // The pull point rushes to the hand; the object follows it on its spring
        if (d > 1e-3) w.drive.position.addScaledVector(to, Math.min(1, (ACCIO.SPEED * dt) / d));
        if (Math.random() < 0.5) g.fx.spark(w.position, 0xfff2a8, 0.07, _v2.set(0, 0.4, 0), 0.3);
        if (w.position.distanceTo(hand) < ACCIO.CATCH) {
            // Caught: from flying to held
            this.state = null;
            w.holder = null;
            w.drive = null;
            if (!g.weapons.grab(w, s.side, 0.5)) { w.release(); if (g.sync) g.sync._localRelease(w); return; }
            g.weapons.hands[s.side].waitClose = true; // stays in the open hand until it closes once
            return;
        }
        if (s.t > ACCIO.MAX_TIME) {
            this.state = null;
            w.release();
            if (g.sync) g.sync._localRelease(w);
        }
    }
}
