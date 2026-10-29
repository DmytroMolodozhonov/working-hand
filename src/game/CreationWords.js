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
