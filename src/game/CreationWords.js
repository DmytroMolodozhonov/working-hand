/**
 * CreationWords.js — the words of «Да пусть создастся …» (DivineCreation.js), the gods' spell said in Russian.
 *
 * The phrase BEGINS with the opener and goes on with what is to be made — a house, a castle «с шестью башнями»,
 * a statue of a pig, a whole city, a creature «с большими глазами и крыльями», a plant… So:
 *   - the opener must stand at the very start (after a little word or two: «ну», «итак», «и»): «да пусть создастся»,
 *     «пусть создастся», «да создастся», «да будет создан(а/о/ы)», «да сотворится», «пусть сотворится»,
 *     «да пусть появится» — as the recognizer writes them («создасться», «создатся», «пуст создастся»…);
 *   - the rest is the description, kept as said (its own words: nothing of it is another spell — this match comes
 *     FIRST in SpellManager.matchSpell, so «…замок с огнём на башнях» is no «Create a Castle» and no «Inferno»);
 *   - everyday talk is safe: «пусть он создаст», «создастся впечатление», «да, пусть будет» never cast — the verb
 *     is the passive «создастся / сотворится / будет создан» right after the opener.
 *
 *   creationWords(text) → {opener, desc} | null     desc '' — the words only (the description may come next)
 */

const FILL = new Set(['ну', 'итак', 'и', 'а', 'так', 'вот', 'теперь', 'давай', 'о', 'эй', 'сейчас', 'щас', 'боги', 'господи']);

// «да» / «пусть» (one of them must be there) + the passive verb of making
const DA = /^(?:да|дай|до)$/;
const PUST = /^(?:пусть|пуст|пущай|пускай|путь|пусь)$/;
const VERB = /^(?:создаст(?:ь)?ся|создатс(?:я|а)|создаться|создасться|созда(?:ст|д)уться|создадутся|создастса|сотворит(?:ь)?ся|сотворятся|сотворица|появит(?:ь)?ся|появятся|возникнет|возникнут|воздвигнет(?:ь)?ся|воздвигнутся|родит(?:ь)?ся)$/;
const BUDET = /^(?:будет|будут|будь)$/;
const MADE = /^(?:создан[аоы]?|сотворен[аоы]?|сотворён)$/;

const norm = (t) => String(t ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 \-]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Is the phrase «Да пусть создастся …»? Its description, as said.
 * @returns {{opener: string, desc: string}|null}
 */
export function creationWords(text) {
    const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
    const w = norm(raw).split(' ').filter(Boolean);
    if (w.length < 2) return null;
    let i = 0;
    while (i < w.length && i < 2 && FILL.has(w[i])) i++;
    let da = false, pust = false, j = i;
    if (DA.test(w[j] || '')) { da = true; j++; }
    if (PUST.test(w[j] || '')) { pust = true; j++; }
    let end = -1;
    if ((da || pust) && VERB.test(w[j] || '')) end = j;
    // «да будет создан(а) …», «пусть будет сотворено …»
    else if ((da || pust) && BUDET.test(w[j] || '') && MADE.test(w[j + 1] || '')) end = j + 1;
    if (end < 0) return null;
    // («да создастся» needs «да» right before the verb — «да, создастся впечатление» is talk: the description must not be «впечатление»)
    const restW = w.slice(end + 1);
    if (!pust && /^(впечатлен|ощущен|чувств|мнение)/.test(restW[0] || '')) return null;
    if (restW.length && /^(впечатлен|ощущен|чувство|мнение)/.test(restW[0])) return null;
    // the description: the words said after the opener (its own letters and numbers kept: «20 здоровья»)
    const opener = w.slice(i, end + 1).join(' ');
    const desc = cutOpener(raw, end + 1);
    return { opener, desc };
}

/** The original text after its first n words (as said: «20 здоровья», commas kept). */
function cutOpener(raw, n) {
    const parts = raw.split(' ');
    let k = 0, seen = 0;
    for (; k < parts.length && seen < n; k++) if (norm(parts[k])) seen++;
    return parts.slice(k).join(' ').replace(/^[\s,.:;—-]+/, '').trim();
}

/**
 * The recognizer's looks at a long phrase still being said overlap and miss its start («тво с большими глазами двумя»,
 * then «глазами двумя крыльями и»…): their words are sewn into one text — the next look goes on after the words they
 * share (a word may be cut at a look's start, or written a little otherwise: «большим» / «большими»).
 *   stitchWords(«…существо за большими», «тво с большими глазами двумя») → «…существо за большими глазами двумя»
 */
export function stitchWords(stream, piece) {
    const A = norm(stream).split(' ').filter(Boolean), B = norm(piece).split(' ').filter(Boolean);
    if (!B.length) return A.join(' ');
    if (!A.length) return B.join(' ');
    const like = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, Math.max(4, b.length - 2))) || b.startsWith(a.slice(0, Math.max(4, a.length - 2)))));
    const W = Math.min(B.length, 7); // (the shared words are at the look's start)
    // the last word said (a long one; a little word «и», «с» — the one before it too) found among the look's first words
    for (let back = 0; back < Math.min(3, A.length); back++) {
        const last = A[A.length - 1 - back];
        if (last.length < 3 && back < Math.min(2, A.length - 1)) continue;
        for (let i = W - 1; i >= 0; i--) {
            if (!like(last, B[i])) continue;
            // (the word before it agrees too, or the look begins right there: the place is sure)
            const prev = A[A.length - 2 - back];
            if (i > 0 && prev && !like(prev, B[i - 1]) && !(i === 1 && prev.endsWith(B[0])) && last.length < 5) continue;
            return [...A, ...B.slice(i + 1 + back)].join(' ');
        }
    }
    // nothing shared: the look goes after (its first word dropped when it is only the end of a cut word)
    const first = B[0];
    const cutWord = first.length <= 4 && A.some((a) => a.length > first.length && a.endsWith(first));
    return [...A, ...B.slice(cutWord ? 1 : 0)].join(' ');
}

/** The opener's words left at the start of sewn looks («создастся существо …» → «существо …»). */
export function dropOpener(text) {
    return norm(text).replace(/^((?:да|дай|до|пусть|пуст|пускай|будет|создаст\S*|создат\S*|сотвор\S*|появ\S*)\s+)+/, '').trim();
}
