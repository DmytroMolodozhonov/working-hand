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
    LIFT: 0.06, // the arm lifted this much from hanging (1 − cos: ~20°) is enough — a thing close by the feet
    NEAR: 0.6, // m: a thing this close may be off the pointing a little more (the hand points down at it)
};

/**
 * The hand a summoned thing flies into: the leading hand (`dom`: 'right' for a right-hander) when it is free,
 * else the other one, else none (null). The author: «правша, правая рука пустая — палочка должна лететь в правую».
 */
export function accioCatcher(free, dom = 'right') {
    const off = dom === 'left' ? 'right' : 'left';
    return free(dom) ? dom : free(off) ? off : null;
}

/** A dead animal «Акцио» acts on: a body, not yet bones (its meat all taken), nor one held by «Левиоса». Pure (tests). */
export function accioBody(a) {
    return !!a && !!a.dead && !a.lev && !a.bones;
}

/** A body pointed at loses to a thing pointed at as well (it lies big round it: its cone is wider). */
const BODY_PENALTY = 0.6;

/** s: whatever «Акцио» is waiting for, it never holds the spell longer (a flight cut short elsewhere). */
export const ACCIO_STUCK = ACCIO.MAX_TIME + 4;

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

    /** «Стоп»: what was flying here stops (a thing falls where it is). True if anything flew. */
    stop() {
        const s = this.state, g = this.game;
        if (!s) return false;
        this.state = null;
        if (s.w) { s.w.release(); g.sync?._localRelease?.(s.w); }
        else if (s.L) { s.L.accio = false; s.L.vel?.set(0, 0, 0); }
        else if (s.bk) { s.bk.accio = false; g.books?.dropBook(s.bk, null); }
        else if (s.board) g.boards?.accioStop();
        // (a crystal is tiny and already broken off: it still comes to the hand)
        return true;
    }

    /** Cast: returns a hint (string) when nothing can be summoned, else null. */
    cast() {
        const g = this.game;
        const ch = g.character;
        let best = null;
        // (a dragon is no thing: «Акцио» does not act on it — DragonKinds.ON_DRAGON.Accio; its egg is a thing: it flies)
        // the thing comes into a free hand: the leading one (Настройки → «Ведущая рука»: a right-hander's
        // right) whichever hand points, the other only when the leading one is busy (accioCatcher)
        const free = (sd) => !g.weapons.hands[sd].held && !g.items?.held[sd] && !g.boards?.handBusy(sd);
        // (an arm only ~20° from hanging counts too: a thing lying right by the feet is pointed at low)
        const lift = g.currentPose?.armLift;
        // (the spell journal: what lay about and how near the pointing it was — why nothing came / why the wrong thing did)
        const dg = { raised: 0, loose: 0, inRange: 0, inCone: 0, nearAng: Infinity, nearD: 0, noHand: false };
        for (const side of ['right', 'left']) {
            if (!ch.isArmRaised(side) && !(lift && lift[side] > ACCIO.LIFT)) continue;
            dg.raised++;
            const catcher = accioCatcher(free, g.dom);
            const hand = ch.getHandWorldPosition(side, new THREE.Vector3());
            const dir = ch.getHandDirection(side, new THREE.Vector3());
            for (const w of catcher ? g.weapons.weapons : []) {
                if (w.holder || w.remoteTarget) continue;
                const to = _v1.subVectors(w.position, hand);
                const d = to.length();
                if (d > ACCIO.RANGE || d < 0.3) continue;
                const ang = dir.angleTo(to.normalize());
                if (ang > ACCIO.CONE + Math.atan2(ACCIO.NEAR, d)) continue;
                const score = ang * 5 + d * 0.05;
                if (!best || score < best.score) best = { w, side: catcher, score };
            }
            // a running book: it flies into the free hand (none free: it lands dazed at the feet)
            for (const { a, pos } of g.runner?.accioTargets() || []) {
                const to = _v1.subVectors(pos, hand);
                const d = to.length();
                if (d > ACCIO.RANGE || d < 0.3) continue;
                const ang = dir.angleTo(to.normalize());
                // (small, fast and running off from a jittery real hand: a wider cone, and it wins
                // over the other things in it — that is what the hand is after)
                if (ang > ACCIO.CONE + Math.atan2(1.5, d)) continue;
                const score = ang * 5 + d * 0.05 - 3;
                if (!best || score < best.score) best = { rb: a, side, catcher, score, hand };
            }
            // a dead animal's body (a cow, a running book…): its meat flies into the free hand (none free: the
            // body is pulled to the feet). Bones (the meat all taken) are nothing to summon: they never stand
            // in the way of the things lying by them (the author: after a pig's meat «Акцио» stopped working)
            for (const a of g.animals?.list || []) {
                if (!accioBody(a)) continue;
                const pos = g.levitation?._centreOf ? g.levitation._centreOf('a', a) : a.group.position;
                const to = _v1.subVectors(pos, hand);
                const d = to.length();
                if (d > ACCIO.RANGE || d < 0.3) continue;
                const ang = dir.angleTo(to.normalize());
                if (ang > ACCIO.CONE + Math.atan2(1, d)) continue;
                const score = ang * 5 + d * 0.05 + BODY_PENALTY; // (a thing pointed at near it wins: a wand, a sword…)
                if (!best || score < best.score) best = { body: a, side, catcher, score, hand };
            }
            // a surfboard (big: into both free hands, under the one free arm, or down in front of the feet)
            for (const { id, pos } of g.boards?.accioTargets() || []) {
                const to = _v1.subVectors(pos, hand);
                const d = to.length();
                if (d > ACCIO.RANGE || d < 0.3) continue;
                const ang = dir.angleTo(to.normalize());
                if (ang > ACCIO.CONE + Math.atan2(1.1, d)) continue;
                const score = ang * 5 + d * 0.05;
                if (!best || score < best.score) best = { board: id, score };
            }
            // any other thing lying about (a bow, a shield, a wand, a scroll, food, coins…)
            if (!catcher) { dg.noHand = true; continue; }
            for (const L of g.items?.loose.values() || []) {
                dg.loose++;
                if (L.asked || L.accio) continue;
                const to = _v1.subVectors(L.model.position, hand);
                const d = to.length();
                if (d > ACCIO.RANGE || d < 0.3) continue;
                dg.inRange++;
                const ang = dir.angleTo(to.normalize());
                if (ang < dg.nearAng) { dg.nearAng = ang; dg.nearD = d; }
                if (ang > ACCIO.CONE + Math.atan2(ACCIO.NEAR, d)) continue;
                dg.inCone++;
                const score = ang * 5 + d * 0.05;
                if (!best || score < best.score) best = { L, side: catcher, score };
            }
            // a fallen book-bird's book
            for (const bk of g.books?.books?.values() || []) {
                const to = _v1.subVectors(bk.model.position, hand);
                const d = to.length();
                if (d > ACCIO.RANGE || d < 0.3) continue;
                const ang = dir.angleTo(to.normalize());
                if (ang > ACCIO.CONE) continue;
                const score = ang * 5 + d * 0.05;
                if (!best || score < best.score) best = { bk, side: catcher, score };
            }
            // a mana crystal growing in a cave: torn out of the rock it cracks — its power to me (ManaCrystals.accio)
            for (const c of g.crystals?.growing() || []) {
                const to = _v1.subVectors(c.center, hand);
                const d = to.length();
                if (d > ACCIO.RANGE || d < 0.3) continue;
                const ang = dir.angleTo(to.normalize());
                if (ang > ACCIO.CONE) continue;
                const score = ang * 5 + d * 0.05;
                if (!best || score < best.score) best = { mc: c, side: catcher, score };
            }
        }
        if (!best) {
            const rb = this._runnerHint();
            const why = !dg.raised ? 'рука не поднята' : dg.noHand ? 'обе руки заняты' : !dg.inRange ? `в радиусе ${ACCIO.RANGE} м вещей нет (на земле всего ${dg.loose})` : `рука не наведена на вещь: ближайшая к линии руки — на ${Math.round(dg.nearAng * 57.3)}° в сторону, в ${Math.round(dg.nearD)} м (допуск ${Math.round(ACCIO.CONE * 57.3)}°); вещей в радиусе ${dg.inRange} из ${dg.loose}`;
            g.lastCastWhy = 'цель не найдена: ' + why;
            if (rb) return rb;
            const busy = !free('left') && !free('right');
            return busy ? '🪄 Обе руки заняты — отпустите что-нибудь' : '🪄 Поднимите руку и направьте её на предмет (меч, лук, щит, палочку, доску…) не дальше 30 м — и скажите «Акцио»';
        }
        if (best.rb) {
            if (g.sound) (g.sound.playSpellFx?.('fxAccio') || g.sound.playWhoosh?.());
            if (best.catcher && g.runner.accioToHand?.(best.rb, best.catcher)) return null;
            g.runner.accio(best.rb, best.hand);
            // (a toast: the voice line is taken by «✨ ACCIO» right after)
            if (!best.catcher) g.hud?.toast?.('🪄 Обе руки заняты — бегущая книга упала у ваших ног. Освободите руку, и «Акцио» принесёт её прямо в неё', 4000);
            return null;
        }
        if (best.body) {
            if (g.sound) (g.sound.playSpellFx?.('fxAccio') || g.sound.playWhoosh?.());
            const a = best.body;
            if (best.catcher && (a.meat || 0) > 0 && g.animals) {
                // its meat comes into the free hand (the host cuts it off and gives it, as when the hand takes it)
                const from = g.levitation?._centreOf ? g.levitation._centreOf('a', a) : a.group.position;
                for (let i = 0; i < 16; i++) g.fx.spark(from, i % 2 ? 0xfff2a8 : 0xa8d8ff, 0.1, _v2.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.5);
                if (g.animals.auth) g.animals._takeMeat(a, g.localId, best.catcher);
                else g.sync?.animalMeat?.(a.id, best.catcher);
                g.mana?.success('Accio');
                return null;
            }
            g.runner?.accio(a, best.hand);
            return null;
        }
        if (best.board) {
            if (!g.boards.accioStart(best.board)) return '🪄 Эту доску уже кто-то держит';
            this.state = { board: best.board, t: 0 };
            if (g.sound) (g.sound.playSpellFx?.('fxAccio') || g.sound.playWhoosh?.());
            if (!free('left') && !free('right')) g.hud?.setVoice?.('🪄 Обе руки заняты — доска ляжет у ваших ног', true);
            return null;
        }
        if (best.L) {
            // (many things in the cone: the one nearest the line comes — the journal says how many competed)
            if (dg.inCone > 1) g.spellLog?.note?.(`🪄 Акцио: в конусе руки ${dg.inCone} вещей, прилетела та, что ближе к линии (${Math.round(best.L.model.position.distanceTo(g.character.group.position))} м от вас)`);
            return this._castItem(best.L, best.side);
        }
        if (best.mc) {
            const f = g.crystals.accio(best.mc, best.side);
            if (!f) return '🪄 Этот кристалл уже кто-то взял';
            this.state = { mc: f, side: best.side, t: 0 };
            if (g.sound) (g.sound.playSpellFx?.('fxAccio') || g.sound.playWhoosh?.());
            return null;
        }
        if (best.bk) {
            // the book rises and flies to the hand; it is caught when it gets there
            // (the host gives it, as when a hand reaches it)
            const bk = best.bk;
            bk.accio = true;
            bk.fallV = null;
            this.state = { bk, side: best.side, t: 0 };
            for (let i = 0; i < 16; i++) g.fx.spark(bk.model.position, i % 2 ? 0xfff2a8 : 0xa8d8ff, 0.1, _v2.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.5);
            if (g.sound) (g.sound.playSpellFx?.('fxAccio') || g.sound.playWhoosh?.());
            return null;
        }
        const w = best.w;
        w.hover = null;
        w.attach({ levitate: true, side: null }); // flies under my control (others see it fly)
        if (g.sync) g.sync._localGrab(w, 'levitate');
        this.state = { w, side: best.side, t: 0 };
        for (let i = 0; i < 16; i++) g.fx.spark(w.position, i % 2 ? 0xfff2a8 : 0xa8d8ff, 0.1, _v2.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.5);
        if (g.sound) (g.sound.playSpellFx?.('fxAccio') || g.sound.playWhoosh?.());
        return null;
    }

    /** A loose thing flies to the hand (the host moves it; a guest asks the host for it). */
    /** Nothing summoned, a running book about: why it didn't come. */
    _runnerHint() {
        const g = this.game, ch = g.character;
        const books = g.runner?.accioTargets?.() || [];
        if (!books.length) return null;
        const me = ch.group.position;
        const near = Math.min(...books.map((b) => b.pos.distanceTo(me)));
        if (near > ACCIO.RANGE) return `🪄 Бегущая книга слишком далеко (${Math.round(near)} м) — «Акцио» достаёт до ${ACCIO.RANGE} м`;
        const lift = g.currentPose?.armLift;
        if (!['left', 'right'].some((s) => ch.isArmRaised(s) || (lift && lift[s] > ACCIO.LIFT))) return '🪄 Поднимите руку (или палочку) и покажите на бегущую книгу — и скажите «Акцио»';
        return '🪄 Бегущая книга не там, куда показывает рука — направьте руку (палочку) прямо на неё';
    }

    _castItem(L, side) {
        const g = this.game;
        for (let i = 0; i < 16; i++) g.fx.spark(L.model.position, i % 2 ? 0xfff2a8 : 0xa8d8ff, 0.1, _v2.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.5);
        if (g.sound) (g.sound.playSpellFx?.('fxAccio') || g.sound.playWhoosh?.());
        if (!g.items.auth) {
            L.asked = true;
            g.sync?.itemTake?.(L.item.uid, side);
            g.mana?.success('Accio'); // (a guest: the host hands it over at once)
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
            if (d < ACCIO.CATCH && !g.items.held[s.side]) { g.items.pickUp(L.item.uid, g.localId, s.side); g.mana?.success('Accio'); }
            else { L.vel = L.vel || new THREE.Vector3(); L.vel.set(0, 0, 0); }
        }
    }

    /** A book flying to the hand. */
    _updateBook(dt) {
        const s = this.state;
        const g = this.game;
        const bk = s.bk;
        s.t += dt;
        if (!g.books?.books.has(bk.id)) { this.state = null; return; } // (somebody else got it)
        const hand = g.character.getGripObject(s.side).getWorldPosition(_v1);
        const p = bk.model.position;
        const to = _v2.subVectors(hand, p);
        const d = to.length();
        if (d > 1e-3) p.addScaledVector(to, Math.min(1, (ACCIO.SPEED * dt) / d));
        bk.model.rotation.y += dt * 5;
        if (Math.random() < 0.5) g.fx.spark(p, 0xfff2a8, 0.07, _v2.set(0, 0.4, 0), 0.3);
        if (d < ACCIO.CATCH || s.t > ACCIO.MAX_TIME) {
            this.state = null;
            bk.accio = false;
            if (d >= ACCIO.CATCH) { g.books.dropBook(bk, null); return; } // (it couldn't get there: it falls)
            g.mana?.success('Accio'); // (mana: it came to the hand)
            if (g.books.auth) g.books._take(bk.id, g.localId, s.side);
            else g.sync?.bookTake?.(bk.id);
        }
    }

    update(dt) {
        const s = this.state;
        if (!s) return;
        // (never stuck: whatever it waits for, a new «Акцио» can be said after a few seconds — the author's game
        // ended when «Акцио» stopped working with his wand lying on the ground)
        s.age = (s.age || 0) + dt;
        if (s.age > ACCIO_STUCK) { this.stop(); return; }
        if (s.L) { this._updateItem(dt); return; }
        if (s.mc) { if (s.mc.done) this.state = null; return; } // (ManaCrystals: it cracked, its power flies to me)
        if (s.bk) { this._updateBook(dt); return; }
        const g = this.game;
        if (s.board) {
            // the board: into the hands that are free when it gets here
            const free = ['left', 'right'].filter((sd) => !g.weapons.hands[sd].held && !g.items?.held[sd] && !g.books?.reading?.handBusy?.(sd) && g.scrolls?.readingSide !== sd);
            const r = g.boards ? g.boards.accioStep(dt, free) : 'gone';
            if (r === 'fly') return;
            this.state = null;
            if (r === 'caught' || r === 'landed') g.mana?.success('Accio');
            return;
        }
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
            g.mana?.success('Accio'); // (mana: it came to the hand)
            return;
        }
        if (s.t > ACCIO.MAX_TIME) {
            this.state = null;
            w.release();
            if (g.sync) g.sync._localRelease(w);
        }
    }
}
