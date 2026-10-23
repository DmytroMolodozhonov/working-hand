/**
 * Imperius.js — «Империус» and «Империус Максима»: the rules (pure, no THREE; tests/unit/imperius.test.js).
 * The spell itself on this computer — the cast, the passage of the mind, the body left standing, driving the
 * creature, the camera, the link fading, the network: ImperiusControl.js.
 *
 * The author: «Ты завладеваешь существом любым: произносишь заклинание — и твоё сознание вселяется в это существо;
 * ты управляешь им, как будто играешь за другого игрока. Твой скин остаётся стоять, на нём загораются белые глаза.
 * Колдовать и вообще делать „своё“ ты не можешь — ты играешь за это существо. „Стоп“ — сознание переселяется
 * обратно. Существо не может уйти слишком далеко: экран темнеет всё больше, пока связь не разорвётся.»
 *
 *  - «Империус»: 100 mana, the mana MAXIMUM at least 150 (cells), then 1 a second while it holds. Ordinary
 *    creatures only (IMPERIUS_TARGETS: plain) — never a magic one, never a boss, never another player.
 *    Only from a scroll (rare, strong: chests of caves / towers / bosses, the towers' shop — ItemTypes.SCROLL_WEIGHTS).
 *  - «Империус Максима»: 500 mana, the maximum at least 750, then 2 a second. Any creature — the magic ones
 *    (a dragon, an owl, a book-bird, the spider…), the bosses, and in multiplayer another PLAYER. A spell of the
 *    gods: its scroll lies only in the gods' library on Venus (GodsTemple.TEMPLE_SCROLLS — that makes it one:
 *    Mana.GOD_SPELLS, ProtectionGods.isDivine); in a multiplayer world without «божественные заклинания на Земле»
 *    it does not work on the Earth (Game._godsBanned).
 *  - Both are HELD (Concentration.HELD.Imperius): while the mind is in the creature no other spell works — not even
 *    Lumos or the shield (the author: «колдовать не можешь») — only «стоп».
 *  - The link: RANGE m between the hero's body and the creature (60 / 120). From FADE_FROM of it the screen
 *    darkens, black at the range — there the link tears (the mind flies back, a moment of weakness).
 *  - It ends: «стоп», the mana out, too far, the creature dead, the hero's body hurt (the mind is jerked back:
 *    a short stun — the blow is real), the hero dead (the death as always — Legacy.js).
 *  - Blame: what the creature does — the people blame the creature; the caster only if they saw the cast
 *    (Blame.spellFamily: «Империус» is a servant's family, as «Брейнрот»: only a seen cast names the master).
 *  - The dragon in Maxima breathes fire at the caster's long «У-у-у» (DragonHowl.js): once in FIRE_EVERY s, the
 *    louder and the longer, the bigger the flame.
 */

/** The numbers (the author's: costs, maxima, upkeep; the rest decided by the game). */
export const IMPERIUS = {
    COST: 100, // mana to cast «Империус» (the author)
    NEED_MAX: 150, // … and the mana maximum (cells) must be at least this (the author)
    UPKEEP: 1, // mana a second while the mind is in the creature (the author)
    RANGE: 60, // m from the body: the link holds this far (the game's decision: «радиус большой, но не бесконечный»)
    FIRST: 15, // +cells the first time it works (Mana.FIRST_SPELL)
    CAST_R: 30, // m: as far as one can reach a creature with the cast (the hand / the wand / the eyes on it)
    AIM_ANG: 0.5, // rad: how close to the hand's / the eyes' line the creature must be (forgiving: the camera's hand wavers)
    FADE_FROM: 0.5, // of RANGE: from here the screen starts to darken
    FADE_SAY: 0.3, // darkness at which «Связь слабеет» is said (once)
    PASS_T: 1.0, // s: the mind's passage (into the creature and back) — the camera flies along the light
    WEAK_T: 1.0, // s of weakness after the link tore (too far)
    HURT_STUN: 1.3, // s of stun when the body is struck (the mind jerked back)
};

/** «Империус Максима» (the author: 500 + 2 a second, the maximum at least 750). */
export const IMPERIUS_MAXIMA = {
    COST: 500,
    NEED_MAX: 750,
    UPKEEP: 2,
    RANGE: 120, // m (twice the plain one)
    FIRST: 100, // the gods' library: «за использование любого заклинания из этой библиотеки первый раз — 100 ячеек маны» (the author)
    PLAYER_BREAK: 20, // HP: a blow at least this strong on a controlled player — they tear free
    FIRE_EVERY: 7, // s: the dragon's fire, once in this long (the author)
};

/** The numbers of a spell: 'Imperius' | 'ImperiusMaxima'. */
export const imperiusOf = (name) => (name === 'ImperiusMaxima' ? IMPERIUS_MAXIMA : IMPERIUS);

/**
 * Who may be taken (the author's rule «кто/что × как»): kind → {ru, plain, magic, boss, fly, why}.
 * plain: the plain «Империус» takes it; else only «Максима». `why`: said when the plain one cannot.
 * Kinds (ImperiusControl's adapters): z zombie, v castle / village person (by role), w a wizard of the game,
 * a animal (by type), s sailor, D dragon, sp the giant spider, b book-bird, o owl, f phoenix, t living tree /
 * risen skeleton, I the Ice Castle's creatures, pl a player.
 */
export const IMPERIUS_TARGETS = {
    zombie: { ru: 'зомби', plain: true },
    villager: { ru: 'житель', plain: true }, // (builders, farmers, merchants, the advisor, travellers, children)
    knight: { ru: 'рыцарь', plain: true }, // (a guard as well: the others take him for one of theirs — nobody reads minds)
    wizard: { ru: 'волшебник', plain: true }, // (an ordinary wizard of a tower or a village: a man; his magic is not yours to use)
    cow: { ru: 'корова', plain: true },
    sheep: { ru: 'баран', plain: true },
    horse: { ru: 'конь', plain: true },
    pig: { ru: 'свинья', plain: true }, // (the farm pig; its wings are another thing: walking with the plain one, flying only with «Максима»)
    sailor: { ru: 'моряк', plain: true },
    // the magic ones: «Максима» only
    pegasus: { ru: 'Пегас', magic: true, fly: true },
    runbook: { ru: 'бегущая книга', magic: true },
    guardBeast: { ru: 'медный бык / минотавр', magic: true }, // (a herd's magic guard — HerdGuards.js)
    dragon: { ru: 'дракон', magic: true, fly: true }, // (its anger, a grudge, a robbed hoard — no matter: the Maxima is the gods'; the mind in it is yours. «Brain Rot Maxima» calms; this one takes)
    spider: { ru: 'гигантская паучиха', magic: true, boss: true },
    bookbird: { ru: 'книга-птица', magic: true, fly: true },
    owl: { ru: 'сова', magic: true, fly: true },
    phoenix: { ru: 'феникс', magic: true, fly: true },
    tree: { ru: 'ожившее дерево', magic: true },
    skeleton: { ru: 'скелет', magic: true },
    // (a servant of «Брейнрот» is its own kind: taken, it forgets its master for good — ImperiusControl._claim)
    snowman: { ru: 'снеговик', magic: true },
    iceMonster: { ru: 'ледяной монстр', magic: true },
    iceQueen: { ru: 'Ледяная Королева', magic: true, boss: true },
    blackbeard: { ru: 'капитан Чёрные Усы', magic: true, boss: true },
    pirateSkeleton: { ru: 'скелет-пират', magic: true },
    // the bosses: a mind too strong for the plain one («Максима» takes any — the author: «любое существо»)
    king: { ru: 'король', boss: true },
    towerHead: { ru: 'глава башни волшебников', boss: true },
    // another player: only «Максима», and never through the gods' shield / «Protection Maxima»
    player: { ru: 'игрок', player: true },
};

/**
 * May this spell take a creature of `kind`? → {ok: true} | {ok: false, say}. ctx: {shield} — a player's shield
 * up (the hand shield / the dome / the gods'): the foreign mind meets it.
 */
export function canTake(kind, maxima, ctx = {}) {
    const t = IMPERIUS_TARGETS[kind];
    if (!t) return { ok: false, say: '🌀 В это не вселиться' };
    if (t.player) {
        if (!maxima) return { ok: false, say: '🧠 Не действует: чужой разум слишком упорный — игрока подчиняет только «Империус Максима»' };
        if (ctx.shield) return { ok: false, say: '🛡️ Чужой разум упёрся в щит — сквозь защиту не вселиться' };
        return { ok: true };
    }
    if (maxima || t.plain) return { ok: true };
    if (t.boss) return { ok: false, say: `👑 Не действует: разум ${t.ru === 'король' ? 'короля' : 'босса'} слишком силён — нужен «Империус Максима»` };
    return { ok: false, say: `✨ ${cap(t.ru)} — магическое существо: в него вселяет только «Империус Максима»` };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Can it be cast now (the maximum, the mana)? null — yes; 'max' — the maximum is under NEED_MAX; 'mana' — not
 * COST mana now. `enabled`: the free world's mana counts (Creative: never).
 */
export function imperiusBlock(name, { enabled, max, mana }) {
    if (!enabled) return null;
    const I = imperiusOf(name);
    if (!((max ?? 0) >= I.NEED_MAX)) return 'max';
    if (!((mana ?? 0) >= I.COST)) return 'mana';
    return null;
}

/** The hint for a block (only when the player tries). */
export function blockSay(name, why) {
    const I = imperiusOf(name);
    const ru = name === 'ImperiusMaxima' ? 'Империус Максима' : 'Империус';
    if (why === 'max') return `🌀 Для «${ru}» нужно ${I.NEED_MAX} ячеек маны — пока ваш разум слишком мал, чтобы покинуть тело`;
    return `😮‍💨 Для «${ru}» нужно ${I.COST} маны`;
}

/** The mana the held spell takes in `dt` s. */
export const upkeep = (name, dt) => imperiusOf(name).UPKEEP * Math.max(0, dt);

/**
 * The link at `dist` m from the body: {dark: 0…1 — how dark the screen, torn: past the range}.
 * Dark from FADE_FROM × RANGE, eased (slowly at first, faster near the end), black at the range.
 */
export function linkAt(name, dist) {
    const R = imperiusOf(name).RANGE, a = IMPERIUS.FADE_FROM * R;
    if (!(dist > a)) return { dark: 0, torn: false };
    const k = Math.min(1, (dist - a) / (R - a));
    return { dark: k * k * (3 - 2 * k) * 0.97 + (k >= 1 ? 0.03 : 0), torn: dist >= R };
}

/**
 * The creature's kind in IMPERIUS_TARGETS from what the game knows of it: sys — the adapter ('z' zombie,
 * 'v' person, 'a' animal, 's' sailor, 'D', 'sp', 'b', 'o', 'p', 't', 'I', 'pl'), c — the creature.
 */
export function kindOf(sys, c = {}) {
    switch (sys) {
        case 'z': return 'zombie';
        case 'v':
            if (c.role === 'king') return 'king';
            if (c.role === 'master' && c.cs?.def?.kind === 'tower') return 'towerHead'; // (the one tower's head — a boss; a village's master is a wizard)
            if (c.wizard) return 'wizard';
            return c.role === 'knight' ? 'knight' : 'villager';
        case 'a':
            if (c.pegasus) return 'pegasus';
            if (c.type === 'runbook') return 'runbook';
            if (c.form) return 'guardBeast';
            return IMPERIUS_TARGETS[c.type] ? c.type : 'cow';
        case 's': return c.role === 'blackbeard' ? 'blackbeard' : c.role === 'skeleton' ? 'pirateSkeleton' : 'sailor';
        case 'D': return 'dragon';
        case 'sp': return 'spider';
        case 'b': return 'bookbird';
        case 'o': return 'owl';
        case 'f': return 'phoenix';
        case 't': return c.skel ? 'skeleton' : 'tree';
        case 'I': return c.type === 'queen' ? 'iceQueen' : c.type === 'monster' ? 'iceMonster' : 'snowman';
        case 'pl': return 'player';
        default: return null;
    }
}

/** Does this kind fly with the arms in «Максима» (and does it run first to take off: the dragon)? */
export function flies(kind, maxima) {
    if (!maxima) return false;
    return !!IMPERIUS_TARGETS[kind]?.fly || kind === 'pig';
}

/** The network's short names of the spell. */
export const NET_SPELL = { Imperius: 0, ImperiusMaxima: 1 };
