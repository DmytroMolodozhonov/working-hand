/**
 * FightLedger.js — the reward for a fight with a wizard: the BEAUTY of one's magic (the author 19.11, 20.11: «я хочу наградить красивую магию… если игрок одно заклинание
 * быстро использовал и всё, не вступил ни в дуэль, ничего — мало получит»). Pure numbers; Mana.fightWon pays by them.
 *
 *  • A separate account for EACH wizard (you may fight several at once): it opens when the fight begins — he casts at me, a beam clash, my spell hits him, the arena round.
 *  • My spells cast while an account is alive (the last 45 s of its fighting) are written in it: each NEW spell counts once (a repeat is nothing — no spam), its worth is
 *    how great it is (the first-success cells of Mana.FIRST_SPELL: a light — little, «Максима» and the great ones — much).
 *  • The prize, % of (the wizard's mana maximum − 30): 5 % for any honest fight, then
 *        + time        up to 16 %   (the seconds of real fighting; counted only while we are really fighting: near each other (NEAR_M) and something happened in the last GAP_S seconds — running away far to recover is not the fight's time (the author 20.11); 45 s is full)
 *        + variety     up to 20 %   (3,6 % for each point of worth of the different spells — what is not aimed at the foe (a stand-up, a light, an Accio) counts half: still the whole strength is spent on winning, the author 20.11 — ; the ones cast in the 6 s BEFORE the fight opened count too — the first spell flies before he answers)
 *        + clash time  4 % for every 5 s the beams really stood against each other, up to 20 %
 *        + beam clashes up to 36 %  (8 % for each clash I stood in + 4 % more for each I WON — the author 20.11: «дуэль лучами — вознаграждать в разы»)
 *        × 1,25 on all of that, if half of my spells (at least 2) were elemental magic (earth, water, fire, air — SpellElements.js)
 *        + underdog    up to 15 %   (the author 20.11: a bonus for being WEAKER — 8 % for each doubling of his strength over mine at the start of the fight: mana maximum + duel mastery)
 *        + crowd       5 % for EACH other opponent fought at the same time (the author 20.11: a wizard, an enchanted tree, anything that fights me — one has to be distracted), up to 20 %
 *        + allies      5 % once, if I called creatures to help in the fight (Alive, a snowman, the fire serpent, Imperius…: ALLY_SPELLS)
 *    the base + time + variety + clashes never give more than 60 %; with everything on top at most 85 %. The same for a kill and for a win with him alive. The «duel mastery» grows by the same share.
 *  • An UNFINISHED fight (the author 20.11: «убежал… NPC меня потерял — всё равно засчитывается, но вдвое меньше, без анимации»): an honest account of a wizard that has been quiet for ABANDON_S
 *    seconds (after at least ABANDON_MIN_ACTIVE_S of real fighting) is paid at ABANDON_K of the prize, quietly (Mana.fightAbandoned); a later win over him pays only the rest.
 *  • DISHONEST fights are not counted — always (the author): an NPC that never cast at me (a bomb in his sleep) gives nothing; the arena is the exception (the round is the fight).
 */
import { ELEMENT_SPELLS } from '../ui/SpellElements.js';

export const FIGHT = {
    MIN_PCT: 5, MAX_PCT: 60, TOTAL_MAX: 85,
    TIME_PCT: 16, TIME_FULL_S: 45, GAP_S: 15, WINDOW_S: 45, NEAR_M: 50,
    VARIETY_PER_W: 3.6, VARIETY_MAX: 20, PRE_S: 6, SUPPORT_K: 0.5,
    ALLY_PCT: 5,
    CLASH_SEC_EACH: 5, CLASH_SEC_PCT: 4, CLASH_SEC_MAX: 20, // every 5 s of a beam clash itself: +4 %, up to +20 % (the author 20.11)
    CLASH_EACH: 8, CLASH_WON: 4, CLASH_MAX: 36, // a beam clash is the boldest fight: several times the old 2 % (the author 20.11: «в разы»)
    ELEMENT_MULT: 1.25, ELEMENT_SHARE: 0.5, ELEMENT_MIN_CASTS: 2,
    CROWD_EACH: 5, CROWD_MAX: 20,
    UNDERDOG_FROM: 1.25, UNDERDOG_K: 8, UNDERDOG_MAX: 15,
    MASTERY_BASE: 2, MASTERY_PER_PCT: 0.25, MASTERY_FOE_SHARE: 0.2,
    ABANDON_S: 45, ABANDON_MIN_ACTIVE_S: 3, ABANDON_K: 0.5, // an unfinished fight (I fled, he lost me): paid half after this long quiet
    DROP_S: 900, MAX_ENTRIES: 40,
};
export const ARENA = '__arena';
/** Spells that call creatures to my side — «когда игрок использует что-то, что помогает ему дополнительными существами» (the author 20.11): once per fight +ALLY_PCT. */
export const ALLY_SPELLS = new Set(['Alive', 'AliveMaxima', 'Snowman', 'FireSerpent', 'Serpent', 'Imperius', 'ImperiusMaxima', 'BrainrotMaxima', 'IceCastle']);
/** Spells that are not aimed at the foe (a stand-up, a light, a thing flying to the hand, building): they count in the fight, but by half. */
export const SUPPORT_SPELLS = new Set(['Up', 'Accio', 'Gather', 'Draw', 'ChangeColor', 'Unfurl', 'Furl', 'Alohomora', 'Lock', 'CreateFloor', 'CreateCeiling', 'CreateWall', 'CreateDoor', 'CreateBed', 'CreateBoard', 'CreateBridge', 'BuildRoof', 'Lumos', 'LumosMaxima', 'LumosFlashlight', 'LumosAhead', 'LumosFollowing', 'Featherfall', 'Flight', 'WaterWalk', 'Waterball', 'WaterForming', 'Stitching', 'Flourish', 'Fireworks', 'Reveal', 'Navigare', 'Invisibility']);

/** How much a spell is worth in a fight, from the cells of its first success (how great it is): a light 0,57 … a great one 3. */
export function spellWeight(gain) { return Math.max(0.4, Math.min(3, 0.4 + (Number(gain) || 1) / 6)); }

const ELEMENT_OF = new Map();
for (const [el, list] of Object.entries(ELEMENT_SPELLS)) for (const s of list) if (!ELEMENT_OF.has(s)) ELEMENT_OF.set(s, el);
export const isElemental = (name) => ELEMENT_OF.has(name);

/** The set `castAtPlayers` of a wizard (who he has cast at): every add — even a repeat — tells the ledger (`FoeSet.onCast`). */
export class FoeSet extends Set {
    constructor(owner) { super(); this.owner = owner; }
    add(id) { super.add(id); FoeSet.onCast?.(this.owner, id); return this; }
}
export const foeSet = (v) => v.castAtPlayers || (v.castAtPlayers = new FoeSet(v));

export class FightLedger {
    /** @param {() => number} now seconds  @param {(name: string) => {key: string, w: number}} spellOf the spell's family and worth */
    constructor(now, spellOf, strength = () => 0, near = null) {
        this.now = now; this.spellOf = spellOf; this.strength = strength; this.near = near; // (near(id): is the foe within NEAR_M of me? false → this second is not the fight's) // (my strength now: mana maximum + duel mastery — noted when an account opens)
        this.map = new Map();
        this.onLog = null; // (id, text) — the journal: how a fight began, who joined it
        this.recent = []; // my latest spells {t, name, key, w, el}: the opening one is cast before the account opens
    }

    _entry(id, create = true) {
        const k = String(id);
        let e = this.map.get(k);
        if (!e && create) {
            if (this.map.size >= FIGHT.MAX_ENTRIES) this.map.delete(this.map.keys().next().value);
            e = { id: k, ally: false, peak: 1, t0: this.now(), me: Number(this.strength()) || 0, last: this.now(), active: 0, honest: false, spells: new Map(), casts: 0, elem: 0, clashes: 0, arena: false };
            this.map.set(k, e);
            const t = this.now();
            for (const r of this.recent) { // (the spells cast just before: they began this fight)
                if (t - r.t > FIGHT.PRE_S) continue;
                if (r.t < e.last) { e.active += Math.min(e.last - r.t, FIGHT.PRE_S); }
                e.casts++; if (r.el) e.elem++;
                if (r.ally) e.ally = true;
                if (!e.spells.has(r.key)) e.spells.set(r.key, r.w);
            }
        }
        return e || null;
    }

    _touch(e) {
        const t = this.now();
        e.last = t;
        if (e.honest) { // (how many fight me at this moment: this one's crowd)
            let n = 0;
            for (const x of this.map.values()) if (x.honest && this._alive(x)) n++;
            if (n > e.peak) e.peak = n;
        }
    }

    _alive(e) { return e.arena || this.now() - e.last <= FIGHT.WINDOW_S; }

    /** He cast at me (an NPC wizard / a player): the fight is honest and goes on. */
    foeCast(id, foeMax = 0) { const e = this._entry(id); this._honest(e, id, foeMax > 0 ? 'он колдует/бьёт в вас' : 'он бьёт вас'); if (foeMax > 0) e.foeMax = foeMax; this._touch(e); }
    _honest(e, id, why) { if (!e.honest) { e.honest = true; this.onLog?.(id, `бой начался (${why}); мана соперника ${e.foeMax || '?'}; противников сейчас ${[...this.map.values()].filter((x) => x.honest && this._alive(x)).length}`); } }
    /** A beam clash with him (won or lost). */
    clash(id, won = false, seconds = 0) { const e = this._entry(id); this._honest(e, id, 'столкновение лучей'); e.clashes++; if (won) e.clashWon = (e.clashWon || 0) + 1; e.clashSec = (e.clashSec || 0) + Math.max(0, +seconds || 0); this._touch(e); }
    /** My spell hurt him: the fight goes on (honest only if he has fought back). */
    hit(id, foeMax = 0) { const e = this._entry(id); if (foeMax > 0) e.foeMax = foeMax; this._touch(e); }
    /** The arena's round: the opponent is fought honestly by the rules of the place. */
    arena(on) {
        const e = this._entry(ARENA, !!on);
        if (!e) return;
        if (on) { e.honest = true; e.arena = true; this._touch(e); } else e.arena = false;
    }
    /** (every frame) The seconds of REAL fighting: an honest account with something happening in the last GAP_S s and the foe near; far away (fled, recovering) — none. */
    tick(dt) {
        const t = this.now();
        for (const e of this.map.values()) {
            if (e.arena || !e.honest || t - e.last > FIGHT.GAP_S) continue;
            if (this.near && this.near(e.id) === false) continue;
            e.active += dt;
        }
    }

    /** (every frame while the arena round runs) the fighting seconds. */
    arenaTick(dt) { const e = this._entry(ARENA, false); if (e?.arena) { e.active += dt; e.last = this.now(); } }

    /** My spell worked: it is written in every account that is alive. */
    myCast(name) {
        const { key, w } = this.spellOf(name);
        if (!(w > 0)) return; // («стоп», «Акцио»-like words of control — not spells for the beauty of a fight)
        const now = this.now();
        const sw = SUPPORT_SPELLS.has(name) ? w * FIGHT.SUPPORT_K : w;
        this.recent.push({ t: now, name, key, w: sw, el: isElemental(name), ally: ALLY_SPELLS.has(name) });
        while (this.recent.length && now - this.recent[0].t > 15) this.recent.shift();
        for (const [k, e] of this.map) {
            if (!this._alive(e)) { if (this.now() - e.last > FIGHT.DROP_S) this.map.delete(k); continue; }
            this._touch(e);
            e.casts++;
            if (isElemental(name)) e.elem++;
            if (ALLY_SPELLS.has(name)) e.ally = true;
            if (!e.spells.has(key)) e.spells.set(key, SUPPORT_SPELLS.has(name) ? w * FIGHT.SUPPORT_K : w);
        }
    }

    /** The account for the arena round, or for `id` (the arena's opponent has an id only at the end). */
    peek(id) { return this.map.get(String(id)) || null; }

    /**
     * The prize of the fight with `id` (the account stays — `close` removes it): {honest, pct, parts, elemental, seconds, spells, clashes}.
     * `fought`: the caller knows the fight was honest (a player who cast at me, the arena).
     */
    summary(id, fought = false, arenaToo = false, foeStrength = 0) {
        let e = this.peek(id);
        const a = arenaToo ? this.peek(ARENA) : null;
        if (a && (!e || a.arena || a.honest)) e = e ? merge(e, a) : a;
        if (!e && fought) e = this._entry(id);
        if (!e || !(e.honest || fought || e.arena)) return { honest: false, pct: 0, parts: null };
        const time = Math.min(1, e.active / FIGHT.TIME_FULL_S) * FIGHT.TIME_PCT;
        let w = 0; for (const x of e.spells.values()) w += x;
        const variety = Math.min(FIGHT.VARIETY_MAX, w * FIGHT.VARIETY_PER_W);
        const clashTime = Math.min(FIGHT.CLASH_SEC_MAX, Math.floor((e.clashSec || 0) / FIGHT.CLASH_SEC_EACH) * FIGHT.CLASH_SEC_PCT);
        const clash = Math.min(FIGHT.CLASH_MAX, e.clashes * FIGHT.CLASH_EACH + (e.clashWon || 0) * FIGHT.CLASH_WON) + clashTime;
        const elemental = e.elem >= FIGHT.ELEMENT_MIN_CASTS && e.elem >= e.casts * FIGHT.ELEMENT_SHARE;
        const extra = (time + variety + clash) * (elemental ? FIGHT.ELEMENT_MULT : 1);
        const beauty = Math.min(FIGHT.MAX_PCT, FIGHT.MIN_PCT + extra);
        const r = e.me > 0 && foeStrength > 0 ? foeStrength / e.me : 0;
        const underdog = r > FIGHT.UNDERDOG_FROM ? Math.min(FIGHT.UNDERDOG_MAX, FIGHT.UNDERDOG_K * Math.log2(r)) : 0;
        const crowd = Math.min(FIGHT.CROWD_MAX, Math.max(0, (e.peak || 1) - 1) * FIGHT.CROWD_EACH);
        const ally = e.ally ? FIGHT.ALLY_PCT : 0;
        const pct = Math.min(FIGHT.TOTAL_MAX, beauty + underdog + crowd + ally);
        return { honest: true, pct, underdog, ratio: r, crowd, ally, names: [...e.spells.keys()], peak: e.peak || 1, parts: { base: FIGHT.MIN_PCT, time, variety, clash }, elemental, seconds: e.active, spells: e.spells.size, clashes: e.clashes, clashWon: e.clashWon || 0, clashSec: e.clashSec || 0, clashTime };
    }

    close(id) { this.map.delete(String(id)); this.map.delete(ARENA); }

    /**
     * The honest accounts of wizards (`foeMax` known) that went quiet: the fight was left unfinished. They are removed from the ledger and returned: [{id, foeMax}].
     * Other quiet accounts (a beast, a tree — nothing to pay) are dropped without a word.
     */
    abandoned() {
        const out = [], t = this.now();
        for (const [k, e] of this.map) {
            if (e.arena || t - e.last < FIGHT.ABANDON_S) continue;
            this.map.delete(k);
            if (e.honest && e.foeMax > 0 && e.active >= FIGHT.ABANDON_MIN_ACTIVE_S) out.push({ id: k, foeMax: e.foeMax, e });
        }
        return out;
    }
    clear() { this.map.clear(); }
}

function merge(a, b) {
    return { ...a, honest: a.honest || b.honest, active: Math.max(a.active, b.active), spells: new Map([...a.spells, ...b.spells]), casts: Math.max(a.casts, b.casts), elem: Math.max(a.elem, b.elem), clashes: Math.max(a.clashes, b.clashes), clashWon: Math.max(a.clashWon || 0, b.clashWon || 0), clashSec: Math.max(a.clashSec || 0, b.clashSec || 0), arena: a.arena || b.arena, me: a.me || b.me, peak: Math.max(a.peak || 1, b.peak || 1), ally: a.ally || b.ally };
}

/** Cells of the prize: `pct` % of (the wizard's maximum − base 30), at least 1. */
export function fightCells(pct, oppMax, base = 30) {
    return Math.max(1, Math.round((pct / 100) * Math.max(0, (Number(oppMax) || base) - base)));
}

/** «Duel mastery» of the same prize: grows with the share, a little of the beaten one's own mastery on top. */
export function fightMastery(pct, oppMastery = 0) {
    return Math.max(1, Math.round(FIGHT.MASTERY_BASE + pct * FIGHT.MASTERY_PER_PCT + Math.max(0, Number(oppMastery) || 0) * FIGHT.MASTERY_FOE_SHARE));
}
