/**
 * BedRules.js — the pure rules of beds (no THREE, no DOM; unit-tested):
 * bed colours and the colour words of «Change a color», the recipe of
 * «Create a Bed» (logs + wool lying together) and the sleep check.
 */

/** Bed colours: key → blanket colour, Russian name and the words that name it. */
export const BED_COLORS = {
    white: { hex: 0xf4f1ea, ru: 'белый', words: ['бел', 'white', 'вайт', 'уайт'] },
    red: { hex: 0xc0392b, ru: 'красный', words: ['красн', 'red', 'рэд', 'ред '] },
    blue: { hex: 0x2c5fd6, ru: 'синий', words: ['син', 'blue', 'блю', 'блу'] },
    green: { hex: 0x2e9e4f, ru: 'зелёный', words: ['зелен', 'зелён', 'green', 'грин'] },
    yellow: { hex: 0xf2c94c, ru: 'жёлтый', words: ['желт', 'жёлт', 'yellow', 'еллоу', 'йеллоу', 'елоу'] },
    orange: { hex: 0xe67e22, ru: 'оранжевый', words: ['оранж', 'orange', 'рыж'] },
    purple: { hex: 0x8e44ad, ru: 'фиолетовый', words: ['фиолет', 'purple', 'пёрпл', 'перпл', 'violet', 'сиренев', 'лилов'] },
    pink: { hex: 0xf48fb1, ru: 'розовый', words: ['розов', 'pink', 'пинк'] },
    cyan: { hex: 0x5dade2, ru: 'голубой', words: ['голуб', 'cyan', 'light blue', 'бирюз', 'сайан'] },
    black: { hex: 0x22252b, ru: 'чёрный', words: ['черн', 'чёрн', 'black', 'блэк', 'блек'] },
    brown: { hex: 0x7a4a24, ru: 'коричневый', words: ['коричн', 'brown', 'браун'] },
    gray: { hex: 0x8a8f96, ru: 'серый', words: ['сер', 'gray', 'grey', 'грей'] },
};

export const DEFAULT_BED_COLOR = 'white';

/** The colour named in a phrase («поменяй цвет на синий», «Change a color red») or null. */
export function parseColor(text) {
    const s = ' ' + (text || '').toLowerCase().replace(/ё/g, 'е') + ' ';
    // «light blue» / «голубой» before «blue»; whole-word checks for the short English ones
    const order = ['cyan', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'brown', 'gray'];
    let best = null;
    for (const key of order) {
        for (const w0 of BED_COLORS[key].words) {
            const w = w0.replace(/ё/g, 'е');
            let i = s.indexOf(w);
            // «сер» must not be found inside other words («серебро» is fine, «пересер…» is not a colour)
            while (i >= 0) {
                const before = s[i - 1];
                const okStart = !/[a-zа-я]/.test(before || ' ');
                if (okStart && (!best || i < best.i)) best = { key, i };
                if (okStart) break;
                i = s.indexOf(w, i + 1);
            }
        }
    }
    return best ? best.key : null;
}

/** A colour key (or a hex / unknown value) → the blanket colour. */
export function bedColorHex(color) {
    if (typeof color === 'number') return color;
    return (BED_COLORS[color] || BED_COLORS[DEFAULT_BED_COLOR]).hex;
}

export const bedColorName = (color) => (BED_COLORS[color] || BED_COLORS[DEFAULT_BED_COLOR]).ru;

// ------------------------------------------------------------------ recipe
export const BED_RECIPE = { logs: 4, wool: 3 };
export const RECIPE_RADIUS = 3; // m around the aimed point

/** How many logs / wool lie in a list of loose items [{kind, count}]. */
export function countMaterials(items) {
    let logs = 0, wool = 0;
    for (const it of items || []) {
        if (!it) continue;
        if (it.kind === 'logs') logs += it.count || 1;
        else if (it.kind === 'wool') wool += it.count || 1;
    }
    return { logs, wool };
}

const plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b === 1) return one;
    if (b >= 2 && b <= 4) return few;
    return many;
};

/**
 * Is there enough for a bed? → {ok, logs, wool, message}: message says
 * (in Russian) what is missing.
 */
export function checkRecipe(items, recipe = BED_RECIPE) {
    const { logs, wool } = countMaterials(items);
    const lacks = [];
    if (logs < recipe.logs) { const n = recipe.logs - logs; lacks.push(`${n} ${plural(n, 'бревно', 'бревна', 'брёвен')}`); }
    if (wool < recipe.wool) { const n = recipe.wool - wool; lacks.push(`${n} ${plural(n, 'клубок', 'клубка', 'клубков')} шерсти`); }
    if (!lacks.length) return { ok: true, logs, wool, message: null };
    let message;
    if (!logs && !wool) message = `🛏️ Здесь нет материалов: бросьте рядом ${recipe.logs} бревна (дерево из руки) и ${recipe.wool} клубка шерсти (с баранов) и покажите на них`;
    else message = `🛏️ Нужно ещё: ${lacks.join(' и ')} (лежит брёвен ${logs} из ${recipe.logs}, шерсти ${wool} из ${recipe.wool})`;
    return { ok: false, logs, wool, message };
}

/**
 * Which items to use up: [{uid, take, left}] — whole bundles first,
 * the last one may be used partly (left > 0 stays on the ground).
 */
export function planConsumption(items, recipe = BED_RECIPE) {
    const out = [];
    for (const kind of ['logs', 'wool']) {
        let need = recipe[kind];
        // the biggest piles first: fewer things to remove
        const list = (items || []).filter((it) => it && it.kind === kind).sort((a, b) => (b.count || 1) - (a.count || 1));
        for (const it of list) {
            if (need <= 0) break;
            const have = it.count || 1;
            const take = Math.min(have, need);
            need -= take;
            out.push({ uid: it.uid, kind, take, left: have - take });
        }
        if (need > 0) return null;
    }
    return out;
}

// ------------------------------------------------------------------- sleep
/**
 * Can the night be skipped? Every living player lies in a bed and has kept
 * still long enough. players: [{dead, lying, still}] (still: seconds).
 */
export function everyoneAsleep(players, stillNeeded = 3) {
    const alive = (players || []).filter((p) => p && !p.dead);
    if (!alive.length) return false;
    return alive.every((p) => p.lying && (p.still || 0) >= stillNeeded);
}
