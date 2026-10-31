/**
 * PentagramWords.js — слова пентаграмм (чистый модуль, без THREE). Автор: «Теперь рисовать пентаграммы вообще не надо. Ты направляешь
 * палочку на землю и произносишь пентаграмму… Все пентаграммы начинаются со слова Пентаграниум — первое слово, дальше название
 * конкретной пентаграммы. Названия — на английском. Отдельного заклинания «Пентаграниум» больше НЕТ».
 *
 * Фраза = «Pentagranium» + имя. Одно «Пентаграниум» — не заклинание (ничего не делает). У каждой пентаграммы реестра (`Pentagrams.js`)
 * СВОЁ имя (тест `pentagram-words.test.js`): новая пентаграмма без имени роняет тест.
 */

/** Пентаграниум (первое слово) — как его пишет распознавание речи. */
export const PENT_FIRST = ['pentagrani', 'pentagrany', 'pentogran', 'pentegran', 'pentagran', 'пентаграни', 'пентогран', 'пентагрэни', 'пентегран', 'пентагренум', 'пентаграниум', 'пентагранием', 'пентаграни ум', 'пентагранни', 'пентагрэнни', 'пентогранни', 'pentagrann', 'пентагран ни'];

/** id пентаграммы → английское имя (то, что говорит игрок) и как его пишет распознавание (русские и английские обрывки). */
export const PENT_NAMES = {
    teleport: { en: 'Teleportis', say: ['телепортис', 'телепортес', 'телепортэс', 'тэлэпортис', 'телепортиз'], stems: ['teleportis', 'teleportes', 'телепортис', 'телепортес', 'телепортэс', 'тэлэпортис', 'телепортиз'] },
    life: { en: 'Vita', say: ['вита', 'вайта', 'вита'], stems: ['vita', 'vyta', 'вита', 'вайта', 'вытта'] },
    mend: { en: 'Mendis', say: ['мендис', 'мэндис', 'мендес'], stems: ['mendis', 'mendes', 'мендис', 'мэндис', 'мендес', 'мэндес'] },
    enchant: { en: 'Enchantis', say: ['энчантис', 'инчантис', 'энчантес'], stems: ['enchantis', 'enchantes', 'энчантис', 'инчантис', 'энчантес', 'энчэнтис', 'инчэнтис'] },
    devil: { en: 'Diabolus', say: ['диаболус', 'дьяболус', 'диаболис'], stems: ['diabolus', 'diabolis', 'диаболус', 'дьяболус', 'диаболис', 'диаболюс'] },
    monster: { en: 'Monstrum', say: ['монструм', 'монструн', 'монструм'], stems: ['monstrum', 'monstrun', 'монструм', 'монструн', 'монструм'] },
    breakward: { en: 'Breakward', say: ['брейквард', 'брэйквард', 'брейкворд'], stems: ['breakward', 'breakword', 'брейквард', 'брэйквард', 'брейкворд', 'брэйкворд', 'брейк вард'] },
    unity: { en: 'Unitas', say: ['унитас', 'юнитас', 'унитес'], stems: ['unitas', 'unitus', 'унитас', 'юнитас', 'унитес', 'юнитес', 'унитос'] },
    bare: { en: 'Palmaris', say: ['пальмарис', 'палмарис', 'пальмарес', 'палмарес'], stems: ['palmaris', 'palmares', 'palmarus', 'пальмарис', 'палмарис', 'пальмарес', 'палмарес', 'пальмарус'] },
    vitality: { en: 'Sanguinis', say: ['сангвинис', 'сангуинис', 'сангвинес', 'сангуинес'], stems: ['sanguinis', 'sanguines', 'sangwinis', 'сангвинис', 'сангуинис', 'сангвинес', 'сангуинес', 'сангвинэс', 'сангуйнис', 'санг винис'] },
    night: { en: 'Noctis', say: ['ноктис', 'ноктес', 'ноктиз'], stems: ['noctis', 'noktis', 'noctes', 'ноктис', 'ноктес', 'нокт ис', 'ноктиз'] },
    sight: { en: 'Spectris', say: ['спектрис', 'спектрес', 'спектрэс'], stems: ['spectris', 'spektris', 'spectres', 'спектрис', 'спектрес', 'спектрэс', 'спектриз', 'спекрис'] },
    firm: { en: 'Firmitas', say: ['фирмитас', 'фермитас', 'фирмитес', 'фирмитэс'], stems: ['firmitas', 'firmitus', 'фирмитас', 'фермитас', 'фирмитес', 'фирмитэс', 'фирмитус', 'фирмитос', 'фермитес'] },
    infernum: { en: 'Infernum', say: ['инфернум', 'инфэрнум', 'инфернус', 'инферно'], stems: ['infernum', 'infernus', 'infernom', 'inferno', 'инфернум', 'инфэрнум', 'инфернус', 'инфёрнум', 'инфер нум', 'инфернам', 'инферно', 'инфэрно', 'инфёрно'] }, // («…Инферно»: the author says it so — with «Пентаграниум» in the phrase it is the gates of hell, never the fire spell)
    gargoyles: { en: 'Gargoylis', say: ['гаргойлис', 'гаргоилис', 'гаргойлес', 'гаргульес', 'гаргулес', 'гаргулис'], stems: ['gargoylis', 'gargoyles', 'gargules', 'gargulis', 'gargoyl', 'гаргойлис', 'гаргоилис', 'гаргойлес', 'гаргойлз', 'гаргульес', 'гаргулес', 'гаргулис', 'гаргуль', 'гаргул', 'гаргойл', 'гаргоил'] },
};

/** «Infernum» said with no first word (the first word was in the phrase before a pause, or misheard): the hell pentagram's name,
 *  never the fire spell «Инферно» (its word «инфер…» is inside it). matchSpell and SpellSpotter check it. */
export const INFERNUM_WORD = /инф[еэё]р?\s?ну[мсн]|infern[uo][msn]/;

/** «Пентаграниум» (first word) is in the phrase: then only a pentagram may come of it — no other spell's word inside the name. */
export const pentFirstSaid = (text) => PENT_FIRST.some((w) => String(text || '').toLowerCase().includes(w));

/** «Pentagranium Teleportis» — заклинание пентаграммы `id` (для справочника, свитков и подсказок). */
export const pentagramSpell = (id) => (PENT_NAMES[id] ? `Pentagranium ${PENT_NAMES[id].en}` : null);

/** The name stem is a whole word (or the start of one for long stems): the short «вита» is no part of «витамины». */
function hasName(s, w) {
    let i = s.indexOf(w);
    while (i >= 0) {
        const after = s[i + w.length];
        if (w.length > 5 || after === undefined || !/[a-zа-яё]/.test(after)) return true;
        i = s.indexOf(w, i + 1);
    }
    return false;
}

/** Какая пентаграмма названа во фразе: id или null. Нужны ОБА слова — первое («Пентаграниум») и имя; одно «Пентаграниум» — не заклинание. */
export function pentagramWords(text) {
    const s = String(text || '').toLowerCase().trim();
    if (!s || !PENT_FIRST.some((w) => s.includes(w))) return null;
    // the longest / most exact name wins (not the first in the table): a short stem inside a longer name never takes it
    let best = null, len = 0;
    for (const id of Object.keys(PENT_NAMES)) for (const w of PENT_NAMES[id].stems) if (w.length > len && hasName(s, w)) { best = id; len = w.length; }
    return best;
}

/** Фразы для слухового поиска (SpellSpotter): «пентаграниум телепортис» и т.д. — русским письмом, варианты. */
export function pentagramSaid() {
    const first = ['пентаграниум', 'пентагранием', 'пентагрэниум', 'пентогранием', 'пентагренум'];
    return Object.keys(PENT_NAMES).map((id) => first.flatMap((f) => PENT_NAMES[id].say.map((n) => `${f} ${n}`)));
}
