/**
 * GhostRules.js — the Castle of Ghosts and its ghosts: rules, numbers and the «who / what» tables (pure, no THREE, node-testable).
 *
 * The author: «Будет замок настоящих призраков. Его нельзя найти, пока у игрока нет зрения невидимого — он даже не генерируется в мире.
 * Огромный замок со шпилями, раза в 4 больше «Create a Castle», чёрный, немножко прозрачный (15 %). В мультиплеере другие игроки проходят сквозь
 * замок, даже не видят его. Если они видят, что игрок со зрением входит в замок — тот игрок пропадает. В замке обитают призраки: страшные, но
 * относительно безобидные. Их нельзя уничтожить — можно изгнать «Nihilis Atra» или сдуть «Wind» / «Wind Maxima» (улетают, испугавшись).
 * Overgrown против них не работает. Они больше исполняют роль страхов… Единственный вредный момент: призрак пролетает сквозь тебя — −1 ХП и
 * охлаждение на несколько секунд; редко; не попытка убийства. Сундуков 4, в разных частях, только пентаграммы белой и чёрной магии
 * (100 уровня и выше) и магические вещи».
 *
 * Where it is used: world/GhostCastle.js (the blocks), game/GhostCastleLife.js (who sees it, the chests, the toggling of the land),
 * game/Ghosts.js (the creature), game/GhostFx.js (the look and the sounds).
 */

/** The castle: where and how big (blocks = metres). */
export const GHOST_CASTLE = {
    CELL: 1536, // m: a cell of the world holds at most one
    CHANCE: 0.4, // a cell has one with this chance (rare: the author)
    MIN_SPAWN: 520, // m: never nearer the world's start
    HALF: 96, // m: half-size of the whole (the terrace 66, the front stair out to 96)
    TERRACE: 66, // m: half-size of the black terrace the castle stands on
    PLINTH: 14, // m: the height of the black terrace the castle stands on (the basement and the crypt lie inside it, above the ground: nothing is cut out of the land)
    SPREAD: 16, // the land under it may differ by this much between its low and high parts (the terrace is built up to a level)
    MIN_GROUND: -4, MAX_GROUND: 23, // the ground's layers (the towers must stay under the world's ceiling: Terrain.MAX_LAYER 120)
    MARGIN: 12, // m between the castle and the edge of its cell
    TRIES: 22, // places tried in a cell
    STOREY: 8, // m: a floor
    PASS: 3, // blocks: the narrowest passage
    DOOR_W: 3, DOOR_H: 6, // a door (the hero is ~3.5 m)
    SEEN_FAR: 420, // m: a seer sees it from this far (the draw distance of the land)
};

/** The four chests: where (by the plan) and what they hold (ItemTypes.rollGhostLoot). `where` is the part of the castle. */
export const GHOST_CHESTS = [
    { id: 'tower', where: 'башня', look: 'rich' },
    { id: 'crypt', where: 'склеп', look: 'iron' },
    { id: 'cellar', where: 'подвал', look: 'iron' },
    { id: 'throne', where: 'тронный зал', look: 'rich' },
];

/** The ghosts: their numbers. */
export const GHOST = {
    NEAR: 70, // m: the ghosts are made round a hero this near the castle's walls (inside it)
    MAX: 7, // at most this many ghosts in the castle at once (they are scares, not a crowd)
    MIN: 3, // …and at least this many when a seer is inside
    FADE_IN: 0.9, FADE_OUT: 1.1, // s: they come and go through the air, never at once
    SPEED: 3.2, // m/s: a drifting ghost
    DART: 9, // m/s: a ghost darting across a passage
    HEIGHT: [1.2, 3.2], // m above the floor it floats
    SIZE: [3.6, 4.6], // m: its height (a sheet taller than a man)
    SCARE_GAP: [7, 15], // s between the scares of the castle (one ghost at a time)
    THROUGH_GAP: [60, 150], // s: the shortest wait before a ghost flies THROUGH the hero (rare)
    THROUGH_CHANCE: 0.3, // the share of scares that fly through (the rest only show, mutter, vanish)
    THROUGH_DMG: 1, // HP: the one harm they do
    THROUGH_MIN_HP: 4, // never flies through a hero who has less (not an attempt on a life)
    CHILL: 3.5, // s: a cold on the hero after a ghost went through (slowed, breath, frost on the screen)
    CHILL_SLOW: 0.62, // the speed left while chilled
    AFRAID: 4.2, // m: it recoils from a hero who comes this near (they fear the hero themselves)
    GAZE_COS: 0.88, // a ghost the hero looks straight at is shy: it vanishes sooner
    BLOWN: 8, // s: a ghost blown away by «Wind» is gone this long before it comes back
    EXORCISE: 600, // s: a ghost driven out by «Nihilis Atra» does not come back for this long
    DIVINE: 45, // s: a ghost scattered by a god's spell is gone this long
    FOOT: 0.4, // m: the radius of a ghost's body for the spells that look for it
    BODY_H: 3.4,
    MOVE_TRIES: 6, // places tried for a new spot
    PROP_NEAR: 30, // m: chairs and candles round the hero that a ghost may move
    PROP_GAP: [14, 34], // s between two tricks with a thing (a chair slides, a candle goes out)
    CANDLE_OUT: [10, 22], // s a candle stays out
};

/** «Who the ghost is to whom»: every kind of creature and thing (CLAUDE.md). `does`: scares | none | flees. */
export const GHOST_WORLD = {
    me: { does: 'scares', why: 'пугает: появляется из-за угла, шепчет, стучит, двигает стулья, гасит свечи; редко пролетает сквозь вас — это −1 ХП и холод на несколько секунд. Не убивает: при малом здоровье не пролетает' },
    players: { does: 'scares', why: 'зрячий друг в замке видит своих призраков и пугается так же; не видящие замка не видят ни замка, ни их' },
    zombies: { does: 'none', why: 'зомби в замок не заходят (его для них нет), призраки их не замечают' },
    castlePeople: { does: 'none', why: 'жители замок призраков не видят и не заходят; тревоги у них призраки не поднимают (Danger.js не вызывается)' },
    animals: { does: 'none', why: 'животные замок не видят и не заходят' },
    sailors: { does: 'none', why: 'моряки не видят замка' },
    spider: { does: 'none', why: 'паучиха не видит замка и призраков' },
    livingTrees: { does: 'none', why: 'не замечают' },
    bookBirds: { does: 'none', why: 'книги-птицы не замечают призраков' },
    dragon: { does: 'none', why: 'драконы не видят призраков' },
    iceCastle: { does: 'none', why: 'ледяные существа не видят призраков' },
    phoenix: { does: 'none', why: 'феникс не замечает призраков' },
    owl: { does: 'none', why: 'сова не видит призраков' },
    canary: { does: 'none', why: 'канарики не видят призраков' },
    taron: { does: 'none', why: 'Тароны призраков не видят и в замке призраков не бывают' },
    spencer: { does: 'none', why: 'птичка Спенсера и призраки — оба невидимые, друг друга не трогают' },
    custom: { does: 'none', why: 'созданные существа не видят замка' },
    gargoyles: { does: 'none', why: 'горгульи не видят призраков' },
};

/**
 * What every spell does to a GHOST (the author's list; CLAUDE.md «на КОГО и на ЧТО»). `does`:
 *   exorcise — driven out for a long time («Nihilis Atra», the one real answer; the ghost wails and dissolves);
 *   blown    — blown away by the wind: it flies off in fright and comes back later («Wind», «Wind Maxima»);
 *   scared   — frightened: it vanishes at once and comes back later («Circle Attack», «Inspirius», a bright «Lumos Maxima»);
 *   scatter  — scattered for a while by a god's spell (not for ever: a ghost cannot be destroyed);
 *   none     — does not act: the ghost has no body (the hint tells the hero why).
 * `hint` — what the hero is told when a spell is cast at a ghost and does nothing.
 */
export const GHOST_SPELLS = {
    Nihilis: { does: 'exorcise', why: '«Nihilis Atra» рассеивает чёрную магию и изгоняет призраков: они воют и растворяются, надолго' },
    Wind: { does: 'blown', why: '«Wind» сдувает призраков: они улетают, испугавшись, и возвращаются позже' },
    WindMaxima: { does: 'blown', why: '«Wind Maxima» сдувает призраков далеко и надолго, но они возвращаются' },
    CircleAttack: { does: 'scared', why: 'призраки пугаются волны и исчезают, потом возвращаются' },
    CircleAttackMaxima: { does: 'scared', why: 'то же, сильнее: исчезают на дольше' },
    Inspirius: { does: 'scared', why: 'призраки пугаются взрывной волны и исчезают' },
    Lumos: { does: 'scared', why: 'свет «Люмос» их пугает: призраки сторонятся луча (но не изгоняются)' },
    Overgrown: { does: 'none', why: '«Overgrown» против призраков не работает: у них нет тела, которое можно оплести' },
    Avada: { does: 'none', why: 'не действует: призрак бестелесен — заряд проходит сквозь него' },
    Stupefy: { does: 'none', why: 'не действует: призрак бестелесный' },
    Fire: { does: 'none', why: 'не действует: призрак бестелесный — огонь его не жжёт' },
    Hellfire: { does: 'none', why: 'не действует: призраки бестелесны — адское пламя проходит сквозь них' },
    Ice: { does: 'none', why: 'не действует: призраки и так холодны, ледяному заклинанию нечего заморозить' },
    Lightning: { does: 'none', why: 'не действует: молния проходит сквозь призрака' },
    Explosion: { does: 'none', why: 'взрыв разрушает блоки, но призрака не ранит (заколдованный камень замка цел)' },
    Arrow: { does: 'none', why: 'стрелы летят сквозь призраков' },
    Levitation: { does: 'none', why: 'не действует: «Левиоса» не берёт бестелесное' },
    Water: { does: 'none', why: 'вода проходит сквозь призрака' },
    Blow: { does: 'none', why: 'кулак и меч проходят сквозь призрака' },
    Alohomora: { does: 'none', why: 'не действует: у призрака нет замков' },
    Imperius: { does: 'none', why: 'в призрака нельзя вселиться: у него нет тела и своей воли — только морок замка' },
    Divine: { does: 'scatter', why: 'заклинания богов рассеивают призраков на время (не навсегда)' },
};

/** The kinds of spells' damage a ghost reads as (so a table row is found by the spell's own name or its kind). */
const ALIAS = {
    Wind: 'Wind', WindMaxima: 'WindMaxima', 'Wind Maxima': 'WindMaxima', NihilisAtra: 'Nihilis', Nihilis: 'Nihilis',
    CircleAttack: 'CircleAttack', 'Circle Attack': 'CircleAttack', CircleAttackMaxima: 'CircleAttackMaxima', 'Circle Attack Maxima': 'CircleAttackMaxima',
    Inspirius: 'Inspirius', Overgrown: 'Overgrown', Lumos: 'Lumos', LumosMaxima: 'Lumos', Avada: 'Avada', AvadaKedavra: 'Avada',
    Stupefy: 'Stupefy', Incendio: 'Fire', Inferno: 'Fire', Fire: 'Fire', fire: 'Fire', Hellfire: 'Hellfire', Ice: 'Ice', Frozen: 'Ice', IceDuel: 'Ice',
    Lightning: 'Lightning', Thunderwave: 'Lightning', Bombardo: 'Explosion', BombardoMaxima: 'Explosion', Boom: 'Divine', arrow: 'Arrow', Levitation: 'Levitation',
    Water: 'Water', Alohomora: 'Alohomora', Imperius: 'Imperius', ImperiusMaxima: 'Imperius', blow: 'Blow',
};

/** The row of GHOST_SPELLS for a spell's name or kind; unknown ones do nothing (a ghost has no body). */
export function ghostSpell(name, { divine = false } = {}) {
    if (divine) return GHOST_SPELLS.Divine;
    return GHOST_SPELLS[ALIAS[name] || name] || { does: 'none', why: 'не действует: призрак бестелесный' };
}

/** The hint the hero reads when the spell does nothing to a ghost (never the obvious: only when a spell was aimed at one). */
export const NO_EFFECT_HINT = '👻 Призрак бестелесный — это заклинание его не берёт. Изгнать призраков можно «Nihilis Atra», сдуть — «Wind».';

/** How long a ghost stays away after a verdict (s). */
export function awayFor(does, strong = false) {
    switch (does) {
        case 'exorcise': return GHOST.EXORCISE;
        case 'blown': return strong ? GHOST.BLOWN * 2.2 : GHOST.BLOWN;
        case 'scatter': return GHOST.DIVINE;
        case 'scared': return strong ? 22 : 12;
        default: return 0;
    }
}

/** A random number in a [lo, hi] pair. */
export const between = (pair, r = Math.random()) => pair[0] + (pair[1] - pair[0]) * r;

/**
 * May a ghost fly THROUGH the hero now? Not when the hero is nearly dead, not too soon after the last time, never twice in a row at once,
 * and only a share of the scares. `since` — seconds since the last pass-through (anywhere in the castle).
 */
export function mayFlyThrough({ hp, maxHp = 20, since, roll = Math.random(), gap = GHOST.THROUGH_GAP[0] }) {
    if (!(hp > GHOST.THROUGH_MIN_HP) || hp < Math.min(maxHp * 0.3, 8)) return false;
    if (since < gap) return false;
    return roll < GHOST.THROUGH_CHANCE;
}

/** The scares a ghost has (what it does to scare): each with a weight (the most common first). */
export const SCARES = [
    { id: 'peek', w: 34, ru: 'выглядывает из-за угла и тает' },
    { id: 'cross', w: 24, ru: 'пролетает поперёк прохода и исчезает' },
    { id: 'behind', w: 14, ru: 'появляется за спиной (только шёпот и холод — ближе четырёх метров не подходит)' },
    { id: 'sound', w: 20, ru: 'шаги, шёпот, плач, стук — а призрака не видно' },
    { id: 'chair', w: 18, ru: 'двигает стул или гасит свечу, пока вы смотрите' },
    { id: 'through', w: 6, ru: 'пролетает сквозь вас: −1 ХП и холод' },
];

/** The sounds of the castle (SoundManager makes them beforehand): id → what it is. */
export const GHOST_SOUNDS = {
    steps: 'шаги за стеной', whisper: 'шёпот', cry: 'плач вдали', knock: 'стук', scrape: 'скрип по полу (стул)', wail: 'вой призрака',
    laugh: 'детский смех', chill: 'холод (пролёт сквозь героя)', fade: 'призрак тает', bell: 'далёкий колокол', door: 'скрип двери', drone: 'гул замка',
};
