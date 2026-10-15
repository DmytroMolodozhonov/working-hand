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

// ------------------------------------------------------------- respawning
/**
 * Places beside a bed to stand at, in the order they are tried: the long
 * sides first, then the foot and the head, a step further out each round.
 * bed {x, z, ry}; dims {W, L}. → [{x, z}]
 */
export function bedSpawnCandidates(bed, dims, gaps = [1.0, 1.8, 2.8]) {
    const c = Math.cos(bed.ry || 0), s = Math.sin(bed.ry || 0);
    // the bed's own axes (as in Beds._nearBed / standUp): across (c, −s), along (s, c)
    const at = (lx, lz) => ({ x: bed.x + lx * c + lz * s, z: bed.z - lx * s + lz * c });
    const out = [];
    for (const g of gaps) {
        const side = dims.W / 2 + g, end = dims.L / 2 + g;
        out.push(at(side, 0), at(-side, 0), at(side, dims.L / 4), at(-side, dims.L / 4), at(side, -dims.L / 4), at(-side, -dims.L / 4), at(0, end), at(0, -end));
    }
    return out;
}

/**
 * Where a player comes back to life at their bed: the first free place beside
 * it with solid ground, facing away from the bed. floorAt(x, z) → the floor
 * height there, or null (no floor, a wall, a drop, something in the way).
 * → {x, y, z, ry} (ry: the hero's rotation.y; the hero looks along (−sin ry, −cos ry)) or null.
 */
export function bedSpawnSpot(bed, dims, floorAt) {
    if (!bed) return null;
    for (const p of bedSpawnCandidates(bed, dims)) {
        const y = floorAt(p.x, p.z);
        if (y == null || !Number.isFinite(y)) continue;
        const dx = p.x - bed.x, dz = p.z - bed.z;
        return { x: p.x, y, z: p.z, ry: Math.atan2(-dx, -dz) };
    }
    return null;
}

/**
 * Where the hero stands up from a bed (and comes back to life at it): a free place beside it IN ITS
 * ROOM — on the floor, nothing in the way from the feet to the head (a wall, a partition, a door,
 * furniture: `blocked(x, y, z)`, the real blocks and boxes), and nothing between it and the bed (a
 * wall the bed stands against is never stepped through into the next room). Nearest first.
 * floorAt(x, z) → the floor there or null. → {x, y, z, ry} or null (no free place: stay by the bed).
 */
export function bedStandSpot(bed, dims, floorAt, blocked, { tall = 4.6, r = 0.45 } = {}) {
    if (!bed) return null;
    const H = [0.4, 1.6, 2.8, tall - 0.3];
    const RING = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]];
    const free = (x, y, z) => H.every((h) => RING.every(([a, c]) => !blocked(x + a, y + h, z + c)));
    // over the mattress from the bed's middle to the place: no wall between them
    const sees = (x, y, z) => {
        const d = Math.hypot(x - bed.x, z - bed.z), n = Math.max(1, Math.ceil(d / 0.2));
        const hs = [Math.max(bed.y + (dims.top ?? 1) + 0.35, y + 0.6), y + 2.2];
        for (let i = 1; i <= n; i++) {
            const px = bed.x + ((x - bed.x) * i) / n, pz = bed.z + ((z - bed.z) * i) / n;
            for (const h of hs) if (blocked(px, h, pz)) return false;
        }
        return true;
    };
    for (const p of bedSpawnCandidates(bed, dims, [0.75, 1.1, 1.6, 2.4])) {
        const y = floorAt(p.x, p.z);
        if (y == null || !Number.isFinite(y) || Math.abs(y - bed.y) > 1.2) continue; // (a drop, a wall's top, a step too high)
        if (!free(p.x, y, p.z) || !sees(p.x, y, p.z)) continue;
        const dx = p.x - bed.x, dz = p.z - bed.z;
        return { x: p.x, y, z: p.z, ry: Math.atan2(-dx, -dz) };
    }
    return null;
}

/**
 * The bed a player respawns at: home {id, x, y, z, ry, gen} (the bed they lay
 * in). beds: Map id → bed (the beds in the world now). A house bed may be
 * unloaded because it is far away — genStands(home) says whether it still
 * stands. → {bed} | {gone: true} (it was destroyed) | null (no bed chosen).
 */
export function homeBed(home, beds, genStands = () => true) {
    if (!home || !home.id) return null;
    const b = beds?.get(home.id);
    if (b) return { bed: b };
    if (home.gen && genStands(home)) return { bed: home };
    return { gone: true };
}
