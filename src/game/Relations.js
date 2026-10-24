/**
 * Relations.js — how every person feels about the hero, as in The Sims (the author: «дружба и любовь… полосочки… не две полосы, а
 * три: формальная — подчинение; дружба; любовь… как только ты становишься королем — 80 подчинений из 100… дружба позволяет
 * заменить уважение… если там ноль, то ничего не пишется — полоса появляется, только когда есть взаимоотношения… минус тоже
 * бывает: если очень серьёзное неуважение — он сам нападёт; многие рыцари ненавидят — сговорятся и нападут; визирь, если сильно и
 * долго ненавидит и есть сторонники, соберёт их и убьёт тебя»).
 *
 * THREE numbers per (person, player):
 *   sub  Подчинение −100…100: the formal bar. A king gets ~80 at once (the people's duty), a deputy 70, a commander 60. Duty only —
 *        no love lost. Negative: disrespect.
 *   fr   Дружба −100…100: zero at first. It can stand in for duty («делает не потому что должен, а потому что дружба») and opens the
 *        house and the things. Negative: enmity.
 *   lv   Любовь 0…100: he loves you. Zero at first.
 * Stored as DELTAS from what the standing gives (the base of sub), so that a new king's 80 is not "kept" but computed from the rank.
 * The bar of friendship / love is not drawn when it is 0 (`visibleBars`); the subordination bar when 0 too.
 *
 * What the town KNOWS of the hero is `rep` (counters of the deeds seen or told): it gives a stranger his first opinion; if nobody knows
 * the hero, there is none. Pure (no THREE / DOM): tests/unit/relations.test.js.
 */

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = (x) => Math.round(x * 10) / 10;

/** The formal standing the people owe the hero (the base of the subordination bar), by his status (Attitude.STATUS key). */
export const SUB_BASE = {
    king: 80, deputy: 70, commander: 60, honored: 25, friend: 10,
    foreignKing: 10, archmage: 12, knight: 5, wizard: 5, merchant: 2, craftsman: 2, traveller: 0, outlaw: -20,
};

/** The base subordination: the status, and (for a king and his men) the person's own stubbornness or meekness (obedience 0…100). */
export function baseSub(status, obedience = 50) {
    const b = SUB_BASE[status] ?? 0;
    return b >= 55 ? clamp(Math.round(b + (obedience - 50) * 0.3), 0, 100) : b;
}

/** A new, empty relation: deltas of sub, fr, lv. */
export const blank = () => ({ s: 0, f: 0, l: 0 });

/** What the bars say now: sub (base + delta), fr, lv (rounded to whole points, as shown). */
export function effective(rel, base = 0) {
    const r = rel || blank();
    return { sub: Math.round(clamp(base + (r.s || 0), -100, 100)), fr: Math.round(clamp(r.f || 0, -100, 100)), lv: Math.round(clamp(r.l || 0, 0, 100)) };
}

/** A relation moved by a deed or a word: d = {s, f, l} (any). Returns the new relation (pure). */
export function bump(rel, d = {}) {
    const r = rel || blank();
    return { s: r1(clamp((r.s || 0) + (d.s || 0), -200, 200)), f: r1(clamp((r.f || 0) + (d.f || 0), -100, 100)), l: r1(clamp((r.l || 0) + (d.l || 0), 0, 100)) };
}

/** The bars to draw: only those with something in them (the author: «если там ноль, то ничего не пишется»). */
export function visibleBars(eff) {
    const out = [];
    if (eff.sub) out.push({ key: 'sub', label: 'Подчинение', value: eff.sub });
    if (eff.fr) out.push({ key: 'fr', label: 'Дружба', value: eff.fr });
    if (eff.lv) out.push({ key: 'lv', label: 'Любовь', value: eff.lv });
    return out;
}

/** What a word of the talk does (by the rules' intent). `f` friendship, `s` subordination, `l` love; `cool`: s between two such gains. */
export const TONE = {
    greet: { f: 0.6, cool: 600 }, thanks: { f: 1.2, cool: 60 }, compliment: { f: 2.5, l: 0.6, cool: 45 }, joke: { f: 1.2, cool: 60 },
    bow: { s: 1.5, cool: 120 }, help: { f: 1.5, cool: 60 }, how_are_you: { f: 0.8, cool: 90 }, family: { f: 1, cool: 90 },
    flirt: { f: 0.6, l: 2.5, cool: 60, needs: 8 },
    insult: { f: -5, s: -4, cool: 5 }, threat: { f: -8, s: -8, cool: 5 },
};

/** The most that mere talk may give a person (he is not bought by chatter): fr gained by words stops here, love by words here. */
export const TALK_CAP = { f: 35, l: 30 };

/** How much a flirt is welcome: a friend's kindness takes it; a stranger's coldness refuses and cools him. */
export function flirtResult(eff, character) {
    const welcome = eff.fr + eff.lv * 0.5 + ((character?.kindness ?? 50) - 50) * 0.2;
    return welcome >= TONE.flirt.needs ? { l: 2.5, f: 0.6 } : { f: -1.5, l: 0 };
}

/**
 * The town's knowledge of the hero — counters of what is known (kept by the castle, seen or told).
 * n: how often he was seen; magic: spells seen; hurt: people hurt; slain: innocents killed; foes: monsters / enemies killed in the town's
 * sight; saved: people helped; gifts: gifts and fair deals; crimes: theft and the like.
 */
export const blankRep = () => ({ n: 0, magic: 0, hurt: 0, slain: 0, foes: 0, saved: 0, gifts: 0, crimes: 0 });

/** Does anybody know him? (no word of him — no opinion). */
export function isKnown(rep) { return !!rep && (rep.n >= 3 || rep.hurt + rep.slain + rep.foes + rep.saved + rep.gifts + rep.crimes > 0); }

/** The town's opinion: −100…100 (good deeds up, blood down; spells awe a little, then frighten the timid). */
export function opinion(rep) {
    if (!isKnown(rep)) return 0;
    return clamp(Math.round(rep.saved * 4 + rep.foes * 2 + rep.gifts * 2 - rep.slain * 14 - rep.hurt * 2 - rep.crimes * 4 + Math.min(10, rep.magic * 0.2)), -100, 100);
}

/** The first opinion of a person who knows of the hero: the town's, softened by his own kindness / temper. */
export function firstImpression(rep, character) {
    const o = opinion(rep);
    if (!o) return blank();
    const soft = ((character?.kindness ?? 50) - 50) * 0.1, hard = ((character?.temper ?? 50) - 50) * 0.1;
    const f = clamp(Math.round(o * 0.35 + (o > 0 ? soft : -hard)), -40, 40);
    return { s: o < -30 ? -Math.round(Math.abs(o) * 0.2) : 0, f, l: 0 };
}

/** What a deed does to a witness (a victim, a bystander) and to the town. */
export const DEED = {
    hurt: { witness: { f: -4, s: -3 }, victim: { f: -10, s: -6 }, rep: 'hurt' },
    slay: { witness: { f: -14, s: -8 }, victim: { f: -40, s: -30 }, rep: 'slain' }, // an innocent man killed
    foe: { witness: { f: 3, s: 1 }, rep: 'foes' }, // a monster killed before their eyes
    saved: { witness: { f: 5, s: 2 }, rep: 'saved' },
    gift: { witness: { f: 4 }, victim: { f: 8 }, rep: 'gifts' }, // `victim` here: the receiver
    theft: { witness: { f: -6, s: -4 }, victim: { f: -14, s: -6 }, rep: 'crimes' },
};

/** How much a person hates the hero (0…100): enmity and disrespect, a hot temper fans it. */
export function hatred(eff, character) {
    const base = Math.max(0, -eff.fr) + Math.max(0, -eff.sub) * 0.7;
    if (base <= 0) return 0;
    return clamp(Math.round(base + ((character?.temper ?? 50) - 50) * 0.2 - Math.max(0, eff.lv) * 0.3), 0, 100);
}

/** Does he do what the hero asks? Duty (sub) and friendship (fr) both count: a friend does it as a friend. kind: basic | serve | risk | army. */
export function obeys(eff, character, kind = 'basic') {
    const need = { basic: 8, serve: 28, risk: 44, army: 52 }[kind] ?? 20;
    const duty = eff.sub * 0.6 + ((character?.obedience ?? 50) - 50) * 0.2;
    const bond = eff.fr * 0.55 + eff.lv * 0.25;
    const total = duty + bond;
    return { yes: total >= need, by: bond > duty && bond > 0 ? 'friend' : 'duty', total: Math.round(total), need };
}

/** Friendship opens the home and the hand (the author: «если дружба — он позволит войти в дом, взять вещь»). */
export const mayEnterHome = (eff) => eff.fr >= 40 || eff.lv >= 55;
export const mayTakeThing = (eff) => eff.fr >= 55 || eff.lv >= 65;

/** The loyalty of a fighter to the king: loyal / wavering / hostile (by how much he hates). */
export function stance(eff, character) {
    const h = hatred(eff, character);
    if (h >= 60) return 'hostile';
    if (h >= 30) return 'wavering';
    return eff.fr >= 20 || eff.sub >= 40 ? 'loyal' : 'wavering';
}

/**
 * A plot among the knights (and the vizier). `people`: [{id, role, hate}] all the castle's fighters and the vizier alive.
 *  - the knights: when at least `max(3, 40% of them)` hate him (≥ 50), they conspire;
 *  - the vizier: hating ≥ 70 for long (`vizierLong`, the seconds he did), with at least `max(4, 40%)` knights of ≥ 40, leads the plot himself.
 * → {plot: false} | {plot: true, leader, members:[ids], loyal:[ids], why}
 */
export function plotOf(people, { vizierLong = 0 } = {}) {
    const knights = people.filter((p) => p.role === 'knight');
    const vizier = people.find((p) => p.role === 'advisor');
    const need = Math.max(3, Math.ceil(knights.length * 0.4));
    const angry = knights.filter((k) => k.hate >= 50);
    const grumbling = knights.filter((k) => k.hate >= 40);
    const loyal = knights.filter((k) => k.hate < 25).map((k) => k.id);
    if (vizier && vizier.hate >= 70 && vizierLong >= 120 && grumbling.length >= Math.max(4, Math.ceil(knights.length * 0.4))) {
        return { plot: true, leader: vizier.id, members: [vizier.id, ...grumbling.map((k) => k.id)], loyal, why: 'vizier' };
    }
    if (angry.length >= need) {
        const lead = [...angry].sort((a, b) => b.hate - a.hate)[0];
        return { plot: true, leader: lead.id, members: angry.map((k) => k.id), loyal, why: 'knights' };
    }
    return { plot: false };
}

/** A lone fighter who hates him enough strikes by himself (a hot head, or a mortal hate). */
export function strikesAlone(hate, character) {
    return hate >= 92 || (hate >= 78 && (character?.temper ?? 50) >= 55);
}
