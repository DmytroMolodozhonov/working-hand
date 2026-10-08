/**
 * Bleeding.js — a blade stuck in a body, blood, and «Rescue».
 *
 * A sword / axe that sticks into a creature («Вингардиум Левиоса» + «Атак»,
 * or a thrust) makes it bleed: −1 HP every second, blood drips, the screen of
 * the wounded player pulses red. Pull the blade out (by hand — your own or
 * someone else's; by «Акцио» / «Левиоса») — it still bleeds, half as fast.
 * «Rescue» stops the bleeding: point the fingers at your own wound (the hand
 * at your body), or point the hand at the wounded player. If the blade is
 * still in, «Rescue» takes it out too.
 */

import * as THREE from 'three';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Bleeding {
    constructor(game) {
        this.game = game;
        this.rate = 0; // my bleeding: HP per second
        this._acc = 0;
        this.impaled = new Map(); // weaponId -> playerId the blade is in
        this.remote = new Map(); // playerId -> rate (to draw their blood)
        this._zT = 0;
        this._touch = new Map();
        this._overlay = typeof document !== 'undefined' ? document.getElementById('bleed-overlay') || this._makeOverlay() : null;
    }

    _makeOverlay() {
        const el = document.createElement('div');
        el.id = 'bleed-overlay';
        document.body.appendChild(el);
        return el;
    }

    /** I am wounded (a blade is in me: 1 HP/s). */
    start(rate = 1) {
        if (this.game.config.mode === 'creative') return;
        this.rate = Math.max(this.rate, rate);
        this.game.hud.setVoice('🩸 В вас вонзилось оружие! Вытащите его и скажите «Rescue», указав на рану', true);
        this.game.sync?.bleed?.(this.rate);
    }

    /** The blade came out: half as fast. */
    slower() {
        if (this.rate > 0) { this.rate = 0.5; this.game.sync?.bleed?.(this.rate); this.game.hud.setVoice('🩸 Оружие вынуто, но кровь ещё идёт — скажите «Rescue», указав на рану', true); }
    }

    stop() {
        if (this.rate <= 0) return;
        this.rate = 0;
        this._acc = 0;
        this.game.sync?.bleed?.(0);
        this.game.hud.setVoice('✚ Кровотечение остановлено', true);
        const c = this.game.character.group.position;
        for (let i = 0; i < 25; i++) this.game.fx.spark(_v.set(c.x, c.y + 0.6, c.z), 0x9fffb0, 0.1, _v2.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.8);
    }

    /** Blades in me (from the impale messages). */
    _bladesInMe() {
        const me = this.game.localId;
        const out = [];
        for (const [wid, pid] of this.impaled) if (pid === me) out.push(wid);
        return out;
    }

    /** «Rescue»: on myself (the hand at the body) or on the player the hand points at. */
    rescue(isFinal) {
        const g = this.game;
        const ch = g.character;
        const body = g.combat.center(new THREE.Vector3());
        const nearBody = ['right', 'left'].some((s) => ch.getHandWorldPosition(s, _v).distanceTo(body) < 1.0);
        if (nearBody && (this.rate > 0 || this._bladesInMe().length)) {
            for (const wid of this._bladesInMe()) this.pullOut(wid);
            this.stop();
            return 'Rescue';
        }
        const aim = g.duel.pickSide(true);
        if (aim && aim.t.kind === 'p') {
            g.sync?.rescue?.(aim.t.id);
            for (const [wid, pid] of this.impaled) if (pid === aim.t.id) this.pullOut(wid);
            const r = g.remotes.get(aim.t.id);
            if (r) for (let i = 0; i < 25; i++) g.fx.spark(_v.copy(r.position).add(_v2.set(0, 0.6, 0)), 0x9fffb0, 0.1, _v2.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.8);
            g.hud.setVoice('✚ Rescue — кровотечение остановлено', true);
            return 'Rescue';
        }
        if (isFinal) g.hud.setVoice('✚ «Rescue»: поднесите пальцы к своей ране или укажите рукой на раненого', true);
        return null;
    }

    /** Take a blade out of a player (whoever's computer has it moves it). */
    pullOut(wid) {
        const g = this.game;
        const w = g.weapons.byId.get(wid);
        if (w && w.stuckIn) { g.weapons._unstick(w, true); return; }
        g.sync?.pullOut?.(wid);
    }

    /** (network) a blade went into / out of a player. */
    noteImpale(wid, pid) {
        this.impaled.set(wid, pid);
        if (pid === this.game.localId) this.start(1);
    }

    noteUnimpale(wid) {
        const pid = this.impaled.get(wid);
        this.impaled.delete(wid);
        if (pid === this.game.localId && !this._bladesInMe().length) this.slower();
    }

    update(dt) {
        const g = this.game;
        const now = performance.now();
        // my blood
        if (this.rate > 0 && !g.combat.dead && !g.isDeadLocal) {
            this._acc += this.rate * dt;
            while (this._acc >= 1) {
                this._acc -= 1;
                if (g.combat.enabled) g.combat.damage(1, null, 'bleed');
                else g.damageLocalPlayer(1);
            }
            if (Math.random() < dt * 8 * this.rate) this._drip(g.combat.center(_v));
        } else if (g.combat.dead || g.isDeadLocal) { this.rate = 0; this._acc = 0; }
        if (this._overlay) this._overlay.style.opacity = this.rate > 0 ? String(0.25 + 0.2 * Math.sin(now / 250)) : '0';
        // other players' blood
        for (const [id, rate] of this.remote) {
            const r = g.remotes.get(id);
            if (!r || r.dead || rate <= 0) continue;
            if (Math.random() < dt * 8 * rate) this._drip(_v.copy(r.position).add(_v2.set(0, 0.6, 0)));
        }
        // blades in zombies make them bleed too (where zombies are simulated)
        this._zT += dt;
        if (this._zT >= 1) {
            this._zT = 0;
            if (g.authority) for (const w of g.weapons.stuckWeapons()) {
                const z = w.stuckIn?.z;
                if (z && z.isAnimal && !z.isDead) g.animals.hit(z, 1, null, null);
                else if (z && !z.playerId && !z.isDead && z.takeDamage) g.damageZombie(z, 1, true, _v.set(0, -1, 0), null);
            }
        }
        for (const w of g.weapons.stuckWeapons()) if (Math.random() < dt * 6) this._drip(w.position);
        // pulling a blade out of somebody by hand: touch its handle for a moment
        if (g.currentPose) {
            for (const [wid] of this.impaled) {
                const w = g.weapons.byId.get(wid);
                if (!w) continue;
                const near = ['right', 'left'].some((s) => ch(g).getHandWorldPosition(s, _v).distanceTo(w.position) < 0.45);
                const t = near ? (this._touch.get(wid) || 0) + dt : 0;
                this._touch.set(wid, t);
                if (t > 0.4) { this._touch.set(wid, -2); this.pullOut(wid); g.hud.setVoice('🗡️ Оружие вынуто', true); }
            }
        }
    }

    _drip(p) {
        this.game.fx.spark(_v2.set(p.x + (Math.random() - 0.5) * 0.4, p.y + (Math.random() - 0.5) * 0.4, p.z + (Math.random() - 0.5) * 0.4), Math.random() < 0.5 ? 0xb3001b : 0x7a0010, 0.07, new THREE.Vector3((Math.random() - 0.5) * 0.5, -1.5, (Math.random() - 0.5) * 0.5), 0.9);
    }

    dispose() {
        if (this._overlay) this._overlay.style.opacity = '0';
    }
}

const ch = (g) => g.character;
