/**
 * WoundCare.js — a bleeding villager holds the wound with a hand; the wizards of the middle rank stop the blood with «Rescue»; the folk help the defenceless
 * (the rules and the author's words: WoundCareRules.js). Part of CastleLife (`life.wound`).
 *
 *   every computer: `v.woundHold` → VillagerModel draws the hand at the wound (the host decides it from the blood; guests have it in the net's flags: bit 16 / 32)
 *   host, every 0.7 s: for each bleeding person looks for help —
 *       a middle wizard bleeding → himself: the wand UP, a word, «Rescue» (the blood stops, the wound — and its scar on the model — stays)
 *       a defenceless one (a plain villager, a junior wizard) → the nearest wizard who can (he sees / hears the call) comes and does «Rescue» at him,
 *       and the nearest plain person comes, presses the wound (the blood runs half as fast) and calls out for a wizard
 *   a helper (`v.care`) walks, stands, works; any trouble (a fight, a stun, the victim gone, 45 s) ends it with nothing broken: `_end` clears every flag
 *
 * «А если»: the victim dies / is carried off / is stunned → the helper stops; a helper dies / is stunned / flies → the victim is free for the next one;
 * a night comes → the sleeping are not helpers (`v.sleep`); two helpers for one wounded → the wizard and the plain one only (two slots); a wizard far off but hears
 * the call (HEAR) → comes; no wizard → the plain helper stays; the host leaves → every flag lives on the villager and is rebuilt by the next host from the blood.
 */
import { CARE, CARE_LINES, canRescue, woundSide, staysSelf, pickWizard, pickPlain, isDefenceless } from './WoundCareRules.js';
import * as THREE from 'three';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const _p = new THREE.Vector3(), _w = new THREE.Vector3();
function turnTo(a, b, k) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * Math.min(1, k);
}

export class WoundCare {
    constructor(life) {
        this.life = life;
        this._t = 0;
        this._near = [];
    }

    // ------------------------------------------------------------ every frame (host)
    update(dt) {
        const L = this.life;
        for (const v of L.byId.values()) {
            const hold = !v.dead && v.bleed > 0;
            if (hold !== !!v.woundHold) { v.woundHold = hold; if (hold) v.woundSide = woundSide(v.id); else v.called = false; }
        }
        if ((this._t -= dt) > 0) return;
        this._t = CARE.SCAN;
        let any = false;
        for (const v of L.byId.values()) if (v.woundHold && !v.dead) { any = true; break; }
        if (!any) return;
        for (const v of L.byId.values()) {
            if (!v.woundHold || v.dead) continue;
            // (a helper that went away: the slot is free again)
            for (const slot of ['careBy', 'pressBy']) {
                if (v[slot] == null) continue;
                const h = L.byId.get(v[slot]);
                if (!h || h.dead || !h.care || h.care.tid !== v.id) v[slot] = null;
            }
            if (staysSelf(v)) { if (!v.care) this._begin(v, v, 'self'); continue; }
            if (!isDefenceless(v)) continue; // (a fighter: his own surgeons are the wizards who notice — the guard code; no one comes for him from the folk)
            const near = this._nearby(v, CARE.HEAR);
            if (v.careBy == null) {
                const w = pickWizard(v, near, v.called ? CARE.HEAR : CARE.SEE);
                if (w) { v.careBy = w.id; this._begin(w, v, 'wizard'); }
            }
            if (v.pressBy == null) {
                const p = pickPlain(v, near);
                if (p) { v.pressBy = p.id; this._begin(p, v, 'plain'); }
            }
        }
    }

    /** The people about one wounded: [{v, d}] within `range` and in sight (the pool is reused). */
    _nearby(victim, range) {
        const L = this.life, out = this._near;
        out.length = 0;
        for (const h of L.byId.values()) {
            if (h === victim || h.dead || h.sleep) continue;
            const d = Math.hypot(h.x - victim.x, h.z - victim.z);
            if (d > range || Math.abs(h.y - victim.y) > 8) continue;
            // (seen at once if near; the call carries through walls)
            if (d > 6 && !victim.called && !L._sees(h, { x: victim.x, y: victim.y + 1.2, z: victim.z })) continue;
            out.push({ v: h, d });
        }
        return out;
    }

    _begin(helper, victim, kind) {
        helper.care = { kind, tid: victim.id, age: 0, phase: kind === 'self' ? 'work' : 'go', t: 0, said: false, wait: 0 };
    }

    /** Ends everything of one helper's task (nothing half-done stays on him or the wounded). */
    _end(v) {
        const c = v.care;
        v.care = null;
        if (v.aimPitch) v.aimPitch = 0;
        if (c) {
            const victim = c.kind === 'self' ? v : this.life.byId.get(c.tid);
            if (victim) { if (victim.careBy === v.id) victim.careBy = null; if (victim.pressBy === v.id) victim.pressBy = null; }
        }
        return false;
    }

    // ------------------------------------------------------------ one helper (host; CastleLife._think calls it early)
    /** → true when he is busy with it this frame (the rest of his thinking is skipped). */
    step(v, dt) {
        const c = v.care;
        if (!c) return false;
        const L = this.life, g = L.game;
        const victim = c.kind === 'self' ? v : L.byId.get(c.tid);
        c.age += dt;
        if (v.dead || !victim || victim.dead || c.age > CARE.GIVE_UP || v.stunT > 0 || v.lev || v.vy || v.carriedBy || v.sleep) return this._end(v);
        if (!(victim.bleed > 0) && c.phase !== 'done') return this._end(v);
        // (a wizard in a fight finishes his own wound only when he has bled a while: not at the first blow)
        if (c.kind === 'self' && v.foe && (c.wait += dt) < 3) return false;
        if (c.kind !== 'self' && (v.foe || v.fleeT > 0)) return this._end(v);
        const dx = victim.x - v.x, dz = victim.z - v.z, d = Math.hypot(dx, dz);
        if (c.phase === 'go') {
            if (d > CARE.NEAR + 0.4) {
                v.mode = 'run';
                L._steer(v, victim.x, victim.z, CARE.RUN, dt, CARE.NEAR);
                return true;
            }
            c.phase = 'work'; c.t = 0;
        }
        // standing at work
        v.speed = 0; v.path = null;
        if (c.kind !== 'self') v.yaw = turnTo(v.yaw, Math.atan2(-dx, -dz), dt * 8);
        c.t += dt;
        if (c.kind === 'plain') {
            v.mode = 'idle';
            if (!c.said) {
                c.said = true;
                L._say(v, pick(CARE_LINES.plain), 3);
                if (!victim.called) { victim.called = true; setTimeout(() => { if (!v.dead) L._say(v, pick(CARE_LINES.call), 3); }, 1800); }
                const b = g.dismember?.bleeders?.get(`${(g.dismember.which?.(victim) || {}).k}:${victim.id}`);
                if (b) b.rate = Math.max(0.1, b.rate * CARE.PRESS_FACTOR); // (the hands on the wound)
            }
            if (c.t > 25) return this._end(v);
            return true;
        }
        // a wizard: the wand up (himself) or at the wounded, the word, «Rescue»
        v.mode = 'cast';
        c.wand = true;
        v.aimPitch = c.kind === 'self' ? 1.25 : Math.atan2(victim.y + 1.8 - (v.y + 3.4), Math.max(0.5, d));
        if (!c.said && c.t >= CARE.SAY_AT) { c.said = true; L._say(v, pick(CARE_LINES.wizard), 2); }
        if (c.t < CARE.RESCUE_T) return true;
        // it works: the blood stops, the wound stays
        const ok = g.dismember?.rescueCreature?.(victim);
        v.mana = Math.max(0, (v.mana ?? 0) - CARE.COST);
        const cx = victim.x, cy = victim.y + 1.6, cz = victim.z;
        for (let i = 0; i < 22; i++) g.fx?.spark?.(_p.set(cx, cy, cz), 0x9fffb0, 0.1, _w.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.8);
        if (ok) { victim.bleed = 0; victim.woundHold = false; victim.called = false; setTimeout(() => { if (!victim.dead) L._say(victim, pick(CARE_LINES.thanks), 3); }, 600); }
        v.castCd = Math.max(v.castCd ?? 0, CARE.COOL);
        c.wand = false;
        this._end(v);
        return true;
    }
}
