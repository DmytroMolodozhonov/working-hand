/**
 * CourtLife.js — the game side of Court.js: the king's treasury and the people's troubles, and the vizier.
 *
 * The vizier (the advisor) knows the treasury and the open troubles. When the king (the castle's owner) is near and has not been
 * told for a while, HE comes to the king and reports (brief: how many, the most urgent one or two) — the king may ask for more,
 * ask for the list, the treasury, the people's mood, be led to the man («веди к нему»: the vizier walks there, the man tells his
 * trouble himself), and answer it by a word: money, supplies, work, guards, a feast, a lower tax, a healer, a word, a judgement.
 * Solving moves the treasury, the mood of the town and the man's bars (дружба, подчинение): a king who looks after his people is
 * loved; one who leaves them with it is not.
 * The state `st.court` rides with the castle's state (RelationsLife.pack/unpack). The host ticks and decides; a guest-king's words
 * become orders ('cmd' id 'court') the host carries out.
 */

import {
    COURT, PROBLEMS, newCourt, tick, solve, autoSolve, parseCourt, currentProblem, briefLine, listLine, detailLine, treasuryLine, moodLine,
    complaint, thanks, neglect, costOf, money, WAYS, amountOf,
} from './Court.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const NEAR_REPORT = 22; // m: the vizier reports to a king this near
const MET = 4.5; // m: the vizier has come

export class CourtLife {
    constructor(life) {
        this.life = life;
        this._t = 2;
        this.walk = new Map(); // castle id → {adv, since} the vizier coming to report
        this.led = new Map(); // castle id → {adv, problem, since, said}
    }

    get game() { return this.life.game; }
    get auth() { return this.life.auth; }

    /** The court of a castle I (or a guest) own; null when nobody is king there. */
    of(cs, create = false) {
        const st = this.life.state(cs.def.id);
        if (!st.owner) return null;
        if (!st.court && create) { st.court = newCourt(cs.def); this._dirty(cs); }
        return st.court || null;
    }

    _dirty(cs) { this.life.rel?.dirty.add(cs.def.id); }

    _vizier(cs) { for (const v of cs.active.values()) if (v.role === 'advisor' && !v.dead) return v; return null; }

    _people(cs) {
        const out = [];
        for (const v of cs.active.values()) if (!v.dead && !v.sleep && v.role !== 'king' && v.role !== 'advisor') out.push({ idx: v.idx, id: v.id, name: v.name, role: v.role, wizard: !!v.wizard });
        return out;
    }

    // ------------------------------------------------------------------ the months (host)
    update(dt) {
        if (!this.auth || !this.life.enabled) return;
        this._t -= dt;
        if (this._t > 0) return;
        const step = 2 - this._t; this._t = 2;
        for (const cs of this.life.castles.values()) {
            if (!cs.awake) continue;
            const court = this.of(cs, true);
            if (!court) continue;
            const people = this._people(cs);
            const ev = tick(court, step, {
                population: Math.max(8, people.length * 3), knights: Math.max(1, people.filter((p) => p.role === 'knight').length), people,
                hasWizards: people.some((p) => p.wizard), hasMerchants: people.some((p) => p.role === 'merchant'),
                raids: this.game.isNight ? 1 : 0, hurt: 0,
            });
            if (ev.length) this._dirty(cs);
            for (const e of ev) if (e.kind === 'bankrupt') this._say(this._vizier(cs), 'Ваше Величество, казна пуста. Жалование платить нечем!');
            this._neglect(cs, court);
            this._initiative(cs, court);
            this._leadStep(cs, court);
        }
    }

    _neglect(cs, court) {
        court._neglectT = (court._neglectT || 0) + 2;
        if (court._neglectT < 240) return;
        court._neglectT = 0;
        for (const p of neglect(court)) {
            const v = cs.active.get(p.idx);
            const owner = this.life.state(cs.def.id).owner;
            if (v && !v.dead && owner) { this.life.rel.bump(v, owner, { f: -2, s: -1 }, { show: false }); }
        }
    }

    _say(v, text, sec = 7) {
        if (!v || !text) return;
        const talk = this.life.talk;
        if (talk?._sayReply) talk._sayReply(v, text, sec); else this.life._say(v, text, sec);
    }

    // ------------------------------------------------------------------ the vizier comes to report
    _initiative(cs, court) {
        const st = this.life.state(cs.def.id), owner = st.owner;
        const adv = this._vizier(cs);
        if (!adv || !owner || adv.foe || adv.cmd || adv.fear || adv.fleeT > 0) return;
        const kp = this.life._playerPos(owner);
        if (!kp) return;
        const w = this.walk.get(cs.def.id);
        const open = court.problems.filter((p) => !p.done && !p.told);
        if (w) {
            const d = Math.hypot(adv.x - kp.x, adv.z - kp.z);
            if (d <= MET + 1 || performance.now() - w.since > 40000) {
                this.walk.delete(cs.def.id);
                if (d <= MET + 3) this._report(cs, court, adv);
            }
            return;
        }
        const quiet = !this.life.talk?.inTalk?.() && !cs.hostile.size;
        const due = court.clock - (court.briefedAt > -1e8 ? court.briefedAt : -1e9) >= COURT.BRIEF_COOLDOWN;
        const near = Math.hypot(adv.x - kp.x, adv.z - kp.z) < NEAR_REPORT * 2 && this.life._inLand(cs.def, kp, 0);
        if (!quiet || !due || !near || !open.length) return;
        // he comes to the king, and reports when he is there
        court.briefedAt = court.clock;
        this.walk.set(cs.def.id, { since: performance.now() });
        this.life.cmds.run(adv, { id: 'come', pace: 'walk' }, owner);
    }

    _report(cs, court, adv) {
        const open = court.problems.filter((p) => !p.done).sort((a, b) => PROBLEMS[b.kind].sev - PROBLEMS[a.kind].sev || a.at - b.at);
        for (const p of open.slice(0, 2)) p.told = true;
        court.topic = open[0]?.id ?? null;
        court.talkUntil = court.clock + 40;
        this._dirty(cs);
        this._say(adv, briefLine(court), 9);
    }

    // ------------------------------------------------------------------ the king's words to the vizier (the one who talks)
    /** → true when the words were about the court and were answered. `v` the vizier (or the man with a trouble). */
    hear(v, text, info = {}) {
        const cs = v.cs;
        const g = this.game, st = this.life.state(cs.def.id);
        if (st.owner !== g.localId) return false;
        const court = this.of(cs, false);
        if (!court) return false;
        if (v.role !== 'advisor') return this.hearPerson(v, text, court);
        const k = parseCourt(text);
        if (!k) return false;
        const chatting = court.clock < (court.talkUntil || 0);
        // (the short words — «подробнее», «да», «дальше» — are for the vizier only while he is telling)
        if (['details', 'next', 'later'].includes(k.kind) && !chatting) return false;
        this.life.talk.commands?._begin?.(v, text, info);
        court.talkUntil = court.clock + 40;
        const say = (line) => this._say(v, line, 10);
        switch (k.kind) {
            case 'problems': {
                const open = court.problems.filter((p) => !p.done);
                for (const p of open) p.told = true;
                court.topic = (currentProblem(court) || {}).id ?? null;
                say(open.length ? `${listLine(court)} Расскажу подробнее?` : listLine(court));
                break;
            }
            case 'treasury': say(treasuryLine(court)); break;
            case 'mood': say(moodLine(court)); break;
            case 'details': { const p = currentProblem(court); say(p ? detailLine(court, p, this._knights(cs)) : 'Всё спокойно, Ваше Величество.'); break; }
            case 'next': {
                const open = court.problems.filter((p) => !p.done);
                const i = open.findIndex((p) => p.id === court.topic);
                const p = open[(i + 1) % Math.max(1, open.length)];
                court.topic = p?.id ?? null;
                say(p ? detailLine(court, p, this._knights(cs)) : 'Больше дел нет, Ваше Величество.');
                break;
            }
            case 'later': say(pick(['Как скажете. Дело подождёт.', 'Хорошо, Ваше Величество. Вернёмся к этому позже.'])); break;
            case 'lead': this._lead(cs, court, v, say); break;
            case 'auto': {
                const p = currentProblem(court);
                if (!p) { say('Решать нечего, Ваше Величество.'); break; }
                const r = this.auth ? autoSolve(court, p, this._knights(cs)) : { ok: false, line: 'Это должен решить хозяин замка сам — я передам.' };
                if (!r.ok) { say(r.line); break; }
                this._after(cs, court, p, r, say, 'auto');
                break;
            }
            case 'solve': {
                const p = currentProblem(court);
                if (!p) { say('Сейчас нечего решать, Ваше Величество. Жалоб нет.'); break; }
                this._solveFor(cs, court, p, k.way, k.amount, say);
                break;
            }
            default: return false;
        }
        this._dirty(cs);
        return true;
    }

    _knights(cs) { let n = 0; for (const v of cs.active.values()) if (v.role === 'knight' && !v.dead) n++; return Math.max(1, n); }

    /** The king answers this trouble in this way (here, on the host, or sent to it). */
    _solveFor(cs, court, p, way, amount, say) {
        const knights = this._knights(cs);
        const owner = this.game.localId;
        if (this.auth) {
            const r = solve(court, p, way, { amount, knights });
            if (!r.ok) { say(r.line); return; }
            this._after(cs, court, p, r, say, way);
        } else {
            // a guest-king: the host does it; here only the vizier's word
            const r = solve(JSON.parse(JSON.stringify(court)), JSON.parse(JSON.stringify(p)), way, { amount, knights });
            if (!r.ok) { say(r.line); return; }
            const adv = this._vizier(cs);
            if (adv) this.life.orders.run(adv, 'cmd', { id: 'court', op: 'solve', pid: p.id, way, amount }, owner);
            say(this._doneLine(p, way, r));
        }
    }

    _doneLine(p, way, r) {
        const def = PROBLEMS[p.kind];
        const base = r.half ? 'Выделил, сколько сказали — это лишь часть, Ваше Величество.' : way === 'tax' ? 'Налог снижен. Народ вздохнёт.' : way === 'guard' ? 'Страже велено — патруль выйдет.' : way === 'feast' ? 'Накрываем столы! Будет пир.' : way === 'work' ? 'Работники посланы, дело сделают.' : way === 'healer' ? 'Лекарь уже в пути.' : way === 'word' ? 'Скажите людям слово — и я передам.' : way === 'judge' ? 'Суд назначен, Ваше Величество рассудит.' : way === 'auto' ? 'Разобрался сам, Ваше Величество.' : `Выделено ${money(r.spent)}. Передам.`;
        void def;
        return base;
    }

    /** After a solved trouble: the man's bars, the town, the show of it. */
    _after(cs, court, p, r, say, way) {
        const owner = this.life.state(cs.def.id).owner;
        const v = cs.active.get(p.idx);
        if (v && !v.dead && owner) this.life.rel.bump(v, owner, r.bonus, { show: false });
        // the town hears of it: a little warmer everywhere
        if (owner && !r.half) for (const w of cs.active.values()) if (!w.dead && w !== v) this.life.rel.bump(w, owner, { f: 0.4 }, { show: false });
        say(`${this._doneLine(p, way, r)} В казне осталось ${money(court.coins)}.`);
        this._effect(cs, p, way, r);
        // the man himself, if he is near, thanks the king
        if (v && !v.dead && owner) {
            const kp = this.life._playerPos(owner);
            if (kp && Math.hypot(v.x - kp.x, v.z - kp.z) < 14) setTimeout(() => { if (!v.dead) this.life._say(v, thanks(p, r.half), 5); }, 1400);
        }
        this._dirty(cs);
    }

    /** What is seen of it: the guards go, the people cheer at a feast, the builders walk to the house. */
    _effect(cs, p, way) {
        const v = cs.active.get(p.idx);
        const owner = this.life.state(cs.def.id).owner;
        if (way === 'guard') {
            const ks = [...cs.active.values()].filter((k) => k.role === 'knight' && !k.dead && !k.foe && !k.cmd).slice(0, 2);
            for (const k of ks) this.life.orders.run(k, 'cmd', { id: 'patrol' }, owner);
        } else if (way === 'feast') {
            const ps = [...cs.active.values()].filter((k) => !k.dead && k.role !== 'king' && !k.foe && !k.cmd).slice(0, 5);
            ps.forEach((k, i) => setTimeout(() => { if (!k.dead) { this.life.cmds.run(k, { id: 'laugh' }, owner); if (i < 2) this.life._say(k, pick(['Да здравствует король!', 'Ура!', 'Вот это пир!']), 3); } }, 500 + i * 400));
        } else if (way === 'work' && v) {
            const b = [...cs.active.values()].find((k) => k.role === 'builder' && !k.dead && !k.foe && !k.cmd && k !== v);
            if (b) this.life.cmds.run(b, { id: 'come', pace: 'walk', to: v.id }, owner);
        }
    }

    // ------------------------------------------------------------------ «веди к нему»
    _lead(cs, court, adv, say) {
        const p = currentProblem(court);
        if (!p) { say('Некого показать, Ваше Величество: жалоб нет.'); return; }
        const v = cs.active.get(p.idx);
        if (!v || v.dead) { say('Сейчас его не найти. Спросим позже.'); return; }
        court.topic = p.id;
        say(pick(['Следуйте за мной, Ваше Величество.', 'Пойдёмте, я провожу вас.', 'Он здесь неподалёку. Идёмте.']));
        const owner = this.life.state(cs.def.id).owner;
        this.led.set(cs.def.id, { adv: adv.id, pid: p.id, since: performance.now(), said: false });
        this.life.orders.run(adv, 'cmd', { id: 'go_to_person', to: v.id }, owner);
    }

    _leadStep(cs, court) {
        const L = this.led.get(cs.def.id);
        if (!L) return;
        const adv = this.life.byId.get(L.adv), p = court.problems.find((x) => x.id === L.pid), v = p && cs.active.get(p.idx);
        const owner = this.life.state(cs.def.id).owner, kp = owner && this.life._playerPos(owner);
        if (!adv || adv.dead || !p || p.done || !v || v.dead || !kp || performance.now() - L.since > 90000) { this.led.delete(cs.def.id); return; }
        const dv = Math.hypot(adv.x - v.x, adv.z - v.z), dk = Math.hypot(kp.x - v.x, kp.z - v.z);
        if (dv < 5 && !L.said) {
            L.said = true;
            this._say(adv, pick(['Вот он, Ваше Величество.', 'Мы пришли. Он сам вам расскажет.']), 4);
        }
        if (L.said && dk < 7) {
            this.led.delete(cs.def.id);
            p.told = true; court.talkUntil = court.clock + 40; court.topic = p.id;
            v.yaw = Math.atan2(-(kp.x - v.x), -(kp.z - v.z));
            this.life._say(v, complaint(p), 8);
            this._dirty(cs);
        }
    }

    // ------------------------------------------------------------------ the man with a trouble
    /** The king speaks to a man who has a trouble: the greeting brings it out; a word of help from the king answers it. */
    hearPerson(v, text, court) {
        const cs = v.cs;
        const p = court.problems.find((x) => x.idx === v.idx && !x.done);
        if (!p) return false;
        const k = parseCourt(text);
        if (k?.kind === 'solve') {
            court.topic = p.id;
            this.life.talk.commands?._begin?.(v, text, {});
            this._solveFor(cs, court, p, k.way, k.amount, (line) => this.life.talk._sayReply(v, line, 8));
            return true;
        }
        return false;
    }

    /** (CastleTalk._apply) A greeting to a man with a trouble: he tells it. */
    onGreet(v, res) {
        const cs = v.cs;
        const court = this.of(cs, false);
        if (!court || this.life.state(cs.def.id).owner !== this.game.localId) return null;
        const p = court.problems.find((x) => x.idx === v.idx && !x.done && !x.complained);
        if (!p || !['greet', 'how_are_you', 'job', 'help', 'bow'].includes(res?.intent)) return null;
        p.complained = true; p.told = true; court.topic = p.id; court.talkUntil = court.clock + 40;
        this._dirty(cs);
        return complaint(p);
    }

    /** For the net: his trouble and the vizier's knowledge, in words. */
    contextFor(v) {
        const cs = v.cs;
        const court = this.of(cs, false);
        if (!court || this.life.state(cs.def.id).owner !== this.game.localId) return '';
        if (v.role === 'advisor') return `${treasuryLine(court)} ${moodLine(court)} Открытых дел: ${court.problems.filter((p) => !p.done).length}.`;
        const p = court.problems.find((x) => x.idx === v.idx && !x.done);
        return p ? `У тебя беда: ${PROBLEMS[p.kind].title}. Расскажи о ней королю, если он заговорит об этом; сам ничего не требуй.` : '';
    }

    // ------------------------------------------------------------------ the host does what a guest-king said
    hostOp(adv, a, by) {
        const cs = adv.cs, st = this.life.state(cs.def.id);
        if (!this.auth || st.owner !== by) return false;
        const court = this.of(cs, true);
        if (a.op === 'solve') {
            const p = court.problems.find((x) => x.id === a.pid && !x.done);
            if (!p) return false;
            const r = solve(court, p, a.way, { amount: a.amount, knights: this._knights(cs) });
            if (r.ok) this._after(cs, court, p, r, () => {}, a.way);
            return r.ok;
        }
        return false;
    }
}
