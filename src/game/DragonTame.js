/**
 * DragonTame.js — «Brain Rot Maxima» (Брейнрот Максима): the rules of calming a dragon and riding it.
 * Pure data and rules: no THREE, Node-testable. The runtime: DragonRide.js (the rider's computer),
 * Dragons.js (the host: the dragon's mind, its anger, the grudge).
 *
 * (the author) «Подчинить существа более высокого уровня, например драконов. Но дракон не становится
 * полностью послушным: он не атакует по твоей команде. Он может напасть только на того, на кого уже
 * агрессивен, и ты можешь выбрать, на кого из них. Заклинание снижает агрессию дракона, и ты можешь
 * на него сесть и летать полноценным полётом, как в «Как приручить дракона». 0,5 маны в секунду.
 * Не работает, если ты уже обидел дракона и начал на него атаку, или пытаешься украсть что-то в
 * драконьей пещере. Если ты уже начал атаку — в лучшем случае агрессия снизится: дракон всё равно
 * нападает, заклинание полностью не срабатывает и полёт невозможен.»
 *
 * Who / what × how («на кого и на что»):
 *  - a dragon (all five kinds): the only target. Calm — the spell takes (the dragon stops being angry at
 *    the caster, lets them near and lets them get on); angry at the caster / offended by them / robbed
 *    by them — it does not take at all (WHY below);
 *  - every other creature (zombies, villagers, animals, sailors, living trees, the spider, the Ice Queen
 *    and her snowmen, Blackbeard and his skeletons, book-birds, phoenixes, owls) and other players:
 *    «Брейнрот Максима» does not act — it is made for dragons; the lesser creatures obey plain «Брейнрот»
 *    (the Queen and the bosses obey neither — Game._castBrainrot);
 *  - things and the world: it does not act; space and the planets: Space.spaceSpellBlock («BrainrotMaxima»).
 *  - the dragon does not become an obedient weapon: it never attacks on command — only a target it is
 *    ALREADY angry at (`angryAt`), the one the rider chose (their hand / look + «Атак»).
 */

export const TAME = {
    COST_PER_S: 0.5, // mana a second to hold the spell (the cast itself: Combat.SPELL_COST.BrainrotMaxima)
    CAST_R: 40, // m: the dragon must be this near (and looked at) to take the spell
    KEEP_R: 90, // m: farther than this from the dragon (not in the saddle) the spell lets go
    MOUNT_R: 7, // m (× size) from the dragon's body: a jump gets onto its back
    GRUDGE_T: 150, // s a dragon remembers being struck / robbed by somebody
    ATTACK_T: 9, // s an order «Атак» lasts
    SEAT_FWD: 0.3, // model m (× size) behind its middle: the rider's place on its back…
    SEAT_UP: 4.8, // …and its height (the top of the back: BODY.y 2.9 + BODY.r 1.9)
    CROUCH_OFF: 4.5, // m: where a rider who gets down stands, beside the dragon
    FLY_K: 1.35, // × DRAGON.FLY × its «реакция»: the top speed under a rider
    WALK_K: 1.0, // × DRAGON.WALK
    TURN_K: 0.8, // × the hero's flight turn: a great body turns slower
    DROP_SPEED: 9, // m/s: a rider whose dragon was angered comes down gently (not a fall from the sky)
    GLIDE_SPEED: 7, // m/s: the descent of a dragon that lost the spell's mana in the air
    HURT_DROP: 2, // HP: the bruise of being thrown off
};

/** Why the spell does not take (for the journal; `say` — a short line for the player at the cast). */
export const REFUSE = {
    aggro: { why: 'дракон уже зол именно на вас', say: '🐉 Дракон уже зол на вас — «Брейнрот Максима» не берёт его разум. Отойдите и дайте ему остыть' },
    grudge: { why: 'вы обидели дракона (ударили, ранили, разозлили)', say: '🐉 Вы обидели дракона — он вам не доверяет, заклинание не держится' },
    thief: { why: 'вы взяли что-то из его логова', say: '🐉 Вы взяли что-то из его логова — дракон не простит, заклинание не держится' },
    taken: { why: 'дракон уже под чьим-то заклинанием', say: '🐉 Этот дракон уже под чужим заклинанием' },
    dead: { why: 'дракон мёртв', say: '🐉 Дракон мёртв' },
};

/**
 * Has `who` offended dragon `d` (hit it, hurt it, robbed its lair) within the grudge time? `now`: the
 * clock the grudge was written with (seconds).
 * → 'grudge' | 'thief' | null
 */
export function offence(d, who, now) {
    const g = d?.grudge?.[who];
    if (!g || now - g.at > TAME.GRUDGE_T) return null;
    return g.thief ? 'thief' : 'grudge';
}

/**
 * May «Brain Rot Maxima» take on dragon `d` for player `who`? Pure rule.
 * → { ok: true, calming: bool } | { ok: false, code, why, say }.
 * A dragon sleeping / watching / flying past / sitting without anger at `who` — takes. Angry at `who`
 * (`d.aggro === who`), offended by them or robbed by them — never (it only lowers the anger a little:
 * `lowersAnger`, the dragon still goes for them, and no flight is possible).
 */
export function tameVerdict(d, who, now) {
    if (!d || d.dead) return { ok: false, code: 'dead', ...REFUSE.dead };
    if (d.tame && d.tame.by !== who) return { ok: false, code: 'taken', ...REFUSE.taken };
    if (d.aggro === who) return { ok: false, code: 'aggro', ...REFUSE.aggro };
    const o = offence(d, who, now);
    if (o) return { ok: false, code: o, ...REFUSE[o] };
    return { ok: true, calming: !!d.target && d.target === who };
}

/**
 * The anger the spell does take off a dragon that is already after the caster ((the author): «в лучшем
 * случае заклинание снизит агрессию»): its fire waits longer, its blows come slower for a while. Pure
 * numbers for Dragons.lowerAnger.
 */
export const LOWER_ANGER = { BREATH_WAIT: 3, BLOW_WAIT: 1.5, SLOW_T: 6 };

/**
 * Whom a dragon may be sent against: the players it is ALREADY angry at — the one it is chasing
 * (`aggro`) and everybody who offended it lately — but never the rider. → ids.
 */
export function angryAt(d, rider, now) {
    const out = [];
    if (d.aggro && d.aggro !== rider) out.push(d.aggro);
    for (const [id, g] of Object.entries(d.grudge || {})) {
        if (id === rider || out.includes(id)) continue;
        if (now - g.at <= TAME.GRUDGE_T) out.push(id);
    }
    return out;
}

/** The order «Атак» for dragon `d` against `target`: → { ok, why? }. It never goes for one that did nothing. */
export function attackVerdict(d, rider, target, now) {
    if (!d?.tame || d.tame.by !== rider) return { ok: false, why: 'дракон не под вашим заклинанием' };
    if (target == null) return { ok: false, why: 'цель не названа' };
    if (target === rider) return { ok: false, why: 'на своего всадника дракон не нападает' };
    if (!angryAt(d, rider, now).includes(target)) {
        return { ok: false, why: 'дракон не нападает по приказу на тех, на кого он не зол сам', say: '🐉 Дракон не нападёт на того, кто ничего ему не сделал — он не оружие' };
    }
    return { ok: true };
}

/**
 * The upkeep: 0,5 mana a second while the spell is held (and in the saddle too). `mana`: the pool now.
 * → { mana, broke } — `broke`: it ran out.
 */
export function upkeep(mana, dt) {
    const m = Math.max(0, mana - TAME.COST_PER_S * dt);
    return { mana: m, broke: m <= 0 };
}

/** The rider's place on the dragon's back, in the world: its origin (x, y, z), yaw, size → {x, y, z}. */
export function seatOf(x, y, z, yaw, size, out = { x: 0, y: 0, z: 0 }) {
    out.x = x + Math.sin(yaw) * TAME.SEAT_FWD * size;
    out.z = z + Math.cos(yaw) * TAME.SEAT_FWD * size;
    out.y = y + TAME.SEAT_UP * size;
    return out;
}

/**
 * «Brain Rot Maxima» × everything («на кого и на что»): what it does to each kind, and why. `does`: 'takes' (a dragon,
 * if the rules above allow) | 'none' (does not act). Checked by tests/unit/spell-targets.test.js.
 */
export const TARGETS = {
    dragons: { does: 'takes', why: 'все пять видов: берёт, если дракон не зол на вас, вы его не обидели и не воровали (tameVerdict); держится 0,5 маны/с' },
    zombies: { does: 'none', why: 'Максима — для драконов; зомби подчиняет обычный «Брейнрот»' },
    castlePeople: { does: 'none', why: 'жители, рыцари, король, волшебники: Максима для драконов; их подчиняет «Брейнрот»' },
    animals: { does: 'none', why: 'животные: «Брейнрот». Пегас никому не подчиняется' },
    sailors: { does: 'none', why: 'моряки, Чёрные Усы и скелеты: Максима для драконов; капитан и скелеты вообще не подчиняются' },
    spider: { does: 'none', why: 'гигантская паучиха: босс, Максима для драконов' },
    livingTrees: { does: 'none', why: 'ожившие деревья: «Брейнрот» (чужое), Максима для драконов' },
    bookBirds: { does: 'none', why: 'книги-птицы: Максима для драконов' },
    phoenix: { does: 'none', why: 'феникс никому не подчиняется' },
    owls: { does: 'none', why: 'сова слишком умна' },
    canaries: { does: 'none', why: 'канарик — не дракон: «Брейнрот Максима» его не берёт (его разум упрямый), и дракон канариков не трогает' },
    tarons: { does: 'none', why: 'Тарон — не дракон: «Брейнрот Максима» его не берёт (упрямый тяжёлый ум), дракон и Тароны не трогают друг друга' },
    spencers: { does: 'none', why: 'птичка Спенсера слишком мала для приказов' },
    ghosts: { does: 'none', why: 'призрак бестелесный: у него нет разума, которым можно приказывать; дракон его не замечает' },
    gargoyles: { does: 'none', why: 'горгульи слушаются пентаграмму, не дракона; дракон их не замечает, они его не трогают' },
    iceCastle: { does: 'none', why: 'Ледяная Королева и её создания: волю Королевы Максима не берёт; снеговиками управляет только Ледяной Жезл' },
    players: { does: 'none', why: 'другие игроки (и сами игроки, и их тела): Максима на них не действует, как и обычный «Брейнрот»' },
    servants: { does: 'none', why: 'слуги «Брейнрот» дракона не заменяют: «Атак» слуг и «Атак» дракона — разные команды (дракон — только по уже злому на него)' },
    items: { does: 'none', why: 'вещи на земле и в руках: не одушевлённое' },
    world: { does: 'none', why: 'земля, вода, постройки, корабли: не действует' },
    space: { does: 'none', why: 'в космосе и на планетах нет драконов — Space.spaceSpellBlock' },
};
