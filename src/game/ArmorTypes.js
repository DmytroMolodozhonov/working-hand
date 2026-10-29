/**
 * ArmorTypes.js — armour and robes as things (pure: data, rolls, the rules of protection;
 * node-testable, no THREE, no game).
 *
 * Armour: three pieces — a helmet (шлем), a breastplate (нагрудник, with the arm plates) and
 * greaves (поножи). Each is a thing of its own: found in chests (one piece, never a whole set),
 * taken off a dead knight, bought from the wizards (a magic one). Worn — put on by hand: the
 * piece held at its place on the body (the helmet on the head, the breastplate on the chest,
 * the greaves on the knee) — or all at once with «Suit Up».
 *   plain   its steel takes blows and spells for its own points (ARMOR.HP), mended never:
 *           beaten to 0 it falls off in pieces;
 *   magic   twice the points (and they come back by themselves), a faint glow; the whole
 *           magic set turns away the simplest magic (MAGIC_SET_BLOCKS: «Левиоса»,
 *           «Остолбеней», the freezing «Айс»…), «Инферно» does half, arrows bounce off it;
 *   named   a dragon's lair always hides one: a whole magic set of a dead knight
 *           («Доспех сэра …»), with its own perks (PERKS) — on the set and on the pieces.
 * The High Mage's suit (makeArchmageSuit, at the end): a robe given only for the status «Высший маг».
 * MAGIC DURABILITY («запас магической прочности», in mana — the author): a magic robe and a magic piece each hold a
 * reserve `mag` (of `magMax`). A simple spell turned away costs the spell's own mana off it (guardSpend: the armour
 * first, then the robe); «Авада Кедавра» is cut by the reserve, not turned away (avadaCut). A magic piece at 0 stays on
 * and turns nothing; a magic robe at 0 falls apart. Plain armour has no reserve (it only takes blows). Robe kinds:
 * simple 100…300, middle 301…600, strong 601…1000 (ROBE_TIERS); armour 100…500 (MAG.ARMOR) — no kinds.
 * Robe (мантия): plain — only clothes; magic — never cold, and the simplest magic
 * (ROBE_BLOCKS — «Инферно», «Остолбеней», «Левиоса», «Айс»…) does nothing; it may have
 * half the harm from 2–3 strong spells (ROBE_STRONG).
 *
 * «Простейшая магия» (the author's word): every spell a wizard knows from the start, without a
 * scroll. Not «Авада Кедавра», nor «Thunderwave», «Lightning Strike», «Let the Hellfire Come»,
 * nor any «Максима» (Вингардиум Левиоса Максима gets through all of it).
 */

let _n = 0;
/** A thing's own id (like ItemTypes.newUid, own prefix: no import cycle). */
export const armorUid = () => 'a' + (++_n).toString(36) + Math.floor(Math.random() * 1296).toString(36);

export const PIECES = ['helmet', 'chest', 'legs'];

// ================================================================ magic durability
/** Robe kinds: simple (cheap, modest to look at), middle, strong. `w`: how often a chest/loot roll gives it. */
export const ROBE_TIERS = {
    simple: { n: 0, ru: 'простая', range: [100, 300], w: 0.6 },
    mid: { n: 1, ru: 'средняя', range: [301, 600], w: 0.3 },
    strong: { n: 2, ru: 'сильная', range: [601, 1000], w: 0.1 },
};
export const MAG = {
    ARMOR: [100, 500], // a magic armour piece's reserve (no kinds; never above 500)
    ROBE_COIN: 10, // coins per point of a magic robe's reserve: 1000 points = 10 000 coins
    PIECE_COIN: 2, // … per point of a magic piece's reserve: 500 points = 1000 coins
    AVADA_K: 8, // «Авада Кедавра»: every HP it is cut by costs this many points of reserve (25 HP = 200)
    AVADA_CAP: 0.8, // … and the reserves never cut more than this share of it: the rest hurts (at full health: wounded, not dead)
    ORDER: ['chest', 'helmet', 'legs'], // the armour pays in this order (then the robe)
    BEAM_T: 0.6, // s: a flame / a beam on the armour is paid once in this time, not every frame
};
const hashOf = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100003) / 100003; };
const spanInt = (r, [a, b]) => a + Math.min(b - a, Math.floor(r * (b - a + 1)));
export function rollRobeTier(r = Math.random) {
    const x = r();
    return x < ROBE_TIERS.simple.w ? 'simple' : x < ROBE_TIERS.simple.w + ROBE_TIERS.mid.w ? 'mid' : 'strong';
}
/** The tier a reserve belongs to. */
export const tierOfMag = (m) => (m <= ROBE_TIERS.simple.range[1] ? 'simple' : m <= ROBE_TIERS.mid.range[1] ? 'mid' : 'strong');
/**
 * A magic thing with no reserve yet (an old save, a bare literal) gets one by its own id — the same on every computer.
 * The High Mage's suit has none (it never wears out). Idempotent. → the thing.
 */
export function ensureMag(it) {
    if (!it || !it.magic || it.archmage || it.mag != null) return it;
    const u = hashOf(String(it.uid || it.piece || 'x'));
    if (it.kind === 'robe') {
        it.tier = ROBE_TIERS[it.tier] ? it.tier : u < 0.6 ? 'simple' : u < 0.9 ? 'mid' : 'strong';
        it.mag = it.magMax = spanInt(hashOf(String(it.uid) + 'm'), ROBE_TIERS[it.tier].range);
    } else if (it.kind === 'armor') {
        it.mag = it.magMax = spanInt(u, MAG.ARMOR);
    }
    return it;
}
/** Does it hold a magic reserve at all? (a magic robe / piece, not the High Mage's suit) */
export const hasMag = (it) => !!it && !!it.magic && !it.archmage && (it.kind === 'robe' || it.kind === 'armor');
/** Its reserve right now. */
export const magOf = (it) => (hasMag(it) ? Math.max(0, ensureMag(it).mag) : 0);
/** What a magic robe / piece costs at the wizards' market: by its reserve (the author: 1000 → 10 000 coins). */
export const magPrice = (it) => (it.kind === 'robe' ? it.mag * MAG.ROBE_COIN : it.mag * MAG.PIECE_COIN);

/** Take `amount` of reserve from these slots in turn. Fills `spent` {slot: n}; → what is still unpaid. */
function takeMag(worn, slots, amount, spent) {
    let left = amount;
    for (const s of slots) {
        const it = worn[s];
        if (!(left > 0) || !hasMag(it)) continue;
        const n = Math.min(left, magOf(it));
        if (n > 0) { spent[s] = (spent[s] || 0) + n; left -= n; }
    }
    return left;
}
/**
 * A spell turned away (spellGuard said block): what it costs in reserve — `cost` is the spell's own mana. The whole
 * magic set pays first; what it cannot pay goes to the robe. → {spent: {slot: n}} (the High Mage's suit pays nothing).
 */
export function guardSpend(worn, fx, spell, cost) {
    const spent = {};
    if (!fx || fx.immune.has(spell) || !(cost > 0)) return { spent };
    let left = cost;
    if (fx.magicSet && MAGIC_SET_BLOCKS.has(spell)) left = takeMag(worn, MAG.ORDER, left, spent);
    if (left > 0 && fx.robe === 'magic' && ROBE_BLOCKS.has(spell)) takeMag(worn, ['robe'], left, spent);
    return { spent };
}
/**
 * «Авада Кедавра» of `a` HP on the wearer: not turned away — the magic armour and then the robe cut it (AVADA_K reserve
 * per HP, together at most AVADA_CAP of it). → {hp, spent}
 */
export function avadaCut(worn, a) {
    const spent = {};
    let cap = a * MAG.AVADA_CAP, left = a;
    for (const s of [...MAG.ORDER, 'robe']) {
        const it = worn[s];
        if (!(cap > 0) || !hasMag(it)) continue;
        const cut = Math.min(cap, magOf(it) / MAG.AVADA_K);
        if (!(cut > 0)) continue;
        spent[s] = cut * MAG.AVADA_K; cap -= cut; left -= cut;
    }
    return { hp: Math.max(0, left), spent };
}
export const PIECE_RU = { helmet: 'Шлем', chest: 'Нагрудник', legs: 'Поножи' };
const PIECE_OF = { helmet: 'шлем', chest: 'нагрудник', legs: 'поножи' };

export const ARMOR = {
    HP: { helmet: 10, chest: 20, legs: 10 }, // a plain piece's points (magic × MAGIC_K)
    MAGIC_K: 2, // magic armour (any piece) lasts this many times longer than plain: one constant for the points
    COVER: { helmet: 0.2, chest: 0.5, legs: 0.3 }, // the share of a blow at random that lands on it
    SOAK: 0.8, // where steel covers, it takes this much of the blow (the rest still hurts)
    FIRE_SOAK: 0.4, // fire heats through: steel takes less of it
    REGEN: 0.1, // points a second a magic piece mends by itself
    WEAR_T: 0.45, // s the piece is held at its place on the body to be put on
    SUIT_UP_R: 9, // m: «Suit Up» takes armour lying this near
    GIVE_UP: 3, // arrows bounced off a magic armour: the knights stop shooting at it (a while)
    GIVE_UP_T: 60, // s they don't try again
    ROBE_PRICE: 1000, // (old fixed price; now by the reserve — MAG.ROBE_COIN / PIECE_COIN, magPrice)
    PIECE_PRICE: 450,
};

/**
 * What the steel never takes — no blow on it (the author: «броня должна защищать фактически от всего, кроме исключений»):
 * poison and bleeding are inside, cold goes through it, no air, a fall or a crash onto the ground, the ice's bite while
 * frozen, the web; the killing curse goes through steel as through a knight's (CastleLife). The gods' own spells go through
 * any armour too (Armor.absorb: ProtectionGods.isDivine). EVERYTHING else — a blow, a beast, a zombie, an arrow, a thing
 * thrown, a blast, a falling stone, any spell's charge, fire — the steel takes its share of (a new kind is taken by itself).
 */
const NOT_SOAKED = new Set(['poison', 'bleed', 'cold', 'air', 'fall', 'board', 'iceBite', 'web', 'AvadaKedavra']);
const FIRE = new Set(['Inferno', 'Fire', 'Hellfire', 'fire']);

/** The whole magic set: these simplest spells do nothing (they bounce off). */
export const MAGIC_SET_BLOCKS = new Set(['LevitateDuel', 'Levitation', 'Stupefy', 'IceDuel', 'Ice', 'Frozen', 'chill', 'Jolt']);
/** A magic robe: every simplest spell on its wearer does nothing — and no cold. */
// («Экспеллиармус» is not here: it acts on the WAND in the hand, not on the body or the robe — the author. The robe never turned it away.)
export const ROBE_BLOCKS = new Set([...MAGIC_SET_BLOCKS, 'SapiraDuel', 'Sapira', 'SandsDuel', 'Sands', 'Inferno', 'Fire', 'IceBall', 'cold', 'Disarmor']);
/** Strong spells a magic robe may soften (−50 %, only these): spell → the damage kind it does. */
export const ROBE_STRONG = { AvadaKedavra: 'AvadaKedavra', LightningStrike: 'Lightning', Thunderwave: 'Thunderwave', BombardoMaxima: 'Bombardo', Hellfire: 'Hellfire', TotalDestruction: 'collapse' };
export const STRONG_RU = { AvadaKedavra: 'Авада Кедавра', LightningStrike: 'Lightning Strike', Thunderwave: 'Thunderwave', BombardoMaxima: 'Бомбардо Максима', Hellfire: 'Let the Hellfire Come', TotalDestruction: 'Total Destruction' };

/**
 * The perks of a named armour (a dragon's lair): rolled when it is found, different every time.
 *   dmg      damage kind → multiplier;  immune  spells that do nothing;  stat  numbers the game reads
 */
export const PERKS = [
    { id: 'fire50', ru: 'Стойкость к огню +50%', dmg: { Inferno: 0.5, Fire: 0.5, Hellfire: 0.5, fire: 0.5 } },
    { id: 'noFall', ru: 'Падения и землетрясения не ранят (кроме очень сильных)', stat: { noFall: 1 } },
    { id: 'fly40', ru: 'Полёт на 40% быстрее', stat: { fly: 1.4 } },
    { id: 'run15', ru: 'Бег на 15% быстрее', stat: { run: 1.15 } },
    { id: 'immStupefy', ru: 'Невосприимчивость к «Остолбеней»', immune: ['Stupefy'] },
    { id: 'immJolt', ru: 'Невосприимчивость к «Джолт» (и к «Джолт Максима»)', immune: ['Jolt', 'JoltMaxima'] },
    { id: 'immSapira', ru: 'Невосприимчивость к «Сапира»', immune: ['SapiraDuel', 'Sapira'] },
    { id: 'immSands', ru: 'Невосприимчивость к «Даст»', immune: ['SandsDuel', 'Sands'] },
    { id: 'immExpel', ru: 'Невосприимчивость к «Экспеллиармус»: палочку не выбить', immune: ['Expelliarmus'] },
    { id: 'immLev', ru: 'Невосприимчивость к «Вингардиум Левиоса»', immune: ['LevitateDuel', 'Levitation'] },
    { id: 'avadaHalf', ru: '«Авада Кедавра» ранит вдвое слабее', dmg: { AvadaKedavra: 0.5 } },
    { id: 'storm50', ru: 'Молния и «Thunderwave» ранят вдвое слабее', dmg: { Lightning: 0.5, Thunderwave: 0.5 } },
    { id: 'blast50', ru: 'Взрывы и обвалы ранят вдвое слабее', dmg: { Bombardo: 0.5, Cannon: 0.5, collapse: 0.5 } },
    { id: 'blade30', ru: 'Мечи, кулаки и стрелы ранят на 30% слабее', dmg: { melee: 0.7, knight: 0.7, arrow: 0.7 } },
    { id: 'beast50', ru: 'Звери, укусы и яд ранят вдвое слабее', dmg: { animal: 0.5, bite: 0.5, poison: 0.5 } },
    { id: 'cold', ru: 'Не мёрзнет: холод и «Айс» не берут', dmg: { cold: 0, IceBall: 0.5 }, immune: ['IceDuel', 'Ice', 'Frozen', 'chill'] },
    { id: 'mana50', ru: 'Мана восстанавливается на 50% быстрее', stat: { manaRegen: 1.5 } },
    { id: 'maxMana20', ru: '+20 к запасу маны, пока надет', stat: { maxMana: 20 } },
    { id: 'maxHp5', ru: '+5 к здоровью, пока надет', stat: { maxHp: 5 } },
    { id: 'cheap10', ru: 'Заклинания на 10% дешевле', stat: { cost: 0.9 } },
    { id: 'heal', ru: 'Раны затягиваются: +1 HP каждые 20 секунд', stat: { heal: 1 / 20 } },
    { id: 'mend3', ru: 'Доспех чинится втрое быстрее', stat: { mend: 3 } },
    { id: 'steady', ru: 'Толчки, ветер и взрывная волна сдвигают вдвое меньше', stat: { push: 0.5 } },
    { id: 'noBleed', ru: 'Раны не кровоточат', dmg: { bleed: 0 } },
];
export const PERK = Object.fromEntries(PERKS.map((p) => [p.id, p]));

/** The knights whose armour lies in the dragons' lairs. */
const KNIGHTS = ['сэра Гаррета Стойкого', 'сэра Эдмунда Огнеборца', 'сэра Персиваля Белого', 'сэра Ланселота Тихого', 'сэра Бертрана Железнорукого',
    'сэра Годфри Последнего', 'леди Изольды Бесстрашной', 'сэра Ульриха Драконоборца', 'сэра Освальда Седого', 'леди Гвиневры Серебряной', 'сэра Тристана Верного',
    'сэра Роланда Неустрашимого', 'сэра Кая Хромого', 'сэра Бедивера Однорукого', 'леди Морганы Стальной', 'сэра Гавейна Зелёного'];

const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
const shuffled = (r, list) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const pieceMax = (it) => (ARMOR.HP[it?.piece] || 0) * (it?.magic ? ARMOR.MAGIC_K : 1);

/** One armour piece (a thing): plain or magic. */
export function makePiece(piece, { magic = false } = {}, r = Math.random) {
    const it = { kind: 'armor', uid: armorUid(), piece, magic: !!magic };
    it.hp = pieceMax(it);
    if (it.magic) it.mag = it.magMax = spanInt(r(), MAG.ARMOR);
    return it;
}

/** A robe (a thing): plain (clothes) or magic (with maybe 2–3 strong spells it softens). */
export function makeRobe(magic = false, r = Math.random, tier = null) {
    const it = { kind: 'robe', uid: armorUid(), magic: !!magic, color: magic ? pick(r, [0x4b2a7a, 0x1f2f6b, 0x5a1d4e, 0x123f4a]) : pick(r, [0x2c3e7a, 0x6b2b2b, 0x2f5a3a, 0x5a4632]) };
    if (magic) { it.tier = ROBE_TIERS[tier] ? tier : rollRobeTier(r); it.mag = it.magMax = spanInt(r(), ROBE_TIERS[it.tier].range); }
    if (magic && r() < 0.5) it.strong = shuffled(r, Object.keys(ROBE_STRONG)).slice(0, 2 + (r() < 0.4 ? 1 : 0));
    return it;
}

/**
 * A named set (a dragon's lair): three magic pieces of one dead knight. The set's perks
 * (2, on the whole set worn) and each piece's own (now and then one) — rolled now, never the same.
 */
export function rollNamedSet(r = Math.random) {
    const who = pick(r, KNIGHTS);
    const ids = shuffled(r, PERKS.map((p) => p.id));
    const set = { id: armorUid(), name: `Доспех ${who}`, perks: ids.slice(0, 2) };
    let k = 2;
    return PIECES.map((piece) => {
        const it = makePiece(piece, { magic: true });
        it.named = `${PIECE_RU[piece]} ${who}`;
        it.set = set;
        it.perks = r() < 0.6 ? [ids[k++]] : [];
        return it;
    });
}

/** A chest's armour (a single piece, never a set): magic ones half as often as plain. */
export function rollChestArmor(r = Math.random, { royal = false, wizard = false } = {}) {
    const x = r();
    const pPlain = royal ? 0.12 : wizard ? 0.04 : 0.14;
    const pMagic = royal ? 0.45 : wizard ? 0.09 : 0.07; // (a royal chest: mostly the fine things; the wizards keep magic ones)
    const pRobe = royal ? 0.06 : wizard ? 0.03 : 0.012; // a magic robe: many times rarer than armour
    if (x < pMagic) return makePiece(pick(r, PIECES), { magic: true });
    if (x < pMagic + pPlain) return makePiece(pick(r, PIECES));
    if (x < pMagic + pPlain + pRobe) return makeRobe(true, r);
    if (!royal && x < pMagic + pPlain + pRobe + 0.03) return makeRobe(false, r);
    return null;
}

/** What a thing of armour is worth at a market. */
export function armorValue(it) {
    if (it.archmage) return 0; // (the High Mage's suit: not for sale — it is earned)
    if (it.kind === 'robe') return it.magic ? magPrice(ensureMag(it)) + 80 * (it.strong?.length || 0) : 25;
    if (it.named) return Math.max(900, magPrice(ensureMag(it)));
    const base = { helmet: 40, chest: 70, legs: 45 }[it.piece] || 40;
    return it.magic ? magPrice(ensureMag(it)) : base;
}

/** «Раскрой свои секреты»: what the hologram says. */
export function describeArmor(it) {
    if (it.lord) {
        const mag = it.magic ? ` Запас магической прочности — ${Math.round(it.mag ?? 0)} из ${it.magMax ?? 0}: наряд поглотил вашу мантию и несёт её силу.` : '';
        return { title: '🜏 Облачение тёмного мага', color: 0x8a3be8, lines: [
            'Тёмная накидка и капюшон, в тени которого не видно лица. Это часть вас самих: снять её нельзя, пока на вас проклятие.' + mag,
            'Любой доспех, который вы наденете, почернеет и сломается: обычный через 10 минут носки, волшебный через 20.',
            'Снять проклятие может только зелье снятия проклятия тёмного мага.',
        ] };
    }
    if (it.archmage) {
        return { title: '🌟 Костюм Высшего мага', color: 0xffd36e, lines: [
            'Даётся только за статус «Высший маг» — за все ачивки',
            'Любое заклинание ранит на 40% слабее — поверх обычной защиты волшебной мантии',
            'Как волшебная мантия: холод не берёт, простейшие заклинания («Инферно», «Остолбеней», «Левиоса», «Айс», «Сапира», «Даст», «Экспеллиармус») не действуют',
            'Не слетает от «Disarmor» и остаётся с вами после смерти',
            'Надевается на всё тело — приложите его к груди',
        ] };
    }
    if (it.kind === 'robe') {
        if (!it.magic) return { title: '🧥 Мантия', color: it.color ?? 0x2c3e7a, lines: ['Обычная мантия: просто красивый наряд, без волшебства', 'Надевается на всё тело — приложите её к груди'] };
        ensureMag(it);
        const lines = [`Запас прочности: <b>${Math.round(it.mag)}</b> из ${it.magMax ?? it.mag} (${ROBE_TIERS[it.tier]?.ru || ''} мантия)`,
            'Каждое отбитое заклинание тратит запас — столько маны, сколько оно стоит; когда запас кончится, мантия рассыплется',
            'Пока есть запас: холод не берёт, простейшие заклинания на вас не действуют («Инферно», «Остолбеней», «Левиоса», «Айс», «Сапира», «Даст»)',
            'Если надеты и волшебные доспехи, запас сначала тратят они, потом мантия. «Авада Кедавра» не отбивается, но запас срезает её удар'];
        for (const s of it.strong || []) lines.push(`«${STRONG_RU[s]}» ранит вдвое слабее`);
        lines.push('Надевается на всё тело, с колпаком — приложите её к груди');
        return { title: it.named ? `❄️ ${it.named}` : '🧙 Волшебная мантия', color: it.named ? 0xbfe9ff : 0xb58cff, lines };
    }
    const title = it.named ? `✨ ${it.named}` : `${it.magic ? '✨ Волшебный' : '🪖'} ${it.magic ? PIECE_OF[it.piece] : PIECE_RU[it.piece]}`;
    const lines = [`Прочность: <b>${Math.round(it.hp ?? pieceMax(it))}</b> из ${pieceMax(it)}${it.magic ? ' (магическая броня служит вдвое дольше обычной и сама восстанавливается)' : ''}`];
    if (it.magic) lines.push(`Запас магической прочности: <b>${Math.round(ensureMag(it).mag)}</b> из ${it.magMax}. Волшебный комплект целиком отбивает простейшие заклинания и тратит на это запас (столько маны, сколько стоит заклинание); на нуле доспех остаётся на вас, но ничего не отбивает`);
    if (it.magic) lines.push('Весь волшебный комплект: «Левиоса», «Остолбеней», «Айс», «Джолт» не действуют, «Инферно» — вдвое слабее, стрелы отскакивают');
    if (it.set) lines.push(`Весь «${it.set.name}» вместе: ${it.set.perks.map((p) => PERK[p]?.ru).join('; ')}`);
    for (const p of it.perks || []) lines.push(`Сам по себе: ${PERK[p]?.ru}`);
    lines.push(it.piece === 'helmet' ? 'Наденьте: поднесите к голове' : it.piece === 'chest' ? 'Наденьте: приложите к груди' : 'Наденьте: приложите к бедру спереди');
    return { title, color: it.magic ? 0x9fd8ff : 0xb8c2cc, lines };
}

/** The display name of a piece / robe (a slot's title, a hint). */
export function armorName(it) {
    if (!it) return '';
    if (it.archmage) return 'Костюм Высшего мага';
    if (it.lord) return it.magic ? 'Облачение тёмного мага ✨' : 'Облачение тёмного мага';
    if (it.kind === 'robe') return it.named || (it.magic ? 'Волшебная мантия' : 'Мантия');
    return it.named || (it.magic ? `Волшебный ${PIECE_OF[it.piece]}` : PIECE_RU[it.piece]);
}

// ================================================================ protection
/**
 * What is worn, as the rules need it: {helmet, chest, legs, robe} (items or null) →
 * {magicSet, robe: 'magic'|'plain'|null, immune: Set, dmg: {kind: ×}, stat: {…}}.
 */
export function wornEffects(worn = {}) {
    const pieces = PIECES.map((p) => worn[p]).filter(Boolean);
    for (const it of pieces) ensureMag(it);
    ensureMag(worn.robe);
    // (a spent reserve turns nothing away: the set with all three at 0, a robe at 0 — only clothes)
    const magicSet = pieces.length === 3 && pieces.every((it) => it.magic) && pieces.some((it) => magOf(it) > 0);
    const robeLive = !!worn.robe?.magic && (!!worn.robe.archmage || magOf(worn.robe) > 0);
    const fx = { magicSet, robe: worn.robe ? (robeLive ? 'magic' : 'plain') : null, archmage: !!worn.robe?.archmage, immune: new Set(), dmg: {}, stat: {}, perks: [] };
    const perkIds = [];
    for (const it of pieces) perkIds.push(...(it.perks || []));
    // a named set's own perks: only when all three of the same set are worn
    const set = pieces[0]?.set;
    if (set && pieces.length === 3 && pieces.every((it) => it.set?.id === set.id)) perkIds.push(...set.perks);
    for (const id of perkIds) {
        const P = PERK[id];
        if (!P) continue;
        fx.perks.push(id);
        for (const s of P.immune || []) fx.immune.add(s);
        for (const [k, m] of Object.entries(P.dmg || {})) fx.dmg[k] = (fx.dmg[k] ?? 1) * m;
        for (const [k, v] of Object.entries(P.stat || {})) fx.stat[k] = k === 'maxMana' || k === 'maxHp' || k === 'heal' ? (fx.stat[k] || 0) + v : k === 'noFall' ? 1 : (fx.stat[k] ?? 1) * v;
    }
    if (robeLive) {
        for (const s of worn.robe.strong || []) { const k = ROBE_STRONG[s]; if (k) fx.dmg[k] = (fx.dmg[k] ?? 1) * 0.5; }
        fx.dmg.cold = 0;
    }
    return fx;
}

/**
 * A spell (a duel charge, a beam, a stream) reaches the wearer: does it act?
 * → {block: true, why} | {block: false, mult} (mult: how strong its harm is).
 */
export function spellGuard(fx, spell) {
    if (!fx) return { block: false, mult: 1 };
    if (fx.immune.has(spell)) return { block: true, why: 'perk' };
    if (fx.robe === 'magic' && ROBE_BLOCKS.has(spell)) return { block: true, why: 'robe' };
    if (fx.magicSet && MAGIC_SET_BLOCKS.has(spell)) return { block: true, why: 'armor' };
    if (fx.magicSet && (spell === 'Inferno' || spell === 'Fire')) return { block: false, mult: 0.5 };
    return { block: false, mult: 1 };
}

/**
 * A blow of `amount` (damage kind `kind`) on the wearer: how much reaches the health, and
 * what each worn piece loses. `r` picks where it lands (a piece's COVER share).
 * → {hp, wear: {helmet: n, …}, mag?: {slot: reserve spent}}
 */
export function soakBlow(worn, fx, amount, kind, r = Math.random) {
    let a = amount * (fx?.dmg?.[kind] ?? 1);
    if (fx?.robe === 'magic' && kind === 'cold') a = 0;
    if (fx?.magicSet && FIRE.has(kind)) a *= 0.5; // (the whole magic set: fire does half)
    if (fx?.archmage && SPELL_DAMAGE.has(kind)) a *= ARCHMAGE.SPELL_K; // (the High Mage's suit: −40 % from any spell, on top of the rest)
    const wear = {};
    if (kind === 'AvadaKedavra' && a > 0) { const c = avadaCut(worn, a); return { hp: c.hp, wear, mag: c.spent }; } // (it goes through steel; the reserves cut it)
    if (a <= 0 || NOT_SOAKED.has(kind)) return { hp: Math.max(0, a), wear };
    // where it lands: a piece by its share of the body (bare where nothing is worn)
    let x = r(), on = null;
    for (const p of PIECES) { x -= ARMOR.COVER[p]; if (x < 0) { on = p; break; } }
    const it = on && worn[on];
    if (!it || !(it.hp > 0)) return { hp: a, wear };
    if (kind === 'Thunderwave' && !it.magic) return { hp: a, wear }; // (a blow from above through plain steel: only a magic piece takes it)
    const soak = Math.min(it.hp, a * (FIRE.has(kind) ? ARMOR.FIRE_SOAK : ARMOR.SOAK));
    wear[on] = soak;
    return { hp: a - soak, wear };
}

/** The four armour cells and what is in them, for the screen / the network (0 none, 1 plain, 2 magic, 3 named). */
export function wornCode(worn = {}) {
    const c = (it) => (!it ? 0 : it.archmage ? 4 : it.named ? 3 : it.magic ? 2 : 1); // (4: the High Mage's suit — a robe; 5: the dark mage's outfit — see below)
    const e = Math.max(0, ...['helmet', 'chest', 'legs', 'robe'].map((k) => (worn[k]?.ench ? worn[k].ench.tier + 1 : 0))); // (enchanted: the best level worn, 0 none — the body's glow)
    const rt = worn.robe?.magic && !worn.robe.archmage ? ROBE_TIERS[ensureMag(worn.robe).tier]?.n ?? 0 : 0; // (the robe's kind: how fine it looks)
    const dk = (worn.helmet?.cursed ? 1 : 0) | (worn.chest?.cursed ? 2 : 0) | (worn.legs?.cursed ? 4 : 0); // (blackened by a dark mage's curse — DarkLord.js)
    const out = { h: c(worn.helmet), c: c(worn.chest), l: c(worn.legs), r: worn.robe?.lord ? 5 : c(worn.robe), rc: worn.robe?.color ?? 0, rt, e };
    if (dk) out.dk = dk;
    return out;
}

/**
 * Where a piece is put on: the hand held there. `hand` — the hero's hand (body space: x right, y up
 * from the hips, the face to −z; the arm's depth is the camera's guess, so it is loose: a hand at
 * the face reads ~1.2 in front); `touch` — what the camera's picture shows (PoseInterpreter.bodyTouch:
 * the surer one — it tells a hand ON the chest from a hand held out in front of it). An arm
 * stretched out holding the piece never puts it on.
 */
export function wearSpot(kind, piece, hand, touch = null) {
    const { x, y, z } = hand;
    const spot = kind === 'robe' || piece === 'chest' ? 'chest' : piece === 'helmet' ? 'head' : piece === 'legs' ? 'knee' : null;
    if (!spot) return false;
    if (touch && !touch[spot]) return false;
    // (the camera saw the hand there: the arm's guessed depth only rules out a hand far out — loose)
    if (spot === 'head') return y > 1.2 && y < 3.6 && Math.hypot(x, z) < (touch ? 1.8 : 1.45); // at the head (its middle at y 2.1), on it or over it
    if (spot === 'chest') return Math.abs(x) < (touch ? 1.1 : 0.9) && y > (touch ? -0.1 : 0.2) && y < 1.9 && z < 0.4 && z > (touch ? -2.0 : -1.6); // on the chest (its front at z −0.4)
    // on the thigh / at the knee: below the belt (the hero's arm hangs to y −0.65 — it can't reach lower,
    // so the camera's picture tells the thigh from a hand at the side); unseen — the hand forward of the thigh
    if (!(Math.abs(x) < 1.0 && y > -1.9 && y < (touch ? 0.6 : 0.15) && z > -1.6 && z < 0.8)) return false;
    return touch ? true : z < -0.35 && Math.abs(x) < 0.75;
}

// ================================================================ «Раздеть» («Disarmor»)
/**
 * «Disarmor»: who / what it acts on (CLAUDE.md: «не действует» is written too, with why).
 * The steel flies off in all directions as real things (they can be picked up, put on).
 */
export const DISARMOR_TARGETS = {
    me: { does: 'strip+jolt', why: 'меня отбрасывает, как «Джолт» (кувырок, падение); мои обычные доспехи (и обычная мантия) слетают и разлетаются вокруг; волшебные остаются; решает мой компьютер. Палочка (рука) вверх к небу + «Disarmor» — снимаю с себя сам (без толчка, та же мана): обычное падает рядом, волшебное и костюм Высшего мага остаются' },
    players: { does: 'strip+jolt', why: 'другой игрок (отбрасывает, как «Джолт»): заряд видят все, снимает с себя его компьютер; волшебные доспехи и мантия не снимаются' },
    zombies: { does: 'jolt', why: 'на зомби нет доспехов — его только отбрасывает, как «Джолт»' },
    castlePeople: { does: 'strip+jolt', why: 'всех отбрасывает, как «Джолт»; рыцари и король: латы разлетаются (шлем, нагрудник, поножи — вещи на земле), броня 0, дерутся дальше без неё; волшебники: обычная мантия слетает, волшебная — нет; остальным снимать нечего (толчок)' },
    animals: { does: 'jolt', why: 'животные без доспехов — их только отбрасывает, как «Джолт»' },
    sailors: { does: 'jolt', why: 'моряки без лат — их только отбрасывает, как «Джолт» (на корабле — по палубе, сильно — за борт)' },
    spider: { does: 'none', why: 'панцирь — её собственный, его не снять: не действует' },
    livingTrees: { does: 'none', why: 'кора — не доспех: не действует' },
    bookBirds: { does: 'fall', why: 'как любой заряд: сбивает книгу-птицу' },
    dragon: { does: 'none', why: 'чешуя — не доспех: не действует' },
    iceCastle: { does: 'none', why: 'платье королевы и лёд монстров — не доспехи: не действует (снеговика только откидывает)' },
    blackship: { does: 'none', why: 'камзол капитана Чёрные Усы и лохмотья скелетов — не доспехи; заряд отбрасывает (капитан может отбить его шпагой спереди)' },
    phoenix: { does: 'push', why: 'перья не снимешь — только толчок' },
    owl: { does: 'none', why: 'простое заклинание: сова увёртывается и улетает' },
    canary: { does: 'none', why: 'канарик носит шкуры и кости, а не доспех: снимать нечего' },
    spencer: { does: 'none', why: 'простое заклинание: птичка Спенсера вспугивается и улетает' },
    custom: { does: 'none', why: 'созданное существо не носит доспехов: снимать нечего' },
    gargoyle: { does: 'none', why: 'простое заклинание на каменную горгулью: «Остолбеней» −6, «Джолт» −8 — броня и мантия не при чём (Gargoyles.boltHit)' },
    servants: { does: 'as their kind', why: 'слуга — зомби, житель, животное или дерево: как они' },
    looseThings: { does: 'none', why: 'лежащие доспехи и так ничьи' },
    world: { does: 'none', why: 'корабли, стены, деревья, вода, земля: не действует, заряд разбивается' },
};

// ================================================================ the High Mage's suit
/**
 * The High Mage's suit (Achievements.js: all the achievements, the status «Высший маг»): a
 * robe of midnight blue with gold patterns, glowing runes and a cloak. Only for the status —
 * never in chests, at the market or in the character editor; it stays with its owner on death.
 * Worn as a robe (in the robe's place): every standard protection of a magic robe (ROBE_BLOCKS,
 * no cold) — and on top of it every spell's harm to the health −40 % (ARCHMAGE.SPELL_K).
 */
export const ARCHMAGE = {
    SPELL_K: 0.6, // a spell's harm on the health × this (−40 %), after every other protection
    COLOR: 0x15183f,
    // who / what it acts on (CLAUDE.md): only on its wearer — a player who is a High Mage
    WHO: {
        me: 'на мне: любое заклинание по здоровью −40% поверх защиты волшебной мантии; удары, стрелы, падения, звери — как обычно',
        players: 'другой игрок-Высший маг: так же, решает его компьютер (урон считается у него)',
        others: 'жители, волшебники, рыцари, зомби, животные, моряки, драконы: не носят — костюм только у игроков со статусом',
        world: 'лежащий костюм ничего не делает; «Disarmor» его не снимает; в сундуках, у торговцев и в редакторе персонажа его нет',
    },
};

/** Damage kinds that are spells (Combat.damage `kind`): the suit softens these. */
export const SPELL_DAMAGE = new Set([
    'AvadaKedavra', 'Sapira', 'Sands', 'IceBall', 'Thunderwave', 'Lightning', 'Inferno', 'Fire', 'Hellfire', 'Bombardo',
    'WaterVortex', 'WaterVortexSuperMaxima', 'Liquidation', 'Inspirius', 'Boom', 'CircleAttack', 'CircleAttackMaxima', 'Jolt', 'JoltMaxima',
    'cold', 'air', 'Ward', 'crush', 'thrown', 'TotalDestruction', 'TotalDestructionMaxima', 'Expelliarmus', 'Disarmor', 'Stupefy',
]);

export function makeArchmageSuit() {
    return { kind: 'robe', uid: armorUid(), magic: true, archmage: true, color: ARCHMAGE.COLOR };
}
