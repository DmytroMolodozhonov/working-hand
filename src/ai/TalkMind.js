/**
 * TalkMind.js — a villager really talks: a small neural net understands what
 * you said (any words, not a list of phrases) and answers in character; when
 * it means to DO something it calls one of the game actions (TalkActions
 * TOOLS). The game checks every call (validateCall) and carries out only what
 * this villager would really do — the king's orders are obeyed, a stranger's
 * orders to the army are refused.
 *
 * The rule-based brain (VillagerBrain) is always there underneath:
 *  - it runs first, at once (it keeps the memory, the mood and the market);
 *  - clear army orders («собери войско», «в атаку на зомби», «отбой») are
 *    carried out at once by the rules, without waiting for the net;
 *  - no net, a slow net (timeout) or nonsense from the net → the rule answer.
 *
 * Pure logic: no DOM, node-testable with a fake model:
 *   const mind = new TalkMind({ llm });            // llm: { ready, chat({system, history, user, tools}) → Promise<string> }
 *   const r = await mind.hear(brain, 'ребята, гоните мертвяков прочь', ctx, { onThinking: () => say('Хм…') });
 *   // → { reply, action: 'attack', args: { target: 'zombies' }, smart: true, … }
 */

import { STATUS, attitudeWord, characterRu } from '../game/Attitude.js';
import { normalize, sanitizeReply, isMostlyRussian } from '../game/VillagerBrain.js';
import { TOOLS, toolsFor, parseToolCalls, validateCall, detectOrder, ARMY, ORDER_LINES } from './TalkActions.js';
import { WIZ_ROLE_RU } from '../game/WizardAI.js';

/** Who each role is (the system prompt, in Russian). */
export const ROLE_PROMPTS = {
    farmer: 'Ты фермер: пашешь поле, растишь пшеницу и морковь, держишь корову. Говоришь просто, по-деревенски. Ты не воин.',
    builder: 'Ты строитель: чинишь стены и башни, строишь дома, таскаешь камни. Говоришь просто. Ты не воин.',
    merchant: 'Ты торговец на рынке у ворот: продаёшь хлеб, сыр, мясо, пироги, яблоки, стрелы, а волшебные вещи только покупаешь. Цены называет сама игра — никогда не выдумывай цен и чисел.',
    knight: 'Ты рыцарь стражи замка: охраняешь короля, ворота и стены, рубишь зомби. Говоришь коротко, по-военному. Приказы войску выполняешь только от короля замка.',
    advisor: 'Ты советник короля: стоишь у трона, знаешь всё о замке, войске и казне. Говоришь учтиво и умно. Приказы короля сразу передаёшь войску.',
    king: 'Ты король этого замка: сидишь на троне, правишь, командуешь войском. Говоришь величественно. Чужим приказам не подчиняешься.',
    wizard: 'Ты волшебник из Башни волшебников: знаешь заклинания (Бомбардо, Инферно, Левиоса, Протего) и говоришь загадочно. Ты не служишь в войске.',
};

const THINK = {
    knight: ['Так…', 'Хм.', 'Так-так…'],
    king: ['Хм…', 'Гм…'],
    advisor: ['Хм… позвольте…', 'Минутку…'],
    common: ['Хм…', 'Э-э…', 'Так…', 'Сейчас…', 'Ну…'],
};

const pickFrom = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length) % arr.length];

/** «Хм…» while the net thinks. */
export function thinkingLine(role, rng = Math.random) { return pickFrom(THINK[role] || THINK.common, rng); }

/** The line for an order obeyed / refused (by role). */
export function orderLine(kind, role, rng = Math.random) {
    const pool = ORDER_LINES[kind];
    const key = role === 'knight' || role === 'advisor' || role === 'king' ? role : 'common';
    return pickFrom(pool[key] || pool.common || pool.knight, rng);
}

/** What the net answers (the rules know these only roughly); everything else the rules answer at once. */
/** What the rules always answer themselves, however long the words (the market, orders, yes / no, manners). */
const RULES_ONLY = new Set(['yes', 'no', 'buy', 'price', 'browse', 'sell', 'haggle', 'insult', 'threat', 'claim_king', 'bow', 'follow', 'stop_follow', 'thanks', 'bye', 'tell_name', 'ask_my_name']);
/**
 * A big net (Gemma 4, `llm.strong`) answers everything itself — a greeting, the way, a request, the king —
 * and the rules only give it the facts (their answer as a hint) and the game action. Only the market's
 * numbers stay the rules' (prices, «да»/«нет» to an offer, haggling): the net never names a price.
 * (Before, the rules answered almost every usual phrase with a canned line and the net was not even asked:
 * the author did not notice the new net at all.)
 */
const QUICK_MS = 1500; // (the net's first words sooner than this: it may answer every talk itself)
const MARKET_ONLY = new Set(['yes', 'no', 'buy', 'price', 'browse', 'sell', 'haggle']);
/**
 * What a person answers without thinking — a greeting, «спасибо», «пока», «да/нет», an insult, a threat, «иди за
 * мной», «стой» — the rules say at once even with a big net (the author: «отвечать моментально, как человек»;
 * measured: the net's answer comes 2–6 s later on a processor, the rules' in 1 ms). The net answers what needs
 * thinking: a question, a request, the way, open talk.
 */
const AT_ONCE = new Set(['greet', 'how_are_you', 'name_ask', 'bye', 'thanks', 'insult', 'threat', 'follow', 'stop_follow', 'bow', 'claim_king', 'compliment', 'tell_name', 'ask_my_name', 'yes', 'no',
    'where_market', 'where_throne', 'where_king', 'where_gate']); // (the way: he knows it — a person points at once)
/** In danger (a fight, zombies at the gate, a fire) only what the rules don't know goes to the net — and it is given little time. */
const DANGER_FIRST_MS = 1500;
/** The net's first sentence later than this (ms): the rules answer (it was 8–9 s for the whole answer). */
const FIRST_MS = 2000; // (the author's journal: 3.5 s of «Хм…» and then a canned line felt like no answer at all)
/**
 * …but where the rules have nothing real to say (open talk, a long or a «complex» phrase) their line is empty —
 * «Интересно говоришь.», «Мудрёно говоришь.» — and the author: «сложные предложения — сразу тупеет». There the
 * villager has said his «Хм…» and thinks longer, as a person would: the net's own answer up to this (ms).
 */
const THINK_MS = 6000;
/** The net said no, while the rules had agreed to do it: the rules' line (the villager does what he says). */
const REFUSAL = /^(нет|не-а|неа|не могу|не пойду|не буду|ни за что|отстань|no\b|i can'?t|i won'?t)|(не пойду|не могу пойти|не стану)/i;

/**
 * The words a villager says at once while the net thinks («Хм…», «Я понял», «Так-так…») — so the talk feels
 * live: the answer follows right after them. By language, by kind of question (a question, a trade, a greeting,
 * a request), by role, by a woman's or a man's word forms; never the same as the last one (`last`).
 * They are short and made in each villager's voice in advance (Speech.prepare): heard with no wait at all.
 * [man's form, woman's form] — or one string for both.
 */
const FILLERS = {
    ru: {
        common: ['Хм…', 'Так-так…', 'Ага…', 'Ну-у…', 'Сейчас…', 'Погоди…', 'Так, подумаю…', 'Хм, сейчас…', 'Так…', 'Ммм…', 'Э-э…', 'Ну смотри…', 'Хм, ну…', 'Сейчас скажу…', 'Так, погоди…', 'Ага, сейчас…',
            // (twenty more neutral ones — they fit any talk, an order, a question, a trade: the author asked for a livelier «хм»)
            'Секунду…', 'Минуточку…', 'Дай-ка подумать…', 'Постой-ка…', 'Значит так…', 'Ну-ка, ну-ка…', 'Так-с…', 'Мгм, сейчас…', 'Эм… сейчас…',
            'Ну, как сказать…', 'Дай-ка прикину…', 'Ммм, дай подумать…', 'Ага, ага…', 'Хм, надо прикинуть…', 'Одну секунду…', 'Погоди-ка минутку…',
            'Так, так, так…', 'Дай собраться с мыслями…', 'Хм… дай-ка…', 'Ща-ща…'],
        question: ['Хороший вопрос…', 'Хм, как бы сказать…', 'Надо подумать…', 'Вспомнить бы…', 'Ох, вопрос…', 'Хм, интересно…', 'Как тебе сказать…', 'Сейчас вспомню…', 'Ммм, ну смотри…', 'Хм, соображу…'],
        request: [['Я понял…', 'Я поняла…'], ['Понял, понял…', 'Поняла, поняла…'], 'Ага, ясно…', 'Так, ясно…', ['Понял тебя…', 'Поняла тебя…'], 'Хм, ладно…', 'Ага, слышу…', 'Так-так, ясно…'],
        trade: ['Так-так, прикину…', 'Хм, прикинем…', 'Ммм, посмотрим…', 'Сейчас прикину…', 'Ну, смотри…', 'Хм, товар…', 'Так, погоди-ка…'],
        greet: ['О!', 'А, это ты…', 'О, здравствуй…', 'Ага…', 'Хм, гость…', 'О, путник…'],
        female: ['Ой, сейчас…', 'Ой, погоди-ка…', 'Ох, подумать надо…', 'Ой, вспомнить бы…', 'Ох, ну…'],
        knight: ['Так…', 'Хм. Слушай…', 'Значит, так…', 'Так точно…', 'Скажу так…', 'Хм. Ясно…'],
        king: ['Гм…', 'Что ж…', 'Хм… Изволь…', 'Гм, слушай же…', 'Хм, так…'],
        advisor: ['Позвольте… минутку…', 'Хм… если позволите…', 'Видите ли…', 'Минутку…', 'Хм, извольте…'],
        merchant: ['Так-так…', 'Ммм, ну смотри…', 'Слушай…', 'Хе, ну…', 'Ага, сейчас…'],
        wizard: ['Хм… любопытно…', 'Мм… видишь ли…', 'Любопытный вопрос…', 'Хм, занятно…', 'Так-так… магия…'],
    },
    en: {
        common: ['Hmm…', 'Well…', 'Let me see…', 'Uh…', 'Right…', 'Hold on…', 'Hm, well…', 'One moment…', 'Let me think…', 'Okay…'],
        question: ['Good question…', 'Hmm, let me think…', 'How to put it…', 'Let me remember…', 'Hmm, interesting…', 'Well, you see…'],
        request: ['I see…', 'I understand…', 'Got it…', 'Right, right…', 'Alright…', 'I hear you…'],
        trade: ['Let me see…', 'Hmm, let me reckon…', 'Well, look…', 'Let me think…'],
        greet: ['Oh!', 'Ah, hello…', 'Oh, a traveller…', 'Well, well…'],
        female: ['Oh, let me see…', 'Oh, hold on…'],
        knight: ['Right…', 'Listen…', 'Well then…', 'Understood…'],
        king: ['Hmm…', 'Well then…', 'Very well…'],
        advisor: ['If I may…', 'One moment…', 'You see…'],
        merchant: ['Let me see…', 'Well, look…'],
        wizard: ['Curious…', 'Hmm… you see…', 'Interesting…'],
    },
};

/** What kind of words the player said (by the rules' intent and the words): the thinking word fits it. */
export function fillerKind(text = '', intent = '') {
    const t = String(text).toLowerCase();
    if (/^(greet|how_are_you)$/.test(intent)) return 'greet';
    if (/^(haggle|price|browse|buy|sell|money|food)$/.test(intent)) return 'trade';
    if (/^(help|follow|quest|stop_follow)$/.test(intent) || /(сделай|помоги|принеси|пойдем|пойдём|иди|покажи|давай|можешь|please|help|could you|can you|bring|show me)/.test(t)) return 'request';
    if (/\?|(почему|зачем|отчего|как(?![а-я])|кто|где|когда|куда|что(?![а-я])|сколько|какой|какая|why|how|who|where|when|what)/.test(t)) return 'question';
    return null;
}

/** The words this villager may say while thinking (in his language, his gender's forms) — to be made in his voice in advance. */
export function fillerPool({ role = 'farmer', female = false, wizard = false, lang = 'ru', kind = null } = {}) {
    const F = FILLERS[lang] || FILLERS.ru;
    const form = (l) => (Array.isArray(l) ? l[female ? 1 : 0] : l);
    const own = wizard ? F.wizard : F[role] || [];
    let pool = [...own, ...F.common];
    if (female && !wizard && role !== 'king') pool = [...F.female, ...pool];
    if (kind && F[kind] && !(role === 'king' && kind !== 'request')) pool = [...F[kind], ...F[kind], ...own]; // (fits the question)
    return [...new Set(pool.map(form))];
}

/**
 * One thinking word. `ready` (optional): the lines already made in this voice — taken first (heard at once).
 */
export function fillerLine({ role = 'farmer', female = false, wizard = false, text = '', intent = '', last = '', lang = null, ready = null, short = false } = {}, rng = Math.random) {
    const lg = lang || (isEnglishText(text) ? 'en' : 'ru');
    let pool = fillerPool({ role, female, wizard, lang: lg, kind: fillerKind(text, intent) });
    // (short: the net answers within half a second — the answer waits for the word to end: «Хм…», not «Ммм, ну смотри…» —
    // the author's journal: a 1.5 s «Хм, интересно…» held the ready answer back)
    if (short) { const sh = pool.filter(isShortFiller); pool = sh.length ? sh : (lg === 'en' ? ['Hm…', 'Well…'] : ['Хм…', 'Ага…', 'Так…']); }
    let fresh = pool.filter((l) => l !== last);
    if (!fresh.length) fresh = pool;
    if (ready) { const r = fresh.filter((l) => ready(l)); if (r.length) fresh = r; }
    return pickFrom(fresh, rng);
}

/** A thinking word said in half a second: one word, a few letters. */
export function isShortFiller(l) {
    const t = String(l).replace(/[…!.,?]/g, '').trim();
    return t.split(/\s+/).length === 1 && t.length <= 7;
}

export function isEnglishText(s) {
    const letters = String(s || '').match(/[a-zа-яё]/gi) || [];
    if (letters.length < 3) return false;
    return letters.filter((c) => /[a-z]/i.test(c)).length / letters.length >= 0.7;
}

/** Where a villager of this role stands (for the prompt: an answer about the world around him). */
const PLACE = {
    merchant: 'у своего прилавка на рынке у ворот замка',
    knight: 'на страже в замке',
    advisor: 'в тронном зале, у трона',
    king: 'на троне в тронном зале',
    builder: 'у стен замка, где идёт стройка',
    farmer: 'у своего поля и дома в замке',
};

export const OPEN_TOPICS = new Set(['unknown', 'news', 'about_castle', 'about_king', 'zombies', 'magic', 'weather', 'money', 'family', 'flirt', 'quest', 'joke']);

export class TalkMind {
    /**
     * @param {{llm?:{ready:boolean, chat:Function}|null, timeoutMs?:number, rng?:Function}} [opts]
     */
    constructor({ llm = null, timeoutMs = null, rng = Math.random } = {}) {
        this.llm = llm;
        this.timeoutMs = timeoutMs;
        this.rng = rng;
    }

    get smart() { return !!this.llm?.ready; }
    /** A big net: it answers every talk (see MARKET_ONLY). */
    get strong() { return !!(this.llm?.ready && this.llm.strong); }
    /** The net says its first words quickly on this computer (≤ 1.5 s; not known yet — trusted). */
    get quickNet() { return this.speedMs == null || this.speedMs <= QUICK_MS; }

    /** How long the net took to its first words (a running mean: one slow answer does not decide). */
    _speed(ms) { this.speedMs = this.speedMs == null ? ms : this.speedMs * 0.6 + ms * 0.4; }

    /**
     * The words that are the same for every villager and every turn (the system turn). The program on this
     * computer reads them — and the game actions after them — once and keeps them: a question then costs it only
     * the villager's own lines and the words said (on the processor a long prompt read anew took 10–20 s).
     */
    basePrompt() {
        return [
            'Это игра: ты житель средневекового мира, живой человек, и никогда не говоришь, что ты программа. Кто ты, где ты и что сейчас — сказано перед словами собеседника.',
            'Что ты знаешь: в замке есть король, его советник у трона, рыцари стражи, рынок у ворот с хлебом, сыром, мясом, яблоками и стрелами, дома жителей. По ночам из-под земли лезут зомби. В пещерах живёт гигантский паук. В Башне волшебников учатся маги. У моря есть порт с кораблями и моряками.',
            'Отвечай ПО СУТИ того, что спросил собеседник, и не меняй тему. Если не знаешь ответа — так и скажи просто, по-своему, и подскажи, у кого спросить (маги в башне, советник короля, торговцы на рынке, стражники у ворот).',
            'Если собеседник просит или приказывает что-то сделать и ты согласен — вызови подходящую функцию. Если не согласен — не вызывай, просто откажи словами. Приказы войску (собрать войско, атаковать, защищать замок) выполняют только по приказу короля замка.',
            'Говори как живой человек своего времени: просто, тепло или резко — по характеру, с живыми словечками, без канцелярита и без перечислений. Можешь в ответ спросить что-то короткое.',
        ].join('\n');
    }

    /** The whole prompt for this villager now (the common words + his own). */
    systemPrompt(brain, ctx = {}) {
        return `${this.basePrompt()}\n${this.persona(brain, ctx)}`;
    }

    /** This villager now: who, where, his mood, what he knows of the one talking (said with the question). */
    persona(brain, ctx = {}) {
        const v = brain.villager || {};
        const w = brain.world || {};
        const role = brain.role;
        const m = brain.memory || {};
        const king = !!ctx.playerIsKing;
        const t = brain.traits || {};
        const en = ctx.lang === 'en';
        const goods = [...new Set((ctx.nearbyGoods || []).map((x) => String(x?.name || x || '').toLowerCase()).filter(Boolean))].slice(0, 8).join(', ');
        // (the wizards of the towers talk through the same brain: their own role and words)
        const wiz = WIZ_ROLE_RU[v.role];
        const lines = [
            wiz ? `Ты — ${v.name || 'волшебник'}, ${wiz[v.female ? 1 : 0].toLowerCase()} в Башне волшебников.`
                : `Ты — ${v.name || 'житель'}, ${brain.roleName}, ${v.female ? 'женщина' : 'мужчина'}, в средневековом замке «${w.castleName || v.castleName || 'Каменный Утёс'}».`,
            wiz ? ROLE_PROMPTS.wizard : ROLE_PROMPTS[role] || ROLE_PROMPTS.farmer,
            role === 'king' || wiz ? '' : `Правитель замка — ${king ? 'твой собеседник' : `${w.kingFemale ? 'королева' : 'король'} ${w.kingName || v.kingName || ''}`.trim()}.`,
            `Настроение: ${brain.mood > 0.3 ? 'хорошее, ты дружелюбен' : brain.mood < -0.3 ? 'плохое, ты раздражён и груб' : 'обычное'}.`,
            `Сейчас ${w.timeOfDay === 'night' ? 'ночь, у стен бродят зомби' : 'день'}${w.danger || ctx.danger ? ', рядом опасность' : ''}.`,
            king ? `Собеседник — КОРОЛЬ этого замка${w.kingDead ? ': он победил прежнего короля и взял замок' : ''}. Обращайся «Ваше Величество».`
                : `Собеседник — ${STATUS[ctx.status]?.ru || 'странник, путник без титула'}${m.playerName ? `, его зовут ${m.playerName}` : ', имени его ты не знаешь'}. Он не король этого замка: приказы войску от него не выполняй.`,
            // (his own nature and how he takes this one — Attitude.js; the GAME decided what he does, his words follow it)
            brain.character ? `Твой характер (0–100): ${characterRu(brain.character)}.` : '',
            brain.attitude ? `Твоё отношение к собеседнику: ${attitudeWord(brain.attitude(ctx.selfId))} (${brain.attitude(ctx.selfId)} из 100).` : '',
            ctx.rel ? `Твои чувства к собеседнику (в числах игры): подчинение ${ctx.rel.sub}, дружба ${ctx.rel.fr}, любовь ${ctx.rel.lv}. Подчинение — долг, дружба — искреннее расположение; отрицательные числа — неприязнь. Говори в тон этим числам.` : '',
            ctx.known ? `Что ты знаешь о собеседнике: ${ctx.known}.` : '',
            brain.decide ? this._willLine(brain, ctx) : '',
            ctx.hostile ? 'Этот человек недавно напал на кого-то в замке — ты его боишься и не доверяешь.' : '',
            m.talks > 1 ? 'Вы уже поздоровались и сейчас разговариваете: НЕ здоровайся снова, продолжай разговор по смыслу.' : '',
            m.talks ? `Вы уже говорили ${m.talks} раз.${m.insults ? ' Он тебя оскорблял.' : ''}${m.trades ? ' Вы торговали.' : ''}${m.lastOrder ? ` Последний приказ: ${m.lastOrder}.` : ''}` : '',
            ctx.doing ? `Сейчас ${ctx.doing}.` : ctx.following ? 'Сейчас ты идёшь следом за собеседником.' : '',
            // (what happened in his town lately: he knows it, talks of it when it comes up — and knows if the one talking did it)
            ctx.news?.length ? `${en ? 'News of your town' : 'Что недавно случилось в твоём городе (ты это знаешь; говори об этом, если к слову или спросят)'}: ${ctx.news.join('; ')}.` : '',
            ctx.lastOffer ? `Ты сейчас предлагаешь сделку: ${ctx.lastOffer.item?.name || 'вещь'} за ${ctx.lastOffer.price} монет.` : '',
            // where he is, what he has, what the traveller has and did — answers about THIS moment, not general words
            !wiz && PLACE[role] ? `Ты стоишь ${PLACE[role]}.` : '',
            goods ? `На твоём прилавке сейчас: ${goods}. Цены назовёт игра, не ты.` : '',
            ctx.heldItem?.name ? `У собеседника в руке ${String(ctx.heldItem.name).toLowerCase()}${ctx.heldItem.magic ? ' (волшебная вещь)' : ''}.` : '',
            ctx.coins != null && role === 'merchant' ? `Монет у него ${ctx.coins > 30 ? 'много' : ctx.coins > 0 ? 'немного' : 'нет совсем'}.` : '',
            m.trades ? 'Он уже покупал у тебя — ты к нему расположен.' : '',
            m.insults ? 'Он тебя оскорблял — ты это помнишь.' : '',
            ctx.recent ? `Недавно: ${ctx.recent}.` : '',
            v.female ? 'О себе говори в женском роде («я рада», «я видела»).' : 'О себе говори в мужском роде («я рад», «я видел»).',
            `Твой характер: ${t.smart > 0.7 ? 'умный, рассудительный' : t.smart < 0.45 ? 'простоватый' : 'здравомыслящий'}, ${t.talkative > 0.7 ? 'разговорчивый' : t.talkative < 0.45 ? 'немногословный' : 'в меру общительный'}, ${t.brave > 0.7 ? 'смелый' : t.brave < 0.35 ? 'боязливый' : 'осторожный'}.`,
            // (a big net answers what the rules understood too: their answer holds the facts — the way, the name, the action)
            ctx.hint ? `Суть твоего ответа сейчас (скажи это своими словами, живо и по-своему, сохрани смысл и факты, ничего не выдумывай сверх): «${ctx.hint}»` : '',
            en ? 'Собеседник говорит по-английски: отвечай ТОЛЬКО по-английски (простыми словами), одной-двумя короткими фразами, от первого лица, без кавычек, без чисел и без пояснений.'
                : 'Отвечай ТОЛЬКО по-русски, грамотно, одной-двумя короткими законченными фразами, от первого лица, без кавычек, без чисел и без пояснений.',
        ];
        return lines.filter(Boolean).join('\n');
    }

    /**
     * What the net will read when I speak to this villager — read NOW, while I come near (the program keeps it
     * read: then a question costs it only my words — on a processor the villager's description read anew took
     * 3–7 s). The same words the next question will begin with: his talk counted one more (the rules count it
     * before the net is asked), the history as it will be then, no hint (it goes last).
     */
    warmRequest(brain, ctx = {}) {
        const m = brain.memory || {};
        const ahead = Object.create(brain);
        Object.defineProperty(ahead, 'memory', { value: { ...m, talks: (m.talks || 0) + 1 } });
        const c = { ...ctx, lang: 'ru', hint: null };
        return {
            system: this.basePrompt(),
            context: this.persona(ahead, c),
            history: (m.log || []).slice(-6).map((l) => ({ role: l.who === 'player' ? 'user' : 'assistant', content: l.text })),
            tools: this.strong ? TOOLS : toolsFor(brain.role, c),
        };
    }

    _history(brain) {
        const log = brain.memory?.log || [];
        // (the last line pair is the one being answered: the rules logged it already; the 9 exchanges before it —
        // the talk goes on, not from nothing each time (the author); on the graphics card ~300 words more cost ~0.1 s)
        return log.slice(-20, -2).map((l) => ({ role: l.who === 'player' ? 'user' : 'assistant', content: l.text }));
    }

    _permCtx(brain, ctx) {
        return {
            role: brain.role,
            playerIsKing: !!ctx.playerIsKing,
            mood: brain.mood,
            talkative: brain.traits?.talkative,
            danger: !!(ctx.danger || brain.world?.danger),
            serve: brain.decide ? brain.decide('serve', ctx) : null, // (Attitude.willDo: the game's own decision)
            favor: brain.decide ? brain.decide('favor', ctx) : null,
            hasOffer: !!ctx.lastOffer,
            players: ctx.players || [],
            selfId: ctx.selfId,
        };
    }

    /**
     * The player said something to this villager.
     * @param {import('../game/VillagerBrain.js').VillagerBrain} brain
     * @param {string} text
     * @param {object} ctx brain ctx + { players:[{id,name}], selfId, following }
     * @param {{onThinking?:Function}} [opts]
     * @returns {Promise<{reply:string, action:string|null, args?:object, smart?:boolean, refused?:boolean, intent?:string}>}
     */
    async hear(brain, text, ctx = {}, opts = {}) {
        const first = this.first(brain, text, ctx);
        return first.done ? first.res : this.ask(brain, text, ctx, first, opts);
    }

    /**
     * The instant part (no waiting): the rules, and clear army orders.
     * @returns {{res:object, perm:object, done:boolean}} done = no need to ask the net
     */
    first(brain, text, ctx = {}) {
        const res = brain.hear(text, ctx); // (memory, mood, the market — and the answer without the net)
        const perm = this._permCtx(brain, ctx);
        // 1) clear army orders: the rules carry them out at once
        let order = res.action === 'ignore' ? null : detectOrder(text, ctx.players || []);
        // («уйди», «отойди» from one who is not the king: not the throne room's «all leave» — a plain request to this one;
        // nearly anybody does it, the rude grumbling — the author: «это просьба, которую даже злые выполняют»)
        if (order?.name === 'dismiss' && !perm.playerIsKing) return { res: this._leaveMe(brain, res, ctx), perm, done: true };
        if (order) return { res: this._finishOrder(brain, res, validateCall(order, perm), null, perm.playerIsKing), perm, done: true };
        // 2) what the rules clearly understood is answered at once (a talk by voice must be quick);
        //    the net takes what they did not (and the open topics, where its own words are better)
        //    — never the market: prices are the game's
        // (a long, «complex» question that merely touched a known word — «а почему маги не любят рыцарей короля» —
        // is the net's: a canned line about the king would not answer it)
        const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
        const complex = words >= 6 && !RULES_ONLY.has(res.intent) && !res.intent.startsWith('where_');
        // (a big net answers everything only while it is quick here: on a slow computer the rules answer what they
        // understood at once, and the net only what they did not — the author: «очень медленно отвечают»)
        // (the market's words are the rules' only at a stall: «сколько будет пять плюс пять» to a farmer is no price question)
        const trader = brain.role === 'merchant' || !!ctx.buys || !!ctx.nearbyGoods?.length;
        const quick = (this.strong && this.quickNet ? MARKET_ONLY.has(res.intent) && trader : !OPEN_TOPICS.has(res.intent) && !complex)
            || (AT_ONCE.has(res.intent) && words <= 6) // (a greeting, the way, an insult, «за мной»: at once, like a person)
            || (!!(ctx.danger || brain.world?.danger) && res.intent !== 'unknown' && !complex); // (in danger: no thinking aloud)
        const done = !this.smart || !res.reply || quick || res.action === 'ignore' || ['trade_yes', 'trade_no'].includes(res.action) || !!res.offer;
        return { res, perm, done };
    }

    /** What he would do if asked now (the game decided — Attitude.willDo): said to the net so its words agree. */
    _willLine(brain, ctx) {
        const d = brain.decide('serve', ctx);
        const how = { gladly: 'выполняешь охотно', reluctant: 'выполняешь, но без охоты (можешь поворчать)', no: 'НЕ выполняешь — откажи по-своему, в духе твоего характера и отношения' }[d.how];
        const army = brain.decide('army', ctx);
        return `Если он просит что-то сделать для него (пойти с ним, охранять, принести, атаковать того, на кого он укажет): ты ${how} (${d.why}).`
            + (army.yes ? ' Приказы войску от него ты исполняешь.' : '');
    }

    /** The rules' answer is only a word to fill the quiet (they did not understand, or it is long talk): the net is worth waiting for. */
    _weak(res, text) {
        const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
        return OPEN_TOPICS.has(res.intent) || (words >= 6 && !RULES_ONLY.has(res.intent));
    }

    /** The net's part: «Хм…», then its answer and its game action (checked). */
    async ask(brain, text, ctx, { res, perm }, opts = {}) {
        let raw = '';
        // the answer is said while the net still writes it (opts.onSentence(piece, i)): the first piece
        // as soon as a clause of it is written («Король у нас строгий,»), then every sentence as it ends
        let partial = '', spoken = '', stopped = false, n = 0, ends = 0;
        const onPartial = typeof opts.onSentence === 'function' ? (piece) => {
            if (stopped) return;
            partial += piece;
            for (;;) {
                if (/[<{]/.test(partial)) { stopped = true; return; } // (a game action is coming: the rest waits for the whole answer)
                const sm = /^[\s\S]*?[.!?…](?=\s|$)/.exec(partial);
                let take = null;
                if (n === 0) {
                    // (the first clause long enough to be said alone, before the sentence ends)
                    const lim = sm ? sm[0].length : partial.length;
                    for (const c of partial.matchAll(/[,;:—–](?=\s)/g)) {
                        if (c.index >= lim) break;
                        const head = partial.slice(0, c.index + 1);
                        if (head.trim().length >= 14 && head.trim().split(/\s+/).length >= 3) { take = head; break; }
                    }
                }
                if (!take && sm && sm[0].trim().length >= 4) take = sm[0];
                if (!take) return;
                partial = partial.slice(take.length);
                const line = n === 0 ? this._clean(take, text, brain) : (this._acceptText(sanitizeReply(take, brain.villager?.name), text) ? sanitizeReply(take, brain.villager?.name) : null);
                if (!line) { stopped = true; return; }
                spoken = spoken ? `${spoken} ${line}` : line;
                try { opts.onSentence(line, n); } catch (_) { /* ignore */ }
                n++;
                if (/[.!?…]$/.test(line) && ++ends >= 2) { stopped = true; return; } // (an answer is at most two sentences)
            }
        } : null;
        const en = isEnglishText(text);
        this._en = en;
        // (what the rules understood well is given to a big net as the meaning of its answer — not for open talk)
        const hint = this.strong && res.reply && !OPEN_TOPICS.has(res.intent) && !en ? res.reply : null;
        ctx = { ...ctx, lang: en ? 'en' : 'ru', hint };
        const t0 = Date.now();
        let firstAt = 0;
        const said0 = onPartial ? (piece) => { if (!tokAt) { tokAt = Date.now(); try { opts.onToken?.(); } catch (_) { /* ignore */ } } onPartial(piece); if (!firstAt && n) firstAt = Date.now(); } : null;
        let tokAt = 0;
        this.lastError = null;
        try {
            opts.onThinking?.();
            let timer, first;
            raw = await Promise.race([
                this.llm.chat({
                    // (the same words for everybody first — the program keeps them read; this villager's own with the question)
                    system: this.basePrompt(),
                    context: this.persona(brain, ctx),
                    history: this._history(brain),
                    // (the words as said, with their «?» and «!» — the net reads a question better than a bare string)
                    user: String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300) || '...',
                    // (a big net gets every action — always the same list, read once; the game still checks each call)
                    tools: this.strong ? TOOLS : toolsFor(brain.role, ctx),
                    maxTokens: 60,
                    ...(said0 ? { onPartial: said0 } : {}),
                }),
                // (nothing said by then: the rules answer — a talk must not wait; the first sentence is said as soon as written)
                new Promise((resolve) => { timer = setTimeout(() => resolve(''), this.timeoutMs ?? (this.strong ? 8000 : 9000)); }),
                // (no first sentence soon — FIRST_MS, in danger DANGER_FIRST_MS: the rules answer now, not after a long «Хм…»)
                new Promise((resolve) => { first = setTimeout(() => { if (!n) resolve(''); }, this.firstMs ?? (ctx.danger || brain.world?.danger ? DANGER_FIRST_MS : this._weak(res, text) ? THINK_MS : FIRST_MS)); }),
            ]);
            clearTimeout(timer);
            clearTimeout(first);
        } catch (e) {
            // (the net failed — the program stopped, the graphics card lost it…: the rules answer, the reason to the journal)
            stopped = true;
            this.lastTimedOut = false;
            this.lastError = String(e?.message || e || 'ошибка').slice(0, 200);
            this._speed(Date.now() - t0 + 4000);
            if (spoken) res.spoken = spoken;
            return res;
        }
        if (!raw) stopped = true; // (too late: its later words are not said over the rules' answer)
        this._speed((firstAt || Date.now()) - t0 + (raw ? 0 : 4000));
        this.lastTimedOut = !raw; // (the net said nothing in time: the rules answered)
        if (spoken) res.spoken = spoken; // (already said: CastleTalk says only the rest)
        if (!raw && res.spoken) { this._setReply(brain, res, res.spoken); res.smart = true; return res; }
        const { text: said, calls } = parseToolCalls(raw);
        const clean = this._clean(said, text, brain) || '';
        const good = !!clean;
        const call = calls.find((c) => validateCall(c, perm).reason !== 'unknown');
        if (call) {
            const check = validateCall(call, perm);
            if (ARMY.has(call.name) || call.name === 'stay' && check.args?.all) return this._finishOrder(brain, res, check, good ? clean : null, perm.playerIsKing);
            if (check.ok) {
                res.action = this._legacy(check);
                res.args = check.args;
                if (good) this._setReply(brain, res, clean);
                else if (res.action === 'follow' && !/(иду|пойд|веди|пошли|слушаюсь|за вами|ладно)/i.test(res.reply)) this._setReply(brain, res, orderLine('obey', brain.role, this.rng));
                res.smart = true;
                return res;
            }
            // the net agreed, the game says no: the villager refuses in words
            res.action = null;
            res.refused = true;
            this._setReply(brain, res, call.name === 'follow_me' ? brain._say('followNo', {}, ctx) || orderLine('refuse', brain.role, this.rng) : orderLine('refuse', brain.role, this.rng));
            return res;
        }
        // no call: keep what the rules decided to do, say it in the net's words
        // (unless the words refuse what the rules are doing — «пойдём со мной» → «Нет, не пойду» while he follows)
        if (good && res.action && !spoken && REFUSAL.test(clean)) return res;
        if (good) { this._setReply(brain, res, clean); res.smart = true; }
        return res;
    }

    /** «Уйди» to one villager: he walks off — gladly, or grumbling, by how he takes me; the king stays where he is. */
    _leaveMe(brain, res, ctx) {
        res.order = true;
        if (brain.role === 'king') { res.action = null; this._setReply(brain, res, pickFrom(['Это мой замок. Уходить будешь ты.', 'Здесь я решаю, кому уйти.'], this.rng)); return res; }
        res.action = 'leave_me';
        const att = brain.attitude ? brain.attitude(ctx.selfId) : 50;
        const lines = att >= 45 ? ['Ладно, не буду мешать.', 'Хорошо, отойду.', 'Как скажешь, ухожу.', 'Понял, ухожу.']
            : ['Да пожалуйста!', 'Ну и ладно. Сам уйду.', 'Больно надо…', 'Ухожу, ухожу. Не кричи.'];
        this._setReply(brain, res, pickFrom(lines, this.rng));
        return res;
    }

    /** An army order (or «отбой»): the action, the memory and the line. */
    _finishOrder(brain, res, check, said, king = false) {
        const name = check.name;
        if (check.ok) {
            res.action = name;
            res.args = check.args;
            brain.memory.lastOrder = name + (check.args?.target ? ':' + check.args.target : '');
            const knightVsUndead = res.args?.target === 'zombies' && brain.role === 'knight' && !king;
            const fallback = name === 'stay' && !check.args?.all ? res.reply
                : knightVsUndead ? pickFrom(ORDER_LINES.knightZombies, this.rng) : orderLine('obey', brain.role, this.rng);
            this._setReply(brain, res, said && /(слушаюсь|исполн|есть|будет|так точно|сию|немедл|как прикажете|иду|бегу|вперед|вперёд|за мной|к бою|разберемся|разберёмся|собира|защит)/i.test(said) ? said : fallback);
        } else {
            res.action = null;
            res.refused = true;
            this._setReply(brain, res, said && !/(слушаюсь|исполн|так точно|будет сделано|как прикажете)/i.test(said) ? said : orderLine('refuse', brain.role, this.rng));
        }
        res.order = true;
        return res;
    }

    /** The old action names CastleTalk already knows. */
    _legacy(check) {
        switch (check.name) {
            case 'follow_me': return 'follow';
            case 'stay': return 'stop_follow';
            case 'go_to': return { market: 'guide:market', throne: 'guide:throne', gate: 'guide:gate' }[check.args.place] || 'guide:' + check.args.place;
            default: return check.name;
        }
    }

    /** The net's words, tidied (no «Привет» in the middle of a talk) — or null if they are not fit to say. */
    _clean(said, userText, brain) {
        let clean = sanitizeReply(said, brain.villager?.name);
        if ((brain.memory?.talks || 0) > 1 && !/(прив|здрав|добр(ый|ое) (день|утро|вечер))/.test(normalize(userText))) {
            const cut = clean.replace(/^(привет(ствую)?|здравствуй(те)?|здорово|добрый (день|вечер)|доброе утро)[,!. ]*/i, '').trim();
            if (cut.length >= 2) clean = cut[0].toUpperCase() + cut.slice(1);
        }
        return this._acceptText(clean, userText) ? clean : null;
    }

    _acceptText(s, userText) {
        if (!s || s.length < 2 || s.length > 240) return false;
        if (this._en ? isMostlyRussian(s) : !isMostlyRussian(s)) return false; // (the player's own language)
        if (normalize(s) === normalize(userText)) return false;
        const words = s.split(/\s+/);
        if (words.some((w) => w.replace(/[^а-яёa-z]/gi, '').length > 22)) return false;
        if (words.length >= 4 && new Set(words.map((w) => w.toLowerCase())).size < words.length / 2) return false;
        if (/(языков(ая|ой) модел|искусственн|нейросет|ассистент|chatgpt|qwen|gemma|функци[юяи]|tool)/i.test(s)) return false;
        if (/\d/.test(s)) return false; // (numbers — prices — are the game's business)
        return true;
    }

    _setReply(brain, res, line) {
        if (!line) return;
        const old = res.reply;
        res.reply = line;
        const m = brain.memory;
        m.lastReply = line;
        const log = m.log || [];
        const last = log[log.length - 1];
        if (last && last.who === 'npc' && last.text === old) last.text = line;
    }
}
