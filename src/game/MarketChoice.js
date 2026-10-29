// Buying at a counter: which good the buyer named, the merchant's question «which one?» when several fit,
// and the words of the little holograms over the goods (a key name for a single good, «Первая палочка» for repeats).
// Pure (no THREE): CastleTalk draws the labels and pays; tests/unit/market-choice.test.js checks the rules.
import { ITEM_INFO } from './ItemTypes.js';

/** Words a good is called by (its name's words, and what people say for it). */
const ALIAS = { armor: ['шлем', 'нагруд', 'понож', 'доспех', 'брон'], magicPouch: ['мешоч', 'магич', 'кошел', 'кошел'], steak: ['мяс', 'стейк', 'жарен'], meat: ['сыро'], redApple: ['яблок', 'красн'], wool: ['шерст', 'пряж'], glass: ['стекл', 'осколк'], flask: ['колб', 'фляг', 'бутыл', 'склян'], crystal: ['кристал'], apple: ['яблок', 'золот'], arrows: ['стрел'], bow: ['лук'], shield: ['щит'], cheese: ['сыр'], bread: ['хлеб'], pie: ['пирог', 'пирож'] };
const PIECE_STEM = { helmet: 'шлем', chest: 'нагруд', legs: 'понож' };
export const normWords = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

/** How well this text names this good: the letters of its words matched (0 — not named). */
export function nameScore(text, item) {
    const words = normWords(text);
    const kind = item.kind === 'coins' && item.magic ? 'magicPouch' : item.kind;
    const stems = [...(ALIAS[kind] || normWords(ITEM_INFO[item.kind]?.name || '').filter((w) => w.length >= 3).map((w) => w.slice(0, Math.max(3, w.length - 2))))];
    if (item.kind === 'weapon') stems.push(item.type === 'axe' ? 'топор' : 'меч');
    let n = 0;
    for (const st of stems) if (words.some((w) => w.startsWith(st) && (st.length > 3 || w.length <= st.length + 2))) n += st.length;
    return n;
}

/** nameScore, but «шлем» names only a helmet (not every piece of armour). */
export function goodScore(text, item) {
    const s = nameScore(text, item);
    if (s && item.kind === 'armor') {
        const words = normWords(text);
        const asked = Object.keys(PIECE_STEM).filter((p) => words.some((w) => w.startsWith(PIECE_STEM[p])));
        if (asked.length && !asked.includes(item.piece)) return 0;
    }
    return s;
}
/** Does this text name this good? */
export const namesGood = (text, item) => goodScore(text, item) > 0;

/** The goods this text names best (all of the top score; [] — none). */
export function namedGoods(text, goods) {
    let best = 0, out = [];
    for (const g of goods) {
        const sc = goodScore(text, g.item);
        if (sc > best) { best = sc; out = [g]; } else if (sc === best && sc > 0) out.push(g);
    }
    return out;
}
/** The one good this text names — null when none, or when several fit equally (the merchant asks, never guesses). */
export function namedGood(text, goods) {
    const r = namedGoods(text, goods);
    return r.length === 1 ? r[0] : null;
}

// ---------------------------------------------------------------- the words of a good
// kind -> [key name, gender m|f|n|p, family (what counts as «the same sort» for first/second/third)]
const NOUN = {
    wand: ['палочка', 'f'], scroll: ['свиток', 'm'], shield: ['щит', 'm'], backpack: ['рюкзак', 'm'], bow: ['лук', 'm'], hammer: ['молот Тора', 'm'],
    apple: ['золотое яблоко', 'n', 'яблоко'], redApple: ['яблоко', 'n', 'яблоко'], meat: ['сырое мясо', 'n'], steak: ['стейк', 'm'], book: ['книга', 'f'],
    arrows: ['стрелы', 'p'], bread: ['хлеб', 'm'], cheese: ['сыр', 'm'], pie: ['пирог', 'm'], wool: ['шерсть', 'f'], flask: ['колба', 'f'],
    potion: ['зелье', 'n'], web: ['паутина', 'f'], glass: ['осколки стекла', 'p'], crystal: ['кристалл маны', 'm'], phoenixFeather: ['перо феникса', 'n', 'перо'],
    owlFeather: ['перо совы', 'n', 'перо'], telewilpinLeaf: ['листок телевильпина', 'm'], carnivoreHead: ['головка плотоядной', 'f'], brightCore: ['сердцевина Ярколета', 'f'], canaryHide: ['кожа канарика', 'f'], bone: ['кость', 'f'], minotaurHorn: ['рог минотавра', 'm'], dragonEgg: ['яйцо дракона', 'n'], robe: ['мантия', 'f'],
};
const PIECE_NOUN = { helmet: ['шлем', 'm'], chest: ['нагрудник', 'm'], legs: ['поножи', 'p'] };
const POTION_OF = { heal: 'зелье лечения', invis: 'зелье невидимости' };
const genderOf = (w) => (/[ая]$/.test(w) ? 'f' : /[ое]$/.test(w) ? 'n' : /[ыи]$/.test(w) ? 'p' : 'm');

/** {name, gender, fam}: the key name of a good (the word the merchant understands), its gender, and its family. */
export function describe(item) {
    let name, gender, fam;
    if (item.kind === 'coins' && item.magic) [name, gender] = ['магический мешочек', 'm'];
    else if (item.kind === 'armor') [name, gender] = PIECE_NOUN[item.piece] || ['доспех', 'm'];
    else if (item.kind === 'weapon') [name, gender] = item.type === 'axe' ? ['топор', 'm'] : ['меч', 'm'];
    else if (item.kind === 'potion') { name = POTION_OF[item.rec] || 'зелье'; gender = 'n'; fam = 'зелье'; }
    else if (NOUN[item.kind]) [name, gender, fam] = NOUN[item.kind];
    else { name = String(ITEM_INFO[item.kind]?.name || 'вещь').toLowerCase(); gender = genderOf(name.split(' ')[0]); }
    return { name, gender, fam: fam || name.split(' ')[0] };
}

const ORD = {
    m: ['первый', 'второй', 'третий', 'четвёртый', 'пятый', 'шестой'],
    f: ['первая', 'вторая', 'третья', 'четвёртая', 'пятая', 'шестая'],
    n: ['первое', 'второе', 'третье', 'четвёртое', 'пятое', 'шестое'],
    p: ['первые', 'вторые', 'третьи', 'четвёртые', 'пятые', 'шестые'],
};
// (what the merchant says: «Какую именно — первую, вторую или третью?»; a thing without life is the same as its plain form)
const ORD_ASK = { ...ORD, f: ['первую', 'вторую', 'третью', 'четвёртую', 'пятую', 'шестую'] };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/**
 * Left to right as the buyer sees the counter (he stands at its front): goods sorted that way.
 * A counter long in x is faced along z, one long in z along x.
 */
export function leftToRight(stall, goods) {
    const c = stall?.counter, f = stall?.front;
    if (!c || !f) return [...goods];
    const along = c.x1 - c.x0 >= c.z1 - c.z0;
    const near = along ? f.z >= (c.z0 + c.z1) / 2 : f.x >= (c.x0 + c.x1) / 2;
    const s = (g) => (along ? (near ? g.pos.x : -g.pos.x) : (near ? -g.pos.z : g.pos.z));
    return goods.map((g, i) => ({ g, i })).sort((a, b) => s(a.g) - s(b.g) || a.i - b.i).map((e) => e.g);
}

/**
 * The words over the goods of one counter: uid -> {text, n, fam, gender, name}. A single sort of good gets its key name
 * («Крыло феникса»); a sort that repeats gets a number word in the right gender («Первая палочка») — left to right.
 */
export function labelGoods(stall, goods) {
    const order = leftToRight(stall, goods);
    const info = order.map((g) => ({ g, d: describe(g.item) }));
    const count = new Map();
    for (const e of info) count.set(e.d.fam, (count.get(e.d.fam) || 0) + 1);
    const seen = new Map(), out = new Map();
    for (const { g, d } of info) {
        const n = (seen.get(d.fam) || 0) + 1;
        seen.set(d.fam, n);
        const rep = count.get(d.fam) > 1 && n <= 6;
        out.set(g.uid, { text: cap(rep ? `${ORD[d.gender][n - 1]} ${d.name}` : d.name), n: rep ? n : 0, fam: d.fam, gender: d.gender, name: d.name });
    }
    return out;
}

// ---------------------------------------------------------------- the question and the answer
const ORD_STEM = [['перв', 1], ['втор', 2], ['трет', 3], ['четвер', 4], ['пят', 5], ['шест', 6]];
const NUM_WORD = { один: 1, одна: 1, одно: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6 };
/** «первую», «вторая», «3» → the number (0 — none). `loose`: «один/два/три» too (only as an answer to the question). */
export function ordinalIn(text, loose = false) {
    for (const w of normWords(text)) {
        for (const [st, n] of ORD_STEM) if (w.startsWith(st)) return n;
        if (/^[1-6]$/.test(w)) return +w;
        if (loose && NUM_WORD[w]) return NUM_WORD[w];
    }
    return 0;
}
/** «левую / среднюю / правую» → 'l' | 'm' | 'r' ('' — none). */
export function sideIn(text) {
    for (const w of normWords(text)) {
        if (w.startsWith('лев')) return 'l';
        if (w.startsWith('сред') || w.startsWith('центр')) return 'm';
        if (w.startsWith('прав')) return 'r';
    }
    return '';
}

/** The merchant's question about these goods (they fit equally). */
export function askLine(cands, labels) {
    const L = cands.map((g) => labels.get(g.uid)).filter(Boolean);
    const same = L.length > 0 && L.every((x) => x.fam === L[0].fam && x.n > 0);
    if (same) {
        const g = L[0].gender, w = L.map((x) => ORD_ASK[g][x.n - 1]);
        const which = g === 'f' ? 'Какую' : g === 'n' ? 'Какое' : g === 'p' ? 'Какие' : 'Какой';
        return `${which} именно — ${w.length > 1 ? `${w.slice(0, -1).join(', ')} или ${w[w.length - 1]}` : w[0]}?`;
    }
    const w = L.map((x) => x.text.toLowerCase());
    return `Что именно — ${w.length > 1 ? `${w.slice(0, -1).join(', ')} или ${w[w.length - 1]}` : w[0] || 'что'}?`;
}

/** One good among `cands` by a number / side word of the answer (null — not understood). */
function byWord(text, cands, labels, loose) {
    const n = ordinalIn(text, loose);
    if (n) {
        const hit = cands.filter((g) => labels.get(g.uid)?.n === n);
        if (hit.length === 1) return hit[0];
        if (!hit.length && cands.length > 1) return null;
        if (hit.length > 1) return null;
    }
    const side = loose ? sideIn(text) : ''; // («левую / среднюю» only as an answer: «среднюю палочку» at first may mean the middle in power)
    if (side && cands.length > 1) {
        const sorted = cands; // (cands are kept left to right)
        if (side === 'l') return sorted[0];
        if (side === 'r') return sorted[sorted.length - 1];
        if (sorted.length % 2 === 1) return sorted[(sorted.length - 1) / 2];
    }
    return null;
}

/**
 * The buyer said `text` with his coins on the counter. → {good} (take this one), {ask: [goods]} (several fit: ask which),
 * or null (no good is named). `pending` — the goods the merchant has already asked about: the text is the answer.
 * Never picks by price: the cheaper is not a guess the merchant may make.
 */
export function chooseGood(text, goods, stall, pending = null) {
    const ordered = leftToRight(stall, goods);
    const labels = labelGoods(stall, goods);
    if (pending) {
        const cands = ordered.filter((g) => pending.includes(g.uid));
        if (cands.length) {
            const hit = byWord(text, cands, labels, true);
            if (hit) return { good: hit };
            const named = namedGoods(text, cands);
            if (named.length === 1) return { good: named[0] };
            // (another good named outright: a new wish)
            const other = namedGood(text, ordered);
            if (other && !cands.includes(other)) return { good: other };
            return { ask: cands };
        }
    }
    const named = namedGoods(text, ordered);
    if (!named.length) return null;
    if (named.length === 1) return { good: named[0] };
    const hit = byWord(text, named, labels, false); // («вторую палочку» at once)
    if (hit) return { good: hit };
    return { ask: named };
}

/** Sizes of a label over a good (metres): wide enough to read from 3–4 m, centred above the price card (CastleTalk._tags). */
export const LABEL = { W: 1.2, H: 0.3, UP: 0.42 };
