/**
 * NihilisRules.js — «Nihilis Atra» (the scattering of black magic; pure, no THREE, node-testable). WHITE magic, only from a scroll, instant.
 *
 * The author: it scatters black magic in the wand's direction as a CONE, like «Wind» (not one target — everything in the cone): whatever lives by
 * black magic falls to pieces — the living trees (and the dead raised at graves: they are living trees too), the skeletons of the black ship, the
 * infernal gargoyles, a monstrous form (the man inside lives), the black pentagrams and the marks on the ground, an «Империус» mind in a body. The
 * black mages (level 60+) it does NOT break — it hurts them badly (not a duel) and they FEAR it; lesser black mages take a lighter wound. A black
 * mage's «Protection Maxima» dome it shatters (a plain mage's — never). Everything else (people, animals, zombies, bosses, things) it does not touch.
 * The ghosts of the Castle of Ghosts it drives out for a long time: Ghosts.exorcise (the hook in Nihilis.js).
 *
 * ON WHOM / ON WHAT (CLAUDE.md): `NIHILIS_TARGETS` below says it for every creature and thing.
 */

export const NIHIL = {
    COST: 40, // mana
    RANGE: 28, // m: how far the cone reaches
    R0: 1.2, SPREAD: 0.5, // the cone: its radius at the wand is R0 and grows by SPREAD for every metre (about 27°)
    FEAR_LEVEL: 60, // black mages of this level and above fear it — and are hurt badly
    HURT: { heavy: 0.55, light: 0.2, blackbeard: 0.4 }, // the share of the maximum health a wound takes (heavy: black 60+; light: black 1–59)
    HURT_MIN: { heavy: 12, light: 4 }, // HP at least
    SCARE_R: 35, // m: black mages (60+) this near the caster (cone or not) run from it
    COOLDOWN: 1.2, // s between two casts
    BIG: 9999, // «falls to pieces»: more than any health
    NAME: 'Nihilis',
    FIRST_GAIN: 5, // cells of mana for the first real scattering (Mana.firstSpellGain)
};

/** A point in the cone from `o` along unit `d`, with a body of radius `r`: along-distance or -1. */
export function inCone(o, d, p, r = 0, range = NIHIL.RANGE) {
    const tx = p.x - o.x, ty = p.y - o.y, tz = p.z - o.z;
    const along = tx * d.x + ty * d.y + tz * d.z;
    if (along < -r || along > range + r) return -1;
    const off = Math.sqrt(Math.max(0, tx * tx + ty * ty + tz * tz - along * along));
    return off <= NIHIL.R0 + Math.max(0, along) * NIHIL.SPREAD + r ? Math.max(0, along) : -1;
}

/** How the spell treats a black mage of dark level `lvl`: 'heavy' (60+: a bad wound and fear) | 'light' (1–59: a lighter wound) | null (not a black mage). */
export const blackWound = (lvl) => (!(lvl > 0) ? null : lvl >= NIHIL.FEAR_LEVEL ? 'heavy' : 'light');

/** The HP a wound takes: its share of the victim's maximum, at least the floor. */
export function woundHp(kind, maxHp) {
    const share = NIHIL.HURT[kind] ?? 0;
    const min = NIHIL.HURT_MIN[kind] ?? 0;
    return Math.max(min, Math.round((Number(maxHp) || 20) * share * 10) / 10);
}

/** Does a pentagram of the table live by black magic (dark: true)? Such a mark in the cone goes out. */
export const scatters = (def) => !!def?.dark;

export const NIHILIS_TARGETS = {
    me: { does: 'scatter', why: 'на свою магию не действует: не задевает самого колдующего. Если на вас попало чужое «Nihilis Atra» — чёрная магия на вас рассеивается: ваш чёрный купол «Protection Maxima» (у чёрного мага) разбит, метка «слом защиты» снята; чёрный маг 60+ получает тяжёлую рану (55% максимума ХП)' },
    players: { does: 'scatter', why: 'чужой игрок в конусе: на его компьютере — то же, что «me» (купол чёрного мага разбит, метка слома снята, чёрный маг 60+ ранен тяжело, ниже — легко, обычного мага не трогает); тот, кто в форме монстра, лишается её; под «Империусом» разум возвращается в тело' },
    zombies: { does: 'none', why: 'зомби мира — не чёрная магия: они не питаются ею, рассеивать нечего' },
    castlePeople: { does: 'black', why: 'обычные жители, рыцари, волшебники — не задеты (белая магия вредит только чёрной); чёрный маг мира (метки на теле): 60+ — тяжёлая рана (55% максимума ХП), страх, купол «Protection Maxima» разбит; ниже 60 — лёгкая рана (20%) и купол разбит; король-рыцарь без чёрной магии не задет' },
    animals: { does: 'none', why: 'животные не чёрная магия — не действует' },
    sailors: { does: 'scatter', why: 'скелеты чёрного корабля рассыпаются (нежить на проклятии); капитан Чёрные Усы проклят — получает тяжёлую рану (40% максимума ХП), не умирает; обычные моряки не задеты', skeleton: 'falls', blackbeard: 'wounded' },
    spider: { does: 'none', why: 'гигантская паучиха — живая, не чёрная магия' },
    livingTrees: { does: 'scatter', why: 'ожившие деревья («Alive» / «Alive Максима») и поднятые на кладбищах мертвецы (это тоже живые деревья) рассыпаются на части — их оживляла чёрная магия' },
    bookBirds: { does: 'none', why: 'книги-птицы — белая магия, не задевает' },
    iceCastle: { does: 'none', why: 'Ледяная Королева, снеговики и ледяные монстры — магия льда, не чёрная: не действует' },
    blackship: { does: 'none', why: 'сам корабль заклинаниями не повреждается (барьер проклятия, Ships.isCursed); но скелеты экипажа в конусе рассыпаются' },
    dragon: { does: 'none', why: 'дракон — не чёрная магия: не ранит и не злит, обиды не копит' },
    phoenix: { does: 'none', why: 'феникс — огонь жизни, не чёрная магия: не касается' },
    owl: { does: 'none', why: 'сова не чёрная магия — не касается' },
    canary: { does: 'none', why: 'канарик не чёрная магия — не касается' },
    taron: { does: 'none', why: 'Тарон не чёрная магия и не дух — не действует' },
    spencer: { does: 'none', why: 'птичка Спенсера не чёрная магия — не касается' },
    custom: { does: 'none', why: 'созданное существо — не чёрная магия: не касается' },
    gargoyles: { does: 'scatter', why: 'адские горгульи (пентаграмма чёрного мага) рассыпаются в прах' },
    monster: { does: 'scatter', why: 'форма страшного монстра (пентаграмма чёрной магии) распадается — человек внутри жив; на чужом компьютере — так же' },
    imperius: { does: 'scatter', why: 'разум «Империуса» (обычного, чёрная магия) возвращается в своё тело; «Империус Максима» — заклинание богов, не чёрная магия — держится' },
    ghosts: { does: 'exorcise', why: 'призраки замка призраков: «Nihilis Atra» изгоняет их — они воют и растворяются надолго (Ghosts.exorcise); уничтожить насовсем нельзя' },
    bodies: { does: 'none', why: 'тела и кости лежат обычными останками — чёрной магии в них нет (даже кости героя с силой не рассыпаются)' },
    marks: { does: 'scatter', why: 'чёрные пентаграммы в конусе (горгульи, объединённой силы, живучести, слом защиты, монстр, дьявольской силы) гаснут; хорошие (телепортации, жизни, починки) и зачарования не задеты' },
    items: { does: 'none', why: 'вещи на земле не трогает' },
    blocks: { does: 'none', why: 'блоков не ломает: это поток света, а не удар' },
    doors: { does: 'none', why: 'двери и замки не касается' },
    ships: { does: 'none', why: 'корабли не повреждает' },
    water: { does: 'none', why: 'воды не касается' },
    ward: { does: 'none', why: 'сферу защиты дома не снимает и не задевает (для неё — «Ward Dispel»)' },
    godGift: { does: 'none', why: 'дары богов и храм богов не задевает: поток света добрый' },
    enchanted: { does: 'none', why: 'заколдованный камень не задевает' },
    space: { does: 'cast', why: 'в космосе и на планетах работает: это поток света, не ветер — воздух не нужен' },
    spells: { does: 'none', why: 'заряды дуэли и другие заклинания на лету не гасит; «Protection» мага-противника держит поток как обычный удар света' },
    concentration: { does: 'none', why: 'мгновенное: сначала «стоп», если вы держите другое заклинание' },
    servants: { does: 'none', why: 'слуг «Брейнрота» не трогает: это не чёрная магия' },
    hellfire: { does: 'none', why: 'адский огонь — пламя, а не оживление: поток света его не гасит (вода и ветер гасят)' },
};
