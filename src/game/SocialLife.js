/**
 * SocialLife.js — people as people (Lives.js is the pure side): each has a goal of his own; the hero may call a friend on the road;
 * a friend or a lover stands up for the hero when he is attacked, of his own will; a man watches a spell and praises or sneers; and he
 * may tire of a friendship. Humanoids all: townsfolk, knights, wizards, the king's men, sailors (anyone with `entry.seed`).
 * The host decides (companions, defence, burnout); the one who talks answers in words (CommandTalk).
 */

import {
    goalOf, goalLine, heroThemes, roadTogether, ROAD_LINES, mayAsk, ASK_LINES, ASKS, reactToMagic, MAGIC_LINES, burnoutChance, BURNOUT_LINES,
    LEAVE_LINES, GOODBYE_LINES, defendDesire, DEFEND_AT, reproach, THEMES,
} from './Lives.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const SCAN = 0.8;
const BIG_SPELL = /(Maxima|Avada|Inferno|Bombardo|Hellfire|Lightning|Thunderwave|Circle|Earthquake|Total|Dragon|Meteor|Create|Planet|Flying)/i;
const spellPower = (name) => (BIG_SPELL.test(String(name)) ? 0.85 : /(Lumos|Nox|Stand|Up|Accio|Wind|Water|Fire)/i.test(String(name)) ? 0.35 : 0.5);

export class SocialLife {
    constructor(life) {
        this.life = life;
        this.heroGoal = null; // {text, themes} — what the hero said his goal is
        this._scanT = 1;
        this._burnT = 60;
        this.state = new Map(); // person id → {lastTalk, grievances, noFriendUntil, reactAt, commentAt}
    }

    get game() { return this.life.game; }
    get auth() { return this.life.auth; }
    get rel() { return this.life.rel; }

    _s(v) {
        let s = this.state.get(v.id);
        if (!s) { if (this.state.size > 600) this.state.clear(); s = { lastTalk: performance.now(), grievances: 0, noFriendUntil: 0, reactAt: 0, commentAt: performance.now() + 120000 }; this.state.set(v.id, s); }
        return s;
    }

    character(v) { return this.life.talk?.brain?.(v)?.character || {}; }
    mood(v) { return this.life.talk?.brain?.(v)?.mood || 0; }
    goal(v) { return v.goal || (v.goal = goalOf(v.entry?.seed ?? 0, v.role, !!v.wizard)); }
    wizardish(v) { return !!v.wizard || v.role === 'wizard'; }

    /** (CastleTalk / Sailors) The hero talked to him: he is not neglected. */
    touched(v) { this._s(v).lastTalk = performance.now(); }

    // ------------------------------------------------------------------ the talk (the one who talks answers)
    askGoal(v) { return goalLine(this.goal(v)); }

    /** «Моя цель — …»: the hero names it. → the person's remark. */
    heroSays(v, text) {
        const t = String(text || '').replace(/^.*?(моя цель|мой план|моя мечта|моя задача|я иду|я отправляюсь|я собираюсь|я хочу)\s*[—:-]?\s*(это\s+)?/i, '');
        const themes = heroThemes(t);
        this.heroGoal = { text: t.trim(), themes };
        const g = this.goal(v);
        const eff = this.rel.eff(v);
        if (!themes.length) return pick(['Любопытно… расскажи подробнее.', 'Хм. Не совсем понял, но звучит серьёзно.']);
        const fitness = themes.includes(g.theme) ? 1 : 0;
        if (fitness) return pick(['О! Это как раз близко мне. У меня самого цель похожая.', 'Достойная цель. Мне такая по душе.']);
        return eff.fr >= 20 ? pick(['Достойная цель. Удачи тебе.', 'Не моё, но я тебя уважаю за это.']) : pick(['Хм. Дело твоё.', 'Звучит громко. Посмотрим, получится ли.']);
    }

    /** «Пойдём со мной»: → {answer, line, minutes} (the host will then make him a companion). */
    invite(v) {
        const eff = this.rel.eff(v);
        const s = this._s(v);
        if (v.companion) return { answer: 'already', line: 'Я и так иду с тобой.' };
        if (performance.now() < s.noFriendUntil) return { answer: 'refuse', line: pick(ROAD_LINES.bond) };
        if (v.role === 'king' || v.job === 'king') return { answer: 'refuse', line: 'Король не покидает свой трон.' };
        const r = roadTogether(eff, this.character(v), this.goal(v), this.heroGoal?.themes || [], { role: v.role, king: this.life.rankOf(v.cs, this.game.localId) >= 9 });
        const pool = r.answer === 'join' ? (r.why === 'shared' ? ROAD_LINES.shared : ROAD_LINES.join) : r.answer === 'help' ? ROAD_LINES.help : r.answer === 'later' ? ROAD_LINES[r.why === 'home' ? 'home' : 'later'] : ROAD_LINES[r.why] || ROAD_LINES.bond;
        return { ...r, line: pick(pool) };
    }

    /** «Дай денег / войти в дом / палочку»: → {yes, line, give?}. */
    ask(v, what) {
        const eff = this.rel.eff(v);
        const r = mayAsk(what, eff, this.character(v), v.role, this.wizardish(v));
        const L = ASK_LINES[what] || ASK_LINES.enter;
        const out = { yes: r.yes, by: r.by, line: pick(r.yes ? L.yes : L.no) };
        const s = this._s(v);
        if (r.yes && (what === 'loan' || what === 'purse')) {
            if (performance.now() - (s.lentAt || -1e9) < 600000) return { yes: false, line: 'Я же недавно давал. Подожди немного.' };
            s.lentAt = performance.now();
            out.give = what === 'loan' ? 15 + Math.floor(Math.random() * 30) : 90 + Math.floor(Math.random() * 110);
        }
        void ASKS;
        return out;
    }

    // ------------------------------------------------------------------ the host: companions
    hostInvite(v, by, args = {}) {
        if (!this.auth || !v || v.dead) return;
        const r = this.invite(v);
        if (r.answer !== 'join' && r.answer !== 'help') return;
        v.companion = { pid: by, since: performance.now(), until: r.answer === 'help' ? performance.now() + (r.minutes || 10) * 60000 : null, goal: this.goal(v), help: r.answer === 'help' };
        v.follow = by; v.followFar = true; v.followT = 1e6; v.guard = true; v.path = null; v.order = null; v.cmd = null; v.foe = null; v.investigate = null;
        void args;
    }

    hostRelease(v, why = 'asked') {
        if (!v.companion) return;
        const pid = v.companion.pid;
        v.companion = null;
        this.life.orders._release(v);
        v.guard = null;
        if (why === 'left') this.life._say(v, pick(LEAVE_LINES), 4);
        else if (why === 'asked') this.life._say(v, pick(GOODBYE_LINES), 3);
        void pid;
    }

    // ------------------------------------------------------------------ magic seen
    /** (RelationsLife.sawCast) A spell by the hero: those who see it may react. */
    onSpell(name, me) {
        const power = spellPower(name);
        const now = performance.now();
        for (const cs of this.life.castles.values()) {
            if (!cs.awake) continue;
            for (const v of cs.active.values()) {
                if (v.dead || v.sleep || v.foe || Math.hypot(v.x - me.x, v.z - me.z) > 26 || !this.life._sees(v, { x: me.x, y: me.y, z: me.z })) continue;
                const s = this._s(v);
                const asked = v.watch && v.watch > now; // «смотри, что я делаю»
                const eff = this.rel.eff(v);
                if (!asked && (now - s.reactAt < 90000 || (eff.fr < 15 && eff.lv < 15) || Math.random() > 0.3)) continue;
                s.reactAt = now;
                v.watch = 0;
                const r = reactToMagic(power, eff, this.character(v), this.mood(v), Math.random(), { wizard: this.wizardish(v) });
                v.yaw = Math.atan2(-(me.x - v.x), -(me.z - v.z)); // (he looks that way)
                v.talking = Math.max(v.talking || 0, 2.5); v.talkTo = this.game.localId;
                this.life._say(v, pick(MAGIC_LINES[r.kind]), 3);
                if (r.f) this.rel.bump(v, this.game.localId, { f: r.f });
            }
        }
    }

    /** «Смотри, что я делаю»: he turns and watches for a few seconds. */
    watch(v) {
        v.watch = performance.now() + 9000;
        const me = this.game.character.group.position;
        v.yaw = Math.atan2(-(me.x - v.x), -(me.z - v.z));
    }

    // ------------------------------------------------------------------ the host: every moment
    update(dt) {
        if (!this.auth || !this.life.enabled) return;
        this._scanT -= dt;
        if (this._scanT <= 0) { this._scanT = SCAN; this._defend(); this._companions(); }
        this._burnT -= dt;
        if (this._burnT <= 0) { this._burnT = 60; this._burnout(); }
    }

    _pids() { return (this.life._players?.() || []).map((q) => ({ id: q.id, p: q.p })); }

    /** A friend steps in: while something is at the hero, those who love / owe / follow him and are brave enough join the guard. */
    _defend() {
        const g = this.game, now = performance.now();
        for (const pl of this._pids()) {
            for (const cs of this.life.castles.values()) {
                if (!cs.awake) continue;
                if (Math.hypot(pl.p.x - cs.def.x, pl.p.z - cs.def.z) > 260) continue;
                let T = null;
                for (const v of cs.active.values()) {
                    if (v.dead || v.role === 'king' || !this.life._fights(v) || v.foe || v.fear || v.fleeT > 0 || v.sleep || v.stunT > 0 || v.arena) continue;
                    if (v.gOwner != null && v.gOwner !== pl.id) continue;
                    if (Math.hypot(v.x - pl.p.x, v.z - pl.p.z) > 45) continue;
                    const eff = this.rel.eff(v, pl.id);
                    const want = defendDesire(eff, this.character(v), { companion: v.companion?.pid === pl.id, king: this.life.rankOf(cs, pl.id) >= 9 });
                    if (want < DEFEND_AT) continue;
                    if (T == null) T = this.life.guard.threats(pl.id, pl.p, !!g.isNight).filter((t) => t.hits);
                    if (!T.length) break;
                    if (v.gOwner !== pl.id) this.life._say(v, pick(['Держись! Я с тобой!', 'Я помогу!', 'Не тронь его!', 'Назад! Он под моей защитой!']), 3);
                    v.gOwner = pl.id; v.gHelp = now + 8000;
                }
            }
        }
    }

    _companions() {
        const now = performance.now();
        for (const cs of this.life.castles.values()) {
            for (const v of cs.active.values()) {
                const c = v.companion;
                if (!c || v.dead) continue;
                const eff = this.rel.eff(v, c.pid);
                if (eff.fr < 4 && eff.lv < 4) { this.hostRelease(v, 'left'); continue; }
                if (c.until && now > c.until) { this.hostRelease(v, 'left'); continue; }
                if (now > (this._s(v).commentAt || 0)) {
                    this._s(v).commentAt = now + 180000 + Math.random() * 180000;
                    const near = this.life._playerPos(c.pid);
                    if (near && Math.hypot(near.x - v.x, near.z - v.z) < 12 && !this.life.talk?.inTalk?.()) this.life._say(v, `Знаешь, моя цель — ${c.goal.text}.`, 4);
                }
                v.followT = Math.max(v.followT || 0, 1e5);
            }
        }
    }

    /** Tired of the friendship: now and then a friend who is forgotten or wronged breaks it off, and means it. */
    _burnout() {
        const now = performance.now(), pid = this.game.localId;
        for (const cs of this.life.castles.values()) {
            if (!cs.awake) continue;
            for (const v of cs.active.values()) {
                if (v.dead) continue;
                const eff = this.rel.eff(v, pid);
                if (eff.fr < 8) continue;
                const s = this._s(v);
                const p = burnoutChance(eff, this.character(v), { minutesSinceTalk: (now - s.lastTalk) / 60000, grievances: s.grievances });
                if (p > 0 && Math.random() < p) this._breakOff(v, pid);
                else s.grievances = Math.max(0, s.grievances - 0.3);
            }
        }
    }

    _breakOff(v, pid) {
        const s = this._s(v);
        this.life._say(v, pick(BURNOUT_LINES), 5);
        const eff = this.rel.eff(v, pid);
        this.rel.bump(v, pid, { f: -eff.fr - 3, l: -Math.min(eff.lv, 25) });
        s.noFriendUntil = performance.now() + 15 * 60000;
        s.grievances = 0;
        if (v.companion) this.hostRelease(v, 'none');
    }

    /** A friend saw the hero strike someone: he asks why (or cheers: the victim was an enemy). Called from RelationsLife.onHit. */
    witnessedBlow(w, victim, by, killed) {
        const pid = this.game.localId;
        if (by !== pid || w === victim) return;
        const justified = victim.foe === by; // (he was at me: the friend cheers)
        const s = this._s(w);
        if (performance.now() - (s.scoldAt || -1e9) < 45000) return;
        const eff = this.rel.eff(w, pid);
        const r = reproach(eff, this.character(w), { justified, roll: Math.random() });
        if (!r) return;
        s.scoldAt = performance.now();
        w.yaw = Math.atan2(-(victim.x - w.x), -(victim.z - w.z));
        this.life._say(w, r.line, 4);
        if (r.f) this.rel.bump(w, pid, { f: r.f });
        if (r.f < 0) s.grievances += killed ? 2 : 1;
        void THEMES;
    }
}
