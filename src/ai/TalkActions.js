/**
 * TalkActions.js — what a villager can DO when you talk to them.
 *
 * Pure logic (node-testable, no DOM):
 *  - TOOLS: the game actions as a JSON function schema (the small neural net
 *    "calls" them: tool calling), with Russian descriptions;
 *  - parseToolCalls(): finds the calls in what the net wrote (several formats:
 *    Qwen <tool_call>{json}</tool_call>, the XML <function=…> form, LFM
 *    <|tool_call_start|>[f(a="b")]<|tool_call_end|>, a bare JSON object);
 *  - validateCall(): the game, not the net, decides: unknown names and bad
 *    arguments are dropped, and an order is carried out only when this
 *    villager would really obey it (the king's orders are obeyed; a stranger's
 *    orders to the army are refused);
 *  - detectOrder(): the plain rule-based reading of army orders («собери
 *    войско», «в атаку на зомби», «защищайте замок», «отбой») — the fallback
 *    when there is no neural net, and the fast path when the words are clear.
 */

import { normalize } from '../game/VillagerBrain.js';

const L = '(?<![а-яa-z0-9])';
const R = '(?![а-яa-z0-9])';

export const PLACES = ['market', 'throne', 'gate', 'walls', 'barracks', 'home'];
export const TARGETS = ['zombies', 'spider', 'animals', 'enemies'];

/** Army orders: they move the castle's knights (only the king gives them). */
export const ARMY = new Set(['gather_army', 'attack', 'defend_castle', 'dismiss', 'guard_me']);

const fn = (name, description, properties = {}, required = []) => ({
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required } },
});

/** The game actions (OpenAI / Hugging Face chat-template tool format). */
export const TOOLS = [
    fn('follow_me', 'Пойти следом за собеседником (он просит идти за ним, сопровождать или охранять его).'),
    fn('stay', 'Остановиться, перестать идти следом и вернуться к своим делам. all=true — отменить приказ всему войску («отбой», «вольно»).',
        { all: { type: 'boolean', description: 'отменить приказы всему войску' } }),
    fn('go_to', 'Проводить собеседника к месту замка.',
        { place: { type: 'string', enum: PLACES, description: 'market — рынок, throne — тронный зал, gate — ворота, walls — стены, barracks — казарма, home — домой' } }, ['place']),
    fn('gather_army', 'Собрать всё войско замка (рыцарей) к королю, чтобы оно шло за ним. Только по приказу короля.'),
    fn('attack', 'Войско атакует врага. Только по приказу короля.',
        { target: { type: 'string', description: 'кого атаковать: zombies — зомби, spider — паук, animals — звери, enemies — любые враги рядом, или имя игрока' } }, ['target']),
    fn('guard_me', 'Стать телохранителем собеседника-короля: идти рядом, прикрывать и бить любого, кто на него нападает («охраняй меня», «защищай меня», «будь рядом»). Только по приказу короля.'),
    fn('defend_castle', 'Войско встаёт на защиту замка: к воротам и на стены, бьёт врагов у стен. Только по приказу короля.'),
    fn('dismiss', 'Приказ «уйдите»: все рядом (в зале) расходятся с глаз долой, а советник отходит к дверям зала. Только по приказу короля.'),
    fn('bow', 'Поклониться собеседнику (королю).'),
    fn('trade_yes', 'Торговец соглашается на сделку, о которой сейчас идёт речь.'),
    fn('trade_no', 'Торговец отказывается от сделки или собеседник передумал.'),
    fn('leave_me', 'Отойти и оставить собеседника в покое: он просит уйти, не мешать, отстать («уйди», «отойди», «не мешай», «отстань»). Это обычная просьба, не приказ войску: её выполняет любой.'),
    fn('flee', 'Убежать от собеседника: он угрожает или опасен.'),
    fn('call_guards', 'Позвать стражу: собеседник угрожает, грабит или нападает.'),
];
export const TOOL_NAMES = new Set(TOOLS.map((t) => t.function.name));

/** The tools worth showing to a villager of this role (a smaller list = a clearer choice for a small net). */
export function toolsFor(role, ctx = {}) {
    return TOOLS.filter((t) => {
        const n = t.function.name;
        if (n.startsWith('trade_')) return role === 'merchant';
        if (n === 'bow') return role !== 'king';
        if (n === 'flee') return role !== 'knight' && role !== 'king';
        if (ARMY.has(n)) return !!ctx.playerIsKing || role === 'knight' || role === 'advisor';
        return true;
    });
}

// ------------------------------------------------------------------ parsing

function coerce(v) {
    if (typeof v !== 'string') return v;
    const s = v.trim();
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return s.replace(/^["']|["']$/g, '');
}

function fromObject(o) {
    if (!o || typeof o !== 'object') return null;
    if (o.function && typeof o.function === 'object') o = o.function; // {type:'function', function:{name, arguments}}
    const name = o.name || o.tool || o.function_name;
    if (typeof name !== 'string') return null;
    let args = o.arguments ?? o.parameters ?? o.args ?? {};
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch (_) { args = {}; } }
    if (!args || typeof args !== 'object' || Array.isArray(args)) args = {};
    return { name: name.trim(), args };
}

/** The first balanced {...} JSON object in a string (or null). */
function firstJson(s) {
    const i = s.indexOf('{');
    if (i < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let k = i; k < s.length; k++) {
        const c = s[k];
        if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) {
            try { return { obj: JSON.parse(s.slice(i, k + 1)), start: i, end: k + 1 }; } catch (_) { return null; }
        }
    }
    // cut off at the end (the token limit): close the braces
    if (depth > 0 && !inStr) { try { return { obj: JSON.parse(s.slice(i) + '}'.repeat(depth)), start: i, end: s.length }; } catch (_) { /* no */ } }
    return null;
}

/** «[attack(target="zombies"), stay()]» — the pythonic call list of LFM models. */
function pythonic(s) {
    const out = [];
    const re = /([a-z_]+)\s*\(([^()]*)\)/g;
    let m;
    while ((m = re.exec(s))) {
        const args = {};
        const ar = /([a-z_]+)\s*=\s*("[^"]*"|'[^']*'|[^,\s)]+)/g;
        let a;
        while ((a = ar.exec(m[2]))) args[a[1]] = coerce(a[2]);
        out.push({ name: m[1], args });
    }
    return out;
}

/** Gemma 4 call arguments: {target:<|"|>zombies<|"|>,all:true} → an object. */
function gemmaArgs(body) {
    const json = String(body).replace(/<\|"\|>/g, '"').replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');
    try { const o = JSON.parse(json); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (_) { return {}; }
}

/**
 * Finds the tool calls in a model's output.
 * @param {string} raw
 * @returns {{text:string, calls:Array<{name:string,args:object}>}} text = what is left to say
 */
export function parseToolCalls(raw) {
    let s = String(raw ?? '');
    const calls = [];
    // <tool_call> … </tool_call> (Qwen, Hermes); the closing tag may be cut off
    s = s.replace(/<tool_call>([\s\S]*?)(<\/tool_call>|$)/g, (_, body) => {
        const fx = /<function=([a-z_]+)>([\s\S]*?)(<\/function>|$)/.exec(body);
        if (fx) {
            const args = {};
            const pr = /<parameter=([a-z_]+)>([\s\S]*?)(<\/parameter>|$)/g;
            let p;
            while ((p = pr.exec(fx[2]))) args[p[1]] = coerce(p[2].trim());
            calls.push({ name: fx[1], args });
        } else {
            const j = firstJson(body);
            const c = j && fromObject(j.obj);
            if (c) calls.push(c);
            else calls.push(...pythonic(body));
        }
        return ' ';
    });
    // <|tool_call>call:attack{target:<|"|>zombies<|"|>}<tool_call|> (Gemma 4); the closing tag may be cut off
    s = s.replace(/<\|tool_call>\s*call:([a-z_]+)\s*(\{[\s\S]*?\})?\s*(<tool_call\|>|$)/g, (_, name, body) => {
        calls.push({ name, args: gemmaArgs(body || '{}') });
        return ' ';
    });
    // <|tool_call_start|>[f(a="b")]<|tool_call_end|> (LFM2)
    s = s.replace(/<\|tool_call_start\|>([\s\S]*?)(<\|tool_call_end\|>|$)/g, (_, body) => {
        const j = firstJson(body);
        const c = j && fromObject(j.obj);
        if (c) calls.push(c); else calls.push(...pythonic(body));
        return ' ';
    });
    // a bare {"name": …, "arguments": …} written as text (tags stripped as special tokens)
    if (!calls.length) {
        const j = firstJson(s);
        const c = j && fromObject(j.obj);
        if (c && TOOL_NAMES.has(c.name)) { calls.push(c); s = s.slice(0, j.start) + ' ' + s.slice(j.end); }
    }
    s = s.replace(/<\/?(tool_call|tool_response|function[^>]*|parameter[^>]*)>/g, ' ').replace(/<\|[^|]*\|>/g, ' ').replace(/<\|?[a-z_]+\|?>/g, (t) => (t.includes('|') ? ' ' : t)).replace(/\s+/g, ' ').trim();
    return { text: s, calls };
}

// ------------------------------------------------------------------ targets

const T_ZOMBIE = new RegExp(`${L}(зомби|мертвец|мертвяк|нежит|упыр|вурдалак|скелет|покойник|нечист)`);
const T_SPIDER = new RegExp(`${L}(паук|паучищ|паучих)`);
const T_ANIMAL = new RegExp(`${L}(зверь|звер[яеи]|животн|волк|медвед|кабан|свин|коров|барана|баранов|овец|овц|лошад|кон[ья]${R})`);
const T_ENEMY = new RegExp(`${L}(враг|врагов|противник|неприятел|чужак|захватчик|их${R}|всех${R}|его${R}|ее${R}|недруг)`);

/**
 * What a target word means.
 * @param {string} target the net's or the rule's word
 * @param {Array<{id:string,name:string}>} [players] players in the game (for «атакуй Петю»)
 * @returns {{kind:'zombies'|'spider'|'animals'|'enemies'}|{kind:'player',id:string,name:string}|null}
 */
export function resolveTarget(target, players = []) {
    const t = normalize(target);
    if (!t) return null;
    if (TARGETS.includes(t)) return { kind: t };
    if (/^(zombie|undead)/.test(t) || T_ZOMBIE.test(t)) return { kind: 'zombies' };
    if (/^spider/.test(t) || T_SPIDER.test(t)) return { kind: 'spider' };
    if (/^(animal|beast)/.test(t) || T_ANIMAL.test(t)) return { kind: 'animals' };
    const words = t.split(' ');
    for (const p of players) {
        const n = normalize(p.name);
        if (!n) continue;
        // «Машу» / «Маша», «Олега» / «Олег»: the same stem, a short ending
        const stem = n.length > 3 ? n.slice(0, n.length - 1) : n;
        if (t === n || words.some((w) => w.startsWith(stem) && w.length <= n.length + 2)) return { kind: 'player', id: p.id, name: p.name };
    }
    if (/^(enem|nearest|all|foe)/.test(t) || T_ENEMY.test(t)) return { kind: 'enemies' };
    return null;
}

// ------------------------------------------------------------------ rules

const ORDER_WORDS = {
    gather: new RegExp(`(${L}(собери|соберите|собрать|созови|созовите|созвать|сзывай|построй|постройте|строй(ся|тесь)|подними|поднимай|поднять|веди|ведите) (\\S+ )?(\\S+ )?(войск|армию|арми[ия]${R}|рыцар|стражу|стражник|солдат|воинов|дружин|полк|отряд|всех|людей)|${L}(войско|армия|рыцари|стража|все|дружина|отряд) (\\S+ )?ко мне${R}|${L}к оружию${R}|${L}в строй${R}|${L}сбор${R}|${L}трубите сбор|${L}(войско|армия|рыцари|дружина|отряд|стража) за мной${R})`),
    attack: new RegExp(`(${L}(атак|атаку|нападай|нападайте|напасть|нападем|бей(те)?${R}|убей(те)?${R}|убить${R}|руби(те)?${R}|в бой${R}|в атаку|уничтож|перебей|перебить|истреб|прогон|прогнать|гоните|разгроми|вперед на|рубите|бейте|вали(те)?${R}|мочи(те)?${R}|взять его|взять их|схватить|схватите))`),
    guard: new RegExp(`(${L}(охраняй|охраняйте|защищай|защищайте|прикрывай|прикрывайте|береги|берегите|оберегай|оберегайте|охранять|защитите|защити) (\\S+ )?(меня|мою жизнь|государя|короля|нас)|${L}(будь|будьте) (\\S+ )?(рядом|при мне|возле меня|около меня)|${L}(я|мы) (\\S+ )?под (вашей |твоей )?защитой|${L}(будь|будьте) (моим|моей|моими) (телохранител|охран|щит))`),
    defend: new RegExp(`(${L}(защищай(те)?|защитите|защитить|оборон(яй|яйте|ять|а)|охраняй(те)?|охранять|держи(те)?|удержи(те)?) (\\S+ )?(замок|замка|крепост|ворота|стены|стен${R}|город|короля|трон)|${L}на стены${R}|${L}к воротам${R}|${L}все на стены|${L}занять оборону|${L}к обороне)`),
    dismiss: new RegExp(`(?<!не )(${L}(уйди|уйдите|уходи|уходите|уйдем|разойдемся|расходись|покиньте зал|убирайся|убирайтесь|покиньте|покинь|выйдите|выйди|отойди|отойдите|отойти|расходитесь|разойдитесь|разойдись|разойтись|свободны|прочь|вон)${R}|${L}(иди|идите) отсюда|${L}(иди|идите)( пожалуйста)?$|${L}(иди|идите) (прочь|вон|домой|отсюда|своей дорогой)|${L}оставь(те)? нас|${L}освободи(те)? (зал|трон))`),
    stopAll: new RegExp(`(${L}отбой${R}|${L}по местам${R}|${L}на посты${R}|${L}по постам${R}|${L}разойдись|${L}разойтись|${L}вольно${R}|${L}отставить${R}|${L}отступ(ай|айте|ить|аем)|${L}назад${R}|${L}(хватит|прекратить|прекратите|прекрати|стоп) (бой|атаку|драку|войну|сражени)|${L}(войско|армия|рыцари|стража|все) (стой|стоять|на место|по местам|по домам|свободны))`),
};

/**
 * Reads an army order in plain words (no neural net).
 * @param {string} text the transcript
 * @param {Array<{id:string,name:string}>} [players]
 * @returns {{name:string,args:object}|null}
 */
export function detectOrder(text, players = []) {
    const t = normalize(text);
    if (!t) return null;
    if (ORDER_WORDS.dismiss.test(t) && !ORDER_WORDS.attack.test(t)) return { name: 'dismiss', args: {} };
    if (ORDER_WORDS.stopAll.test(t)) return { name: 'stay', args: { all: true } };
    if (ORDER_WORDS.attack.test(t)) {
        // «бей», «руби» alone are not orders without whom: «атакуй», «в атаку» are
        const target = resolveTarget(t.replace(ORDER_WORDS.attack, ' '), players)
            || (/(атак|в бой|нападай|нападайте|в атаку|вперед на)/.test(t) ? { kind: 'enemies' } : null);
        if (target) return { name: 'attack', args: { target: target.kind === 'player' ? target.name : target.kind } };
    }
    if (ORDER_WORDS.guard.test(t)) return { name: 'guard_me', args: {} };
    if (ORDER_WORDS.defend.test(t)) return { name: 'defend_castle', args: {} };
    if (ORDER_WORDS.gather.test(t)) return { name: 'gather_army', args: {} };
    return null;
}

// ------------------------------------------------------------------ validation

/**
 * Would this villager do it? The game decides, not the net.
 * @param {{name:string,args?:object}} call
 * @param {{role:string, playerIsKing?:boolean, mood?:number, talkative?:number, danger?:boolean,
 *          hasOffer?:boolean, players?:Array<{id,name}>, selfId?:string}} ctx
 * @returns {{ok:true, name:string, args:object} | {ok:false, name?:string, reason:'unknown'|'bad_args'|'refuse'|'not_merchant'|'no_offer'}}
 */
export function validateCall(call, ctx = {}) {
    if (!call || typeof call.name !== 'string') return { ok: false, reason: 'unknown' };
    const name = call.name.trim();
    if (!TOOL_NAMES.has(name)) return { ok: false, reason: 'unknown' };
    const a = call.args && typeof call.args === 'object' ? call.args : {};
    const role = ctx.role || 'farmer';
    const king = !!ctx.playerIsKing;
    const mood = Number(ctx.mood) || 0;
    const no = (reason = 'refuse') => ({ ok: false, name, reason });
    const yes = (args = {}) => ({ ok: true, name, args });
    switch (name) {
        case 'follow_me': {
            if (role === 'king') return no();
            if (king) return yes();
            if (ctx.serve) return ctx.serve.yes ? yes({ agreed: true }) : no(); // (his character and how he takes me — Attitude.willDo)
            const willing = role === 'knight' || role === 'advisor' ? (mood > 0.3 || !!ctx.danger)
                : mood > 0.5 || (mood > 0.2 && (Number(ctx.talkative) || 0) > 0.7);
            return willing ? yes() : no();
        }
        case 'stay': return yes({ all: a.all === true || a.all === 'true' });
        case 'go_to': {
            const place = String(a.place || '').toLowerCase();
            if (!PLACES.includes(place)) return no('bad_args');
            if (role === 'king' && !king) return no();
            if (!king && ctx.favor) return ctx.favor.yes ? yes({ place }) : no();
            if (!king && mood < -0.3) return no();
            return yes({ place });
        }
        case 'guard_me': return king ? yes() : ctx.serve?.yes ? yes({ agreed: true }) : no(); // (a bodyguard for anyone he wants to help)
        case 'gather_army': case 'defend_castle': case 'dismiss':
            return king ? yes() : no();
        case 'attack': {
            const target = resolveTarget(String(a.target ?? ''), ctx.players || []);
            if (!target) return no('bad_args');
            if (target.kind === 'player' && target.id === ctx.selfId) return no('bad_args'); // (not on the king himself)
            // a knight fights the undead / the spider by himself if you ask; anything else — only the king's word
            if (!king && !(role === 'knight' && (target.kind === 'zombies' || target.kind === 'spider'))) return no();
            return yes({ target: target.kind === 'player' ? target.name : target.kind, ...(target.kind === 'player' ? { playerId: target.id } : {}) });
        }
        case 'bow': return king && role !== 'king' ? yes() : no();
        case 'trade_yes': case 'trade_no':
            if (role !== 'merchant') return no('not_merchant');
            if (!ctx.hasOffer && name === 'trade_yes') return no('no_offer');
            return yes();
        case 'leave_me': return role === 'king' ? no() : yes(); // («уйди» — a plain request, not an army order: even the rude do it)
        case 'flee': return role === 'knight' || role === 'king' ? no() : yes();
        case 'call_guards': return yes();
        default: return no('unknown');
    }
}

// ------------------------------------------------------------------ lines

/** What a villager says when obeying / refusing an order (the net's own words win when it has some). */
export const ORDER_LINES = {
    obey: {
        knight: ['Слушаюсь, Ваше Величество!', 'Будет исполнено!', 'Есть!', 'Так точно, Ваше Величество!'],
        advisor: ['Сию минуту, Ваше Величество. Передаю приказ войску.', 'Будет исполнено, мой государь.', 'Немедля распоряжусь, Ваше Величество.'],
        common: ['Слушаюсь, Ваше Величество! Бегу к рыцарям!', 'Сейчас передам страже, Ваше Величество!', 'Как прикажете, Ваше Величество!'],
    },
    refuse: {
        knight: ['Я подчиняюсь только королю.', 'Приказы мне отдаёт король, а не ты.', 'Ты мне не командир.'],
        advisor: ['Войском командует король, а не путники.', 'Такие приказы отдаёт только король.'],
        king: ['Ты приказываешь мне? Королю?!', 'Здесь приказываю я.', 'Дерзость! Я здесь правитель.'],
        common: ['Я тебе не солдат.', 'Войском командует король, не я.', 'Я человек мирный, какое войско?', 'Иди к королю с такими приказами.'],
    },
    knightZombies: ['Нежить? Сейчас разберёмся!', 'За мной, братья! Бей мертвецов!', 'Мертвецы у стен? Иду!'],
    none: {
        knight: ['Врагов не видно, Ваше Величество. Мы рядом.', 'Никого нет, Ваше Величество. Ждём приказа.'],
        common: ['Да тут никого нет, Ваше Величество.'],
    },
};
