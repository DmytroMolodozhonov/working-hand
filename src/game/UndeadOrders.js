/**
 * UndeadOrders.js — what the raised dead (and a living tree) understand of their master's words (pure, node-testable).
 *
 * The author 05.11: «скелеты теперь смогут понимать более сложные команды… так же, как и житель, всё, что им скажут, просто они ничего
 * сказать не смогут: „атакуй всё село“ — пойдут и атакуют всё село. Но есть радиус: стараются не выходить за него; если игрок слишком
 * далеко отойдёт — магия рассеется (у каждого скелета своя: один выпал из радиуса — рассеялся он, другие нет)».
 *
 *   raid    «атакуйте (всё) село / деревню / замок / всех жителей / всех» — every person of the place near (the knights too); «убейте всех
 *           рыцарей / стражу» — only them; «перебейте зомби», «убейте животных / коров…» — those
 *   that    «атакуй его / того / вон того / фас» with the hand at someone — that one (as the spell «Атак»)
 *   go      «идите туда / вон туда / туда, куда показываю» with the hand at the ground — there, and stand
 *   follow  «за мной / ко мне / идите сюда / следуйте за мной» — back to the master
 *   stay    «стойте здесь / ждите / оставайтесь тут» — each stands where it is (and fights only what comes at it)
 *   guard   «охраняйте / защищайте меня» — round the master, any enemy near him fought (not only one at his very body)
 *   stop    «отставить / отбой / хватит / не трогайте / назад» — no more fighting: back to the master
 * Where: the game hears the words (main.js → LivingTrees.hearOrder), the host keeps the order (Servants.order); the radius
 * (UNDEAD.LEASH) is kept by every servant on its own — the spell's own 50 m (ALIVE.RANGE) still ends the one that went too far.
 */

export const UNDEAD = {
    LEASH: 42, // m from the master: they keep inside it (the spell's own end is at 50 m — ALIVE.RANGE)
    RAID_R: 90, // m round the place the order was given: the village / the castle it means
    ORDER_TIME: 180000, // ms an order stands (a raid takes a while)
};

const norm = (t) => ' ' + String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';

const ATTACK = /(атак|напад|убей|убейт|убить|уничтож|перебей|перебейт|громи|разгром|бейте|бей |фас|рвите|порвите|растерзай|kill|attack)/;
const PLACE = /(сел[оау ]|деревн|город|замок|замк|поселен|жител|людей|люди|крестьян|всех |всё |все )/;
const KNIGHTS = /(рыцар|страж|воин|солдат|охран[уы ])/;
const ZOMBIES = /(зомби|мертвяк|нежит)/;
const ANIMALS = /(живот|зверь|звер[еия]|коров|свин|овц|овец|баран|лошад|коня|коней)/;
const THAT = /(его|её|ее|их|того|тех|ту |этого|эту|этих|вон того|вон ту|вон тех|фас)/;
const THERE = /(иди|идите|ступай|ступайте|бегом|марш|вперед|туда|вон туда)/;

/** The master's words → an order {do, who?} or null (not an order to them). */
export function parseUndeadOrder(text) {
    const t = norm(text);
    if (/^ (отставить|отбой|хватит|фас) $/.test(t)) return t.trim() === 'фас' ? { do: 'that' } : { do: 'stop' };
    if (t.trim().split(' ').length < 2) return null; // (one word: a spell or speech — «стоп», «Атак» are spells)
    if (/(отставить|отбой|хватит|прекрат|не трогай|не нападай|не атакуй|оставьте их|назад ко мне)/.test(t)) return { do: 'stop' };
    if (/(охраня|защищай|защити|прикрой|прикройте)\S* ?(меня|нас)/.test(t)) return { do: 'guard' };
    if (/(стой|стойте|ждите|жди |оставайся|оставайтесь|стоять|замри|замрите)/.test(t) && !ATTACK.test(t)) return { do: 'stay' };
    if (/(за мной|ко мне|сюда|следуй|следуйте|вернись|вернитесь|возвращайтесь)/.test(t) && !ATTACK.test(t)) return { do: 'follow' };
    if (ATTACK.test(t)) {
        if (ZOMBIES.test(t)) return { do: 'raid', who: 'zombies' };
        if (ANIMALS.test(t)) return { do: 'raid', who: 'animals' };
        if (KNIGHTS.test(t)) return { do: 'raid', who: 'knights' };
        if (PLACE.test(t)) return { do: 'raid', who: 'people' };
        if (THAT.test(t) || / фас /.test(t)) return { do: 'that' };
        return null;
    }
    if (THERE.test(t) && /(туда|там|вон|куда)/.test(t)) return { do: 'go' };
    return null;
}

/** Is this person / creature one the raid means? `who` from the order; c: a castle person {role, wizard…} or a kind 'z' / 'a'. */
export function raidMeans(who, k, c) {
    if (who === 'zombies') return k === 'z';
    if (who === 'animals') return k === 'a';
    if (k !== 'v') return false;
    if (who === 'knights') return c?.role === 'knight' || c?.role === 'king';
    return true; // ('people': everybody of the place — the knights too)
}

/** A point kept inside the leash round the master: (x, z) moved onto the circle if beyond it. → {x, z} */
export function leashPoint(x, z, mx, mz, r = UNDEAD.LEASH) {
    const dx = x - mx, dz = z - mz, d = Math.hypot(dx, dz);
    if (d <= r || d < 1e-6) return { x, z };
    return { x: mx + dx / d * r, z: mz + dz / d * r };
}

/** What the HUD says to the master once the order is taken (the dead say nothing — a line of the game). */
export const ORDER_SAID = {
    raid: { people: '💀 Мертвецы идут громить всех вокруг', knights: '💀 Мертвецы идут на стражу', zombies: '💀 Мертвецы идут на зомби', animals: '💀 Мертвецы идут на зверей' },
    that: '💀 Мертвецы идут на того, на кого вы показали',
    go: '💀 Мертвецы идут туда, куда вы показали',
    follow: '💀 Мертвецы идут за вами',
    stay: '💀 Мертвецы стоят на месте',
    guard: '💀 Мертвецы охраняют вас',
    stop: '💀 Мертвецы оставили бой и идут к вам',
};
