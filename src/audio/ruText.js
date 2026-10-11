/**
 * ruText.js — a line made ready to be read aloud in Russian: no stage
 * directions, emoji or markup, and numbers written as words («5 монет» →
 * «пять монет»), because a neural voice reads letters, not digits.
 */

const ONES_M = ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять',
    'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function under1000(n, fem) {
    const out = [];
    if (n >= 100) { out.push(HUNDREDS[Math.floor(n / 100)]); n %= 100; }
    if (n >= 20) { out.push(TENS[Math.floor(n / 10)]); n %= 10; if (!n) return out; }
    if (n || !out.length) {
        if (fem && n === 1) out.push('одна');
        else if (fem && n === 2) out.push('две');
        else out.push(ONES_M[n]);
    }
    return out;
}

function thousandsWord(n) {
    const t = n % 100, u = n % 10;
    if (t >= 11 && t <= 14) return 'тысяч';
    if (u === 1) return 'тысяча';
    if (u >= 2 && u <= 4) return 'тысячи';
    return 'тысяч';
}

/** A whole number (0…999 999) in words; `fem` for feminine nouns (одна монета, две монеты). */
export function numberToWords(n, fem = false) {
    n = Math.floor(Math.abs(n));
    if (n >= 1e6) return String(n);
    const th = Math.floor(n / 1000), rest = n % 1000;
    const out = [];
    if (th) { out.push(...under1000(th, true), thousandsWord(th)); if (!rest) return out.join(' '); }
    out.push(...under1000(rest, fem));
    return out.join(' ');
}

// nouns after a number that are feminine (монета, стрела, корова…)
const FEM_NOUN = /^(монет|стрел|корон|коров|овц|минут|секунд|недел|ноч|звёзд|звезд|бутыл|буханк|головк|штук|лошад|свин|золот(ая|ые|ых))/i;

/** Text that TTS reads well. */
export function speakable(text) {
    return String(text ?? '')
        .replace(/\*[^*]*\*/g, ' ')
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/gu, ' ')
        .replace(/[«»"<>]/g, '')
        .replace(/(\d+)(\s*)([А-Яа-яЁё]*)/g, (_, d, sp, word) => `${numberToWords(+d, FEM_NOUN.test(word))}${sp || (word ? ' ' : '')}${word}`)
        .replace(/\s+/g, ' ')
        .trim();
}
