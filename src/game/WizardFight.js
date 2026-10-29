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
 * They cast only facing the foe fully (FaceTarget.js — the author's rule «лицом к цели»): from the
 * side or with his back a wizard first turns (at a body's speed, never an instant about-face), then
 * casts; ready to cast, he stops to turn and aim. The charge flies where his wand points.
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
import { WIZ, NPC_COST, pickSpell, react, noticeCharge, manaPace, wantsMaxima, castHold, holdsCast, duelBand, duelDist, prepTime, CAST_PREP } from './WizardAI.js';
import { KT, choosePlan, reviewPlan, remember, begin, newMemory } from './KnightTactics.js';
import { WIZ_PLANS, WIZ_LINES, wizardRoles, planSpell, CAST_PACE } from './WizardTactics.js';
import { FX } from '../fx/WizardFx.js';
import { DUEL, DUEL_SPELLS } from './Duel.js';
import { PVP, shieldHitCost } from './Combat.js';
import { wantedTactics } from './Wanted.js';
import { lessonSpell } from './BumpRules.js';
import { FACE, facesTarget, turnToward, yawTo } from './FaceTarget.js';
import { reactLagText, huntRole, huntLeash, chooseShield, canDome, SHIELD } from './WizardMind.js';

const WALK = 2.3, RUN = 5.6;
const DUEL_DRAIN = 1; // mana a second a wizard spends pushing in a duel (as a player's fatigue)
const URGENT = new Set(['punish', 'regroup', 'guardMaster', 'kite']);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _ch = new THREE.Vector3();

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
    static fights(v) { return !!v.W && !v.entry?.stranger && (v.role !== 'student' || (v.entry?.brave ?? 0) >= 0.55); }

    // ------------------------------------------------------------ the circle
    /** (host) The wizards after one foe: plans and roles, a few times a second. */
    update(dt) {
        this.clock += dt;
        this._t -= dt;
        if (this._t > 0) return;
        this._t = 0.25;
        const L = this.life, now = this.clock;
        for (const cs of L.castles.values()) {
            if (!(cs.awake || cs.def.kind === 'wander') || !(cs.def.kind === 'tower' || cs.def.kind === 'wander' || cs.def.kind === 'wizvillage' || (cs.def.kind === 'hamlet' && cs.def.mage))) continue; // (the wandering wizards' site is never «awake»: Travelers leads them)
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
    /** (host) A new fight for `v`: the reaction time (the log), and the role in the pursuit. */
    _engage(v, fp) {
        const L = this.life, lag = v.reactLag || { t: 0.5, level: 2, lost: false };
        const ready = (v.cs?.alertUntil || 0) > Date.now() || (v.readyUntil || 0) > Date.now() || !!(v.fx & FX.SHIELD);
        const level = this.life.wantedLevel(v.foe) || 0;
        const role = huntRole({ role: v.role, rank: v.rank, level, saw: true, tied: v.role === 'master', timid: false, hasWand: !v.noWand }, () => ((v.id.length * 31 + (v.idx | 0) * 17) % 100) / 100);
        v.engage = { foe: v.foe, t: ready ? lag.t * 0.4 : lag.t, role, level, until: Date.now() + 20000 };
        L.alog?.decision(v, `${reactLagText(lag)}${ready ? ' (уже настороже — вдвое быстрее)' : ''}; в погоне: ${role === 'hunt' ? 'идёт искать, если убежит' : 'держит место'}; розыск героя: ${level}`);
    }

    step(v, dt) {
        const L = this.life, cs = v.cs;
        const fp = L._playerPos(v.foe);
        const d = fp ? Math.hypot(fp.x - v.x, fp.z - v.z) : Infinity;
        const now = Date.now();
        // (a new fight: his own reaction time first; and does he hunt or keep the place — WizardMind)
        if (!v.engage || v.engage.foe !== v.foe || v.engage.until < now) this._engage(v, fp);
        v.engage.until = now + 20000;
        // where the foe was last seen, and which way he was going (for a hunt, if he gets away)
        if (fp) {
            const k = v.seen;
            v.seen = { x: fp.x, z: fp.z, dx: k ? fp.x - k.x : 0, dz: k ? fp.z - k.z : 0, t: now };
            if (k && now - k.t < 1500) { v.seen.dx = (fp.x - k.x) * 0.5 + (k.dx || 0) * 0.5; v.seen.dz = (fp.z - k.z) * 0.5 + (k.dz || 0) * 0.5; }
        }
        const hunter = v.engage.role === 'hunt';
        // (a hunter does not stop at the edge of his land: the more they want the criminal, the farther he follows)
        const leash = hunter ? huntLeash({ role: v.role, level: v.engage.level, saw: true }) : 25;
        const gone = !fp || (!L._inLand(cs.def, fp, 30) && (d > leash || !L._inLand(cs.def, fp, Math.max(160, leash))));
        const grudge = v.grudge && v.grudge.id === v.foe && v.grudge.until > now;
        const wanted = cs.hostile.get(v.foe) > now || grudge;
        if (gone || !wanted) {
            if (fp && gone) v.gaveUp = { id: v.foe, until: now + 15000 };
            const lost = v.foe;
            v.foe = null; v.path = null; v.wt = null; v.grudge = null;
            v.fx &= ~(FX.SHIELD | FX.DOME);
            // got away (out of sight, out of reach), and he is still wanted: a hunt — to the last known place, then the likely ways
            if (hunter && wanted && v.seen && now - v.seen.t < 60000) {
                L.wizards.startHunt(v, { x: v.seen.x, z: v.seen.z, dx: v.seen.dx, dz: v.seen.dz, saw: true }, v.engage.level, 'убежал из виду');
                v.huntBy = lost;
            }
            return true;
        }
        v.seated = false;
        // the first seconds: he has not got his wand out yet (a beginner is lost, the Master is at once)
        if (v.engage.t > 0) {
            v.engage.t -= dt;
            this._react(v, dt);
            v.speed = 0; v.path = null; v.mode = 'idle';
            if (fp) this._turnTo(v, fp, dt);
            L._ground(v);
            return true;
        }
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
        if (this._prepTick(v, dt)) { L._ground(v); return true; } // (saying a spell: he stands, the wand up — then it flies)
        // in a duel (our beams pushing): stand, the wand on him, push (Duel.js referees it)
        if (this._inClash(v, dt)) { L._ground(v); return true; }
        const wt = v.wt, sq = wt?.sq;
        const W = v.W;
        // (a held shield: the guards and the screen keep it up — it costs a little mana)
        if (wt && (wt.role === 'shield' || wt.role === 'guard') && v.mana > 2) { if (!(v.fx & FX.SHIELD)) v.mana -= NPC_COST.Protection; v.shieldT = Math.max(v.shieldT, 0.4); v.fx |= FX.SHIELD; }
        // the Master: he comes too close → blink away
        if (v.role === 'master' && W.blink && d < 3.5 && (v.blinkCd ?? 0) <= 0) this._blink(v, fp);
        let spot = this._spot(v, fp, d, sq);
        // ready to cast and a clear shot: he stops to turn to the foe and aim (no casting on the walk, sideways)
        const shot = this._castReady(v, d) && this.clearShot(v, fp);
        // (ready, but one of his own in the line: a step to the side for a clear one)
        if (!shot && this._castReady(v, d) && this._friendInLine(v, fp)) {
            v.lineT = (v.lineT || 0) + dt;
            if (v.lineT > 1) {
                v.lineT = 0; v.spotTurn = ((v.spotTurn || 0) + (v.idx % 2 ? 0.45 : -0.45)) % (Math.PI * 2);
                const box = v.wt || v;
                if (box.spot?.node != null) v.badFire = { id: box.spot.node, until: this.clock + 6 }; // (that window is no good now: another)
                box.fire = null; box.spot = null; v.spot = null;
            }
        } else v.lineT = 0;
        if (shot && spot && !spot.run && !(v.unstickT > 0)) spot = null;
        // just cast: he stands in his pose a moment (and while his charge flies), only then moves on
        if (this.holding(v, dt, d)) { spot = null; v.unstickT = 0; }
        let moving = false;
        if (v.unstickT > 0 && v.path) {
            // (stuck: round by the tower's paths for a while)
            v.unstickT -= dt;
            if (L._followPath(v, dt, RUN)) { v.unstickT = 0; v.path = null; }
            moving = true;
        } else if (spot) {
            const there = L._goSpot(v, spot.x, spot.z, spot.run ? RUN : WALK * 1.3, dt, 0.7, spot.y);
            moving = !there && v.speed > 0;
            if (!there) this._stuck(v, spot, dt); else v.stk = null;
        }
        if (!moving) { v.speed = 0; this._turnTo(v, fp, dt); }
        if (wt?.role === 'retreat' && !moving) { v.mana = Math.min(v.maxMana, v.mana + W.regen * 2 * dt); v.hp = Math.min(v.maxHp, v.hp + 0.3 * dt); }
        if (shot) this._tryCast(v, fp, d, sq);
        v.mode = v.castT > 0 ? 'cast' : (v.fx & FX.SHIELD) ? 'shield' : moving ? (v.speed > WALK * 1.4 ? 'run' : 'walk') : 'idle';
        if (v.mode === 'shield') v.aimPitch = 0;
        L._ground(v);
        return true;
    }

    /** (after `_cast`) He stands where he cast: the pose held a while (WizardAI.castHold). */
    _startHold(v) {
        v.holdT = castHold();
        v.heldT = 0;
    }

    /**
     * (host) Still standing in his cast's pose? (WizardAI.holdsCast: the pose's time, his charge still
     * flying — its beam comes from his wand; a danger right at him or a flight from it — no.)
     */
    holding(v, dt, foeDist = Infinity) {
        if (v.holdT == null) return false;
        v.holdT -= dt; v.heldT = (v.heldT || 0) + dt;
        let flying = false;
        const bolts = this.game.duel?.bolts;
        if (bolts) for (const b of bolts.values()) if (b.by === v.id && b.state === 'flying') { flying = true; break; }
        if (holdsCast({ left: v.holdT, held: v.heldT, flying, fleeing: v.fleeT > 0, foeDist })) return true;
        v.holdT = null;
        return false;
    }

    /** (host) No foe (he answered a creature, a tree…): he stands in his cast's pose, facing where he cast. */
    holdStill(v, dt) {
        if (v.holdT == null || v.foe) return false;
        if (!this.holding(v, dt)) return false;
        v.speed = 0; v.path = null;
        if (v.holdAt) this._turnTo(v, v.holdAt, dt);
        v.mode = v.castT > 0 ? 'cast' : 'idle';
        this.life._ground(v);
        return true;
    }

    /** Where this wizard wants to stand now (by its role and the plan). */
    _spot(v, fp, d, sq) {
        const L = this.life, wt = v.wt, W = v.W;
        const [r0, r1] = W.range;
        const plan = sq?.plan || 'duel';
        // a duel's distance: not far, not close — further from a foe behind his shield (WizardAI.duelBand)
        const shield = this._foeShield(v.foe);
        const [lo, hi] = duelBand(W.range, shield);
        const keep = duelDist(d, W.range, shield);
        const mine = Math.atan2(v.z - fp.z, v.x - fp.x);
        const strafe = Math.sin(this.clock * 0.5 + v.idx * 1.7) * 0.22 + (v.spotTurn || 0); // (a moving target is harder to hit; stuck: another side)
        const spread = (k, of) => sq.base + (of > 1 ? (k / of) * Math.PI * 2 : 0);
        const ground = (a, R) => {
            const box = wt || v; // (no role yet: his own)
            const s = box.spot;
            if (s && Math.abs(s.a - a) < 0.08 && Math.abs(s.R - R) < 0.6 && Math.hypot(s.fx - fp.x, s.fz - fp.z) < 1.5) return s;
            const p = this._goodSpot(v, fp, a, R);
            // inside the tower / on another floor than that place: a window, a gallery, the hole the blast
            // made — a place of the tower he can get to with a clear shot at the foe; none — down the stairs
            // and out to that place on the ground
            if (Math.abs(p.y - v.y) > 2.5 || L._roofed(v)) {
                const n = this._fireNode(v, fp, R, hi);
                if (n) return (box.spot = { x: n.x, y: n.y, z: n.z, a, R, fx: fp.x, fz: fp.z, run: Math.hypot(n.x - v.x, n.z - v.z) > 6 || Math.abs(n.y - v.y) > 2.5, node: n.id });
            }
            return (box.spot = { x: p.x, y: p.y, z: p.z, a, R, fx: fp.x, fz: fp.z, run: Math.hypot(p.x - v.x, p.z - v.z) > 6 || Math.abs(p.y - v.y) > 2.5 });
        };
        if (!wt) return ground(mine, keep);
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
                return n ? { x: n.x, y: n.y, z: n.z, run: true } : ground(mine, r1 * 1.4);
            }
            case 'guard': {
                const m = v.cs.active.get(0);
                if (!m || m.dead) return ground(mine, r0);
                const a = Math.atan2(fp.z - m.z, fp.x - m.x) + (wt.k - (wt.of - 1) / 2) * 0.8;
                return { x: m.x + Math.cos(a) * 2.6, z: m.z + Math.sin(a) * 2.6, run: true };
            }
            case 'shield': return ground(sq.base + (wt.k - (wt.of - 1) / 2) * 0.45, Math.max(4, lo * 0.7));
            case 'snipe': {
                const id = sq.upNodes[wt.k % Math.max(1, sq.upNodes.length)];
                const n = id != null ? v.cs.graph.nodes[id] : null;
                if (n) return { x: n.x, y: n.y, z: n.z, run: true };
                return ground(mine + strafe, keep);
            }
            case 'binder': return ground(mine + strafe, lo);
            default: break;
        }
        switch (plan) {
            case 'crossfire': case 'volley': return ground(spread(wt.k, wt.of) + strafe * 0.5, keep);
            case 'screen': return ground(sq.base + (wt.k - (wt.of - 1) / 2) * 0.5, Math.max(lo, Math.max(4, lo * 0.7) + 4.5));
            case 'kite': return ground(mine, hi);
            case 'punish': return ground(mine, lo);
            case 'ground': return ground(spread(wt.k, wt.of), lo);
            default: return ground(mine + strafe, keep);
        }
    }

    /**
     * A place of the building (a path node he can get to — not through a way the blast broke) with a
     * clear shot at the foe, about `keep` from him: the nearest such, others' places counting a little
     * against (two don't crowd one window). Looked for again every 1.5 s. → node or null.
     */
    _fireNode(v, fp, keep, hi) {
        const cs = v.cs, gr = cs.graph, c = this.game.collision;
        if (!gr.nodes.length) return null;
        const box = v.wt || v;
        const f = box.fire;
        if (f && this.clock - f.t < 1.5 && Math.hypot(f.fx - fp.x, f.fz - fp.z) < 3) return f.n;
        const from = v.node != null && v.node >= 0 && Math.hypot(gr.nodes[v.node].x - v.x, gr.nodes[v.node].z - v.z) < 3 ? v.node : gr.nearest(v.x, v.y, v.z);
        const can = gr.reach(from, cs.cut);
        // (the places the others chose — and just round them: two don't stand in one window, one behind another)
        const taken = [];
        for (const o of cs.active.values()) if (o !== v && !o.dead && o.foe === v.foe) { const s = (o.wt || o).spot; if (s?.node != null) taken.push(s); }
        const bad = v.badFire && v.badFire.until > this.clock ? v.badFire.id : -1;
        const list = [];
        for (const id of can) {
            if (id === bad) continue;
            const n = gr.nodes[id];
            const dF = Math.hypot(n.x - fp.x, n.z - fp.z);
            if (dF > hi * 1.15 || dF < 3) continue;
            const run = Math.hypot(n.x - v.x, n.z - v.z) + Math.abs(n.y - v.y) * 1.5;
            const near = taken.some((s) => Math.abs(s.y - n.y) < 2.5 && Math.hypot(s.x - n.x, s.z - n.z) < 2.5);
            list.push({ n, s: run + Math.abs(dF - keep) * 0.8 + (near ? 30 : 0) });
        }
        list.sort((a, b) => a.s - b.s);
        let pick = null;
        const L = this.life;
        for (let i = 0; i < Math.min(24, list.length); i++) {
            const n = list[i].n;
            // (never a doorway: one standing there shuts the way out for all the others — room round it)
            let room = 0;
            for (let k = 0; k < 8; k++) if (L._walkable(n.x + Math.cos(k * Math.PI / 4) * 1.6, n.z + Math.sin(k * Math.PI / 4) * 1.6, n.y)) room++;
            if (room < 6) continue;
            if (!c?.lineOfSight || c.lineOfSight(n.x, n.y + 3.4, n.z, fp.x, fp.y + 0.3, fp.z, 0.45)) { pick = n; break; }
        }
        box.fire = { t: this.clock, fx: fp.x, fz: fp.z, n: pick };
        return pick;
    }

    /** Does this foe hold a «Protection» now (his hand shield or dome)? */
    _foeShield(id) {
        const g = this.game;
        if (id === g.localId) return !!g.combat?.shield;
        return (g.remotes?.get(id)?.combat?.shield || 0) > 0;
    }

    /** Could he cast at the foe now (the pause over, his role casts, in range)? (The line of sight: clearShot.) */
    _castReady(v, d) {
        const W = v.W, wt = v.wt;
        v.castCd = (v.castCd ?? 0);
        if (v.castCd > 0 || v.castT > 0.15) return false;
        if (wt && (wt.role === 'shield' || wt.role === 'guard' || wt.role === 'retreat')) return false;
        if (v.mana < NPC_COST.Jolt) return false; // (no mana for any spell: he does not stand waiting to aim)
        return !(d > W.range[1] * 1.2 || d < 1.2);
    }

    /** He turns to a point at a body's speed (FaceTarget: never an instant about-face). */
    _turnTo(v, p, dt) {
        v.yaw = turnToward(v.yaw, yawTo(v.x, v.z, p.x, p.z), FACE.WIZARD_TURN * dt);
    }

    /** (`_castReady` and `clearShot` already true) The spell at the foe — only once he faces him fully (`_cast`). */
    _tryCast(v, fp, d, sq) {
        const L = this.life, W = v.W, wt = v.wt;
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
        if (v.prep) return;
        if (v.lesson && this.life._pupilDown(v.foe)) return; // (a lesson never finishes off the one on the ground)
        const spell = this._spellFor(v, planSpell(plan, wt?.role, v.skillRole || v.role) || pickSpell(v.skillRole || v.role), T);
        const cost = NPC_COST[spell] ?? 10;
        if (v.mana < cost) return;
        // he says it first (a second: _prepTick casts it), then the pause before the next (low on mana: slower)
        this._begin(v, spell, foe, fp, { cost, sq, cd: W.cast * (CAST_PACE[plan] ?? 1) * T.pace * manaPace(v.mana - cost, v.maxMana) * (0.8 + Math.random() * 0.4) });
    }

    /**
     * He starts saying a spell (WizardAI.CAST_PREP): only facing the target fully («лицом к цели»); the
     * charge flies when it is said (_prepTick). `o`: {cost, cd (the pause after it), sq, vs (the charge
     * it answers), at (a creature {k, id} instead of a player)}. true: begun.
     */
    _begin(v, spell, foeId, fp, o = {}) {
        if (v.prep || v.noWand) return false;
        if (!facesTarget(v.yaw, v.x, v.z, fp.x, fp.z, FACE.SPELL)) return false;
        const t = prepTime();
        if (v.lesson) v.lesson.casts++;
        v.prep = { spell, foe: foeId, at: o.at || null, vs: o.vs || null, cost: o.cost ?? (NPC_COST[spell] ?? 10), cd: o.cd ?? v.W.cast, sq: o.sq || null, t, age: 0 };
        v.castCd = Math.max(v.castCd ?? 0, t + 0.1); // (nothing else begun meanwhile)
        return true;
    }

    /**
     * (host, every frame) Saying a spell: he stands, turns to the target, the wand up and glowing (FX.CAST,
     * the cast pose) — when it is said, the charge flies (`_cast`), its mana paid, the pause begun.
     * Stunned, frozen, lifted, the wand gone, in a clash, the target gone — it is lost. true: busy with it.
     */
    _prepTick(v, dt) {
        const P = v.prep;
        if (!P) return false;
        const lost = () => { v.prep = null; return false; };
        if (v.dead || v.noWand || v.stunT > 0 || v.lev || v.vy) return lost();
        if (this.game.duel?.clashes?.some((x) => x.a.by === v.id || x.b.by === v.id)) return lost();
        P.t -= dt; P.age += dt;
        let fp = null, target = null;
        if (P.at) {
            const c = target = this.game.duel?._creature?.(P.at.k, P.at.id);
            if (c) { const at = this.game.duel._creaturePoint(c, _ch); fp = { x: at.x, y: at.y - 0.3, z: at.z }; }
        } else fp = this.life._playerPos(P.foe);
        if (!fp || P.age > CAST_PREP.GIVE_UP) return lost();
        v.speed = 0; v.path = null;
        this._turnTo(v, fp, dt);
        const dh = Math.hypot(fp.x - v.x, fp.z - v.z) || 1;
        v.aimPitch = Math.atan2(fp.y + 0.3 - (v.y + 3.4), dh);
        v.mode = 'cast';
        if (P.t > 0) return true;
        if (v.mana < P.cost) return lost();
        if (!this.clearShot(v, fp, target)) return true; // (a moment more: the line may clear; the target himself is never «in the way»)
        if (!this._cast(v, P.spell, P.foe, fp, P.vs, P.at)) return true; // (not facing it fully yet: still turning)
        v.prep = null;
        v.mana -= P.cost;
        v.castCd = Math.max(v.castCd ?? 0, P.cd);
        if (P.sq) P.sq.casts++;
        if (P.at) v.threatAt = null;
        return true;
    }

    /** The spell a wizard really casts at this foe (by his wanted level: Wanted.wantedTactics). */
    _spellFor(v, spell, T) {
        if (v.lesson) return lessonSpell(); // (a lesson: only Expelliarmus / Stupefy — never freezing, never deadly)
        if (spell === 'LevitateDuel' || spell === 'AvadaKedavra') spell = 'Stupefy'; // (they don't lift a man to hold him)
        if (T.soft && spell === 'SapiraDuel') spell = v.role !== 'student' && Math.random() < 0.4 ? 'IceDuel' : 'Stupefy'; // (calm: only stun, freeze)
        if (T.heavy && (spell === 'Stupefy' || spell === 'Jolt') && Math.random() < T.heavy) spell = 'SapiraDuel';
        if (T.avada && Math.random() < T.avada) spell = 'AvadaKedavra'; // (a mass murderer: they mean to kill)
        if ((v.skillRole || v.role) === 'student' && (spell === 'IceDuel' || spell === 'AvadaKedavra')) spell = 'Stupefy';
        return spell;
    }

    /**
     * A clear shot from this wizard's wand at the foe: the line from the wand's height to the foe's
     * body free of any block, door or wall (sampled finely: a wall one block thick is never missed).
     */
    clearShot(v, fp, foe = null) {
        const c = this.game.collision;
        if (this._friendInLine(v, fp, foe)) return false;
        if (!c?.lineOfSight) return true;
        return c.lineOfSight(v.x, v.y + 3.4, v.z, fp.x, fp.y + 0.3, fp.z, 0.35);
    }

    /**
     * One of his own between his wand and the foe (a charge hits whatever it touches first — Duel.js):
     * he doesn't cast through a friend's back; he waits or steps aside for a clear line.
     */
    _friendInLine(v, fp, foe = null) {
        const dx = fp.x - v.x, dz = fp.z - v.z, L = Math.hypot(dx, dz);
        if (L < 1.5) return false;
        const ux = dx / L, uz = dz / L, fy = fp.y - 1.95;
        for (const o of v.cs.active.values()) {
            if (o === v || o === foe || o.dead) continue; // (the arena's duel: the foe is a wizard of the same tower — he is the target, not «one of his own» in the way)
            const ox = o.x - v.x, oz = o.z - v.z;
            const f = ox * ux + oz * uz;
            if (f < 0.6 || f > L + 1.5) continue; // (one right by the foe too: a charge that misses him by a hand finds the friend)
            const y = v.y + (fy - v.y) * (f / L); // (the line's height there)
            if (Math.abs(o.y - y) > 2.2) continue;
            if (Math.abs(ox * -uz + oz * ux) < 1.3) return true; // (a body and a little room: one may step into it)
        }
        return false;
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
            const n = gr.nearest(spot.x, spot.y ?? v.y, spot.z, 6);
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
            this._turnTo(v, fp, dt);
            const dy = fp.y + 0.3 - (v.y + 3.4), dh = Math.hypot(fp.x - v.x, fp.z - v.z) || 1;
            v.aimPitch = Math.atan2(dy, dh);
        }
        v.mana = Math.max(0, v.mana - DUEL_DRAIN * dt);
        // «Максима!» — as a player shouts it (5 mana, once in 3 s; how readily — by his rank)
        v.maxT = (v.maxT ?? 1.5) - dt;
        if (v.maxT <= 0) {
            v.maxT = DUEL.MAXIMA_EVERY;
            if (wantsMaxima(v.skillRole || v.role, v.mana) && duel.applyMaxima(c.a.id, c.b.id, v.id)) {
                v.mana -= DUEL.MAXIMA_COST;
                this.game.sync?.duelMaxima?.(c.a.id, c.b.id, v.id);
                this.life._say(v, 'Максима!', 1.5);
            }
        }
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
        if ((v.skillRole || v.role) === 'student' && share < 0.2 && v.mana < 5) return { ok: false, jerk: true };
        return { ok: true, jerk: false };
    }

    /** A duel charge from the wand at a player (the charge itself: Duel.js, seen by everybody). */
    _cast(v, spell, foeId, fp, vs = null, at = null) {
        const g = this.game, duel = g.duel;
        if (!duel?._addBolt) return false;
        // «лицом к цели»: from the side or with his back — no spell; he turns first (step / pursueThreat)
        if (!facesTarget(v.yaw, v.x, v.z, fp.x, fp.z, FACE.SPELL)) return false;
        if (v.group.visible) v.model.getWandTip(_o);
        else _o.set(v.x - Math.sin(v.yaw), v.y + 3.4, v.z - Math.cos(v.yaw));
        // (the wand's tip through a wall he stands against: no — the charge would start on the other side)
        const c = g.collision;
        if (c?.lineOfSight && (!c.lineOfSight(v.x, v.y + 3.0, v.z, _o.x, _o.y, _o.z, 0.15) || c.pointBlocked?.(_o.x, _o.y, _o.z))) return false;
        // (somebody right before him, the wand's tip in them or through them: it starts before them — hits them)
        duel.armStart?.(_ch.set(v.x, v.y + 3.0, v.z), _o, v.id);
        const body = at ? null : duel._bodyOf?.('p', foeId, duel._tmpBody()); // (`at`: a creature {k, id} instead of a player)
        if (body) _d.copy(body.a).lerp(body.b, 0.55); else _d.set(fp.x, fp.y, fp.z);
        _d.sub(_o).normalize();
        const err = 0.06 / (v.W.skill || 1) * (v.dazeT > 0 ? 6 : 1); // (not a perfect hand; dizzy after a «Джолт»: far off)
        _d.x += (Math.random() - 0.5) * 2 * err; _d.y += (Math.random() - 0.5) * err; _d.z += (Math.random() - 0.5) * 2 * err;
        _d.normalize();
        const b = duel._addBolt({ id: `${v.id}:${++this.seq}`, by: v.id, spell, side: 'right', tk: at ? at.k : 'p', tid: at ? at.id : foeId, ak: 0.55, o: _o.clone(), d: _d.clone(), npc: true, vs });
        if (spell === 'AvadaKedavra') this.life._say(v, 'Авада Кедавра!', 2); // (the killing words are heard)
        g.sync?.duelCast?.(b);
        v.aimPitch = Math.asin(Math.max(-1, Math.min(1, _d.y)));
        v.castT = 0.55;
        v.model.castNow = true;
        this._startHold(v);
        v.holdAt = { x: fp.x, z: fp.z };
        const me = g.character.group.position;
        if (spell === 'AvadaKedavra' && duel.avada) duel.avada.cast(_o, _d, Math.hypot(me.x - v.x, me.z - v.z) < 60); // (the same poison-green flash and terrible sound as a player's)
        else duel._burst?.(_o, duel.colors(spell, v.id).glow, 12);
        if (spell !== 'AvadaKedavra' && Math.hypot(me.x - v.x, me.z - v.z) < 40) { if (spell === 'IceDuel') g.sound?.playIce?.(); else if (spell === 'Jolt' || spell === 'JoltMaxima') g.sound?.playJolt?.(spell === 'JoltMaxima', false); else g.sound?.playSapira?.(); }
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
            // does he see it, is he ready, is there time? (from behind — never; taken by surprise — late)
            const eta = dist / (DUEL_SPELLS[b.spell]?.speed || 15);
            const n = this._notice(v, b, dist, eta);
            if (!n.seen) continue; // (not seen yet: maybe a moment later, when it comes into view)
            seen.add(v.id);
            if (!n.shield) { this._caught(v, b); continue; } // (too late to do anything)
            const domeOk = !!v.W?.dome && (v.domeCd ?? 0) <= 0 && !(v.fx & FX.DOME);
            let r = react({ role: v.skillRole || v.role, mana: v.mana, shieldReady: true, domeReady: v.role === 'master' && domeOk, spell: b.spell, eta, robe: !!v.robe });
            // the strong ones (300+ mana) raise «Protection Maxima» when it is really worth it: a heavy spell, a volley, many foes, a bad state
            if (r === 'shield' && domeOk && canDome(v.maxMana, v.rank)) {
                let inc = 0;
                for (const o of duel.bolts.values()) if (o.state === 'flying' && !o.npc && o.by !== v.id && Math.hypot(v.x - o.front.x, v.z - o.front.z) < 22) inc++;
                const pick2 = chooseShield({ mana: v.mana, maxMana: v.maxMana, rank: v.rank, spell: b.spell, incoming: inc, foes: v.cs?.hostile?.size || 0, boss: this.life.wantedLevel(b.by) >= 3, hpK: v.hp / (v.maxHp || 1), domeReady: true });
                if (pick2 === 'dome') { r = 'dome'; this.life.alog?.decision(v, `щит: Protection Maxima (залп ${inc}, заклинание ${b.spell})`); }
            }
            if (r && !v.foe && this.life._isPlayer(b.by) && WizardFight.fights(v)) { v.foe = b.by; v.grudge = { id: b.by, until: Date.now() + 40000 }; v.seated = false; } // (he cast at me: now it is a fight)
            if (r === 'counter' && (!n.counter || eta < CAST_PREP.T + 0.3)) r = 'shield'; // (no time to raise the wand and say it: only the hand shield)
            if (r === 'dome') this._dome(v);
            else if (r === 'counter' && this._counter(v, b)) { /* (a spell back: the beams meet — a duel) */ }
            else if (r === 'shield' || r === 'counter') {
                if (!(v.fx & FX.SHIELD)) v.mana -= NPC_COST.Protection; // (raised in the free hand: the wand goes on casting)
                v.shieldT = Math.max(v.shieldT, 1.4); v.fx |= FX.SHIELD;
                v.yaw = turnToward(v.yaw, yawTo(v.x, v.z, b.o.x, b.o.z), 0.5); // (a quick turn of the shoulder to it — not an about-face)
                if (Math.random() < 0.25) this.life._say(v, pick(WIZ_LINES.shield), 1.5);
            }
        }
    }

    /** What this wizard can do about the charge `b` (WizardAI.noticeCharge): seen? time for a shield, a spell back? */
    _notice(v, b, dist, eta) {
        const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
        const facing = dist > 1e-3 ? ((b.front.x - v.x) * fx + (b.front.z - v.z) * fz) / dist : 1;
        const c = this.game.collision;
        const sees = !c?.lineOfSight || c.lineOfSight(v.x, v.y + 3.6, v.z, b.front.x, b.front.y, b.front.z, 0.45);
        const now = Date.now();
        // ready: already fighting, his tower on the alert / against this caster, or the wand just used
        const ready = !!v.foe || v.castT > 0 || !!(v.fx & FX.SHIELD) || v.cs?.alertUntil > now || v.cs?.hostile?.get(b.by) > now || (v.readyUntil || 0) > now;
        return noticeCharge({ facing, sees, ready, seated: !!v.seated || v.job === 'desk', eta, reactT: v.W.reactT ?? 0.5 });
    }

    /** Taken unawares: no answer — but now he knows (a moment later he is ready, if he still stands). */
    _caught(v, b) {
        v.readyUntil = Date.now() + 20000;
        if (!v.foe && this.life._isPlayer(b.by) && WizardFight.fights(v)) { v.foe = b.by; v.grudge = { id: b.by, until: Date.now() + 40000 }; }
    }

    /**
     * (host) Hurt by a creature whose master he didn't see (a living tree, a servant): he defends himself
     * from it — a «Джолт» at it to throw it back (a tree only reels; CreatureImpact), now and then.
     */
    threat(v, ref) {
        if (!v.W || v.noWand || v.dead || (v.castCd ?? 0) > 0 || v.stunT > 0) return false;
        const duel = this.game.duel;
        const c = duel?._creature?.(ref.k, ref.id);
        if (!c) return false;
        const at = duel._creaturePoint(c, _d.clone());
        const fp = { x: at.x, y: at.y - 0.3, z: at.z };
        if (!this.clearShot(v, fp)) return false;
        const spell = v.role === 'master' ? 'JoltMaxima' : 'Jolt';
        const cost = NPC_COST[spell] ?? 5;
        if (v.mana < cost) return false;
        // not facing it yet: he turns to it first (pursueThreat), then casts
        if (!facesTarget(v.yaw, v.x, v.z, fp.x, fp.z, FACE.SPELL)) { v.threatAt = { ref, until: this.clock + 3 }; return false; }
        // he says it first (a second), then it flies (_prepTick)
        return this._begin(v, spell, null, fp, { at: ref, cost, cd: v.W.cast * manaPace(v.mana - cost, v.maxMana) });
    }

    /** (host) A creature hurt him and he is turning to it to answer (threat): true — busy with it this frame. */
    pursueThreat(v, dt) {
        const t = v.threatAt;
        if (!t || v.foe || v.noWand || v.dead || v.stunT > 0 || this.clock > t.until) { v.threatAt = null; return false; }
        const c = this.game.duel?._creature?.(t.ref.k, t.ref.id);
        if (!c) { v.threatAt = null; return false; }
        const at = this.game.duel._creaturePoint(c, _d.clone());
        v.speed = 0; v.path = null;
        this._turnTo(v, at, dt);
        v.mode = 'idle';
        if ((v.castCd ?? 0) <= 0) this.threat(v, t.ref);
        this.life._ground(v);
        return true;
    }

    /** A spell straight back at the one who cast at him: the two charges meet (Duel.js: a clash). */
    _counter(v, b) {
        const L = this.life;
        if (v.noWand || !L._isPlayer(b.by) || (v.castCd ?? 0) > 0.6) return false;
        const fp = L._playerPos(b.by);
        if (!fp || !this.clearShot(v, fp)) return false;
        const spell = this._spellFor(v, pickSpell(v.skillRole || v.role), wantedTactics(L.wantedLevel(b.by), v.role));
        const cost = NPC_COST[spell] ?? 10;
        if (v.mana < cost) return false;
        // (said first, a second — a charge too near is not met in time: then only the hand shield, _react)
        return this._begin(v, spell, b.by, fp, { vs: b.id, cost, cd: v.W.cast * 0.6 });
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

    /**
     * (host) The rule of concentration for a wizard of the game (Concentration.js): stunned, frozen, lifted,
     * thrown or dead, he holds nothing — the shield in his hand falls apart (dead: the dome too). His own
     * fight never casts a second spell while one is held: in a clash only the clash (WizardAI.decide), the
     * shield in the free hand and the dome are the author's exceptions (as a player's).
     */
    lostFocus(v) {
        if (!v?.fx) return;
        if (v.dead) this._shatter(v, FX.SHIELD | FX.DOME);
        else if (v.stunT > 0 || v.lev || v.vy) this._shatter(v, FX.SHIELD);
    }

    /** «Nihilis Atra» shatters a black mage's «Protection Maxima» dome (Nihilis.js). */
    breakDome(v) { this._shatter(v, FX.DOME); }

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
