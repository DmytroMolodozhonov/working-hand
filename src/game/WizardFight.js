/**
 * WizardFight.js — the wizards of a tower (and the wanderers) fight: real duel spells from the
 * wand (src/game/Duel.js — the same charges a player casts: «Остолбеней», «Сапира», «Айс»), a hand
 * shield against a charge flying at them, the Master's dome and blink — and a plan for the circle
 * (WizardTactics.js), chosen, weighed and changed like the knights' (KnightTactics.js).
 *
 * Who is hit by their charges: whoever the charge touches first (Duel decides — a player on his
 * own computer, his shield too; creatures on the host). Never the caster himself. A player's charge
 * and a wizard's meet in a real duel (the beams push — Duel.js): the wizard holds his wand on the
 * player, stands and pushes with his strength (skill, mana, health); a weak student may give up.
 *
 * They cast only with a real line of sight from the wand to the foe (a window, a doorway, an
 * arrow slit — never through a wall, a floor or a closed door), and stand only where they can.
 * One stuck (a corner, a wall in the way) takes another place / the tower's paths.
 * How hard they fight: the foe's hidden wanted level (Wanted.js) — stunning at first, heavier
 * spells when angry, «Авада Кедавра» at a mass murderer.
 *
 * The host runs it (like all the castle people); the charges go to everyone as duel casts, the
 * shield / dome / blink as the wizard's `fx` bits, the cast as its mode.
 *
 * Their «Protection» as a player's (Combat.js): the hand shield is held in the free (left) hand —
 * the wand hand goes on casting; 5 mana to raise, then 0.5 a second. The Master's dome
 * («Protection Maxima»): 20, then 1 a second, held while charges come (let go after `dome.t` s
 * of quiet). Every spell either stops costs half of that spell's mana (shieldPays); out of mana
 * it shatters and the spell goes on through.
 */

import * as THREE from 'three';
import { WIZ, NPC_COST, pickSpell, react } from './WizardAI.js';
import { KT, choosePlan, reviewPlan, remember, begin, newMemory } from './KnightTactics.js';
import { WIZ_PLANS, WIZ_LINES, wizardRoles, planSpell, CAST_PACE } from './WizardTactics.js';
import { FX } from '../fx/WizardFx.js';
import { PVP, shieldHitCost } from './Combat.js';
import { wantedTactics } from './Wanted.js';

const WALK = 2.3, RUN = 5.6;
const DUEL_DRAIN = 1; // mana a second a wizard spends pushing in a duel (as a player's fatigue)
const URGENT = new Set(['punish', 'regroup', 'guardMaster', 'kite']);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const _o = new THREE.Vector3(), _d = new THREE.Vector3();

export class WizardFight {
    constructor(wl) {
        this.wl = wl;
        this.life = wl.life;
        this.game = wl.game;
        this.seq = 0;
        this.clock = 0;
        this._t = 0;
    }

    /** Does this one fight (the brave; a timid student runs)? */
    static fights(v) { return !!v.W && (v.role !== 'student' || (v.entry?.brave ?? 0) >= 0.55); }

    // ------------------------------------------------------------ the circle
    /** (host) The wizards after one foe: plans and roles, a few times a second. */
    update(dt) {
        this.clock += dt;
        this._t -= dt;
        if (this._t > 0) return;
        this._t = 0.25;
        const L = this.life, now = this.clock;
        for (const cs of L.castles.values()) {
            if (!cs.awake || !(cs.def.kind === 'tower' || cs.def.kind === 'wander')) continue;
            const groups = new Map();
            for (const v of cs.active.values()) {
                if (!v.W || v.dead || !v.foe || v.servantOf != null) { if (v.wt) v.wt = null; continue; }
                (groups.get(v.foe) || groups.set(v.foe, []).get(v.foe)).push(v);
            }
            const circles = cs.circles || (cs.circles = new Map());
            for (const foe of [...circles.keys()]) if (!groups.has(foe)) circles.delete(foe);
            for (const [foe, men] of groups) {
                let sq = circles.get(foe);
                if (!sq) {
                    const mems = cs.tacMem || (cs.tacMem = new Map());
                    let mem = mems.get(foe);
                    if (!mem) mems.set(foe, (mem = newMemory()));
                    mem.plan = null;
                    sq = { cs, foe, mem, t0: now, ids: new Set(men.map((v) => v.id)), start: men.length, lost: 0, lostAt: [], plan: null, planT0: now, reviewT: now + 0.4, base: 0, sayT: 0, seen: {}, casts: 0, binds: 0, hp0: 0, lost0: 0, wasDown: false, volleyId: 0, volleyAt: 0, upNodes: [] };
                    circles.set(foe, sq);
                }
                this._run(sq, men, now);
            }
        }
    }

    _run(sq, men, now) {
        const L = this.life;
        const ids = new Set(men.map((v) => v.id));
        let changed = false;
        for (const id of sq.ids) if (!ids.has(id)) { changed = true; const v = L.byId.get(id); if (!v || v.dead) { sq.lost++; sq.lostAt.push(now); } }
        for (const id of ids) if (!sq.ids.has(id)) changed = true;
        sq.ids = ids;
        sq.start = Math.max(sq.start, men.length);
        const fp = L._playerPos(sq.foe);
        if (!fp) return;
        const st = L._foeState(sq.foe);
        if (st.lying && !sq.wasDown) sq.binds++;
        sq.wasDown = st.lying;
        if (now >= sq.reviewT) {
            sq.reviewT = now + KT.REVIEW;
            const sit = this._situation(sq, men, fp, st, now);
            if (this._review(sq, men, sit, now)) changed = true;
        }
        if (changed && sq.plan) this._roles(sq, men, fp, now);
        // a volley: the leader counts, all cast on «три»
        if (sq.plan === 'volley' && now > sq.volleyAt + 4.5) {
            sq.volleyId++;
            sq.volleyAt = now + 1.6;
            const lead = L.byId.get(sq.leader);
            if (lead && !lead.dead) L._say(lead, pick(WIZ_LINES.count), 2.5);
        }
    }

    _situation(sq, men, fp, st, now) {
        const L = this.life, g = this.game, cs = sq.cs;
        const able = men.filter((v) => !(v.stunT > 0) && !v.vy && !v.lev);
        const ds = men.map((v) => Math.hypot(fp.x - v.x, fp.z - v.z)).sort((a, b) => a - b);
        const ys = men.map((v) => v.y).sort((a, b) => a - b);
        const dist = ds[Math.floor(ds.length / 2)] ?? 0, baseY = ys[Math.floor(ys.length / 2)] ?? fp.y - 1.95;
        let cx = 0, cz = 0;
        for (const v of men) { cx += v.x; cz += v.z; }
        sq.base = Math.atan2(cz / men.length - fp.z, cx / men.length - fp.x);
        const feet = fp.y - 1.95;
        const gy = g.collision.groundAt ? g.collision.groundAt(fp.x, fp.z, feet + 0.6) : g.collision.groundY(fp.x, fp.z);
        const air = st.air || feet - gy > 2.2;
        const high = !air && feet > baseY + 3.2;
        // he comes at them: close, and closer than at the last look
        const melee = ds[0] < 4.5 || (ds[0] < 8 && sq.sit && ds[0] < sq.sit.near - 1.5);
        const master = cs.active.get(0);
        const masterAlive = !!master && !master.dead && master.role === 'master';
        // the places above him to cast from (the tower's galleries, balconies, upper floors)
        sq.upNodes = [];
        if (!air && !high && cs.graph.nodes.length) {
            const c = g.collision;
            let checks = 0;
            for (const n of cs.graph.nodes) {
                if (n.y < feet + 4 || n.y > feet + 16 || checks > 40) continue;
                const h = Math.hypot(n.x - fp.x, n.z - fp.z);
                if (h > 26 || h < 5) continue;
                checks++;
                if (!c.lineOfSight || c.lineOfSight(n.x, n.y + 3.4, n.z, fp.x, fp.y + 0.4, fp.z, 0.45)) sq.upNodes.push(n.id);
                if (sq.upNodes.length >= 6) break;
            }
        }
        return {
            n: able.length, start: sq.start, lost: sq.lost, lostRecent: sq.lostAt.filter((x) => now - x < 20).length,
            hpK: men.reduce((a, v) => a + v.hp / v.maxHp, 0) / men.length, manaK: men.reduce((a, v) => a + (v.mana || 0) / (v.maxMana || 1), 0) / men.length,
            dist, near: ds[0], air, high, water: false, lying: st.lying, busy: st.busy, noMana: st.noMana, shield: st.shield, melee: !!melee,
            masterAlive, masterThreat: masterAlive && Math.hypot(fp.x - master.x, fp.z - master.z) < 9, upper: sq.upNodes.length > 0,
            t: now - sq.t0, foeHp: st.hp, noFallback: now - sq.mem.fallbackAt < KT.FALLBACK_AGAIN,
        };
    }

    _review(sq, men, sit, now) {
        const L = this.life;
        sq.sit = sit;
        this._observe(sq, men, sit, now);
        const P = sq.plan;
        const first = choosePlan(sit, sq.mem, now, Math.random, WIZ_PLANS);
        let res = null;
        if (P) {
            const p = { t: now - sq.planT0, hurt: Math.max(0, sq.hp0 - sit.foeHp), casts: sq.casts, binds: sq.binds, lost: sq.lost - sq.lost0 };
            res = reviewPlan(P, sit, p, WIZ_PLANS);
            if (!res) {
                if (first.id === P) return false;
                if (p.t < KT.MIN_PLAN && !URGENT.has(first.id)) return false;
                res = { done: true, why: 'better' };
            }
            remember(sq.mem, P, res, now);
        }
        const id = res ? choosePlan(sit, sq.mem, now, Math.random, WIZ_PLANS).id : first.id;
        begin(sq.mem, id, now);
        if (id === 'regroup') sq.mem.fallbackAt = now;
        sq.plan = id; sq.planT0 = now; sq.hp0 = sit.foeHp; sq.casts = 0; sq.binds = 0; sq.lost0 = sq.lost;
        const lead = men.find((v) => v.role === 'master') || men.reduce((a, b) => (b.idx < a.idx ? b : a));
        let line = pick(WIZ_LINES.plan[id]);
        if (res?.fail && WIZ_LINES.fail[res.why] && id !== P) line = pick(WIZ_LINES.fail[res.why]) + ' ' + line;
        if (id !== P || res?.fail) L._say(lead, line, 4);
        sq.sayT = now + 2;
        return true;
    }

    _observe(sq, men, sit, now) {
        const flags = { air: sit.air, high: sit.high, shield: sit.shield, melee: sit.melee, noMana: sit.noMana, busy: sit.busy };
        const was = sq.seen;
        sq.seen = flags;
        if (now < sq.sayT) return;
        const key = Object.keys(flags).find((k) => flags[k] && !was[k]);
        if (!key) return;
        const who = men.filter((v) => v.role !== 'master')[0] || men[0];
        this.life._say(who, pick(WIZ_LINES.seen[key]), 3);
        sq.sayT = now + 1.2;
    }

    _roles(sq, men, fp, now) {
        const master = sq.cs.active.get(0);
        const lead = {};
        const roles = wizardRoles(sq.plan, men.map((v) => ({ id: v.id, idx: v.idx, role: v.role, d: Math.hypot(fp.x - v.x, fp.z - v.z), dm: master && !master.dead ? Math.hypot(master.x - v.x, master.z - v.z) : Infinity })), { leader: lead });
        sq.leader = lead.id;
        for (const v of men) v.wt = { role: roles.get(v.id) || 'caster', plan: sq.plan, sq, since: now, k: 0, of: 1, spot: null };
        // each his own place round him, in order (nobody crossing another's way)
        const byRole = new Map();
        for (const v of men) (byRole.get(v.wt.role) || byRole.set(v.wt.role, []).get(v.wt.role)).push(v);
        for (const list of byRole.values()) {
            list.sort((a, b) => Math.atan2(a.z - fp.z, a.x - fp.x) - Math.atan2(b.z - fp.z, b.x - fp.x));
            list.forEach((v, k) => { v.wt.k = k; v.wt.of = list.length; });
        }
        if (sq.plan === 'regroup') {
            const m = master && !master.dead && sq.ids.has(master.id) ? master : null;
            if (m && m.domeCd <= 0) this._dome(m);
        }
    }

    // ------------------------------------------------------------ one wizard
    /** (host) A wizard with a foe: true (moved, maybe cast). */
    step(v, dt) {
        const L = this.life, cs = v.cs;
        const fp = L._playerPos(v.foe);
        const d = fp ? Math.hypot(fp.x - v.x, fp.z - v.z) : Infinity;
        const gone = !fp || (!L._inLand(cs.def, fp, 30) && (d > 25 || !L._inLand(cs.def, fp, 160)));
        const grudge = v.grudge && v.grudge.id === v.foe && v.grudge.until > Date.now();
        if (gone || !(cs.hostile.get(v.foe) > Date.now() || grudge)) {
            if (fp && gone) v.gaveUp = { id: v.foe, until: Date.now() + 15000 };
            v.foe = null; v.path = null; v.wt = null; v.grudge = null;
            v.fx &= ~(FX.SHIELD | FX.DOME);
            return true;
        }
        v.seated = false;
        v.shieldT = (v.shieldT || 0) - dt; v.domeT = (v.domeT || 0) - dt; v.castT = (v.castT || 0) - dt; v.blinkFx = (v.blinkFx || 0) - dt;
        if (v.shieldT <= 0) v.fx &= ~FX.SHIELD;
        if (v.domeT <= 0) v.fx &= ~FX.DOME; // (quiet a while: he lets it go — his «стоп»)
        // a held shield / dome takes mana every second (as a player's); none left — it falls apart
        const hold = ((v.fx & FX.SHIELD) ? PVP.SHIELD_DRAIN : 0) + ((v.fx & FX.DOME) ? PVP.DOME_DRAIN : 0);
        if (hold) { v.mana -= hold * dt; if (v.mana <= 0) { v.mana = 0; this._shatter(v, FX.SHIELD | FX.DOME); } }
        if (v.blinkFx <= 0) v.fx &= ~FX.BLINK;
        // the wand knocked out of the hand («Экспеллиармус»): no magic — away from him
        if (v.noWand) {
            L._steer(v, v.x + (v.x - fp.x), v.z + (v.z - fp.z), RUN, dt);
            v.mode = v.speed > 0 ? 'flee' : 'idle';
            L._ground(v);
            return true;
        }
        this._react(v, dt);
        // in a duel (our beams pushing): stand, the wand on him, push (Duel.js referees it)
        if (this._inClash(v, dt)) { L._ground(v); return true; }
        const wt = v.wt, sq = wt?.sq;
        const W = v.W;
        // (a held shield: the guards and the screen keep it up — it costs a little mana)
        if (wt && (wt.role === 'shield' || wt.role === 'guard') && v.mana > 2) { if (!(v.fx & FX.SHIELD)) v.mana -= NPC_COST.Protection; v.shieldT = Math.max(v.shieldT, 0.4); v.fx |= FX.SHIELD; }
        // the Master: he comes too close → blink away
        if (v.role === 'master' && W.blink && d < 3.5 && (v.blinkCd ?? 0) <= 0) this._blink(v, fp);
        const spot = this._spot(v, fp, d, sq);
        let moving = false;
        if (v.unstickT > 0 && v.path) {
            // (stuck: round by the tower's paths for a while)
            v.unstickT -= dt;
            if (L._followPath(v, dt, RUN)) { v.unstickT = 0; v.path = null; }
            moving = true;
        } else if (spot) {
            const there = L._goSpot(v, spot.x, spot.z, spot.run ? RUN : WALK * 1.3, dt, 0.7);
            moving = !there && v.speed > 0;
            if (!there) this._stuck(v, spot, dt); else v.stk = null;
        }
        if (!moving) { v.speed = 0; L._face(v, fp, dt); }
        if (wt?.role === 'retreat' && !moving) { v.mana = Math.min(v.maxMana, v.mana + W.regen * 2 * dt); v.hp = Math.min(v.maxHp, v.hp + 0.3 * dt); }
        this._tryCast(v, fp, d, sq);
        v.mode = v.castT > 0 ? 'cast' : (v.fx & FX.SHIELD) ? 'shield' : moving ? (v.speed > WALK * 1.4 ? 'run' : 'walk') : 'idle';
        if (v.mode === 'shield') v.aimPitch = 0;
        L._ground(v);
        return true;
    }

    /** Where this wizard wants to stand now (by its role and the plan). */
    _spot(v, fp, d, sq) {
        const L = this.life, wt = v.wt, W = v.W;
        const [r0, r1] = W.range;
        const plan = sq?.plan || 'duel';
        const mine = Math.atan2(v.z - fp.z, v.x - fp.x);
        const strafe = Math.sin(this.clock * 0.5 + v.idx * 1.7) * 0.22 + (v.spotTurn || 0); // (a moving target is harder to hit; stuck: another side)
        const spread = (k, of) => sq.base + (of > 1 ? (k / of) * Math.PI * 2 : 0);
        const ground = (a, R) => {
            const box = wt || v; // (no role yet: his own)
            const s = box.spot;
            if (s && Math.abs(s.a - a) < 0.08 && Math.abs(s.R - R) < 0.6 && Math.hypot(s.fx - fp.x, s.fz - fp.z) < 1.5) return s;
            const p = this._goodSpot(v, fp, a, R);
            return (box.spot = { x: p.x, z: p.z, a, R, fx: fp.x, fz: fp.z, run: Math.hypot(p.x - v.x, p.z - v.z) > 6 });
        };
        if (!wt) return ground(mine, Math.min(Math.max(d, r0), r1 * 0.85));
        switch (wt.role) {
            case 'retreat': {
                const gr = v.cs.graph;
                if (wt.node == null) {
                    let best = -1, bs = -Infinity;
                    for (const id of gr.tagged('room').concat(gr.tagged('home'), gr.tagged('throneFront'))) {
                        const n = gr.nodes[id];
                        const s = Math.hypot(n.x - fp.x, n.z - fp.z) - 0.7 * Math.hypot(n.x - v.x, n.z - v.z);
                        if (s > bs) { bs = s; best = id; }
                    }
                    wt.node = best;
                }
                const n = gr.nodes[wt.node];
                return n ? { x: n.x, z: n.z, run: true } : ground(mine, r1 * 1.4);
            }
            case 'guard': {
                const m = v.cs.active.get(0);
                if (!m || m.dead) return ground(mine, r0);
                const a = Math.atan2(fp.z - m.z, fp.x - m.x) + (wt.k - (wt.of - 1) / 2) * 0.8;
                return { x: m.x + Math.cos(a) * 2.6, z: m.z + Math.sin(a) * 2.6, run: true };
            }
            case 'shield': return ground(sq.base + (wt.k - (wt.of - 1) / 2) * 0.45, Math.max(4, r0 * 0.6));
            case 'snipe': {
                const id = sq.upNodes[wt.k % Math.max(1, sq.upNodes.length)];
                const n = id != null ? v.cs.graph.nodes[id] : null;
                if (n) return { x: n.x, z: n.z, run: true };
                return ground(mine + strafe, Math.min(Math.max(d, r0), r1 * 0.85));
            }
            case 'binder': return ground(mine + strafe, r0);
            default: break;
        }
        switch (plan) {
            case 'crossfire': case 'volley': return ground(spread(wt.k, wt.of) + strafe * 0.5, Math.min(Math.max(d, r0 + 1), r1 * 0.8));
            case 'screen': return ground(sq.base + (wt.k - (wt.of - 1) / 2) * 0.5, Math.max(4, r0 * 0.6) + 4.5);
            case 'kite': return ground(mine, r1 * 0.9);
            case 'punish': return ground(mine, r0);
            case 'ground': return ground(spread(wt.k, wt.of), r0 + 2);
            default: return ground(mine + strafe, Math.min(Math.max(d, r0), r1 * 0.85));
        }
    }

    _tryCast(v, fp, d, sq) {
        const L = this.life, W = v.W, wt = v.wt;
        v.castCd = (v.castCd ?? 0);
        if (v.castCd > 0 || v.castT > 0.15) return;
        if (wt && (wt.role === 'shield' || wt.role === 'guard' || wt.role === 'retreat')) return;
        if (d > W.range[1] * 1.2 || d < 1.2 || !this.clearShot(v, fp)) return;
        const plan = sq?.plan || 'duel';
        if (plan === 'volley') {
            if (this.clock < sq.volleyAt || v.volleyed === sq.volleyId) return;
            v.volleyed = sq.volleyId;
        }
        // how hard: the foe's hidden wanted level (Wanted.js)
        const foe = sq?.foe ?? v.foe;
        const T = wantedTactics(L.wantedLevel(foe), v.role);
        // mercy: one helpless on the ground is not finished off (but kept down by a binder) — unless he is a known murderer
        const st = sq?.sit;
        if (T.mercy && st?.lying && !(wt?.role === 'binder') && !(Date.now() - (v.hurtAt || 0) < 5000)) return;
        const spell = this._spellFor(v, planSpell(plan, wt?.role, v.role) || pickSpell(v.role), T);
        const cost = NPC_COST[spell] ?? 10;
        if (v.mana < cost) return;
        if (this._cast(v, spell, foe, fp)) {
            v.mana -= cost;
            v.castCd = W.cast * (CAST_PACE[plan] ?? 1) * T.pace * (0.8 + Math.random() * 0.4);
            if (sq) sq.casts++;
        }
    }

    /** The spell a wizard really casts at this foe (by his wanted level: Wanted.wantedTactics). */
    _spellFor(v, spell, T) {
        if (spell === 'LevitateDuel' || spell === 'AvadaKedavra') spell = 'Stupefy'; // (they don't lift a man to hold him)
        if (T.soft && spell === 'SapiraDuel') spell = v.role !== 'student' && Math.random() < 0.4 ? 'IceDuel' : 'Stupefy'; // (calm: only stun, freeze)
        if (T.heavy && (spell === 'Stupefy' || spell === 'Jolt') && Math.random() < T.heavy) spell = 'SapiraDuel';
        if (T.avada && Math.random() < T.avada) spell = 'AvadaKedavra'; // (a mass murderer: they mean to kill)
        if (v.role === 'student' && (spell === 'IceDuel' || spell === 'AvadaKedavra')) spell = 'Stupefy';
        return spell;
    }

    /**
     * A clear shot from this wizard's wand at the foe: the line from the wand's height to the foe's
     * body free of any block, door or wall (sampled finely: a wall one block thick is never missed).
     */
    clearShot(v, fp) {
        const c = this.game.collision;
        if (!c?.lineOfSight) return true;
        return c.lineOfSight(v.x, v.y + 3.4, v.z, fp.x, fp.y + 0.3, fp.z, 0.35);
    }

    /**
     * A place to stand at bearing `a`, about `R` from the foe: one he can stand on (no wall, no
     * water) AND see the foe from — the nearest such bearing round the wanted one.
     */
    _goodSpot(v, fp, a, R) {
        const L = this.life, c = this.game.collision;
        let first = null;
        for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6]) {
            const p = L._groundSpot(v, fp, a + da, R);
            if (!first) first = p;
            if (Math.abs(p.y - v.y) > 6 || !L._walkable(p.x, p.z, p.y)) continue;
            if (c?.lineOfSight && !c.lineOfSight(p.x, p.y + 3.4, p.z, fp.x, fp.y + 0.3, fp.z, 0.45)) continue;
            return p;
        }
        return first;
    }

    /** (host) Not getting anywhere towards his place: another place, or round by the paths. */
    _stuck(v, spot, dt) {
        const s = v.stk || (v.stk = { x: v.x, z: v.z, t: 0 });
        s.t += dt;
        if (s.t < 1.4) return;
        const moved = Math.hypot(v.x - s.x, v.z - s.z);
        s.x = v.x; s.z = v.z; s.t = 0;
        if (moved > 0.5) { v.stkN = 0; return; }
        v.stkN = (v.stkN || 0) + 1;
        v.spotTurn = ((v.spotTurn || 0) + (v.stkN % 2 ? 0.9 : -1.8)) % (Math.PI * 2);
        if (v.wt) v.wt.spot = null;
        v.spot = null;
        const gr = v.cs.graph;
        if (gr.nodes.length) {
            const n = gr.nearest(spot.x, v.y, spot.z, 6);
            if (n >= 0 && this.life._goTo(v, n) && v.path?.length > 1) v.unstickT = 4;
            else v.path = null;
        }
        if (v.stkN >= 3) this.life._unwall(v); // (in a wall, not only at it?)
    }

    /** In a duel now: he stands, holds the wand on the opponent, pushes; mana goes. */
    _inClash(v, dt) {
        const duel = this.game.duel;
        const c = duel?.clashes?.find((x) => x.a.by === v.id || x.b.by === v.id);
        if (!c) return false;
        const op = c.a.by === v.id ? c.b.by : c.a.by;
        const fp = this.life._playerPos(op);
        v.speed = 0; v.path = null;
        if (fp) {
            this.life._face(v, fp, dt);
            const dy = fp.y + 0.3 - (v.y + 3.4), dh = Math.hypot(fp.x - v.x, fp.z - v.z) || 1;
            v.aimPitch = Math.atan2(dy, dh);
        }
        v.mana = Math.max(0, v.mana - DUEL_DRAIN * dt);
        v.castT = Math.max(v.castT || 0, 0.3);
        v.mode = 'cast';
        return true;
    }

    /**
     * (Duel, host) Does this wizard still hold the duel? `share` 0…1 how well it goes for him.
     * A student out of mana and losing gives up (jerk: the other's spell hits him).
     */
    clashHold(v, share) {
        if (!v || v.dead || v.noWand || v.lev || v.stunT > 0 || v.vy) return { ok: false, jerk: true };
        if (v.role === 'student' && share < 0.2 && v.mana < 5) return { ok: false, jerk: true };
        return { ok: true, jerk: false };
    }

    /** A duel charge from the wand at a player (the charge itself: Duel.js, seen by everybody). */
    _cast(v, spell, foeId, fp, vs = null) {
        const g = this.game, duel = g.duel;
        if (!duel?._addBolt) return false;
        if (v.group.visible) v.model.getWandTip(_o);
        else _o.set(v.x - Math.sin(v.yaw), v.y + 3.4, v.z - Math.cos(v.yaw));
        // (the wand's tip through a wall he stands against: no — the charge would start on the other side)
        const c = g.collision;
        if (c?.lineOfSight && (!c.lineOfSight(v.x, v.y + 3.0, v.z, _o.x, _o.y, _o.z, 0.15) || c.pointBlocked?.(_o.x, _o.y, _o.z))) return false;
        const body = duel._bodyOf?.('p', foeId, duel._tmpBody());
        if (body) _d.copy(body.a).lerp(body.b, 0.55); else _d.set(fp.x, fp.y, fp.z);
        _d.sub(_o).normalize();
        const err = 0.06 / (v.W.skill || 1) * (v.dazeT > 0 ? 6 : 1); // (not a perfect hand; dizzy after a «Джолт»: far off)
        _d.x += (Math.random() - 0.5) * 2 * err; _d.y += (Math.random() - 0.5) * err; _d.z += (Math.random() - 0.5) * 2 * err;
        _d.normalize();
        const b = duel._addBolt({ id: `${v.id}:${++this.seq}`, by: v.id, spell, side: 'right', tk: 'p', tid: foeId, ak: 0.55, o: _o.clone(), d: _d.clone(), npc: true, vs });
        if (spell === 'AvadaKedavra') this.life._say(v, 'Авада Кедавра!', 2); // (the killing words are heard)
        g.sync?.duelCast?.(b);
        v.yaw = Math.atan2(-_d.x, -_d.z);
        v.aimPitch = Math.asin(Math.max(-1, Math.min(1, _d.y)));
        v.castT = 0.55;
        v.model.castNow = true;
        duel._burst?.(_o, duel.colors(spell, v.id).glow, 12);
        const me = g.character.group.position;
        if (Math.hypot(me.x - v.x, me.z - v.z) < 40) { if (spell === 'IceDuel') g.sound?.playIce?.(); else if (spell === 'Jolt' || spell === 'JoltMaxima') g.sound?.playJolt?.(spell === 'JoltMaxima', false); else g.sound?.playSapira?.(); }
        return true;
    }

    /** A charge flies at this wizard: a shield, the dome, or a step aside (WizardAI.react). */
    _react(v, dt) {
        const duel = this.game.duel;
        v.reactT = (v.reactT || 0) - dt;
        if (!duel?.bolts || v.reactT > 0) return;
        v.reactT = 0.1;
        for (const b of duel.bolts.values()) {
            if (b.state !== 'flying' || b.npc || b.by === v.id) continue;
            const dx = v.x - b.front.x, dz = v.z - b.front.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 22) continue;
            const at = (b.tk === 'v' && b.tid === v.id) || (b.dir.x * dx + b.dir.z * dz > dist * 0.94); // (aimed at me, or coming straight at me)
            if (!at) continue;
            const seen = b.seenBy || (b.seenBy = new Set());
            if (seen.has(v.id)) continue;
            seen.add(v.id);
            const eta = dist / 15;
            if (eta < (v.W.reactT ?? 0.5)) continue; // (too late to do anything)
            const r = react({ role: v.role, mana: v.mana, shieldReady: true, domeReady: v.role === 'master' && (v.domeCd ?? 0) <= 0, spell: b.spell, eta });
            if (r && !v.foe && this.life._isPlayer(b.by) && WizardFight.fights(v)) { v.foe = b.by; v.grudge = { id: b.by, until: Date.now() + 40000 }; v.seated = false; } // (he cast at me: now it is a fight)
            if (r === 'dome') this._dome(v);
            else if (r === 'counter' && this._counter(v, b)) { /* (a spell back: the beams meet — a duel) */ }
            else if (r === 'shield' || r === 'counter') {
                if (!(v.fx & FX.SHIELD)) v.mana -= NPC_COST.Protection; // (raised in the free hand: the wand goes on casting)
                v.shieldT = Math.max(v.shieldT, 1.4); v.fx |= FX.SHIELD;
                v.yaw = Math.atan2(-(b.o.x - v.x), -(b.o.z - v.z));
                if (Math.random() < 0.25) this.life._say(v, pick(WIZ_LINES.shield), 1.5);
            }
        }
    }

    /** A spell straight back at the one who cast at him: the two charges meet (Duel.js: a clash). */
    _counter(v, b) {
        const L = this.life;
        if (v.noWand || !L._isPlayer(b.by) || (v.castCd ?? 0) > 0.6) return false;
        const fp = L._playerPos(b.by);
        if (!fp || !this.clearShot(v, fp)) return false;
        const spell = this._spellFor(v, pickSpell(v.role), wantedTactics(L.wantedLevel(b.by), v.role));
        const cost = NPC_COST[spell] ?? 10;
        if (v.mana < cost) return false;
        if (!this._cast(v, spell, b.by, fp, b.id)) return false;
        v.mana -= cost;
        v.castCd = Math.max(v.castCd ?? 0, v.W.cast * 0.6);
        return true;
    }

    _dome(v) {
        const D = v.W.dome;
        if (!D || (v.fx & FX.DOME) || v.mana < NPC_COST.ProtectionMaxima) return;
        v.mana -= NPC_COST.ProtectionMaxima;
        v.domeT = D.t; v.domeCd = D.cd;
        v.fx |= FX.DOME;
    }

    /**
     * (host) A spell reached this wizard's shield (`dome`: the Master's dome, else the hand shield):
     * it costs half of that spell's mana. true: held; false: no mana for it — it shatters, the spell goes on.
     */
    shieldPays(v, spell, dome = false) {
        const cost = shieldHitCost(spell);
        if (dome) v.domeT = Math.max(v.domeT || 0, v.W?.dome?.t || 6); // (still under fire: he keeps it up)
        if (v.mana >= cost) { v.mana -= cost; return true; }
        v.mana = 0;
        this._shatter(v, dome ? FX.DOME : FX.SHIELD);
        return false;
    }

    /** The wizard's shield / dome breaks: its light flies apart in pieces. */
    _shatter(v, bits) {
        if (!(v.fx & bits)) return;
        const dome = !!(v.fx & bits & FX.DOME);
        v.fx &= ~bits;
        if (bits & FX.SHIELD) v.shieldT = 0;
        if (bits & FX.DOME) v.domeT = 0;
        const fx = this.game.fx;
        if (!fx) return;
        for (let i = 0; i < (dome ? 40 : 20); i++) {
            const a = Math.random() * Math.PI * 2, r = dome ? 3.2 : 0.9;
            _o.set(v.x + (dome ? Math.cos(a) * r : -Math.sin(v.yaw) * 1.3 + (Math.random() - 0.5) * r), v.y + (dome ? Math.random() * 3 : 2.6 + (Math.random() - 0.5) * r), v.z + (dome ? Math.sin(a) * r : -Math.cos(v.yaw) * 1.3));
            fx.spark(_o, i % 2 ? 0x9fd8ff : 0xffffff, 0.14, _d.set((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6), 0.7);
        }
        fx.lightFlash?.(_o, 0x6fc3ff, 3, 0.3, 18);
        if (Math.random() < 0.5) this.life._say(v, dome ? 'Мой купол!' : 'Щит!', 1.5);
    }

    /** The Master is gone in a puff of smoke — and stands a dozen metres off. */
    _blink(v, fp) {
        const L = this.life;
        const a0 = Math.atan2(v.z - fp.z, v.x - fp.x);
        for (const da of [0, 0.7, -0.7, 1.4, -1.4]) {
            const p = L._groundSpot(v, fp, a0 + da, 12);
            if (Math.abs(p.y - v.y) > 3 || !L._walkable(p.x, p.z, p.y)) continue;
            this.wl.fx.smoke(v);
            v.x = p.x; v.z = p.z; v.y = p.y; v.path = null;
            this.wl.fx.smoke(v);
            v.fx |= FX.BLINK; v.blinkFx = 0.5;
            v.blinkCd = v.W.blink.cd;
            L._say(v, pick(WIZ_LINES.blink), 2);
            return;
        }
        v.blinkCd = 3;
    }
}

export { WIZ };
