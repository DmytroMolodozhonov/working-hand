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
 *
 * Light cuts: a slash with a sword / axe leaves a small red cut where the
 * blade went (everybody sees it on the body). It bleeds a little for a few
 * seconds, stops by itself, darkens and heals in about a minute and a half —
 * no HP loss, nothing to treat.
 */

import * as THREE from 'three';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const CUT_BLEED = 8; // s of light bleeding
const CUT_LIFE = 90; // s until it has healed
const MAX_CUTS = 12; // per body
const _cutGeo = new THREE.BoxGeometry(1, 1, 1);
const _fresh = new THREE.Color(0xc0001c), _scab = new THREE.Color(0x5a1810);

/**
 * Where on the body a cut goes: the part and the point on its surface.
 * `h` = [x, y, z] in the character's own frame (feet at y −1.95, face to −Z).
 * @returns {{part:string, pos:number[], normal:number[]}}
 */
export function cutPlace(h) {
    const [x, y, z] = h;
    let part, c, half;
    if (y > 1.45) { part = 'head'; c = [0, 2.1, 0]; half = [0.6, 0.6, 0.6]; }
    else if (y > -0.05) { part = 'body'; c = [0, 0.75, 0]; half = [0.6, 0.75, 0.4]; }
    else { part = x < 0 ? 'leftLeg' : 'rightLeg'; c = [x < 0 ? -0.3 : 0.3, -0.975, 0]; half = [0.25, 0.975, 0.25]; }
    // the point inside the box, then out to its nearest face
    const p = [x - c[0], y - c[1], z - c[2]].map((v, i) => Math.max(-half[i], Math.min(half[i], v)));
    let k = 0, best = -1;
    for (let i = 0; i < 3; i++) {
        if (part === 'head' && i === 1 && p[1] > 0) continue; // (not on top: there is hair)
        const r = Math.abs(p[i]) / half[i];
        if (r > best) { best = r; k = i; }
    }
    const normal = [0, 0, 0];
    normal[k] = p[k] >= 0 ? 1 : -1;
    p[k] = normal[k] * (half[k] + 0.012);
    return { part, pos: p, normal };
}

export class Bleeding {
    constructor(game) {
        this.game = game;
        this.rate = 0; // my bleeding: HP per second
        this._acc = 0;
        this.impaled = new Map(); // weaponId -> playerId the blade is in
        this.remote = new Map(); // playerId -> rate (to draw their blood)
        this._zT = 0;
        this._touch = new Map();
        this.cuts = []; // {mesh, mat, age, char}
        this._cutMsg = -1e9;
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

    /** A blade slashed me (not a deep wound): a cut that heals by itself. */
    cut(h) {
        if (!h || this.game.config.mode === 'creative') return;
        this.addCut(this.game.character, h);
        this.game.sync?.cut?.(h);
        const now = performance.now();
        if (now - this._cutMsg > 8000) {
            this._cutMsg = now;
            this.game.hud.setVoice('🩸 Порез — неглубокий, кровь скоро остановится сама', true);
        }
    }

    /** Put a cut on a character's body (mine or another player's). */
    addCut(character, h) {
        if (!character || !Array.isArray(h) || h.length < 3 || !h.every(Number.isFinite)) return null;
        const { part, pos, normal } = cutPlace(h);
        const parent = part === 'head' ? character.head
            : part === 'body' ? character.body
            : (part === 'leftLeg' ? character.leftLegPivot : character.rightLegPivot)?.children.find((c) => c.isMesh);
        if (!parent) return null;
        const mat = new THREE.MeshBasicMaterial({ color: _fresh });
        const mesh = new THREE.Mesh(_cutGeo, mat);
        // a thin slash lying on the face, at a random slant
        const len = 0.22 + Math.random() * 0.16;
        if (normal[0]) mesh.scale.set(0.02, 0.05, len);
        else if (normal[1]) mesh.scale.set(len, 0.02, 0.05);
        else mesh.scale.set(len, 0.05, 0.02);
        mesh.rotation.set(normal[0] ? Math.random() * 1.4 - 0.7 : 0, normal[1] ? Math.random() * 1.4 - 0.7 : 0, normal[2] ? Math.random() * 1.4 - 0.7 : 0);
        mesh.position.fromArray(pos);
        mesh.name = 'cut';
        parent.add(mesh);
        this.cuts.push({ mesh, mat, age: 0, char: character, len, axis: normal[0] ? 'z' : 'x' });
        // too many on one body: the oldest is healed
        const mine = this.cuts.filter((c) => c.char === character);
        if (mine.length > MAX_CUTS) this._removeCut(mine[0]);
        return mesh;
    }

    _removeCut(c) {
        c.mesh.parent?.remove(c.mesh);
        c.mat.dispose();
        const i = this.cuts.indexOf(c);
        if (i >= 0) this.cuts.splice(i, 1);
    }

    _updateCuts(dt) {
        for (let i = this.cuts.length - 1; i >= 0; i--) {
            const c = this.cuts[i];
            c.age += dt;
            if (c.age >= CUT_LIFE || !c.mesh.parent) { this._removeCut(c); continue; }
            // the blood stops by itself, the cut darkens, then closes up
            c.mat.color.copy(_fresh).lerp(_scab, Math.min(1, c.age / 20));
            if (c.age > CUT_LIFE - 15) c.mesh.scale[c.axis] = Math.max(0.03, c.len * (CUT_LIFE - c.age) / 15);
            if (c.age < CUT_BLEED && Math.random() < dt * 4 * (1 - c.age / CUT_BLEED)) {
                c.mesh.getWorldPosition(_v);
                this._drip(_v, 0.08);
            }
        }
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
        this._updateCuts(dt);
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

    _drip(p, spread = 0.4) {
        this.game.fx.spark(_v2.set(p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread, p.z + (Math.random() - 0.5) * spread), Math.random() < 0.5 ? 0xb3001b : 0x7a0010, 0.07, new THREE.Vector3((Math.random() - 0.5) * 0.5, -1.5, (Math.random() - 0.5) * 0.5), 0.9);
    }

    /** A player left / their avatar is gone: forget the cuts on it. */
    clearCuts(character) {
        for (const c of this.cuts.slice()) if (!character || c.char === character) this._removeCut(c);
    }

    dispose() {
        this.clearCuts();
        if (this._overlay) this._overlay.style.opacity = '0';
    }
}

const ch = (g) => g.character;
