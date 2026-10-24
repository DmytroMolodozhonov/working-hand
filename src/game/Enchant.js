/**
 * Enchant.js — «Пентаграмма зачарования»: правила (чистый модуль, без THREE).
 *
 * Пентаграмма светлая (`dark: false`), сиренево-золотая, постоянная: нарисовал один раз — стоит навсегда. Учится сжиганием
 * свитка (как остальные пентаграммы). Рисунок — ENCHANT_PENTAGRAM.draw (круг + вписанный ромб-кристалл с точкой-искрой).
 *
 * Предмет лежит на земле внутри круга (брошен, выпал из руки, положен рукой, опущен Левитацией) — по ОДНОМУ за раз.
 * Идёт обряд (RITUAL_S секунд: столб света, руны, предмет парит и вращается, вспышка, мелодия). С игрока списывается
 * 30 % ТЕКУЩЕЙ маны (мана в наличии, не ячейки; округление вверх). Чем больше списано — тем вероятнее крутое зачарование
 * (`enchantTier`, плавная функция, не чистый рандом). Меньше MIN_MANA в наличии — обряд не начинается.
 * Зачарованное (`item.ench = {tier, kind}`) второй раз не зачаровать; блоки, монеты, еда, свитки, книги — нельзя.
 *
 * Все числа — в одной таблице ENCHANTS; применяются через `enchantMul / enchantAdd` в существующих формулах
 * (урон оружия, лука, защита доспехов и мантий, щит, сила и цена палочки).
 */

export const ENCHANT = {
    SHARE: 0.3, // доля ТЕКУЩЕЙ маны, которую берёт обряд
    MIN_MANA: 10, // меньше маны в наличии — не начинается
    RITUAL_S: 4.5, // сколько идёт обряд
    HOVER_Y: 3.2, // на какой высоте над центром круга парит предмет (герой ~3,5 м)
    RADIUS: 4.5, // радиус круга, м (чертёж 9 м, герой ~3,5 м)
};

export const ENCHANT_TIERS = [
    { id: 0, ru: 'Слабое', color: 0xc9b8ff, glow: '#c9b8ff' },
    { id: 1, ru: 'Хорошее', color: 0xb98cff, glow: '#b98cff' },
    { id: 2, ru: 'Сильное', color: 0xffd36e, glow: '#ffd36e' },
    { id: 3, ru: 'Великое', color: 0xfff6dc, glow: '#fff6dc' },
];

const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/** Мана, которую возьмёт обряд при `mana` в наличии (30 %, вверх). */
export const enchantCost = (mana) => Math.max(0, Math.ceil(Math.max(0, mana) * ENCHANT.SHARE - 1e-9)) || 0;

/**
 * Вес каждого уровня при списанной мане `spent` (слабое = 1, остальные растут плавно со своим порогом):
 *   Хорошее 1,6·S((s−8)/80)   Сильное 1,2·S((s−25)/140)   Великое 0,9·S((s−15)/200),  S — «гладкая ступенька» 0…1.
 */
export function tierWeights(spent) {
    const s = Math.max(0, spent);
    return [1, 1.6 * smooth((s - 8) / 80), 1.2 * smooth((s - 25) / 140), 0.9 * smooth((s - 15) / 200)];
}

/** Шансы уровней (сумма 1). */
export function tierChances(spent) {
    const w = tierWeights(spent), t = w[0] + w[1] + w[2] + w[3];
    return w.map((x) => x / t);
}

/** Какой уровень выпал: детерминированно от `rng()` ∈ [0,1). */
export function enchantTier(spent, rng = Math.random) {
    const p = tierChances(spent);
    let x = rng();
    for (let i = 0; i < 4; i++) { x -= p[i]; if (x < 0) return i; }
    return 3;
}

// ----------------------------------------------------------------- что можно зачаровать и что это даёт
/** Вид зачарования по вещи (null — нельзя). */
export function enchantKind(it) {
    if (!it) return null;
    if (it.kind === 'armor') return it.piece === 'helmet' ? 'helmet' : it.piece === 'legs' ? 'legs' : 'chest';
    if (it.kind === 'robe') return it.archmage ? null : 'robe'; // (костюм Высшего мага — ачивка, ему нечего добавить)
    if (it.kind === 'weapon') return 'weapon';
    if (it.kind === 'bow') return 'bow';
    if (it.kind === 'shield') return 'shield';
    if (it.kind === 'wand') return 'wand'; // (a wizard's wand and a wanderer's staff: both kind 'wand')
    if (it.kind === 'hammer') return 'hammer';
    if (it.kind === 'backpack') return 'backpack';
    return null; // блоки, монеты, еда, свитки, книги, зелья, ингредиенты, Ледяной Жезл (дар богов) …
}

/**
 * Числа по уровням [Слабое, Хорошее, Сильное, Великое]. Все малые и аккуратные.
 *   dmg    — доля меньше урона по здоровью (после брони) | cut — доля меньше износа деталей
 *   atk    — доля больше урона | keen — оружие не тупится (запас)
 *   shield — во сколько раз больше силы щита; plain — на сколько выше порог поломки простого щита
 *   uses   — сколько лишних ударов молнии за грозу (молот Тора) | slots — лишние ячейки рюкзака
 *   power  — добавка к силе заклинаний палочки, % | save — доля дешевле мана
 */
export const ENCHANTS = {
    helmet: { dmg: [0.03, 0.05, 0.08, 0.12], cut: [0.15, 0.3, 0.45, 0.6], text: 'раны сильнее смягчаются, шлем изнашивается медленнее' },
    chest: { dmg: [0.04, 0.07, 0.11, 0.16], cut: [0.15, 0.3, 0.45, 0.6], text: 'раны сильнее смягчаются, нагрудник изнашивается медленнее' },
    legs: { dmg: [0.03, 0.05, 0.08, 0.12], cut: [0.15, 0.3, 0.45, 0.6], text: 'раны сильнее смягчаются, поножи изнашиваются медленнее' },
    robe: { dmg: [0.03, 0.06, 0.1, 0.15], text: 'любой урон слабее (заклинания тоже)' },
    weapon: { atk: [0.08, 0.16, 0.26, 0.4], text: 'бьёт сильнее, клинок не тупится' },
    bow: { atk: [0.08, 0.16, 0.26, 0.4], text: 'стрелы бьют сильнее' },
    shield: { shield: [1.15, 1.3, 1.5, 1.8], plain: [0, 5, 10, 20], text: 'выдерживает больше ударов и заклинаний' },
    hammer: { uses: [0, 1, 1, 2], text: 'молния попадает в молот чаще за одну грозу' },
    backpack: { slots: [0, 1, 1, 2], text: 'в рюкзак влезает больше вещей' },
    wand: { power: [3, 6, 10, 15], save: [0.02, 0.04, 0.06, 0.1], text: 'заклинания сильнее (сверх обычных +15 %) и дешевле' },
};

/** Можно ли положить на пентаграмму. → {ok, why?} (why — подсказка игроку, по действию). */
export function canEnchant(it) {
    if (!it) return { ok: false, why: 'Это нельзя зачаровать' };
    if (it.ench) return { ok: false, why: 'Предмет уже зачарован' };
    if (!enchantKind(it)) return { ok: false, why: 'Это нельзя зачаровать' };
    return { ok: true };
}

/** Зачаровать (меняет вещь на месте). */
export function applyEnchant(it, tier) {
    const c = canEnchant(it);
    if (!c.ok) return null;
    it.ench = { tier: Math.max(0, Math.min(3, tier | 0)), kind: enchantKind(it) };
    return it.ench;
}

const row = (it) => (it?.ench ? ENCHANTS[it.ench.kind] : null);
const num = (r, k, e) => (e.sum ? (e.sum[k] ?? 0) : r && r[k] ? r[k][e.tier] : 0); // (`sum`: several enchantments united on the pentagram of united power — UnitedRules.js)

/** The numbers of a thing's enchantment as a map (for uniting): from the table by its tier, or its own `sum`; null — not enchanted. */
export function enchantSums(it) {
    if (!it?.ench) return null;
    if (it.ench.sum) return { ...it.ench.sum };
    const r = ENCHANTS[it.ench.kind], out = {};
    for (const k of Object.keys(r || {})) if (Array.isArray(r[k])) out[k] = r[k][it.ench.tier];
    return out;
}

/** Добавка (доля/число) по ключу, 0 если нет. */
export function enchantAdd(it, key) { return it?.ench ? num(row(it), key, it.ench) : 0; }

/** Множитель «1 + добавка» (урон оружия, лука). */
export const enchantMul = (it, key = 'atk') => 1 + enchantAdd(it, key);

/** Во сколько раз меньше износ детали доспеха (1 — как раньше). */
export const wearMul = (it) => 1 - enchantAdd(it, 'cut');

/** Сколько здоровья доходит после зачарованных доспехов `worn` ({helmet, chest, legs, robe}): общий множитель урона. */
export function enchantSoak(worn = {}) {
    let m = 1;
    for (const k of ['helmet', 'chest', 'legs', 'robe']) m *= 1 - enchantAdd(worn[k], 'dmg');
    return m;
}

/** Сила щита (магического): множитель; порог поломки простого щита: добавка. */
export const shieldMul = (it) => (it?.ench ? num(row(it), 'shield', it.ench) || 1 : 1);
export const shieldPlain = (it) => enchantAdd(it, 'plain');

/** Палочка: множитель силы заклинаний и множитель цены маны. */
export const wandPowerMul = (it) => 1 + enchantAdd(it, 'power') / 100;
export const wandCostMul = (it) => Math.max(0.1, 1 - enchantAdd(it, 'save') - (it?.uSave || 0));

/** Цена вещи растёт с зачарованием (рынок). */
export const enchantValueMul = (it) => (it?.ench ? [1.25, 1.6, 2.2, 3.2][it.ench.tier] : 1);

/** Название уровня + короткое описание бонуса (голограмма, справочник, подсказка). */
export function describeEnchant(it) {
    if (!it?.ench) return null;
    const T = ENCHANT_TIERS[it.ench.tier], R0 = ENCHANTS[it.ench.kind], t = it.ench.tier, S = it.ench.sum;
    const R = S ? Object.fromEntries(Object.keys(R0).map((k) => [k, Array.isArray(R0[k]) ? Array.from({ length: 4 }, () => S[k] ?? (k === 'shield' ? 1 : 0)) : R0[k]])) : R0; // (united: the summed numbers stand for every tier)
    const bits = [];
    if (R.dmg) bits.push(`−${Math.round(R.dmg[t] * 100)}% урона`);
    if (R.cut) bits.push(`износ −${Math.round(R.cut[t] * 100)}%`);
    if (R.atk) bits.push(`+${Math.round(R.atk[t] * 100)}% урона`);
    if (R.shield) bits.push(`сила щита ×${R.shield[t]}`);
    if (R.uses) bits.push(R.uses[t] ? `+${R.uses[t]} молнии за грозу` : 'молот легче ловит молнию');
    if (R.slots) bits.push(R.slots[t] ? `+${R.slots[t]} яч. рюкзака` : 'рюкзак крепче');
    if (R.power) bits.push(`+${R.power[t]}% силы заклинаний`);
    if (R.save) bits.push(`мана −${Math.round(R.save[t] * 100)}%`);
    return { title: `✦ ${T.ru} зачарование`, color: T.color, glow: T.glow, lines: [R.text, bits.join(', ')] };
}

// ----------------------------------------------------------------- пентаграмма
/**
 * Рисунок для таблицы PENTAGRAMS: фигуры в единицах радиуса R (центр 0,0): круг, вписанный ромб-кристалл
 * (острые вершины вверх/вниз), малый круг-искра в середине. Отличается от звезды дьявольской силы (пятилучевая),
 * телепорта (круг + квадрат + малый круг), жизни и ремонта брони.
 */
export const ENCHANT_DRAW = [
    { t: 'circle', r: 1 },
    { t: 'poly', pts: [[0, -0.86], [0.52, 0], [0, 0.86], [-0.52, 0]] },
    { t: 'circle', r: 0.14 },
];

/** Запись для таблицы `PENTAGRAMS` (если её нет — модуль держит свою, `Pentagram*.js` подхватит по id). */
export const ENCHANT_PENTAGRAM = {
    id: 'enchant', dark: false, glow: 0xc9a8ff, gold: 0xffd36e,
    ru: 'Пентаграмма зачарования', radius: ENCHANT.RADIUS, draw: ENCHANT_DRAW,
    cost: 'ENCHANT.SHARE × текущая мана', permanent: true, scroll: 'EnchantPentagram',
};

/** «Кто/что» для обряда (CLAUDE.md). */
export const ENCHANT_TARGETS = {
    me: { does: 'pay', why: 'платит 30 % текущей маны; видит обряд' },
    players: { does: 'look', why: 'видят столб света и парящий предмет (сообщение «ench»), платит тот, кто начал' },
    items: { does: 'enchant', why: 'один предмет за раз: доспехи, мантии, оружие, лук, щит, палочка/посох, молот Тора, рюкзак; блоки, монеты, еда, свитки, книги, зелья, ингредиенты, дары богов — нельзя' },
    creatures: { does: 'none', why: 'на существ не действует; стоящий в круге не ранится' },
};
