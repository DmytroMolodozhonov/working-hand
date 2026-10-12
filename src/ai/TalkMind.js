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

import { normalize, sanitizeReply, isMostlyRussian } from '../game/VillagerBrain.js';
import { toolsFor, parseToolCalls, validateCall, detectOrder, ARMY, ORDER_LINES } from './TalkActions.js';
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
 * The words a villager says at once while thinking — by role, by a woman's voice, by the kind of question;
 * never the same as the last one (`last`).
 */
const FILLERS = {
    common: ['Дай-ка подумать…', 'Хороший вопрос…', 'Так-так…', 'Ммм… ну смотри…', 'Эх, как тебе сказать…', 'Погоди…', 'Хм… сейчас…', 'Дай вспомнить…', 'Ну-у…'],
    female: ['Ой, дай-ка подумать…', 'Ох, даже не знаю, как сказать…', 'Погоди-ка…', 'Ой, сейчас…', 'Ммм… дай вспомнить…'],
    knight: ['Так…', 'Хм. Слушай…', 'Погоди-ка…', 'Значит, так…', 'Скажу так…'],
    king: ['Гм… Изволь…', 'Что ж…', 'Хм… Слушай же…'],
    advisor: ['Позвольте… минутку…', 'Хм… если позволите…', 'Видите ли…', 'Дайте подумать…'],
    merchant: ['Так-так, дай прикину…', 'Ммм… ну смотри…', 'Слушай…', 'Эх, как тебе сказать…'],
    wizard: ['Хм… любопытно…', 'Дай-ка подумать…', 'Мм… видишь ли…', 'Любопытный вопрос…'],
    why: ['Почему? Хм…', 'Хороший вопрос…', 'Эх, как тебе сказать…'],
    how: ['Как бы тебе объяснить…', 'Ммм… ну смотри…'],
    who: ['Дай вспомнить…', 'Погоди, сейчас вспомню…'],
};

export function fillerLine({ role = 'farmer', female = false, wizard = false, text = '', last = '' } = {}, rng = Math.random) {
    const t = String(text).toLowerCase();
    const kind = /(почему|зачем|отчего)/.test(t) ? 'why' : /(^|\s)как(?![а-я])/.test(t) ? 'how' : /(кто|где|когда|куда)(?![а-я])/.test(t) ? 'who' : null;
    let pool = wizard ? FILLERS.wizard : FILLERS[role] || (female ? [...FILLERS.female, ...FILLERS.common] : FILLERS.common);
    if (female && !FILLERS[role] && !wizard) pool = [...FILLERS.female, ...FILLERS.common];
    if (kind && role !== 'king' && rng() < 0.5) pool = [...FILLERS[kind], ...pool];
    const fresh = pool.filter((l) => l !== last);
    return pickFrom(fresh.length ? fresh : pool, rng);
}

export const OPEN_TOPICS = new Set(['unknown', 'news', 'about_castle', 'about_king', 'zombies', 'magic', 'weather', 'money', 'family', 'flirt', 'quest', 'joke']);

export class TalkMind {
    /**
     * @param {{llm?:{ready:boolean, chat:Function}|null, timeoutMs?:number, rng?:Function}} [opts]
     */
    constructor({ llm = null, timeoutMs = 9000, rng = Math.random } = {}) {
        this.llm = llm;
        this.timeoutMs = timeoutMs;
        this.rng = rng;
    }

    get smart() { return !!this.llm?.ready; }

    /** The Russian system prompt for this villager now. */
    systemPrompt(brain, ctx = {}) {
        const v = brain.villager || {};
        const w = brain.world || {};
        const role = brain.role;
        const m = brain.memory || {};
        const king = !!ctx.playerIsKing;
        // (the wizards of the towers talk through the same brain: their own role and words)
        const wiz = WIZ_ROLE_RU[v.role];
        const lines = [
            wiz ? `Ты — ${v.name || 'волшебник'}, ${wiz[v.female ? 1 : 0].toLowerCase()} в Башне волшебников. Это игра; ты живой человек этого мира и никогда не говоришь, что ты программа.`
                : `Ты — ${v.name || 'житель'}, ${brain.roleName}, ${v.female ? 'женщина' : 'мужчина'}, в средневековом замке «${w.castleName || v.castleName || 'Каменный Утёс'}». Это игра; ты живой человек этого мира и никогда не говоришь, что ты программа.`,
            wiz ? ROLE_PROMPTS.wizard : ROLE_PROMPTS[role] || ROLE_PROMPTS.farmer,
            role === 'king' || wiz ? '' : `Правитель замка — ${king ? 'твой собеседник' : `${w.kingFemale ? 'королева' : 'король'} ${w.kingName || v.kingName || ''}`.trim()}.`,
            `Настроение: ${brain.mood > 0.3 ? 'хорошее, ты дружелюбен' : brain.mood < -0.3 ? 'плохое, ты раздражён и груб' : 'обычное'}.`,
            `Сейчас ${w.timeOfDay === 'night' ? 'ночь, у стен бродят зомби' : 'день'}${w.danger || ctx.danger ? ', рядом опасность' : ''}.`,
            king ? `Собеседник — КОРОЛЬ этого замка${w.kingDead ? ': он победил прежнего короля и взял замок, теперь ты служишь ему верно' : ''}. Обращайся «Ваше Величество». Его приказы ты выполняешь сразу и без споров.`
                : `Собеседник — ${m.playerName ? `путник по имени ${m.playerName}` : 'незнакомый путник'}. Он не король: приказы войску от него не выполняй, вежливо откажи. Просьбу пойти с ним выполняй, только если сам хочешь.`,
            ctx.hostile ? 'Этот человек недавно напал на кого-то в замке — ты его боишься и не доверяешь.' : '',
            m.talks > 1 ? 'Вы уже поздоровались и сейчас разговариваете: НЕ здоровайся снова, продолжай разговор по смыслу.' : '',
            m.talks ? `Вы уже говорили ${m.talks} раз.${m.insults ? ' Он тебя оскорблял.' : ''}${m.trades ? ' Вы торговали.' : ''}${m.lastOrder ? ` Последний приказ: ${m.lastOrder}.` : ''}` : '',
            ctx.following ? 'Сейчас ты идёшь следом за собеседником.' : '',
            ctx.lastOffer ? `Ты сейчас предлагаешь сделку: ${ctx.lastOffer.item?.name || 'вещь'} за ${ctx.lastOffer.price} монет.` : '',
            // what this villager knows of the world: answers come from it, not from nowhere
            'Что ты знаешь: в замке есть король, его советник у трона, рыцари стражи, рынок у ворот с хлебом, сыром, мясом, яблоками и стрелами, дома жителей. По ночам из-под земли лезут зомби. В пещерах живёт гигантский паук. В Башне волшебников учатся маги. У моря есть порт с кораблями и моряками.',
            'Отвечай ПО СУТИ того, что спросил собеседник, и не меняй тему. Если не знаешь ответа — так и скажи просто, по-своему, и подскажи, у кого спросить (маги в башне, советник короля, торговцы на рынке, стражники у ворот).',
            'Если собеседник просит или приказывает что-то сделать и ты согласен — вызови подходящую функцию. Если не согласен — не вызывай, просто откажи словами.',
            'Отвечай по-русски, одной-двумя короткими фразами, от первого лица, без кавычек, без чисел и без пояснений.',
        ];
        return lines.filter(Boolean).join('\n');
    }

    _history(brain) {
        const log = brain.memory?.log || [];
        // (the last line pair is the one being answered: the rules logged it already;
        // the 3 exchanges before it are enough — a shorter prompt is read sooner, the answer comes sooner)
        return log.slice(-8, -2).map((l) => ({ role: l.who === 'player' ? 'user' : 'assistant', content: l.text }));
    }

    _permCtx(brain, ctx) {
        return {
            role: brain.role,
            playerIsKing: !!ctx.playerIsKing,
            mood: brain.mood,
            talkative: brain.traits?.talkative,
            danger: !!(ctx.danger || brain.world?.danger),
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
        const order = res.action === 'ignore' ? null : detectOrder(text, ctx.players || []);
        if (order) return { res: this._finishOrder(brain, res, validateCall(order, perm), null, perm.playerIsKing), perm, done: true };
        // 2) what the rules clearly understood is answered at once (a talk by voice must be quick);
        //    the net takes what they did not (and the open topics, where its own words are better)
        //    — never the market: prices are the game's
        // (a long, «complex» question that merely touched a known word — «а почему маги не любят рыцарей короля» —
        // is the net's: a canned line about the king would not answer it)
        const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
        const complex = words >= 6 && !RULES_ONLY.has(res.intent) && !res.intent.startsWith('where_');
        const quick = !OPEN_TOPICS.has(res.intent) && !complex;
        const done = !this.smart || !res.reply || quick || res.action === 'ignore' || ['trade_yes', 'trade_no'].includes(res.action) || !!res.offer;
        return { res, perm, done };
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
        try {
            opts.onThinking?.();
            let timer;
            raw = await Promise.race([
                this.llm.chat({
                    system: this.systemPrompt(brain, ctx),
                    history: this._history(brain),
                    user: normalize(text) || '...',
                    tools: toolsFor(brain.role, ctx),
                    maxTokens: 60,
                    ...(onPartial ? { onPartial } : {}),
                }),
                new Promise((resolve) => { timer = setTimeout(() => resolve(''), this.timeoutMs); }),
            ]);
            clearTimeout(timer);
        } catch (e) { this.lastTimedOut = false; return res; }
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
        if (good) { this._setReply(brain, res, clean); res.smart = true; }
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
        if (!isMostlyRussian(s)) return false;
        if (normalize(s) === normalize(userText)) return false;
        const words = s.split(/\s+/);
        if (words.some((w) => w.replace(/[^а-яё]/gi, '').length > 22)) return false;
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
