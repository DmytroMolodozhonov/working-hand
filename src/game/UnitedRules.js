/**
 * UnitedRules.js — «Пентаграмма объединённой силы» (United Power, `Pentagranium Unitas`): правила (чистый модуль, без THREE).
 *
 * Чёрная магия (`dark: true`), только со свитка. Объединяет силы ДВУХ предметов ОДНОГО вида в один новый: те две вещи исчезают,
 * появляется одна, у которой все числа СУММИРУЮТСЯ (боевая сила, бафы на заклинания и направления, экономия маны, зачарование пентаграммой…).
 * Цена: тело убитого человекоподобного (не кости), головка плотоядного растения, два предмета одного вида, мана `UNITED.COST` (при слове),
 * и сразу +`UNITED.DARK` к уровню тёмной магии. Готовое можно объединять снова и снова — предел только технический (`LIMIT`).
 * Палочка-результат — своя, тонкая и изящная, случайного цвета из `UNITED_PALETTE`; найти её нигде нельзя (только эта пентаграмма).
 */

export const UNITED = {
    COST: 120, // мана при слове
    DARK: 30, // уровней тёмной магии сразу (в сумме не больше 100 — DarkMagic.addDark)
    RITUAL_S: 5.4, // сколько идёт обряд
    HOVER_Y: 3.4, // на какой высоте над кругом парят предметы (герой ~3,5 м)
};

/** Технические пределы суммы (чтобы числа не переполнялись; «до бесконечности» — на деле очень много). */
export const LIMIT = { power: 2000, favs: 2000, dirs: 2000, save: 0.9, bonus: 5000, max: 5000, slots: 200, arrows: 200 };

/** Красивая палитра палочек (у каждой объединённой свой цвет; индекс хранится в `ucol`). */
export const UNITED_PALETTE = [0x7be0ff, 0xff7ad1, 0xb28cff, 0x7dffb0, 0xffd36e, 0xff8a5c, 0x5cf0e0, 0xe6a0ff, 0xa0ffd8, 0xffb0b0, 0x9fb8ff, 0xf6ff8a];

export const UNITED_NAME_RU = { wand: 'палочку', weapon: 'оружие', shield: 'щит', bow: 'лук', armor: 'часть брони', robe: 'мантию', backpack: 'рюкзак', hammer: 'молот' };

/** Тело, подходящее для обряда: человекоподобное (житель, рыцарь, волшебник, моряк), НЕ кости, не тело героя. → {ok, why?} */
export function bodyOk(b) {
    if (!b) return { ok: false, why: 'Нужно тело убитого человекоподобного' };
    if (b.bones || b.stage === 'bones') return { ok: false, why: 'Кости не подходят — нужно тело, которое ещё не стало скелетом' };
    if (b.lg) return { ok: false, why: 'В этом теле лежит сила героя — оно не подходит' };
    if (b.k !== 'v') return { ok: false, why: 'Нужно тело человекоподобного: жителя, рыцаря, волшебника или моряка' };
    return { ok: true };
}

/** Можно ли объединять вещь: волшебные вещи с бафами/зачарованием (палочка — любая, кроме простой, посоха и палочки дракона). */
export function uniteKind(it) {
    if (!it) return null;
    if (it.kind === 'wand') return it.plain || it.staff || it.dragon ? null : 'wand';
    if (it.kind === 'weapon' || it.kind === 'bow' || it.kind === 'shield' || it.kind === 'backpack' || it.kind === 'hammer' || it.kind === 'robe') return it.archmage ? null : it.kind;
    if (it.kind === 'armor') return 'armor';
    return null;
}

/** Вид «для сравнения»: объединять можно только вещи одного вида (палочка+палочка, щит+щит, меч+меч, шлем+шлем…). */
const speciesOf = (it) => (it.kind === 'weapon' ? `weapon:${it.type}` : it.kind === 'armor' ? `armor:${it.piece}` : it.kind);

/** Можно ли объединить `a` и `b`. → {ok, why?} (why — подсказка игроку, по действию). */
export function canUnite(a, b) {
    if (!a || !b) return { ok: false, why: 'Нужно положить в круг два предмета одного вида' };
    const ka = uniteKind(a), kb = uniteKind(b);
    if (!ka) return { ok: false, why: 'Первый предмет не объединить: нужна волшебная вещь с бафами — палочка, щит, меч, лук, броня…' };
    if (!kb) return { ok: false, why: 'Второй предмет не объединить: нужна волшебная вещь с бафами — палочка, щит, меч, лук, броня…' };
    if (speciesOf(a) !== speciesOf(b)) return { ok: false, why: 'Предметы разного вида не объединяются: нужны два одинаковых — палочка и палочка, щит и щит' };
    return { ok: true };
}

const clamp = (v, hi) => Math.min(hi, Math.max(0, v));

// ----------------------------------------------------------------- палочка
/** Все бафы палочки одним видом: {power %, favs {заклинание: %}, dirs {направление: %}, save (доля)} (зачарование пентаграммой переведено в числа). */
export function wandBonuses(w, enchantRow = null) {
    const out = { power: w.power || 0, favs: { ...(w.favs || {}) }, dirs: { ...(w.dirs || {}) }, save: w.uSave || 0 };
    if (w.fav) out.favs[w.fav] = (out.favs[w.fav] || 0) + 40;
    if (w.dir) out.dirs[w.dir] = (out.dirs[w.dir] || 0) + 25;
    if (w.ench && enchantRow) {
        out.power += enchantRow.power?.[w.ench.tier] || 0;
        out.save += enchantRow.save?.[w.ench.tier] || 0;
    }
    return out;
}

/** Сложить две палочки в одну новую. `rnd` — случайные числа (цвет); `ench` — строка ENCHANTS.wand. → {item, capped} */
export function mergeWands(a, b, { uid, rnd = Math.random, ench = null } = {}) {
    const x = wandBonuses(a, ench), y = wandBonuses(b, ench);
    let capped = false;
    const cap = (v, hi) => { if (v > hi) { capped = true; return hi; } return v; };
    const sum = (p, q, hi) => { const o = { ...p }; for (const k of Object.keys(q)) o[k] = cap((o[k] || 0) + q[k], hi); return o; };
    const col = a.united ? a.ucol : b.united ? b.ucol : Math.floor(rnd() * UNITED_PALETTE.length) % UNITED_PALETTE.length;
    const item = {
        kind: 'wand', uid, united: (a.united || 1) + (b.united || 1), ucol: col, color: UNITED_PALETTE[col], model: 0, fav: null, dir: null,
        power: cap(x.power + y.power, LIMIT.power), favs: sum(x.favs, y.favs, LIMIT.favs), dirs: sum(x.dirs, y.dirs, LIMIT.dirs), uSave: cap(x.save + y.save, LIMIT.save),
    };
    return { item, capped };
}

// ----------------------------------------------------------------- остальные вещи
/** Числа вещи, что складываются, по виду. */
const SUM_FIELDS = { weapon: [['bonus', LIMIT.bonus]], bow: [['bonus', LIMIT.bonus], ['arrows', LIMIT.arrows]], shield: [['max', LIMIT.max]], backpack: [['slots', LIMIT.slots]], hammer: [['charges', 99]] };

/** Сложить две вещи не-палочки: первая остаётся основой (вид, внешность), числа и зачарование складываются. `enchSum(it)` — карта зачарования вещи (см. Enchant.enchantSums). */
export function mergeGeneric(a, b, { uid, enchSum = () => null } = {}) {
    let capped = false;
    const item = JSON.parse(JSON.stringify(a));
    item.uid = uid;
    item.united = (a.united || 1) + (b.united || 1);
    for (const [k, hi] of SUM_FIELDS[a.kind] || []) {
        const v = (a[k] || 0) + (b[k] || 0);
        item[k] = Math.min(hi, v);
        if (v > hi) capped = true;
    }
    if (a.magic || b.magic) item.magic = true;
    if (a.kind === 'armor') item.hp = Math.max(a.hp || 0, b.hp || 0);
    const ea = enchSum(a), eb = enchSum(b);
    if (ea || eb) {
        const sum = {};
        for (const m of [ea, eb]) for (const k of Object.keys(m || {})) sum[k] = (sum[k] || 0) + m[k];
        if (sum.shield !== undefined) sum.shield = (ea?.shield ?? 1) + (eb?.shield ?? 1) - 1; // (a multiplier: the bonuses add)
        item.ench = { tier: Math.max(a.ench?.tier ?? 0, b.ench?.tier ?? 0), kind: (a.ench || b.ench).kind, sum };
    }
    return { item, capped };
}

/** Объединить `a` и `b` (одного вида). → {ok, item?, capped?, why?} */
export function mergeItems(a, b, opts = {}) {
    const c = canUnite(a, b);
    if (!c.ok) return c;
    const r = a.kind === 'wand' ? mergeWands(a, b, opts) : mergeGeneric(a, b, opts);
    return { ok: true, ...r };
}

/** Строки для описания объединённой вещи (голограмма, справочник). */
export function describeUnited(it) {
    if (!it?.united) return null;
    const lines = [`Сплав ${it.united} вещей: все бафы сложены`];
    if (it.kind === 'wand') {
        lines.push(`Сила палочки: <b>+${Math.round(it.power || 0)}%</b> в бою`);
        for (const [k, v] of Object.entries(it.favs || {})) lines.push(`Любимое заклинание <b>${k}</b>: +${Math.round(v)}%`);
        for (const [k, v] of Object.entries(it.dirs || {})) lines.push(`Направление <b>${k}</b>: +${Math.round(v)}%`);
        if (it.uSave) lines.push(`Мана дешевле на <b>${Math.round(it.uSave * 100)}%</b>`);
    }
    return { title: it.kind === 'wand' ? '✦ Объединённая палочка' : '✦ Объединённая вещь', color: it.color ?? 0xb28cff, lines };
}

/** «Кто/что» для обряда (CLAUDE.md). */
export const UNITED_TARGETS = {
    me: { does: 'pay', why: 'платит 120 маны при слове, получает +30 к тёмной магии сразу; видит обряд' },
    players: { does: 'look', why: 'видят тёмное пламя, спираль предметов и новую вещь (сообщение pgm uni); платит тот, кто произнёс' },
    castlePeople: { does: 'alarm', why: 'чёрная магия: жители пугаются как у других чёрных пентаграмм (castleLife.alarm "dark")' },
    bodies: { does: 'consume', why: 'тело убитого человекоподобного (житель, рыцарь, волшебник, моряк) растворяется в пламени; кости и тело героя не подходят' },
    items: { does: 'unite', why: 'два предмета одного вида исчезают, появляется один со сложенными бафами; головка плотоядной тоже исчезает; другие вещи в круге не трогаются' },
    zombies: { does: 'none', why: 'не задевает' }, animals: { does: 'none', why: 'не задевает' }, sailors: { does: 'none', why: 'на палубе пентаграмма не создаётся' },
    spells: { does: 'none', why: 'не преграда для зарядов' },
};
