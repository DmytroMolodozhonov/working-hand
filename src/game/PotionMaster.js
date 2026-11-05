/**
 * PotionMaster.js — Мастер зелий в «Логове зельевара» (чистые правила: рецептуар, разбор слов, реплики, подсказки; без THREE).
 * Игровая часть — PotionMasterLife.js.
 *
 * Слова автора: «жителя помощника, который будет просто стоять, а может помогать с зельями. У него тоже будет Вингардиум Левиоса. Он будет
 * знать, как сварить любое зелье, мастер зелеварения. Когда игрок спавнится, он сможет помогать. Они смогут общаться. Он может сам
 * сварить или помочь игроку сварить».
 *
 * Что он умеет (всё — по словам, правилами, сразу, без нейросети; остальной разговор — как у любого жителя):
 *   «какие зелья ты знаешь» · «как сварить зелье удачи» / «рецепт …» · «свари зелье удачи» (сам: огонь, вода, ингредиенты с полок
 *   Левиосой, ждёт, наливает колбу) · «помоги сварить …» (готовит огонь и воду, говорит рецепт — бросает игрок) · «что дальше / чего не
 *   хватает» (смотрит в котёл) · «налей зелье» · «разожги огонь» · «налей воды» · «стоп».
 */

import { RECIPES, INGREDIENT_RU, CAULDRON, recipeById, matchRecipe } from './Potions.js';

const lc = (n) => String(n).charAt(0).toLowerCase() + String(n).slice(1);

export const MASTER = {
    NAME: 'Эрдвин',
    TITLE: 'Мастер зелий',
    SEED: 20261105,
    HP: 400,
    LIFT_T: 1.7, // с: вещь летит с полки к котлу
    GAP_T: 0.7, // с между вещами
    DROP_WAIT: 4.5, // с ждёт, пока вещь упадёт в воду
    BOIL_WAIT: 75, // с ждёт кипения
    BREW_WAIT: 240, // с ждёт готовности
    ARC: 2.6, // м: высота дуги полёта над прямой
    ABOVE: 2.2, // м над краем котла, где вещь отпускают
};

/** Слова-признаки зелий (id рецепта → корни слов; по-русски и по-английски). Новый рецепт без строки — по названию. */
export const POTION_WORDS = {
    heal: ['исцел', 'лечеб', 'здоров', 'heal'],
    clearmind: ['светл', 'ума', 'ясн', 'clear'],
    lordcure: ['проклят', 'тёмного мага', 'темного мага', 'снятия', 'curse'],
    disguise: ['скрыти', 'личност', 'маскиров', 'disguise'],
    dazzle: ['ослепит', 'dazzle', 'обаят'],
    luck: ['удач', 'везен', 'luck'],
    waterbreath: ['дыхани', 'под водой', 'подводн', 'breath'],
    wings: ['крыльев', 'крылья', 'крылы', 'wings'],
    dragonform: ['дракон', 'превращен', 'dragon'],
    mermaid: ['русал', 'mermaid'],
    potionreset: ['обнулен', 'сброс', 'reset'],
};

const norm = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const has = (text, words) => words.some((w) => text.includes(norm(w)));

/** Какое зелье называют слова (или null). */
export function findRecipe(text) {
    const t = norm(text);
    let best = null, bs = 0;
    for (const r of RECIPES) {
        const words = POTION_WORDS[r.id] || [r.name];
        let s = 0;
        for (const w of words) if (t.includes(norm(w))) s += norm(w).length;
        if (s > bs) { bs = s; best = r; }
    }
    return best;
}

/** Ингредиенты рецепта в порядке броска (`order` — как велено, иначе по списку), с повторами по числу. */
export function planOf(r) {
    const out = [];
    if (r.order) return r.order.slice();
    for (const [k, n] of Object.entries(r.ingredients)) for (let i = 0; i < n; i++) out.push(k);
    return out;
}

export const ingName = (k) => INGREDIENT_RU[k] || k;

/** «золотое яблоко, кристалл маны и перо феникса» */
export function listRu(kinds) {
    const names = [...new Set(kinds)].map((k) => { const n = kinds.filter((x) => x === k).length; return n > 1 ? `${ingName(k)} ×${n}` : ingName(k); });
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}` : names[0] || '';
}

/** Что говорит про рецепт. */
export function recipeLine(r) {
    const plan = planOf(r);
    const order = r.order ? ' Порядок важен: бросайте именно в таком порядке.' : '';
    return `${r.name}: ${listRu(plan)}. Вода должна кипеть, и всё нужно бросить в котёл за ${r.window || CAULDRON.WINDOW} секунд.${order}`;
}

/** Какие зелья знает (для «что ты умеешь»). */
export function knownLine() {
    return `Я знаю все зелья: ${RECIPES.map((r) => r.name.replace(/^Зелье /, '')).join(', ')}. Скажите «как сварить» и название — расскажу, или «свари» — сварю сам.`;
}

/**
 * Намерение по словам. → { kind, rec? } | null.
 * kinds: 'list' | 'recipe' | 'brew' | 'help' | 'hint' | 'give' | 'fire' | 'water' | 'stop' | 'hello'
 */
export function parseIntent(text) {
    const t = norm(text);
    if (!t) return null;
    const rec = findRecipe(t);
    if (/(^| )(стоп|отмена|отставить|хватит|не надо|не нужно|прекрати)( |$)/.test(t)) return { kind: 'stop' };
    if (/(разожги|зажги|подожги|включи огонь|огонь под котл)/.test(t)) return { kind: 'fire' };
    if (/(налей|добавь|долей|набери|плесни) .*вод/.test(t) || /(^| )воды( |$)/.test(t) && /(налей|дай)/.test(t)) return { kind: 'water' };
    if (/(как|рецепт|из чего|что нужно|что надо|что класть|что положить|что бросить|ингредиент|состав)/.test(t) && !/(^| )(свари|сварим|сделай|приготовь|завари)( |$)/.test(t)) return rec ? { kind: 'recipe', rec } : { kind: 'list' };
    if (/(что|какие) .*(знаешь|умеешь|можешь|за зелья|зелья бывают|бывают)/.test(t) || /(список|перечисли) .*зель/.test(t) || /(^| )(какие зелья)( |$)/.test(t)) return { kind: 'list' };
    if (/(что дальше|что еще|что ещё|чего не хватает|что добавить|что класть дальше|что делать дальше|правильно ли|посмотри в котел|что в котле)/.test(t)) return { kind: 'hint' };
    if (/(^| )(свари|сварим|приготовь|завари|сделай|изготовь|сваришь)( |$)/.test(t)) return rec ? { kind: 'brew', rec } : { kind: 'help', ask: true };
    if (/(помоги|помощь|подскажи|научи|вместе)/.test(t)) return rec ? { kind: 'help', rec } : { kind: 'help', ask: true };
    if (/(налей|дай|отлей|наполни|дай мне) .*(зелье|колб|флакон|склянк)/.test(t) || /(^| )(налей|дай) (зелье|мне зелье)/.test(t)) return { kind: 'give' };
    if (/(привет|здравствуй|добрый|здорово|приветствую|hello)/.test(t) && t.length < 40) return { kind: 'hello' };
    if (rec && t.split(' ').length <= 4) return { kind: 'recipe', rec }; // (просто «зелье удачи» — расскажет рецепт)
    return null;
}

/** Что в котле → какое зелье ближе всего и чего не хватает. */
export function hintFor(ings) {
    const have = Object.entries(ings || {}).filter(([, n]) => n > 0);
    if (!have.length) return { empty: true };
    const exact = matchRecipe(ings, null);
    if (exact) return { done: exact };
    let best = null, bs = -1;
    for (const r of RECIPES) {
        const want = r.ingredients;
        // (всё, что в котле, должно входить в рецепт, и не больше положенного)
        if (!have.every(([k, n]) => (want[k] || 0) >= n)) continue;
        const got = have.reduce((a, [, n]) => a + n, 0);
        if (got > bs) { bs = got; best = r; }
    }
    if (!best) return { wrong: true, have: have.map(([k]) => k) };
    const missing = [];
    for (const [k, n] of Object.entries(best.ingredients)) for (let i = 0; i < n - (ings[k] || 0); i++) missing.push(k);
    return { rec: best, missing };
}

export function hintLine(ings) {
    const h = hintFor(ings);
    if (h.empty) return 'В котле пока пусто. Скажите, какое зелье хотите, — подскажу, что класть.';
    if (h.done) return `Всё сошлось — это ${h.done.name}! Ждите, пока оно сварится.`;
    if (h.wrong) return 'Эти вещи вместе зелья не дадут. Лучше вылить котёл и начать заново — скажите, какое зелье нужно.';
    return `Похоже на ${h.rec.name}. Не хватает: ${listRu(h.missing)}.`;
}

/** Реплики мастера (по ситуациям; одну выбирает игра). */
export const LINES = {
    hello: ['Добро пожаловать в моё логово! Я мастер зелий. Спросите, какие зелья я знаю, — или скажите «свари» и название.', 'А, гость! Присаживайтесь… то есть подходите к котлу. Что будем варить?'],
    welcome: 'Добро пожаловать в логово зельевара! Я Эрдвин, мастер зелий. Скажите «свари зелье удачи» или «как сварить…» — помогу.',
    askWhich: ['Какое зелье? Назовите — скажем, «зелье удачи».', 'Что варим? Скажите название зелья.'],
    busy: (name) => `Я занят — варю ${lc(name)}. Скажите «стоп», если передумали.`,
    start: (name) => `Принял! Варим ${lc(name)}. Смотрите, как это делается.`,
    startHelp: (name) => `Хорошо, ${lc(name)}: я разожгу огонь и налью воды, а бросать будете вы. Слушайте рецепт.`,
    noCauldron: 'Котла не вижу… странно. Подойдите к очагу.',
    fire: 'Fire!', water: 'Waterbollow!', lift: 'Вингардиум Левиоса!',
    reset: 'Старое вылью — начнём с чистого котла.',
    boiling: 'Ждём, пока закипит…',
    ready: (name) => `Готово! ${lc(name)}. Окунайте колбы или скажите «налей зелье».`,
    spoiled: 'Не вышло… жижа. Бывает. Вылью и сварю заново, если скажете.',
    given: 'Держите! Колбу не роняйте.',
    notReady: 'Ещё не готово — зелье должно настояться.',
    stopped: 'Хорошо, остановился.',
    idle: 'Я пока ничего не варю. Скажите, что нужно.',
    cantGive: 'Нечего наливать — сначала сварим зелье.',
    thanks: ['Рад помочь!', 'Заходите ещё — у меня всегда что-нибудь кипит.'],
};

/** Описание для нейросети (TRADE_PROMPTS.potionmaster): кто он и все рецепты — цифры игры, не выдумывать. */
export function promptText() {
    return `Ты мастер зелий Эрдвин, живёшь в тёмном каменном логове с большим котлом, ручьём и полками, где лежат все ингредиенты мира. Ты знаешь, как сварить любое зелье, и умеешь двигать вещи заклинанием «Вингардиум Левиоса». Ты можешь сам сварить зелье или научить гостя. Рецепты (точно, не выдумывай другие): ${RECIPES.map((r) => `${r.name} — ${listRu(planOf(r))}`).join('; ')}. Вода в котле должна кипеть, всё бросают за полминуты. Говоришь неспешно, как учёный старик, любишь свою работу.`;
}

export { recipeById };
