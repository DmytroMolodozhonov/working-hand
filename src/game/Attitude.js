/**
 * Attitude.js — who a villager is (his character, 0–100) and how he takes the one talking to him (the author:
 * «у жителей — небольшие характеры: доброта, помощь… от 0 до 100; отношение к тебе по умолчанию какое-то
 * случайное, растёт или падает после разговоров; они знают твой статус — странник, торговец, ремесленник,
 * рыцарь, король — и относятся по-разному; король — стараются подчиняться, но бывают и те, кто не подчиняется;
 * рыцари подчиняются всегда»).
 *
 * The GAME decides whether he does what he is asked (willDo); the villagers' net is told that decision with his
 * character, so his words fit what he does (TalkMind.persona). Pure: no THREE, no DOM; numbers from the seed.
 *
 * Who it covers: every human-like being that talks — townsfolk, knights, the king, merchants, wizards, sailors.
 */

/** The traits (0–100) and how they are said to the net. */
export const TRAITS = [
    ['kindness', 'доброта'],
    ['helpful', 'готовность помочь'],
    ['obedience', 'послушание'],
    ['brave', 'смелость'],
    ['trust', 'доверчивость к чужим'],
    ['greed', 'жадность'],
    ['temper', 'вспыльчивость'],
];

/** A small seeded generator (mulberry32). */
function rng32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const clamp100 = (x) => Math.max(0, Math.min(100, Math.round(x)));
/** A value round `mid`, `spread` either way (two draws: the middle more often than the ends). */
const around = (r, mid, spread) => clamp100(mid + ((r() + r()) - 1) * spread);

/**
 * A villager's character from his seed and role — the same every time he is met.
 * Knights obey (it is their oath); a king obeys nobody; merchants are a little greedy; the others are anyone.
 */
export function characterOf(seed, role = 'farmer') {
    const r = rng32(((seed >>> 0) ^ 0x85ebca6b) >>> 0);
    const c = {
        kindness: around(r, 55, 40),
        helpful: around(r, 50, 40),
        obedience: around(r, 50, 35),
        brave: around(r, 50, 45),
        trust: around(r, 45, 40),
        greed: around(r, 35, 35),
        temper: around(r, 35, 35),
    };
    if (role === 'knight') { c.obedience = clamp100(88 + r() * 12); c.brave = clamp100(70 + r() * 30); }
    if (role === 'king') { c.obedience = 0; c.brave = clamp100(75 + r() * 25); }
    if (role === 'advisor') c.obedience = clamp100(70 + r() * 25);
    if (role === 'merchant') c.greed = clamp100(45 + r() * 45);
    if (role === 'sailor') c.obedience = clamp100(70 + r() * 30);
    return c;
}

/** How he takes a stranger at first (0–100): kind and trusting — warmer; a short temper — colder; and a little chance. */
export function startAttitude(c, seed) {
    const r = rng32(((seed >>> 0) ^ 0xc2b2ae35) >>> 0);
    return clamp100(30 + c.kindness * 0.2 + c.trust * 0.2 - c.temper * 0.1 + (r() - 0.5) * 30);
}

/** The player's standing, as the villagers see it (CastleTalk.status): the respect each kind of villager pays it. */
export const STATUS = {
    king: { ru: 'КОРОЛЬ этого замка — твой государь', respect: 15 },
    foreignKing: { ru: 'король другого замка', respect: 20 },
    archmage: { ru: 'Высший маг — величайший волшебник', respect: 15 },
    knight: { ru: 'рыцарь в доспехах', respect: 8 },
    wizard: { ru: 'волшебник с палочкой', respect: 8 },
    merchant: { ru: 'торговец', respect: 5 },
    craftsman: { ru: 'ремесленник', respect: 5 },
    traveller: { ru: 'странник, путник без титула', respect: 0 },
    outlaw: { ru: 'разыскиваемый преступник — его ищет стража', respect: -40 },
};

/** The words for an attitude. */
export function attitudeWord(a) {
    return a >= 80 ? 'очень тёплое — ты к нему расположен как к другу' : a >= 60 ? 'доброе' : a >= 40 ? 'ровное, без особых чувств'
        : a >= 20 ? 'настороженное, ты ему не очень доверяешь' : 'плохое — он тебе неприятен';
}

/**
 * Asked something: does he do it? → {yes, how: 'gladly'|'reluctant'|'no', why}
 * kind: 'army' — an order to the castle's war host; 'serve' — do something for me (follow, guard, dig, fetch,
 * attack a creature I show); 'favor' — a little help (show the way, tell, wait); 'risk' — into danger
 * (fight a monster, stand by me against zombies).
 * o: {c: character, att: attitude 0–100, status: STATUS key, role, guest, danger}
 * `luck` 0..1: the moment's chance (the same request asked again soon gets the same answer — the caller keeps it).
 */
export function willDo(kind, { c, att = 50, status = 'traveller', role = 'farmer', guest = false, danger = false } = {}, luck = 0.5) {
    if (guest) return { yes: true, how: 'gladly', why: 'он здесь, чтобы помогать во всём' };
    if (!c) return { yes: false, how: 'no', why: 'не знает тебя' };
    if (role === 'king' && kind !== 'favor') return { yes: false, how: 'no', why: 'король никому не служит' };
    const king = status === 'king';
    if (kind === 'army') {
        if (!king) return { yes: false, how: 'no', why: 'войску приказывает только король' };
        if (role === 'knight' || role === 'advisor') return { yes: true, how: 'gladly', why: 'приказ государя' };
    }
    if (king && (role === 'knight' || role === 'advisor' || role === 'sailor')) return { yes: true, how: 'gladly', why: 'служит государю' };
    // the will to do it: his kindness and readiness to help, how he takes me, my standing, his own nature
    const respect = STATUS[status]?.respect ?? 0;
    let will = 5 + c.helpful * 0.35 + c.kindness * 0.15 + att * 0.4 + respect; // (an average villager, a stranger: about one in two helps)
    if (king) will += 10 + (c.obedience - 50) * 0.6; // (most obey their king; the stubborn few do not)
    if (kind === 'favor') will += 15;
    if (kind === 'risk') will += (c.brave - 50) * 0.6 + (danger ? 0 : -5);
    will += (luck - 0.5) * 20;
    if (will >= 70) return { yes: true, how: 'gladly', why: king ? 'слушается короля' : 'хочет помочь' };
    if (will >= 50) return { yes: true, how: 'reluctant', why: king ? 'слушается короля, хоть и без охоты' : 'помогает, хоть и без охоты' };
    return { yes: false, how: 'no', why: king ? 'упрямится и не слушается даже короля' : att < 30 ? 'ты ему неприятен' : 'не хочет связываться' };
}

/** How what happened changes his attitude (0–100) to the player: a talk's mood change, a blow, a gift. */
export function shiftAttitude(att, delta) { return clamp100((Number.isFinite(att) ? att : 50) + delta); }

/** The character in words for the net: «доброта 72, готовность помочь 40…». */
export function characterRu(c) {
    return TRAITS.map(([k, ru]) => `${ru} ${c[k]}`).join(', ');
}
