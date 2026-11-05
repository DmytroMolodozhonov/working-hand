/**
 * HomeDefenceLife.js — игровая часть «страх → свой дом → заперся → обороняется» (правила и числа — HomeDefence.js). Хост ведёт, гости видят
 * позы, оружие в руках (биты `fx`, как у толпы — Audacity.withTool) и закрытую дверь (`dlk`).
 *
 * Вход: VillagerFear доводит испуганного до дома по путям места (`shelter`, скорость бега) и вызывает `arrive`. Дальше человек — в
 * состоянии `v.hd` (VillagerFear.step передаёт ему ход, CastleLife._fight держит его на привязи у дома).
 *
 * Что может пойти не так (учтено):
 *  - дверь ещё открыта / домашние ещё бегут → ждёт до BAR_WAIT, запирает, только когда дверь закрылась; не закрылась — не запирает;
 *  - свой, подбежавший к запертой двери (KNOCK_R), — ему отпирают и снова запирают;
 *  - Алохомора / выломали дверь → засов снят (Alohomora.apply 'door'), дверь пропала — тот же вход, защитники бьют;
 *  - дом загорелся / обвалился → засов снят, бежит дальше (VillagerFear: `bad`, соседний дом / из деревни);
 *  - ночь → после спокойствия не выходит, а ложится (NightLife); сон/Левиоса/хват монстра/смерть → `release` (засов снят, оружие убрано);
 *  - сделка / разговор → дом занят человеком только когда он уже испуган (VillagerFear._fearful: не в сделке);
 *  - ребёнок, старик, раненый, робкий — в укромное место (поза «сжался», руки над головой — только стоя на месте), не бьют;
 *  - не больше 3 на одного врага; бьют внутри дома, дальше LEASH от дома не гонятся;
 *  - друг короля / хозяин места — дом от него не защищают и не запирают (privileged); дуэльный режим / арена — не пугаются (peace);
 *  - сундук пуст / оружие взял другой — своё, потом кулаки; сундук в другой комнате — пропускает (ARM_REACH, ARM_GIVE_UP);
 *  - хост ушёл / место уснуло — `Houses._deactivate` снимает засов; сохранение не хранит засов (в загруженной игре все двери по-старому).
 */

import { HOME, HOME_WEAPONS, WALK_SPEED, RUN_SPEED, defenderClass, chestWeapon, armsFor, postSpot, hideSpot, intruderIn, leashed, doorAxis, mayComeOut } from './HomeDefence.js';
import { withTool } from './Audacity.js';
import { calmNeeded } from './Danger.js';
import { isForgiven } from './Ranks.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const WALK = WALK_SPEED, RUN = RUN_SPEED;

const SAY = {
    bar: ['Запирай, запирай!', 'Засов, скорее!', 'Не пустим!'],
    arm: ['Где мой топор...', 'Что-нибудь тяжёлое!', 'Сейчас я им...'],
    fight: ['Вон из моего дома!', 'Не дам!', 'Убирайся!'],
    peek: ['Тихо вроде...', 'Ушли?'],
    child: ['Мама...', 'Страшно...'],
};

export class HomeDefence {
    constructor(life) {
        this.life = life;
        this.game = life.game;
        this.taken = new Set(); // сундуки, из которых уже взяли (один раз на сундук)
        this.stats = { total: 0, idle: 0, armed: 0, fists: 0, fought: 0, barred: 0, out: 0 };
        this._t = 0;
        this._sweepT = 0;
        this._idleLogAt = -1e9;
    }

    get auth() { return this.game.authority; }
    get locks() { return this.game.locks; }

    // ------------------------------------------------------------------ входы
    /** (VillagerFear) человек добежал до дома `F.house`. → true: дальше ведёт он (`v.hd`). */
    arrive(v, F) {
        if (!this.auth || !this.life.enabled) return false;
        const h = v.cs.def.houses?.[F.house];
        if (!h?.inside || !h.door) return false;
        if (this.life.game.arenaDuels?.peace?.()) return false;
        const p = this.life.aud._traits(v);
        const cls = defenderClass(p);
        const rec = this.game.houses?.active.get(h.id) || null;
        const mates = this._occupants(v.cs, F.house);
        const hd = v.hd = { house: F.house, h, rec, st: 'bar', t: 0, k: mates.length, p, fighter: cls.fights, why: cls.why, by: F.danger?.by ?? null, spot: null, tool: null, from: null, chest: null, barred: false, said: false, calmT: 0, outAt: 0, peekT: 0 };
        v.path = null; v.speed = 0;
        F.state = 'home';
        this.stats.total++;
        this.life.alog?.decision(v, `${this._who(v)} добежал до ${F.house === v.entry?.home ? 'своего' : 'чужого'} дома — ${cls.fights ? 'будет защищать' : cls.why}; ждёт, пока закроется дверь`);
        if (hd.fighter && Math.random() < 0.5) this.life._say(v, pick(SAY.bar), 3);
        return true;
    }

    _who(v) { return `${v.title || v.role}${v.entry?.trade ? '/' + v.entry.trade : ''} ${v.name || ''}`.trim(); }

    _occupants(cs, house) {
        const out = [];
        for (const o of cs.active.values()) if (o.hd && o.hd.house === house && !o.dead) out.push(o);
        return out;
    }

    /** Свой/хозяин: дом от него не защищают. */
    _privileged(cs, pid) {
        const st = this.life.state(cs.def.id);
        return st.owner === pid || isForgiven(st.ranks, pid);
    }

    /** Игроки, на которых дом защищает: тот, от кого бежали; враги места; кто нагл (страх/толпа). */
    _threats(v, hd) {
        const cs = v.cs, now = Date.now(), out = [];
        for (const pl of this.life._players()) {
            if (this._privileged(cs, pl.id)) continue;
            const hostile = (cs.hostile.get(pl.id) || 0) > now;
            const ph = this.life.aud.phase(cs, pl.id);
            if (hostile || hd.by === pl.id || ph === 'fear' || ph === 'mob') out.push(pl);
        }
        return out;
    }

    // ------------------------------------------------------------------ ход
    /** (VillagerFear.step) → true: ход этого кадра сделан. */
    step(v, dt) {
        const hd = v.hd;
        if (!hd) return false;
        const life = this.life, g = this.game, cs = v.cs;
        if (v.dead || v.sleep || v.lev || v.handLink || v.carriedBy) { this.release(v, 'вынесен из дела'); return false; }
        if (g.arenaDuels?.peace?.()) { this.release(v, 'дуэльный режим'); return false; }
        hd.t += dt;
        const h = hd.h, rec = hd.rec = g.houses?.active.get(h.id) || hd.rec;
        const F = v.fear;
        // дом горит / обвалился → дальше бежит (VillagerFear решит: сосед, рыцари, из деревни)
        hd.chkT = (hd.chkT || 0) - dt;
        if (hd.chkT <= 0) {
            hd.chkT = 1;
            const fr = life.fright;
            if (fr._burning(h) || fr._broken(h)) {
                life.alog?.decision(v, `${this._who(v)}: дом ${fr._burning(h) ? 'горит' : 'разрушен'} — отпер и бежит в другой`);
                this.unbar(v);
                const F2 = F || (v.fear = { state: 'run', level: 3, danger: { x: h.inside.x, z: h.inside.z, kind: 'fire', seen: new Map() }, lastT: fr.now, since: fr.now, bad: new Set(), t: 0 });
                F2.bad = F2.bad || new Set();
                F2.bad.add(hd.house);
                const here = fr.near(v.x, v.z, 80);
                v.hd = null; this._unarm(v);
                fr._decide(v, 2, F2.danger, here, true);
                return false;
            }
        }
        const door = this.doorPoint(h);
        const D = g.doors, dRec = rec?.doorId && D?.list.get(rec.doorId);
        if (hd.barred && rec?.doorId && !dRec) { hd.barred = false; this.locks?.barred.delete(rec.doorId); } // (выломали: двери нет)
        if (hd.barred && this.locks?.picked.has(rec?.doorId)) { hd.barred = false; this.locks.barred.delete(rec.doorId); life.alog?.decision(v, `${this._who(v)}: дверь отперли (Алохомора) — готов к бою`); }
        // враг в доме / у открытой двери: бьёт
        if (hd.st !== 'fight') {
            const threats = this._threats(v, hd);
            hd.threatD = Infinity;
            const doorOpen = !dRec || Math.abs(dRec.a) > 0.25;
            for (const pl of threats) {
                hd.threatD = Math.min(hd.threatD, Math.hypot(pl.p.x - v.x, pl.p.z - v.z));
                if (intruderIn(h, pl.p, { doorOpen }) && this._canFight(v, hd, pl)) { this._engage(v, hd, pl); break; }
            }
        }
        switch (hd.st) {
            case 'bar': this._barStep(v, hd, dt, dRec, door); break;
            case 'arm': this._armStep(v, hd, dt); break;
            case 'post': case 'hide': this._holdStep(v, hd, dt, door); break;
            case 'fight': this._fightStep(v, hd, dt); break;
            case 'peek': this._peekStep(v, hd, dt, dRec); break;
            default: this.release(v, 'неизвестное состояние'); return false;
        }
        life._ground(v);
        return true;
    }

    doorPoint(h) {
        const { ax, az } = doorAxis(h);
        return { x: h.inside.x - ax * 1.2, z: h.inside.z - az * 1.2 };
    }

    _faceDoor(v, door, dt) { this.life._steer(v, door.x, door.z, 0, dt, 99); v.speed = 0; }

    _barStep(v, hd, dt, dRec, door) {
        const life = this.life;
        // встаёт у входа и ждёт, пока закроется дверь (Houses закрывает её сама через ~1,5 с, если проём свободен)
        const d = Math.hypot(hd.h.inside.x - v.x, hd.h.inside.z - v.z);
        if (d > 1.1) life._steer(v, hd.h.inside.x, hd.h.inside.z, WALK, dt, 0.5);
        else this._faceDoor(v, door, dt);
        v.mode = v.speed > 0 ? 'walk' : 'idle';
        const closed = !dRec || Math.abs(dRec.a) < HOME.DOOR_SHUT;
        const pending = this._pendingFamily(v, hd);
        if (closed && (pending === 0 || hd.t > HOME.BAR_WAIT)) {
            if (dRec) this._bar(v, hd);
            this._next(v, hd);
        } else if (hd.t > HOME.BAR_WAIT + 4) { life.alog?.decision(v, `${this._who(v)}: дверь не закрывается — не запирает, идёт дальше`); this._next(v, hd); }
    }

    /** Сколько домашних ещё бежит к этой двери (ждём их — не запираем перед носом). */
    _pendingFamily(v, hd) {
        let n = 0;
        for (const o of v.cs.active.values()) {
            if (o === v || o.dead || !o.fear || o.fear.state !== 'shelter' || o.fear.house !== hd.house) continue;
            if (Math.hypot(o.x - hd.h.door.x, o.z - hd.h.door.z) < HOME.KNOCK_R * 3) n++;
        }
        return n;
    }

    _bar(v, hd) {
        const id = hd.rec?.doorId;
        if (!id || !this.locks) return;
        let B = this.locks.barred.get(id);
        if (!B) { B = { def: v.cs.def, by: new Set() }; this.locks.barred.set(id, B); }
        B.by.add(v.id);
        hd.barred = true;
        this.stats.barred++;
        this.life.alog?.decision(v, `${this._who(v)} запер дверь изнутри`);
        this.game.sound?.playClang?.(0.15);
    }

    unbar(v) {
        const hd = v.hd;
        const id = hd?.rec?.doorId;
        if (!hd?.barred || !id) return;
        hd.barred = false;
        const B = this.locks?.barred.get(id);
        if (B) { B.by.delete(v.id); if (!B.by.size) this.locks.barred.delete(id); }
    }

    _next(v, hd) {
        hd.t = 0;
        if (hd.fighter) { hd.st = 'arm'; hd.armT = 0; hd.chest = this._pickChest(v, hd); if (Math.random() < 0.4) this.life._say(v, pick(SAY.arm), 3); }
        else { hd.st = 'hide'; hd.spot = this._valid(v, hideSpot(hd.h, hd.k), hd.h); if (hd.p.child && Math.random() < 0.5) this.life._say(v, pick(SAY.child), 3); }
    }

    /** Точка в доме, куда можно встать (иначе — вход). */
    _valid(v, s, h) {
        if (this.life._walkable(s.x, s.z, v.y)) return s;
        const mir = { x: 2 * h.inside.x - s.x, z: 2 * h.inside.z - s.z };
        return this.life._walkable(mir.x, mir.z, v.y) ? mir : { x: h.inside.x, z: h.inside.z };
    }

    _pickChest(v, hd) {
        const list = hd.rec?.chests;
        if (!list?.length) return null;
        let best = null, bd = HOME.ARM_REACH;
        for (const c of list) {
            if (this.taken.has(c.id) || c.isOpen) continue;
            const w = chestWeapon(c.id, c.house?.flavor || null, this.taken);
            if (!w) continue;
            const p = c.mesh.position;
            if (Math.abs(p.y - v.y) > 3) continue; // (в другом этаже)
            const d = Math.hypot(p.x - v.x, p.z - v.z);
            if (d < bd) { bd = d; best = { c, w, x: p.x, z: p.z }; }
        }
        return best;
    }

    _armStep(v, hd, dt) {
        const life = this.life;
        const ch = hd.chest;
        if (ch && !this.taken.has(ch.c.id) && hd.t < HOME.ARM_GIVE_UP) {
            const d = Math.hypot(ch.x - v.x, ch.z - v.z);
            if (d > 1.9 && !hd.rummage) { life._steer(v, ch.x, ch.z, WALK * 1.4, dt, 1.6); v.mode = v.speed > WALK * 1.2 ? 'run' : v.speed > 0 ? 'walk' : 'idle'; return; }
            hd.rummage = (hd.rummage || 0) + dt;
            life._steer(v, ch.x, ch.z, 0, dt, 99); v.speed = 0; v.mode = 'work';
            if (hd.rummage < HOME.ARM_T) return;
            this.taken.add(ch.c.id);
            this._equip(v, hd, ch.w);
        } else this._equip(v, hd, null); // (нет сундука / взял другой / не дошёл: своё, потом кулаки)
        hd.st = 'post'; hd.t = 0; hd.spot = this._valid(v, postSpot(hd.h, hd.k), hd.h);
    }

    _equip(v, hd, fromChest) {
        const a = armsFor(hd.p, fromChest);
        if (v.mobTool0 === undefined) v.mobTool0 = v.model?.toolKind ?? 'none';
        life_dropBucket(this.life, v);
        v.model?.setHeldTool?.(a.tool);
        v.fx = withTool(v.fx, a.tool);
        v.mobDmg = a.dmg; v.mobWeapon = a.tool;
        hd.tool = a.tool; hd.from = a.from;
        if (a.tool === 'none') this.stats.fists++; else this.stats.armed++;
        this.life.alog?.decision(v, `${this._who(v)} взял ${HOME_WEAPONS[a.tool]?.ru || a.tool} (${a.from}) — занимает позицию у двери`);
    }

    _unarm(v) {
        if (v.mob || v.aud) return; // (оружие толпы — у толпы)
        this.life.aud._unarm(v);
    }

    _holdStep(v, hd, dt, door) {
        const life = this.life;
        const s = hd.spot || hd.h.inside;
        const d = Math.hypot(s.x - v.x, s.z - v.z);
        if (d > 0.5 && hd.t < 12) {
            life._steer(v, s.x, s.z, WALK * 1.2, dt, 0.35);
            v.mode = v.speed > WALK * 1.2 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
            if (v.speed === 0 && hd.t > 4 && !hd.stuckSaid) { hd.stuckSaid = true; this._idle(v, hd, 'место занято телами/мебелью — стоит там, где стоит'); }
        } else {
            this._faceDoor(v, door, dt);
            // боец: оружие наготове (поза «закрылся»); спрятавшийся: сжался, руки над головой (стоя на месте)
            v.mode = hd.st === 'post' ? 'block' : 'flee';
        }
        // выход: спокойно давно, никого рядом
        const F = v.fear;
        const calm = F ? life.fright.now - F.lastT : 99;
        hd.outChk = (hd.outChk || 0) - dt;
        if (hd.outChk > 0) return;
        hd.outChk = 1;
        const need = calmNeeded(v.brave ?? 0.5, v.elder);
        const threatD = this._nearestThreat(v);
        const night = !!this.game.isNight;
        if (night && calm > need.peek && threatD >= HOME.FAR_R) { this.release(v, 'ночь — ложится спать дома', false, true); return; }
        if (mayComeOut({ calm, need: need.out, threatD, night, now: 0 })) {
            hd.st = 'peek'; hd.t = 0; hd.peekT = 0;
            this.life.alog?.decision(v, `${this._who(v)}: тихо ${calm.toFixed(0)} с, рядом никого (≥ ${HOME.FAR_R} м) — выглядывает`);
            if (Math.random() < 0.4) this.life._say(v, pick(SAY.peek), 3);
        }
    }

    _nearestThreat(v) {
        let d = Infinity;
        for (const pl of this.life._players()) {
            if (this._privileged(v.cs, pl.id)) continue;
            const hostile = (v.cs.hostile.get(pl.id) || 0) > Date.now();
            const ph = this.life.aud.phase(v.cs, pl.id);
            if (hostile || ph === 'fear' || ph === 'mob' || v.hd?.by === pl.id) d = Math.min(d, Math.hypot(pl.p.x - v.x, pl.p.z - v.z));
        }
        return d;
    }

    _peekStep(v, hd, dt, dRec) {
        const life = this.life, h = hd.h;
        const { ax, az } = doorAxis(h);
        const at = { x: h.inside.x - ax * 0.4, z: h.inside.z - az * 0.4 };
        const d = Math.hypot(at.x - v.x, at.z - v.z);
        if (d > 0.7) { life._steer(v, at.x, at.z, WALK * 0.8, dt, 0.5); v.mode = v.speed > 0 ? 'walk' : 'idle'; return; }
        this._faceDoor(v, this.doorPoint(h), dt);
        v.mode = 'idle';
        hd.peekT += dt;
        // опять кто-то рядом — назад на пост
        if (this._nearestThreat(v) < HOME.FAR_R) { hd.st = hd.fighter ? 'post' : 'hide'; hd.t = 0; hd.outChk = 0; return; }
        if (hd.peekT >= HOME.PEEK_T + (hd.k * HOME.STAGGER)) this.release(v, 'опасность прошла — отпер и вышел', true);
    }

    // ------------------------------------------------------------------ бой
    _canFight(v, hd, pl) {
        if (!hd.fighter) return false;
        if (hd.st === 'bar' || hd.st === 'arm') return hd.t > 0; // (безоружный тоже бьёт: кулаки)
        // не больше FIGHT_MAX на одного врага
        let n = 0;
        for (const o of v.cs.active.values()) if (o !== v && o.foe === pl.id && o.hd) n++;
        return n < HOME.FIGHT_MAX;
    }

    _engage(v, hd, pl) {
        if (!hd.tool) this._equip(v, hd, null);
        hd.st = 'fight'; hd.t = 0; hd.foePid = pl.id;
        v.foe = pl.id; v.grudge = { id: pl.id, until: Date.now() + 60000 }; v.path = null; v.chaseT = 0; v.fleeT = 0;
        v.cs.hostile.set(pl.id, Math.max(v.cs.hostile.get(pl.id) || 0, Date.now() + 8000)); // (дерётся — _fight держит врага)
        this.stats.fought++;
        this.life.alog?.decision(v, `${this._who(v)}: враг вошёл в дом — бьёт (${HOME_WEAPONS[hd.tool]?.ru || hd.tool}), вместе с домашними`);
        if (Math.random() < 0.6) this.life._say(v, pick(SAY.fight), 3);
    }

    _fightStep(v, hd) {
        // CastleLife._think отдаёт бой в _fight, пока есть v.foe; здесь — только когда врага отпустили (ушёл/привязь)
        v.foe = null; v.grudge = null;
        hd.st = hd.fighter ? 'post' : 'hide'; hd.t = 0;
        this.life.alog?.decision(v, `${this._who(v)}: враг ушёл/упал — возвращается на пост`);
    }

    /** (CastleLife._fight) привязь: защитник не гонится дальше дома. → true: отпущен, ход кончен. */
    leash(v, fp) {
        const hd = v.hd;
        if (!hd) return false;
        if (!fp || leashed(hd.h, fp) || this._privileged(v.cs, v.foe)) {
            v.foe = null; v.grudge = null; v.path = null; v.chaseT = 0;
            hd.st = hd.fighter ? 'post' : 'hide'; hd.t = 0;
            return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ конец
    /** Человек вышел из дома / вынесен из дела: засов снят, оружие убрано, страх закончен. `walkOut`: сказать «Фух» и идти к делам. */
    release(v, why, said = false, night = false) {
        const hd = v.hd;
        if (!hd) return;
        this.unbar(v);
        v.hd = null;
        if (hd.foePid != null && v.foe === hd.foePid) { v.foe = null; v.grudge = null; v.path = null; }
        this._unarm(v);
        this.stats.out++;
        this.life.alog?.decision(v, `${this._who(v)}: ${why}`);
        if (v.fear) this.life.fright._end(v, said);
        else if (v.job === 'wander') { v.waitT = 0; this.life._nextTrip?.(v); }
        if (night && v.job === 'wander') { v.trips = 0; v.goingHome = true; } // (ночью — не к делам: домой, NightLife уложит)
    }

    /** Доля стоящих без дела (для журнала/стенда). */
    _idle(v, hd, why) {
        this.stats.idle++;
        if (this._t - this._idleLogAt < HOME.IDLE_LOG_GAP) return;
        this._idleLogAt = this._t;
        this.life.alog?.decision(v, `${this._who(v)} стоит в доме без дела: ${why}`);
    }

    // ------------------------------------------------------------------ по кадру
    update(dt) {
        this._t += dt;
        if (!this.locks?.barred.size) return;
        this._sweepT -= dt;
        if (this._sweepT > 0) return;
        this._sweepT = 1;
        // (засов держит только живой, не спящий, ещё находящийся в доме)
        for (const [id, B] of this.locks.barred) {
            for (const vid of [...B.by]) {
                const o = this.life.byId.get(vid);
                if (!o || o.dead || o.sleep || !o.hd || !o.hd.barred) B.by.delete(vid);
            }
            if (!B.by.size) this.locks.barred.delete(id);
        }
    }

    /** Есть ли у этого человека дом, куда можно бежать (для Audacity: «из деревни — только если дома нет»). */
    hasHome(v) {
        const hi = v.entry?.home;
        const h = hi != null ? v.cs?.def.houses?.[hi] : null;
        if (!h?.inside || h.homeNode == null) return false;
        const fr = this.life.fright;
        return !fr._burning(h) && !fr._broken(h);
    }
}

function life_dropBucket(life, v) { life.fright?._dropBucket?.(v); }

export { RUN, WALK };
