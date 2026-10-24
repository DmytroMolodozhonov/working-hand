/**
 * HurtFlash.js — a creature that really loses HP glows a light red for a moment, on every
 * computer: so it is clear the blow / the spell / the fire really hit and really hurt.
 *
 * Every frame it looks at every creature's HP (players over the network, castle people,
 * sailors, animals with the bronze bull / the minotaur / the Pegasus, the giant spider,
 * living trees, dragons, phoenixes…). HP is synced from the host to everybody, so a drop
 * seen here is a real wound — on the host and on the guests alike.
 *  - Zombies are not watched: they already flash red themselves (Zombie.takeDamage, 'zhit').
 *  - My own body is not tinted: I see the red flash of the screen (Hud.damageFlash).
 *  - «Not acted on» stays visible: a dragon in fire loses no HP — no flash.
 *
 * The tint: each mesh gets, for ~0.22 s, a red-tinted copy of its material (cached per
 * material, refreshed from the original at every flash). The original is never changed
 * (models share their materials), and it comes back only if the mesh still has our copy
 * (other code may have changed the look meanwhile: cooked, bronze, ice).
 */

import * as THREE from 'three';

export const HURT_FLASH = {
    TIME: 0.22, // s the red lasts
    GAP: 0.35, // s at least between two flashes of one creature (a slow burn pulses)
    MIN: 0.2, // HP: a smaller loss (with what is gathered) is not shown yet
    TINT: 0.35, // how far the colour goes to red
    GLOW: 0.25, // a weak red glow (materials that can glow)
    FAR: 80, // m: farther than this, not watched
};

const RED = new THREE.Color(0xff1a10);
const _p = new THREE.Vector3();

export class HurtFlash {
    constructor(game) {
        this.game = game;
        this.t = 0;
        this._state = new WeakMap(); // creature → {hp, acc, next}
        this._tints = new WeakMap(); // original material → its red copy
        this._lit = new Set(); // {mesh, orig, tint, until}
    }

    update(dt) {
        this.t += dt;
        const g = this.game;
        const me = g.character?.group?.position;
        // every creature: its model, HP, death (and its form: a new form sets its HP anew, not a wound)
        for (const r of g.remotes?.values?.() || []) this.watch(r, r.character?.group, r.hp, r.dead, me);
        for (const v of g.castleLife?.byId?.values?.() || []) this.watch(v, v.group, v.hp, v.dead, me);
        for (const v of g.ships?.crew?.byId?.values?.() || []) this.watch(v, v.group, v.hp, v.dead, me);
        for (const a of g.animals?.list || []) this.watch(a, a.model, a.hp, a.dead, me, a.form | 0); // (the bull / the minotaur calming: back to an animal's HP)
        for (const s of g.spiders?.list || []) this.watch(s, s.model, s.hp, s.dead, me);
        for (const t of g.livingTrees?.list || []) this.watch(t, t.model, t.hp, t.gone || t.phase === 'fall', me);
        for (const d of g.dragons?.list || []) this.watch(d, d.model, d.hp, d.dead, me);
        for (const f of g.phoenixes?.list || []) this.watch(f, f.model, f.hp, f.dead, me);
        for (const o of g.owls?.list || []) this.watch(o, o.model, o.hp, o.dead, me);
        for (const c of g.iceCastle?.list || []) this.watch(c, c.model, c.hp, c.dead, me);
        this._restore();
    }

    /** One creature: a real loss of HP since the last look → its model flashes. */
    watch(c, root, hp, dead, me = null, form = 0) {
        if (!c || typeof c !== 'object') return;
        let st = this._state.get(c);
        if (!st) { this._state.set(c, (st = { hp, acc: 0, next: 0, dead, form })); return; }
        const was = st.hp, wasDead = st.dead, wasForm = st.form;
        st.hp = hp; st.dead = dead; st.form = form;
        if (form !== wasForm) { st.acc = 0; return; }
        if (!Number.isFinite(hp) || !Number.isFinite(was)) { st.acc = 0; return; } // (unknown: a player who just came back)
        if (wasDead) { st.acc = 0; return; } // (a body: nothing more to show)
        if (hp < was) st.acc += was - hp;
        if (st.acc < HURT_FLASH.MIN || this.t < st.next) return;
        st.acc = 0;
        st.next = this.t + HURT_FLASH.GAP;
        if (!root || root.visible === false) return;
        if (me && root.getWorldPosition && root.getWorldPosition(_p).distanceToSquared(me) > HURT_FLASH.FAR * HURT_FLASH.FAR) return;
        this.flash(root);
    }

    /** The model glows red for a moment. */
    flash(root) {
        const until = this.t + HURT_FLASH.TIME;
        root.traverse((o) => {
            if (!o.isMesh || !o.material || o.userData?.noHurtFlash) return;
            const lit = o.userData._hurtLit;
            if (lit && this._lit.has(lit) && o.material === lit.tint) { lit.until = until; return; } // (still red: longer)
            const orig = o.material;
            const tint = Array.isArray(orig) ? orig.map((m) => this._tint(m)) : this._tint(orig);
            if (tint === orig) return;
            o.material = tint;
            const e = { mesh: o, orig, tint, until };
            o.userData._hurtLit = e;
            this._lit.add(e);
        });
    }

    /** A material's red copy, freshly made from the original (its colour may have changed). */
    _tint(m) {
        if (!m || !m.color || m.isShaderMaterial) return m;
        let t = this._tints.get(m);
        if (!t) { t = m.clone(); this._tints.set(m, t); } else t.copy(m);
        delete t.userData.src; // (a far shape's twin: the red copy keeps its red — FarShape.syncTwin follows `src` only on the twin itself)
        // (a material with its own shader piece — the sky's tint, the far shape's skin: clone() drops it, and the copy then shares
        // the original's program without its uniforms — the draw throws. The same piece, the same program key)
        if (m.onBeforeCompile && t.onBeforeCompile !== m.onBeforeCompile) t.onBeforeCompile = m.onBeforeCompile;
        if (m.customProgramCacheKey && t.customProgramCacheKey !== m.customProgramCacheKey) t.customProgramCacheKey = m.customProgramCacheKey;
        t.color.lerp(RED, HURT_FLASH.TINT);
        if (t.emissive) t.emissive.lerp(RED, HURT_FLASH.GLOW);
        return t;
    }

    _restore(all = false) {
        for (const e of this._lit) {
            if (!all && this.t < e.until) continue;
            this._lit.delete(e);
            if (e.mesh.material === e.tint) e.mesh.material = e.orig; // (only our copy: another look stays)
            if (e.mesh.userData._hurtLit === e) delete e.mesh.userData._hurtLit;
        }
    }

    dispose() { this._restore(true); }
}
