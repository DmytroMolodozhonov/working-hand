/**
 * PentagramHydro.js — the gift of the white pentagram of water power (rules and the author's words: HydroRules.js; the circle: Pentagranium.js calls `useCircle` each frame
 * the hero stands in a lit circle of this kind).
 *
 * With the gift every water spell takes its water from the moisture of the air when no water is near (not in a desert, not off the Earth, not in hell):
 *   `spring(x, z, y)`  → a stand-in water surface {x, y, z, dist, humid: true} under the hand's spot (Waterbollow: start, «Максима», the second hand's feed)
 *   `point(o, d)`      → a stand-in water point ahead where the hand points (Wave Attack, Water Vortex, the storm's aim)
 *   `stormWater()`     → a stand-in list of the storm's "water blocks": only the count matters (entries are null: nothing is taken from the world, nothing is given back)
 * and a cloud of mist gathers to the hand (`_mist`).
 *
 * «А если»: ice held at the stand — refused with why; no water held — refused; not enough mana — nothing is paid; the gift twice — "already"; a desert — the spells ask for real water again
 * and say why once in a while; the hero dies — the gift goes (a lying body keeps it for "Give Me My Power": Legacy.js); the world is saved/loaded — `hydro` in the player's record; a guest — his
 * computer decides his own spells; Creative — no mana, but the water must still be held (the rite is the rite).
 */
import * as THREE from 'three';
import { HYDRO, HYDRO_HINT, holdsLiquidWater, airWet } from './HydroRules.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class PentagramHydro {
    constructor(game) {
        this.game = game;
        this.on = false;
        this._noteAt = -1e9;
        this.anim = null;
    }

    // ------------------------------------------------------------ saving
    snapshot() { return this.on ? { h: 1 } : null; }
    restore(o) { this.on = !!o?.h; }
    onDeath() { const had = this.on; this.on = false; this.anim = null; if (had) this.game.perf?.note?.('💧 водяная сила: дар забрала смерть'); }

    // ------------------------------------------------------------ the circle
    /** What water the hero holds now (for the rite). */
    held() {
        const g = this.game;
        const ball = g.water?.state ? { frozen: !!g.water.state.frozen } : null;
        const vs = g.vortex?.state;
        return { ball, storm: !!g.waterStorm?.busy, wave: !!g.waves?.mine, vortex: vs ? { frozen: !!vs.frozen } : null };
    }

    /** The hero stands in the circle: `ctx` { m, pays, hint, mana, fx } → true when the gift was given this frame. */
    useCircle(ctx) {
        const g = this.game;
        if (g.isDeadLocal || g.combat?.dead) return false;
        if (this.on) { ctx.hint('💧 ' + HYDRO_HINT.have); return false; }
        const h = holdsLiquidWater(this.held());
        if (!h.ok) { ctx.hint('💧 ' + (h.why === 'ice' ? HYDRO_HINT.ice : HYDRO_HINT.noWater)); return false; }
        if (ctx.pays && ctx.mana < HYDRO.COST) { ctx.hint('💧 ' + HYDRO_HINT.noMana(HYDRO.COST)); return false; }
        if (ctx.pays) { g.combat.fatigue -= HYDRO.COST; g.combat._hudKey = ''; }
        this.on = true; // (at once: the picture is only the picture)
        this.anim = { t: 0, m: ctx.m };
        ctx.fx?.();
        g.hud?.setVoice?.(HYDRO_HINT.done, true);
        g.perf?.note?.('💧 Пентаграмма водяной силы: дар получен');
        return true;
    }

    // ------------------------------------------------------------ the water spells' side
    /** Why the air gives no water here (or null): 'space' | 'desert' | 'hell'. */
    dryWhy() {
        const g = this.game;
        const t = g.terrain?.data, p = g.character?.group?.position;
        const desert = !!(t && p && (t.pyr?.sandy?.(Math.round(p.x), Math.round(p.z)) || t.pyr?.near?.(p.x, p.z, 120)));
        return airWet({ offEarth: !!g.space?.offEarth, hell: !!g.hellGate?.inHell, desert });
    }

    /** Says (once in a while) that it is too dry. Returns null so callers can `return`. */
    _dryNote(why) {
        const now = performance.now() / 1000;
        if (why === 'desert' && now - this._noteAt > HYDRO.NOTE_COOL) { this._noteAt = now; this.game.hud?.setVoice?.(HYDRO_HINT.dry, true); }
        return null;
    }

    /** A stand-in water surface under a spot (x, z, y of the hand's spot), or null (no gift / too dry). */
    spring(x, z, y) {
        if (!this.on) return null;
        const why = this.dryWhy();
        if (why) return this._dryNote(why);
        const col = this.game.collision;
        const ground = col?.groundY ? col.groundY(x, z) : y - 2;
        const sy = Math.max(ground + HYDRO.RAISE_FLOOR, y - HYDRO.SPRING_UP);
        return { x, y: sy, z, dist: 0.5, humid: true };
    }

    /** A stand-in water point where the hand `d` points from `o` (the spell is shown it), or null. */
    point(o, d) {
        if (!this.on) return null;
        const why = this.dryWhy();
        if (why) return this._dryNote(why);
        const col = this.game.collision;
        const k = 3.5;
        const x = o.x + d.x * k, z = o.z + d.z * k;
        const ground = col?.groundY ? col.groundY(x, z) : o.y - 2;
        return _v.set(x, Math.max(ground + HYDRO.RAISE_FLOOR, Math.min(o.y + d.y * k, ground + 4)), z).clone();
    }

    /** The storm's stand-in water: only the count matters (nulls: nothing taken from the world). */
    stormWater(max) {
        if (!this.on || this.dryWhy()) return null;
        return { list: new Array(max).fill(null), count: max };
    }

    /** The mist gathering to the hand when a spell takes water from the air (cheap: a few sparks). */
    mist(to) {
        const g = this.game, ch = g.character;
        if (!g.fx || !to) return;
        const p = ch.group.position;
        for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 2.5;
            _v.set(to.x + Math.cos(a) * r, to.y + (Math.random() - 0.2) * 2, to.z + Math.sin(a) * r);
            _w.set(to.x - _v.x, to.y - _v.y, to.z - _v.z).multiplyScalar(1 / HYDRO.MIST_S);
            g.fx.spark(_v, i % 3 ? 0xcfe8ff : 0xffffff, 0.12, _w, HYDRO.MIST_S);
        }
        void p;
    }

    // ------------------------------------------------------------ per frame
    update(dt) {
        if (!this.anim) return;
        const A = this.anim, g = this.game;
        A.t += dt;
        const m = A.m;
        if (g.fx && m && A.t < 2.2 && Math.random() < dt * 30) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * (m.r || 3);
            g.fx.spark(_v.set(m.x + Math.cos(a) * r, m.y + 0.2, m.z + Math.sin(a) * r), Math.random() < 0.5 ? 0x9fd8ff : 0xe8f6ff, 0.14, _w.set(0, 2 + Math.random() * 3, 0), 1.3);
        }
        if (A.t > 2.4) this.anim = null;
    }

    dispose() { this.anim = null; }
}
