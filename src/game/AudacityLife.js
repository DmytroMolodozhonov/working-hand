/**
 * AudacityLife.js — the game side of Audacity.js: «наглость» of a player in a settlement, the crowd that falls on him together,
 * and the people who run out of the village.
 *
 * The HOST keeps and runs it (a guest's blow/theft arrives at the host as always); the guests only see the result: where the people
 * go (the net list), what is in their hands (bits of `v.fx`, `applyFx`), what they shout.
 *  - `deed(cs, by, kind, witnesses, …)` — called by CastleLife where a deed is already judged (`_offence`, `theft`, `reportCrime`,
 *    `damaged`): the points go only if somebody SAW and knew who it was (Blame.js already decided that);
 *  - every 0.5 s per awake place with a record (`_tick`): the number eases; phase by hysteresis; at «fear» the bell tolls (BuildingFx.alarm)
 *    and the timid go out of the village (`_alert`, `step` — mode 'out' → 'wait' → 'back'); at «mob» the ones who can fight muster at the
 *    leader's side (a knight first), and when enough have come — or he comes too close — they all go at him at once (`foe`), each from
 *    his own side of the circle (CastleLife._assignSlots with Audacity.MOB.STYLE: up to five at once, all round);
 *  - when it calms (or the player leaves / dies / makes peace) the crowd goes home, the runaways come back (never left idle at night:
 *    NightLife takes them to bed; the knights and the king keep their own rules and just join in).
 * Walking is only `CastleLife._steer/_followPath` (the Pilot: round each other and the walls, no pushing, no through-walls).
 * Journal «решение:» — who attacked, who ran, why, the number (ActionLog).
 */

import {
    AUD, deed as deedRec, ease, phaseOf, blank, valueOf, PHASE_NAME, fightsInMob, shelters, weaponFor, withTool, toolOf,
    MOB, pickLeader, musterSpot, goNow, EXODUS, refugeSpot, mayReturn, NO_POINTS_ROLES,
} from './Audacity.js';
import { isForgiven } from './Ranks.js';
import { isWizSite } from './WizardLife.js';
import { isWeak } from './WandererMind.js';

const TICK = 0.5; // s between two looks per record (not per frame)
const RUN = 5.4, WALK = 2.3;
const JOINS_PER_TICK = 5; // people who change their mind in one look (no 30 calls at one frame)
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const key = (cs, pid) => `${cs.def.id}|${pid}`;

const SHOUT = {
    rally: ['Бей вора!', 'Все сюда! Он грабит нас!', 'Хватит терпеть! Вместе!', 'Убийца! Хватай, что под рукой!', 'Он убил наших! Вилы сюда!', 'К оружию, соседи!'],
    go: ['Бей его!', 'Все разом! Окружай!', 'За наших!', 'Не пускай его!', 'Гони душегуба!'],
    flee: ['Бегите из деревни!', 'Спасайтесь! Он убивает людей!', 'Уходим отсюда, пока живы!', 'За околицу! Скорее!', 'Бегите, бегите!'],
    back: ['Кажется, ушёл…', 'Можно вернуться?..', 'Пойдём домой. Тихо вроде.', 'Слава богу, живы.'],
    glare: ['Совсем совесть потерял…', 'Не нравится мне этот человек.', 'Тише, он смотрит.'],
};
export const AUD_LINES = SHOUT;

export class AudacityLife {
    constructor(life) {
        this.life = life;
        this.recs = new Map(); // `${castle}|${pid}` → { cs, pid, rec, bellAt, exo:Set(id), seen }
        this.mobs = new Map(); // same key → { cs, pid, phase:'muster'|'go', t0, leader, members:Map(id → {v, tool0}), spotT, spots }
        this._t = 0;
        this._tickT = TICK;
        this._neighbors = new Map(); // castle id → nearest other settlement {x, z} (cached: the world does not move)
    }

    get game() { return this.life.game; }
    get auth() { return this.life.auth; }

    // ------------------------------------------------------------------ the number
    _entry(cs, pid, make = false) {
        const k = key(cs, pid);
        let e = this.recs.get(k);
        if (!e && make) { e = { cs, pid, rec: blank(), bellAt: -1e9, exo: new Set(), k }; this.recs.set(k, e); }
        return e || null;
    }

    /** Наглость 0…100 игрока `pid` в месте `cs`. */
    value(cs, pid) { const e = this._entry(cs, pid); return e ? valueOf(e.rec) : 0; }

    /** Самая большая наглость кого-либо в месте. */
    top(cs) { let m = 0; for (const e of this.recs.values()) if (e.cs === cs) m = Math.max(m, valueOf(e.rec)); return m; }

    phase(cs, pid) { return this._entry(cs, pid)?.rec.phase || 'calm'; }

    /** Is this place one the crowd rules apply to? (not a tower / a wizards' settlement — they have their own; not a stall) */
    _eligible(cs) {
        const d = cs?.def;
        return !!d && cs.awake && !isWizSite(d) && d.kind !== 'stall' && d.kind !== 'guest' && d.kind !== 'wander';
    }

    /**
     * (host) A deed of player `by` in place `cs`. `witnesses`: the people who SAW it and knew who it was. No witness — no points (the
     * author: «одного случайного удара мало»; nobody saw — nothing happened). The owner (the king) and the king's friends are not
     * judged here (Rebellion.js / Ranks.js); the duel mode and the arena's legal fights are nobody's business.
     * @returns {number} points added
     */
    deed(cs, by, kind, witnesses, { n = 1, victim = null } = {}) {
        if (!this.auth || !this.life.enabled || !cs || by == null || !this._eligible(cs)) return 0;
        if (this.game.arenaDuels?.peace?.() || !this.life._isPlayer(by)) return 0;
        const st = this.life.state(cs.def.id);
        if (st.owner === by || isForgiven(st.ranks, by)) return 0;
        const w = (witnesses || []).filter((x) => x && !x.dead && x.sleep?.phase !== 'lie' && !x.arena);
        if (kind === 'slay' && victim && NO_POINTS_ROLES.has(victim.role)) return 0; // (the king's death is the castle's war, not the crowd's)
        const e = this._entry(cs, by, true);
        const before = valueOf(e.rec);
        const r = deedRec(e.rec, kind, { witnesses: w.length, n, victimId: victim?.id ?? null, now: this._t });
        if (!r.add) {
            if (!w.length) this.life.alog?.note(`наглость «${cs.def.name || cs.def.id}»: ${kind} — никто не видел, очков нет (${before.toFixed(0)})`);
            return 0;
        }
        const after = valueOf(e.rec);
        this.life.alog?.note(`наглость «${cs.def.name || cs.def.id}» ${String(by).slice(0, 8)}: ${before.toFixed(0)} → ${after.toFixed(0)} (${KIND_WORD[kind] || kind}, свидетелей ${w.length}${r.add > (DEEDS_BASE[kind] || 0) * 1.35 + 0.01 ? ', не первая жертва' : ''}) — ${PHASE_NAME[phaseOf(after, e.rec.phase)]}`);
        e.wake = true; // (look at once, not in half a second)
        this._tickT = Math.min(this._tickT, 0.05);
        return r.add;
    }

    /** A player died (or left): the people forget the heat — the crowd goes home, the number halves. */
    playerDied(pid) {
        for (const e of this.recs.values()) if (e.pid === pid) { e.rec.v = Math.round(e.rec.v * 0.5 * 10) / 10; e.rec.quiet = 0; this._disband(e, 'игрок погиб'); this._calmDown(e); }
    }

    // ------------------------------------------------------------------ loop (host)
    update(dt) {
        if (!this.auth || !this.life.enabled || !this.recs.size) return;
        this._t += dt;
        this._tickT -= dt;
        if (this._tickT > 0) return;
        const step = Math.max(TICK, -this._tickT + TICK);
        this._tickT = TICK;
        for (const [k, e] of this.recs) {
            if (!e.cs.awake) { this._disband(e, 'место уснуло'); this.recs.delete(k); continue; } // (a sleeping place does not cool — but nothing of it is left running)
            this._tick(e, step);
            if (e.rec.v <= 0 && e.rec.phase === 'calm' && !e.exo.size && !this.mobs.has(k)) this.recs.delete(k);
        }
    }

    _tick(e, dt) {
        const { cs, pid } = e;
        const g = this.game;
        if (g.arenaDuels?.peace?.()) { this._disband(e, 'дуэльный режим'); this._calmDown(e); e.rec.v = 0; return; }
        const st = this.life.state(cs.def.id);
        if (st.owner === pid || isForgiven(st.ranks, pid)) { e.rec.v = 0; e.rec.phase = 'calm'; this._disband(e, 'игрок стал хозяином/другом короля'); this._calmDown(e); return; }
        ease(e.rec, dt);
        const prev = e.rec.phase;
        const v = valueOf(e.rec);
        const ph = e.rec.phase = phaseOf(v, prev);
        if (ph !== prev) this.life.alog?.note(`наглость «${cs.def.name || cs.def.id}» ${String(pid).slice(0, 8)}: ${PHASE_NAME[prev]} → ${PHASE_NAME[ph]} (${v.toFixed(0)})`);
        const pos = this.life._playerPos(pid);
        if (!pos) { this._disband(e, 'игрока нет'); return; }
        const def = cs.def;
        const dp = Math.max(Math.abs(pos.x - def.x), Math.abs(pos.z - def.z));
        const here = dp <= def.zone + AUD.AWARE_R; // (near the place: they notice him)
        if (ph === 'wary' && here) this._glare(e, pos);
        if (ph === 'fear' || ph === 'mob') {
            if (here) this._alert(e, pos, ph);
        }
        if (ph === 'mob') {
            if (dp <= def.zone + MOB.R) this._mob(e, pos);
            else this._disband(e, 'игрок ушёл далеко');
        } else if (prev === 'mob' || this.mobs.has(e.k)) this._disband(e, ph === 'fear' ? 'наглость упала ниже порога толпы' : 'успокоились');
        if (ph === 'calm' || ph === 'wary') this._calmDown(e);
    }

    // ------------------------------------------------------------------ people
    _traits(v) {
        this.life.fright._traits(v); // (brave, elder — from the seed: the same person is always the same)
        const E = v.entry || {};
        return {
            role: v.role, trade: E.trade || null, female: !!E.female, brave: v.brave ?? 0.5, elder: !!v.elder, weak: isWeak(v), child: !!v.child, kid: !!v.kid,
            hpFrac: v.maxHp > 0 ? v.hp / v.maxHp : 1, atStall: v.job === 'stall' || (v.role === 'seller'), tool: v.mobTool0 ?? v.model?.toolKind,
        };
    }

    /** Free to be moved by this system (not asleep, not on the king's/player's orders, not held, not stunned, not at the arena). */
    _free(v) {
        return !v.dead && !v.sleep && !v.arena && v.servantOf == null && !v.handLink && !v.lev && !v.carriedBy && !(v.stunT > 0) && !v.climb && !v.imp
            && !(v.talking > 0) && !(v.giveT > 0) && !v.cmd && !v.order && !v.gOwner && !v.follow && !v.impDuty && !v.wizard && v.role !== 'king' && v.role !== 'advisor' && !v.dark;
    }

    /** The bell and the cry: the whole village knows (once in a while). */
    _alert(e, pos, ph) {
        const { cs } = e, def = cs.def;
        if (this._t - e.bellAt > 12) {
            e.bellAt = this._t;
            this.game.buildingFx?.alarm({ x: def.x, y: 0, z: def.z }, def.zone + 30); // (the bell tolls fast — BuildingFx)
            this.life.night?.noise({ x: pos.x, y: pos.y, z: pos.z }, 45); // (the sleepers near wake)
            this.life.alog?.note(`набат в «${cs.def.name || cs.def.id}»: ${PHASE_NAME[ph]} (наглость ${valueOf(e.rec).toFixed(0)}) — колокол бьёт, слабые уходят, бойцы собираются`);
        }
        // the timid go: some each look (not the whole village in one frame); those who already know — near him or after the bell
        let n = 0;
        for (const v of cs.active.values()) {
            if (n >= JOINS_PER_TICK) break;
            if (v.aud || v.foe || !this._free(v) || v.role === 'knight') continue;
            if (v.mob || v.hd) continue; // (already at home on guard: HomeDefenceLife)
            const t = this._traits(v);
            if (!shelters(t)) continue;
            if (!this.life.fright._fearful(v) && !v.fear) continue;
            if (Math.max(Math.abs(v.x - cs.def.x), Math.abs(v.z - cs.def.z)) > cs.def.zone + 10) continue; // (already outside: stays there)
            // the author: «слабые бегут В СВОЙ ДОМ и запираются; из деревни — только если дом недоступен/разрушен»
            if (v.fear && v.fear.level >= 2 && v.fear.state !== 'flee') continue; // (already heading for a house / inside)
            if (this.life.home.hasHome(v) && this.life.fright.sendHome(v, pos, e.pid)) {
                this.life.alog?.decision(v, `прячется дома: наглость ${valueOf(e.rec).toFixed(0)}, слабый (${t.elder ? 'старик' : t.child || t.kid ? 'ребёнок' : t.female ? 'женщина' : 'робкий'}) — бежит в свой дом и запрёт дверь`);
                if (k < 3 || Math.random() < 0.25) this.life._say(v, pick(SHOUT.flee), 3);
                n++;
                continue;
            }
            if (v.fear?.state === 'shelter') { n++; continue; } // (no own house, but another one is near enough: he is running there)
            if (this.life.fright.sendHome(v, pos, e.pid)) { n++; continue; }
            this._leave(e, v, t, pos); // (no house at all / burnt / fallen: out of the village, as before)
            n++;
        }
    }

    _glare(e, pos) {
        // «косятся»: a mutter now and then from the ones who see him (no more than one per look)
        if (this._t - (e.glareAt || -1e9) < 14) return;
        e.glareAt = this._t;
        let best = null, bd = 18;
        for (const v of e.cs.active.values()) {
            if (v.dead || v.foe || v.sleep || v.talking > 0 || v.role === 'knight') continue;
            const d = Math.hypot(v.x - pos.x, v.z - pos.z);
            if (d < bd && this.life._sees(v, pos)) { bd = d; best = v; }
        }
        if (best) this.life._say(best, pick(SHOUT.glare), 3);
    }

    // ------------------------------------------------------------------ the timid leave the village
    _neighbor(def) {
        if (this._neighbors.has(def.id)) return this._neighbors.get(def.id);
        let best = null, bd = Infinity;
        for (const o of this.life.index?.near(def.x, def.z, EXODUS.NBR_R) || []) {
            if (o.id === def.id || isWizSite(o) && o.kind !== 'wizvillage') continue;
            const d = Math.hypot(o.x - def.x, o.z - def.z);
            if (d < bd) { bd = d; best = { x: o.x, z: o.z }; }
        }
        if (this._neighbors.size > 200) this._neighbors.clear();
        this._neighbors.set(def.id, best);
        return best;
    }

    _leave(e, v, t, pos) {
        const life = this.life;
        const k = e.exo.size;
        const spot = refugeSpot(e.cs.def, pos, this._neighbor(e.cs.def), k);
        life.fright?._end?.(v, false); // (the old fear — hiding in a house, a bucket — is over: he goes)
        v.fear = null; v.fleeT = 0; v.fleeFrom = null; v.fleeAt = null; v.flee = null; v.path = null; v.seated = false; v.talking = 0; v.follow = null; v.investigate = null; v.waitT = 0; v.chore = null; v.purpose = '';
        v.aud = { mode: 'out', k: e.k, t0: this._t, spot, still: 0, pathDone: false, prog: { x: v.x, z: v.z, t: 0 }, pid: e.pid };
        e.exo.add(v.id);
        const why = t.elder ? 'старик' : t.child || t.kid ? 'ребёнок' : t.female ? 'женщина' : t.weak ? 'слабый' : t.hpFrac < 0.6 ? 'ранен' : t.atStall ? 'торговец с товаром' : t.trade === 'priest' ? 'священник' : `робкий (храбрость ${(t.brave * 100).toFixed(0)} %)`;
        life.alog?.decision(v, `бежит из деревни: ${why}; наглость ${valueOf(e.rec).toFixed(0)} — убежище за границей (${spot.x.toFixed(0)}, ${spot.z.toFixed(0)})`);
        if (k < 3 || Math.random() < 0.25) life._say(v, pick(SHOUT.flee), 3);
    }

    /** (CastleLife._think) The person's own state of this system. → true: handled this frame. */
    step(v, dt) {
        const A = v.aud;
        if (!A) return false;
        if (v.foe || v.dead || v.sleep || !this.auth) { this._drop(v); return false; }
        const life = this.life, cs = v.cs;
        if (A.mode === 'muster') return this._musterStep(v, A, dt);
        const def = cs.def;
        if (A.mode === 'out') {
            const run = RUN * (v.elder ? EXODUS.ELDER : 1);
            // (how: along the ways of the place to the node nearest the outside spot, then straight across the land)
            if (!A.pathDone) {
                if (!v.path || v.pathI >= (v.path?.length ?? 0)) {
                    if (!A.pathTried) {
                        A.pathTried = true;
                        const g2 = cs.graph;
                        const n = g2.nodes.length ? g2.nearest(A.spot.x, v.y, A.spot.z, 8) : -1;
                        if (n >= 0) life._goTo(v, n, (nd) => this._cost(nd, v)); else A.pathDone = true;
                    } else A.pathDone = true;
                }
                if (!A.pathDone) {
                    if (life._followPath(v, dt, run)) { v.path = null; A.pathDone = true; }
                    v.mode = 'flee';
                }
            }
            if (A.pathDone) {
                const d = life._steer(v, A.spot.x, A.spot.z, run, dt, 1.2);
                v.mode = v.speed > 0 ? 'flee' : 'idle';
                if (d < 2) { A.mode = 'wait'; A.waitAt = this._t; v.speed = 0; v.mode = 'idle'; v.path = null; }
            }
            // (running but not moving for STUCK_S: hides where he stands — never a permanent run on the spot; the Pilot's own unstick also works)
            A.prog.t += dt;
            if (A.prog.t > 1) {
                const held = Math.hypot(v.x - A.prog.x, v.z - A.prog.z) < 0.4;
                A.prog.x = v.x; A.prog.z = v.z; A.prog.t = 0;
                A.still = held ? A.still + 1 : 0;
                if (A.still >= EXODUS.STUCK_S) { A.mode = 'wait'; A.waitAt = this._t; A.hid = true; v.speed = 0; v.mode = 'idle'; v.path = null; life.alog?.decision(v, 'бежит, но стоит на месте (стены/толпа) — пережидает там, где стоит'); }
            }
            this._ground(v);
            return true;
        }
        if (A.mode === 'wait') {
            v.speed = 0; v.mode = 'idle';
            const tp = life._playerPos(A.pid);
            if (tp) life._steer(v, tp.x, tp.z, 0, dt, 99); // (turned to him, watching)
            A.chk = (A.chk || 0) - dt;
            if (A.chk <= 0) {
                A.chk = 1;
                const e = this.recs.get(A.k);
                const waited = this._t - (A.waitAt ?? A.t0);
                const pd = tp ? Math.hypot(tp.x - v.x, tp.z - v.z) : Infinity;
                const aud = e ? valueOf(e.rec) : 0;
                if (!e || mayReturn({ waited, audacity: aud, playerD: pd, mobOn: this.mobs.has(A.k) })) this._back(v, A, e ? `наглость ${aud.toFixed(0)}, игрок в ${pd.toFixed(0)} м, ждал ${waited.toFixed(0)} с` : 'всё улеглось');
                else if (pd < 14 && A.hid !== true && waited > 2) { // (he came to the hiding place: farther away, not cornered)
                    const k = (this.recs.get(A.k)?.exo.size || 0) + 3;
                    A.spot = refugeSpot(def, tp, this._neighbor(def), k); A.mode = 'out'; A.pathDone = true; A.still = 0;
                }
            }
            this._ground(v);
            return true;
        }
        this._drop(v);
        return false;
    }

    _cost(nd, v) { const tp = this.life._playerPos(v.aud?.pid); if (!tp) return 0; const d = Math.hypot(nd.x - tp.x, nd.z - tp.z); return d < 10 ? (10 - d) * 6 : 0; } // (a way that passes close by him costs more)

    _back(v, A, why) {
        this.life.alog?.decision(v, `возвращается в деревню: ${why}`);
        const e = this.recs.get(A.k);
        e?.exo.delete(v.id);
        v.aud = null; v.path = null; v.fear = null;
        if (Math.random() < 0.4) this.life._say(v, pick(SHOUT.back), 3);
        // (back to what he did; at night — straight home, NightLife puts him to bed: never left standing in the road)
        if (v.job === 'wander') { // (a stall / home / post job walks back to its place by itself)
            v.waitT = 0; v.goingHome = !!this.game.isNight;
            if (this.game.isNight) v.trips = 0;
            this.life._nextTrip(v);
        }
    }

    _drop(v) {
        const A = v.aud;
        if (!A) return;
        this.recs.get(A.k)?.exo.delete(v.id);
        this.mobs.get(A.k)?.members.delete(v.id);
        v.aud = null;
        if (!v.mob) this._unarm(v);
    }

    _ground(v) { this.life._ground?.(v); }

    // ------------------------------------------------------------------ the crowd
    _equip(v, t) {
        if (v.mobTool0 === undefined) v.mobTool0 = v.model?.toolKind ?? 'none';
        const tool = weaponFor({ ...t, tool: v.mobTool0 });
        this.life.fright?._dropBucket?.(v);
        v.model?.setHeldTool?.(tool);
        v.fx = withTool(v.fx, tool);
        v.mobDmg = tool === 'none' ? 1 : 2; // (fists 1, a fork / a hammer / a knife 2: _strike)
        v.mobWeapon = tool;
    }

    _unarm(v) {
        if (v.mobTool0 === undefined) return;
        if (!v.dead) v.model?.setHeldTool?.(v.toolGone ? 'none' : v.mobTool0);
        v.fx = withTool(v.fx, '');
        v.mobTool0 = undefined; v.mobDmg = 0; v.mobWeapon = null;
    }

    /** (guests) What is in the hands of a commoner: the host's bits. */
    applyFx(v, fx) {
        if (v.role === 'knight' || v.wizard) return;
        const tool = toolOf(fx);
        if (tool) {
            if (v.guestTool0 === undefined) v.guestTool0 = v.model?.toolKind ?? 'none';
            if (v.model?.toolKind !== tool) v.model?.setHeldTool?.(tool);
        } else if (v.guestTool0 !== undefined) {
            if (!(fx & 2)) v.model?.setHeldTool?.(v.guestTool0); // (the bucket bit is the fear system's: it takes the hand itself)
            v.guestTool0 = undefined;
        }
    }

    _mob(e, pos) {
        const { cs, pid } = e, life = this.life, def = cs.def;
        let M = this.mobs.get(e.k);
        const fresh = !M;
        if (!M) { M = { cs, pid, phase: 'muster', t0: this._t, leader: null, members: new Map(), spots: new Map(), spotT: 0, lastN: 0 }; this.mobs.set(e.k, M); }
        // the knights of the place: their own rules (they hear the alarm and go for him, as for any wrecker) — and they are the crowd's landmark
        let kn = 0;
        const knights = [];
        for (const v of cs.active.values()) {
            if (v.dead || v.role !== 'knight' || !life._fights(v) || v.sleep) continue;
            const d = Math.hypot(v.x - pos.x, v.z - pos.z);
            if (d > MOB.R + 40) continue;
            knights.push({ id: v.id, role: 'knight', brave: 1, d, v });
            if (!v.foe && fresh) { v.foe = pid; v.path = null; v.investigate = null; kn++; }
        }
        // the ones who can fight: the nearest first, no more than MOB.MAX
        const room = MOB.MAX - M.members.size;
        let joined = 0;
        if (room > 0) {
            const cand = [];
            for (const v of cs.active.values()) {
                if (v.aud || v.mob || v.foe || v.role === 'knight' || !this._free(v)) continue;
                if (Math.max(Math.abs(v.x - def.x), Math.abs(v.z - def.z)) > def.zone + 12) continue;
                const d = Math.hypot(v.x - pos.x, v.z - pos.z);
                if (d > MOB.R) continue;
                const t = this._traits(v);
                if (!fightsInMob(t)) continue;
                if (!life._sees(v, pos) && d > 35 && !e.bellAt) continue; // (hears the bell: any; else sees him or is near)
                cand.push({ v, t, d });
            }
            cand.sort((a, b) => a.d - b.d);
            for (const c of cand) {
                if (joined >= Math.min(room, JOINS_PER_TICK)) break;
                this._join(e, M, c.v, c.t, pos);
                joined++;
            }
        }
        // (the opening cry: a few voices, not all at once)
        if (fresh || joined) {
            let said = 0;
            for (const m of M.members.values()) { if (said >= 2) break; if (!m.cried) { m.cried = true; life._say(m.v, pick(SHOUT.rally), 3); said++; } }
        }
        // clean: dead / gone / lost
        for (const [id, m] of M.members) if (m.v.dead || !life.byId.has(id) || m.v.sleep) { M.members.delete(id); }
        if (!M.members.size && !knights.length && M.phase === 'go' && this._t - M.t0 > 4) { this._disband(e, 'толпа разошлась'); return; }
        const list = [...M.members.values()];
        // the leader (a knight if any), the muster spots round the target on his side
        const lead = pickLeader([...knights.map((k) => ({ id: k.id, role: 'knight', brave: 1, d: k.d, v: k.v })), ...list.map((m) => ({ id: m.v.id, role: m.v.role, brave: m.v.brave ?? 0.5, d: Math.hypot(m.v.x - pos.x, m.v.z - pos.z), v: m.v }))]);
        if (lead && lead.id !== M.leader) { M.leader = lead.id; life.alog?.note(`толпа «${def.name || def.id}»: ориентир — ${lead.v.title || lead.role} ${lead.v.name || ''}, в толпе ${list.length}${knights.length ? `, рыцарей ${knights.length}` : ''}`); }
        if (M.phase === 'muster') {
            M.spotT -= TICK;
            const L = lead?.v || list[0]?.v;
            if (L && M.spotT <= 0) {
                M.spotT = 1.2;
                const n = list.length;
                list.forEach((m, i) => { m.spot = musterSpot(L, pos, i, n); });
            }
            let ready = 0, nearest = Infinity;
            for (const m of list) {
                if (m.spot && Math.hypot(m.v.x - m.spot.x, m.v.z - m.spot.z) < 3.2) ready++;
                nearest = Math.min(nearest, Math.hypot(m.v.x - pos.x, m.v.z - pos.z));
            }
            if (list.length && goNow({ ready, total: list.length, t: this._t - M.t0, nearest })) this._go(e, M, list, pos, ready);
            else if (!list.length && knights.length && this._t - M.t0 > 2) M.phase = 'go';
        } else {
            // the attack goes on: the hostility to him is renewed while the crowd lives; the latecomers go straight in
            const now = Date.now();
            cs.hostile.set(pid, Math.max(cs.hostile.get(pid) || 0, now + MOB.FOE_S * 1000));
            const inReach = this.life._inLand(def, pos, 30); // (beyond it `_fight` lets go of him: no flicker of foe on / off)
            for (const m of inReach ? list : []) {
                const v = m.v;
                if (!v.foe && !v.dead) { v.foe = pid; v.grudge = { id: pid, until: now + 60000 }; v.path = null; v.fleeT = 0; v.aud = null; }
            }
        }
        void kn;
    }

    _join(e, M, v, t, pos) {
        const life = this.life;
        life.fright?._end?.(v, false);
        v.fear = null; v.fleeT = 0; v.fleeFrom = null; v.flee = null; v.path = null; v.seated = false; v.talking = 0; v.investigate = null; v.waitT = 0; v.chore = null; v.purpose = '';
        v.mob = true;
        v.aud = { mode: 'muster', k: e.k, t0: this._t, pid: e.pid, still: 0, prog: { x: v.x, z: v.z, t: 0 } };
        this._equip(v, t);
        M.members.set(v.id, { v, cried: false, spot: null });
        life.alog?.decision(v, `в толпе против игрока (наглость ${valueOf(e.rec).toFixed(0)}): ${t.role}${t.trade ? '/' + t.trade : ''}, храбрость ${(t.brave * 100).toFixed(0)} %, берёт ${WEAPON_RU[v.mobWeapon] || v.mobWeapon}, идёт на сбор`);
    }

    _musterStep(v, A, dt) {
        const life = this.life;
        const M = this.mobs.get(A.k);
        const m = M?.members.get(v.id);
        if (!M || !m) { this._dropMob(v); return false; }
        const spot = m.spot;
        const tp = life._playerPos(A.pid);
        if (!tp) { this._dropMob(v); return false; }
        if (spot) {
            const d = life._steer(v, spot.x, spot.z, RUN * 0.85, dt, 0.8);
            if (d < 1.4 || v.speed === 0) { v.speed = 0; v.mode = 'block'; life._steer(v, tp.x, tp.z, 0, dt, 99); } // (stands at his place, the weapon up, turned to him)
            else v.mode = 'run';
        } else { v.speed = 0; v.mode = 'idle'; }
        this._ground(v);
        return true;
    }

    _go(e, M, list, pos, ready) {
        const { cs, pid } = e, life = this.life, now = Date.now();
        M.phase = 'go';
        cs.hostile.set(pid, Math.max(cs.hostile.get(pid) || 0, now + MOB.FOE_S * 1000));
        let cried = 0;
        for (const m of list) {
            const v = m.v;
            if (v.dead) continue;
            v.foe = pid; v.grudge = { id: pid, until: now + 60000 }; v.path = null; v.fleeT = 0; v.aud = null; v.chaseT = 0;
            if (cried < 3 && Math.random() < 0.6) { cried++; life._say(v, pick(SHOUT.go), 3); }
        }
        life.alog?.note(`толпа «${cs.def.name || cs.def.id}» нападает вместе: ${list.length} человек (на месте ${ready}), наглость ${valueOf(e.rec).toFixed(0)}, игрок ${String(pid).slice(0, 8)}`);
        if (!this.game.hud?.notify) return;
        if (pid === this.game.localId) this.game.hud.notify('😡 Жители собрались и идут на вас всей толпой');
    }

    _dropMob(v) {
        v.aud = null; v.mob = false;
        this._unarm(v);
    }

    /** The crowd is over (calm / gone / the place asleep): the weapons down, the foe forgotten, back to work. */
    _disband(e, why) {
        const M = this.mobs.get(e.k);
        if (!M) return;
        const { pid } = e;
        let n = 0;
        for (const m of M.members.values()) {
            const v = m.v;
            n++;
            v.mob = false;
            if (v.aud?.mode === 'muster') v.aud = null;
            if (!v.dead) {
                if (v.foe === pid && v.role !== 'knight') { v.foe = null; v.grudge = null; v.path = null; v.chaseT = 0; }
                this._unarm(v);
                v.mode = 'idle'; v.speed = 0;
                if (v.job === 'wander') { v.waitT = 0; v.trips = Math.max(v.trips || 0, 1); this.life._nextTrip(v); }
            }
        }
        this.mobs.delete(e.k);
        this.life.alog?.note(`толпа «${e.cs.def.name || e.cs.def.id}» разошлась: ${why}; было ${n}`);
    }

    /** Calm: the runaways may come back (each decides by himself in `step` — `mayReturn`); nothing to push here. */
    _calmDown(e) {
        if (!e.exo.size) return;
        for (const id of [...e.exo]) { const v = this.life.byId.get(id); if (!v || !v.aud) e.exo.delete(id); }
    }

    /** The place with the person: is he in a crowd / running? */
    busy(v) { return !!v.aud || !!v.mob; }

    /** Plain numbers for a journal line / a test. */
    info(cs, pid) { const e = this._entry(cs, pid); return e ? { v: valueOf(e.rec), phase: e.rec.phase, exo: e.exo.size, mob: this.mobs.get(e.k)?.members.size || 0 } : { v: 0, phase: 'calm', exo: 0, mob: 0 }; }
}

const KIND_WORD = { hurt: 'удар по жителю', slay: 'убийство', rob: 'грабёж', arson: 'поджог', wreck: 'разрушение' };
const DEEDS_BASE = { hurt: 6, slay: 35, rob: 25, arson: 28, wreck: 0 };
const WEAPON_RU = { pitchfork: 'вилы', hoe: 'мотыгу', hammer: 'молот', knife: 'кухонный нож', none: 'кулаки' };
