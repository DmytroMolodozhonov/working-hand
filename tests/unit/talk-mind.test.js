import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/core/math.js';
import { VillagerBrain } from '../../src/game/VillagerBrain.js';
import { TOOLS, TOOL_NAMES, toolsFor, parseToolCalls, validateCall, detectOrder, resolveTarget } from '../../src/ai/TalkActions.js';
import { restAfter } from '../../src/game/CastleTalk.js';
import { TalkMind, ROLE_PROMPTS, thinkingLine, fillerLine } from '../../src/ai/TalkMind.js';

const PLAYERS = [{ id: 'p1', name: 'Олег' }, { id: 'p2', name: 'Маша' }];

function brain(role, { mood = 0, seed = 5, king = false } = {}) {
    return new VillagerBrain({ id: `${role}-${seed}`, name: 'Ратибор', role, castleName: 'Серый Утёс', kingName: 'Эдгар', mood, seed },
        { castleName: 'Серый Утёс', kingName: 'Эдгар', playerIsKing: king, timeOfDay: 'day', danger: false }, { rng: createRng(seed) });
}

/** A fake neural net: answers with what the test wants, records what it was asked. */
function fakeLLM(answer, { delay = 0 } = {}) {
    const llm = {
        ready: true,
        asked: [],
        chat(req) {
            llm.asked.push(req);
            const out = typeof answer === 'function' ? answer(req) : answer;
            return delay ? new Promise((r) => setTimeout(() => r(out), delay)) : Promise.resolve(out);
        },
    };
    return llm;
}

// ------------------------------------------------------------ the schema

test('every tool has a Russian description and a JSON object schema', () => {
    for (const t of TOOLS) {
        assert.equal(t.type, 'function');
        assert.match(t.function.name, /^[a-z_]+$/);
        assert.match(t.function.description, /[а-я]/);
        assert.equal(t.function.parameters.type, 'object');
        for (const r of t.function.parameters.required) assert.ok(t.function.parameters.properties[r], `${t.function.name}.${r}`);
    }
    assert.ok(TOOL_NAMES.has('gather_army') && TOOL_NAMES.has('attack') && TOOL_NAMES.has('defend_castle') && TOOL_NAMES.has('follow_me') && TOOL_NAMES.has('stay'));
});

test('merchants see the trade tools, others do not; army tools only for the king / knights / the advisor', () => {
    const names = (role, ctx) => toolsFor(role, ctx).map((t) => t.function.name);
    assert.ok(names('merchant').includes('trade_yes'));
    assert.ok(!names('farmer').includes('trade_yes'));
    assert.ok(!names('farmer').includes('gather_army'));
    assert.ok(names('farmer', { playerIsKing: true }).includes('gather_army'));
    assert.ok(names('knight').includes('attack'));
    assert.ok(names('advisor').includes('defend_castle'));
});

// ------------------------------------------------------------ parsing

test('tool calls are found in every format a small model writes', () => {
    let r = parseToolCalls('Слушаюсь! <tool_call>\n{"name": "gather_army", "arguments": {}}\n</tool_call>');
    assert.deepEqual(r.calls, [{ name: 'gather_army', args: {} }]);
    assert.equal(r.text, 'Слушаюсь!');

    r = parseToolCalls('<tool_call>\n<function=attack>\n<parameter=target>\nzombies\n</parameter>\n</function>\n</tool_call>\nВперёд!');
    assert.deepEqual(r.calls, [{ name: 'attack', args: { target: 'zombies' } }]);
    assert.equal(r.text, 'Вперёд!');

    r = parseToolCalls('<|tool_call_start|>[attack(target="Олег")]<|tool_call_end|>Есть!');
    assert.deepEqual(r.calls, [{ name: 'attack', args: { target: 'Олег' } }]);

    r = parseToolCalls('{"name": "follow_me", "arguments": "{}"} Иду.');
    assert.deepEqual(r.calls, [{ name: 'follow_me', args: {} }]);
    assert.equal(r.text, 'Иду.');

    r = parseToolCalls('<tool_call>{"name": "stay", "arguments": {"all": true}'); // cut off
    assert.deepEqual(r.calls, [{ name: 'stay', args: { all: true } }]);

    r = parseToolCalls('Просто поболтаем.');
    assert.deepEqual(r.calls, []);
    assert.equal(r.text, 'Просто поболтаем.');
});

// ------------------------------------------------------------ the rules

test('army orders are read in plain words', () => {
    const cases = [
        ['собери войско', 'gather_army'], ['созови всех рыцарей', 'gather_army'], ['рыцари ко мне', 'gather_army'], ['к оружию', 'gather_army'],
        ['защищайте замок', 'defend_castle'], ['все на стены', 'defend_castle'], ['охраняйте ворота', 'defend_castle'],
        ['в атаку на зомби', 'attack'], ['атакуйте мертвецов', 'attack'], ['убейте паука', 'attack'], ['нападайте на олега', 'attack'],
        ['отбой', 'stay'], ['вольно', 'stay'], ['отставить', 'stay'],
    ];
    for (const [text, name] of cases) assert.equal(detectOrder(text, PLAYERS)?.name, name, text);
    assert.deepEqual(detectOrder('в атаку на зомби').args, { target: 'zombies' });
    assert.deepEqual(detectOrder('нападайте на олега', PLAYERS).args, { target: 'Олег' });
    assert.deepEqual(detectOrder('отбой').args, { all: true });
    for (const text of ['привет', 'где рынок', 'сколько стоит хлеб', 'иди за мной', 'как дела у рыцарей', 'я убью всех зомби']) assert.equal(detectOrder(text, PLAYERS), null, text);
});

test('targets: creatures, players by any word form, enemies', () => {
    assert.deepEqual(resolveTarget('зомби'), { kind: 'zombies' });
    assert.deepEqual(resolveTarget('нежить'), { kind: 'zombies' });
    assert.deepEqual(resolveTarget('spider'), { kind: 'spider' });
    assert.deepEqual(resolveTarget('волков'), { kind: 'animals' });
    assert.deepEqual(resolveTarget('Машу', PLAYERS), { kind: 'player', id: 'p2', name: 'Маша' });
    assert.deepEqual(resolveTarget('врагов'), { kind: 'enemies' });
    assert.equal(resolveTarget('облака'), null);
});

test('the king is obeyed; a stranger is refused; the game — not the net — decides', () => {
    const king = { role: 'knight', playerIsKing: true, players: PLAYERS };
    const stranger = { role: 'knight', playerIsKing: false, players: PLAYERS };
    assert.ok(validateCall({ name: 'gather_army', args: {} }, king).ok);
    assert.ok(validateCall({ name: 'defend_castle', args: {} }, king).ok);
    assert.deepEqual(validateCall({ name: 'attack', args: { target: 'Олега' } }, king), { ok: true, name: 'attack', args: { target: 'Олег', playerId: 'p1' } });
    assert.equal(validateCall({ name: 'gather_army' }, stranger).reason, 'refuse');
    assert.equal(validateCall({ name: 'attack', args: { target: 'Олег' } }, stranger).reason, 'refuse');
    // a knight fights the undead if anyone asks
    assert.ok(validateCall({ name: 'attack', args: { target: 'зомби' } }, stranger).ok);
    assert.equal(validateCall({ name: 'attack', args: { target: 'зомби' } }, { ...stranger, role: 'farmer' }).reason, 'refuse');
    // nonsense from the net is dropped
    assert.equal(validateCall({ name: 'launch_rockets', args: {} }, king).reason, 'unknown');
    assert.equal(validateCall({ name: 'attack', args: { target: 'облака' } }, king).reason, 'bad_args');
    assert.equal(validateCall({ name: 'go_to', args: { place: 'луна' } }, king).reason, 'bad_args');
    assert.equal(validateCall({ name: 'attack', args: { target: 'Олег' } }, { ...king, selfId: 'p1' }).reason, 'bad_args'); // (not on the king himself)
    // follow: the king — always; a stranger — when the villager likes them
    assert.ok(validateCall({ name: 'follow_me' }, { role: 'farmer', playerIsKing: true }).ok);
    assert.equal(validateCall({ name: 'follow_me' }, { role: 'farmer', mood: 0 }).ok, false);
    assert.ok(validateCall({ name: 'follow_me' }, { role: 'farmer', mood: 0.6 }).ok);
    assert.equal(validateCall({ name: 'follow_me' }, { role: 'king', playerIsKing: true }).ok, false);
    // trade only for merchants with an offer on the table
    assert.equal(validateCall({ name: 'trade_yes' }, { role: 'farmer' }).reason, 'not_merchant');
    assert.equal(validateCall({ name: 'trade_yes' }, { role: 'merchant' }).reason, 'no_offer');
    assert.ok(validateCall({ name: 'trade_yes' }, { role: 'merchant', hasOffer: true }).ok);
});

// ------------------------------------------------------------ the mind

test('a Russian system prompt per role, with the king rule', () => {
    const mind = new TalkMind({});
    for (const role of ['farmer', 'builder', 'merchant', 'knight', 'advisor', 'king']) {
        const b = brain(role);
        const p = mind.systemPrompt(b, { playerIsKing: false });
        assert.match(p, /[а-я]/);
        assert.ok(p.includes(ROLE_PROMPTS[role]), role);
        assert.match(p, /не король/);
    }
    assert.match(mind.systemPrompt(brain('knight'), { playerIsKing: true }), /КОРОЛЬ этого замка/);
    assert.ok(ROLE_PROMPTS.wizard);
    assert.ok(thinkingLine('knight').length > 0);
});

test('no net: the rules carry out the king\'s army orders at once and refuse a stranger', async () => {
    const mind = new TalkMind({ llm: null, rng: createRng(1) });
    let r = await mind.hear(brain('knight', { king: true }), 'собери войско', { playerIsKing: true, players: PLAYERS });
    assert.equal(r.action, 'gather_army');
    assert.match(r.reply, /Величеств|Есть|исполнено/);
    r = await mind.hear(brain('farmer', { king: true }), 'в атаку на зомби', { playerIsKing: true, players: PLAYERS });
    assert.equal(r.action, 'attack');
    assert.deepEqual(r.args, { target: 'zombies' });
    r = await mind.hear(brain('knight'), 'собери войско', { playerIsKing: false, players: PLAYERS });
    assert.equal(r.action, null);
    assert.ok(r.refused);
    assert.match(r.reply, /корол|командир/i);
    // plain talk stays the rule brain's
    r = await mind.hear(brain('farmer'), 'привет как дела', {});
    assert.ok(r.reply.length > 0);
    assert.ok(!r.smart);
});

test('the net understands free words: its tool call is carried out (the king)', async () => {
    const llm = fakeLLM('Будет исполнено, Ваше Величество! <tool_call>{"name": "defend_castle", "arguments": {}}</tool_call>');
    const mind = new TalkMind({ llm, rng: createRng(2) });
    let thinking = 0;
    const b = brain('advisor', { king: true });
    const r = await mind.hear(b, 'пусть мои люди не пустят врага за стены', { playerIsKing: true, players: PLAYERS }, { onThinking: () => thinking++ });
    assert.equal(thinking, 1, '«Хм…» while the net thinks');
    assert.equal(r.action, 'defend_castle');
    assert.equal(r.reply, 'Будет исполнено, Ваше Величество!');
    assert.equal(b.memory.lastOrder, 'defend_castle');
    // the net was given the tools and a Russian prompt
    const req = llm.asked[0];
    assert.ok(req.tools.some((t) => t.function.name === 'defend_castle'));
    assert.match(req.context, /советник/);
    assert.equal(req.user, 'пусть мои люди не пустят врага за стены');
});

test('the net agrees to a stranger\'s army order — the game refuses anyway', async () => {
    const llm = fakeLLM('Так точно! <tool_call>{"name": "attack", "arguments": {"target": "Маша"}}</tool_call>');
    const mind = new TalkMind({ llm, rng: createRng(3) });
    const r = await mind.hear(brain('knight'), 'ребята проучите-ка машку', { playerIsKing: false, players: PLAYERS });
    assert.equal(r.action, null);
    assert.ok(r.refused);
    assert.doesNotMatch(r.reply, /Так точно/);
});

test('follow by free words; nonsense calls and junk text fall back to the rules', async () => {
    let mind = new TalkMind({ llm: fakeLLM('Пойдём, покажу. <tool_call>{"name":"follow_me","arguments":{}}</tool_call>'), rng: createRng(4) });
    let r = await mind.hear(brain('farmer', { mood: 0.7 }), 'составь мне компанию до колодца', {});
    assert.equal(r.action, 'follow');
    assert.ok(r.smart);
    mind = new TalkMind({ llm: fakeLLM('<tool_call>{"name":"fly_away","arguments":{}}</tool_call> As an AI language model I cannot'), rng: createRng(4) });
    const b = brain('farmer');
    r = await mind.hear(b, 'расскажи что нибудь', {});
    assert.equal(r.action, null);
    assert.ok(!r.smart);
    assert.match(r.reply, /[а-я]/i);
    // prices are the game's business: a reply with numbers is not taken
    mind = new TalkMind({ llm: fakeLLM('Хлеб стоит 100 монет'), rng: createRng(4) });
    r = await mind.hear(brain('farmer'), 'расскажи о себе', {});
    assert.ok(!r.smart);
});

test('a slow net times out: the rule answer comes', async () => {
    const mind = new TalkMind({ llm: fakeLLM('Поздно.', { delay: 300 }), timeoutMs: 40, rng: createRng(5) });
    const r = await mind.hear(brain('builder'), 'что строишь', {});
    assert.ok(r.reply.length > 0);
    assert.notEqual(r.reply, 'Поздно.');
});

test('memory per villager: the net is given the earlier lines', async () => {
    const llm = fakeLLM('Да-да, помню.');
    const mind = new TalkMind({ llm, rng: createRng(6) });
    const b = brain('farmer');
    await mind.hear(b, 'меня зовут дима', {});
    await mind.hear(b, 'расскажи про урожай', {});
    await mind.hear(b, 'а что ты обо мне знаешь', {});
    const last = llm.asked[llm.asked.length - 1];
    assert.ok(last.history.some((h) => h.role === 'user' && /дима/.test(h.content)));
    assert.match(last.context, /Дима/);
    assert.doesNotMatch(last.system, /Дима/, 'the common words are the same for everybody (read once by the program)');
});

test('«почему» is not «почём»; a question with no answer gets an honest «не знаю», not a line about something else', async () => {
    const { detectIntent } = await import('../../src/game/VillagerBrain.js');
    assert.ok(!detectIntent('почему ты грустный').all.includes('price'));
    assert.ok(detectIntent('почем хлеб').all.includes('price'));
    const b = brain('farmer', { seed: 9 });
    let honest = 0;
    for (let i = 0; i < 20; i++) if (/(знаю|знает|спроси|слыхал|попроще)/i.test(b.hear('почему у драконов нет крыльев', {}).reply)) honest++;
    assert.ok(honest >= 8, `honest answers: ${honest}/20`);
});

test('a wizard of the towers gets the wizard prompt, not a farmer\'s', () => {
    const b = new VillagerBrain({ id: 'w1', name: 'Финеас', role: 'teacher', seed: 3 }, { timeOfDay: 'day' }, { rng: createRng(3) });
    const p = new TalkMind({}).systemPrompt(b, {});
    assert.match(p, /наставник в Башне волшебников/);
    assert.ok(p.includes(ROLE_PROMPTS.wizard));
    assert.doesNotMatch(p, /фермер/);
});

test('a quick talk: what the rules clearly understood is answered at once (the net is not even asked); the net\'s first sentence is said while it still writes', async () => {
    const llm = fakeLLM((req) => {
        if (req.onPartial) for (const p of ['Ох, ', 'по ночам мертвецы лезут. ', 'А днём ', 'тихо.']) req.onPartial(p);
        return 'Ох, по ночам мертвецы лезут. А днём тихо.';
    });
    const mind = new TalkMind({ llm, rng: createRng(8) });
    const b = brain('farmer', { seed: 8 });
    const quick = await mind.hear(b, 'как тебя зовут', {});
    assert.equal(llm.asked.length, 0, 'a name question needs no net');
    assert.ok(quick.reply);
    const said = [];
    const r = await mind.hear(b, 'а что у вас тут творится вообще', {}, { onSentence: (s) => said.push(s) });
    assert.equal(llm.asked.length, 1);
    // («Ох,» is too short to be said alone: the first piece is the sentence; then the next one as it ends)
    assert.deepEqual(said, ['Ох, по ночам мертвецы лезут.', 'А днём тихо.']);
    assert.equal(r.spoken, 'Ох, по ночам мертвецы лезут. А днём тихо.');
    assert.equal(r.reply, 'Ох, по ночам мертвецы лезут. А днём тихо.');
});

test('the answer is said while written: a long enough first clause at once, then each sentence; a game action stops it', async () => {
    const llm = fakeLLM((req) => {
        if (req.onPartial) for (const p of ['Король у нас ', 'строгий, ', 'но добрый. ', 'Его все ', 'уважают.']) req.onPartial(p);
        return 'Король у нас строгий, но добрый. Его все уважают.';
    });
    const mind = new TalkMind({ llm, rng: createRng(3) });
    const said = [];
    const r = await mind.hear(brain('farmer', { seed: 3 }), 'а что у вас тут творится вообще', {}, { onSentence: (s, i) => said.push([i, s]) });
    assert.deepEqual(said, [[0, 'Король у нас строгий,'], [1, 'но добрый.'], [2, 'Его все уважают.']]);
    assert.equal(restAfter(r.reply, r.spoken), '');
    assert.equal(restAfter('Король у нас строгий, но добрый. Его все уважают.', 'Король у нас строгий,'), 'но добрый. Его все уважают.');
    assert.equal(restAfter('Совсем другое.', 'Король у нас строгий,'), '', 'never said twice');
    const llm2 = fakeLLM((req) => {
        if (req.onPartial) for (const p of ['Хорошо, ', 'пойдём. <tool_call>{"name": "follow_me", "arguments": {}}</tool_call>']) req.onPartial(p);
        return 'Хорошо, пойдём. <tool_call>{"name": "follow_me", "arguments": {}}</tool_call>';
    });
    const said2 = [];
    await new TalkMind({ llm: llm2, rng: createRng(3) }).hear(brain('farmer', { seed: 4 }), 'а что у вас тут творится вообще', {}, { onSentence: (s) => said2.push(s) });
    assert.ok(said2.every((x) => !/[<{]/.test(x)), 'no tool call said aloud');
});

test('a complex question goes to the net even if it touches a known word; an unknown question is a «не знаю» on it, never a line about something else', async () => {
    const llm = fakeLLM(() => 'Маги держатся особняком, а рыцари им не доверяют.');
    const mind = new TalkMind({ llm, rng: createRng(5) });
    const b = brain('farmer', { seed: 5 });
    const r = await mind.hear(b, 'а скажи мне почему маги в башне не любят рыцарей короля', {});
    assert.equal(llm.asked.length, 1, 'the net is asked');
    assert.match(r.reply, /Маги держатся особняком/);
    await mind.hear(b, 'сколько стоит хлеб', {});
    assert.equal(llm.asked.length, 1, 'the market stays the rules\' (prices are the game\'s)');
    // no net: the rules answer on the question
    const plain = brain('builder', { seed: 2 });
    const a = plain.hear('почему в этой башне живут волшебники', {}).reply;
    assert.match(a, /(не знаю|не скажу|не слыхал|кабы я знал).*(башн|маг)/i, a);
    assert.match(plain.hear('далеко ли отсюда до моря', {}).reply, /(не знаю|не скажу|не слыхал|кабы я знал|Мудрёный)/i);
    const said = plain.hear('я вчера видел странный свет над лесом', {}).reply;
    assert.match(said, /^(Вот как|Понимаю|Ну, тебе виднее|Интересно говоришь|Вот оно что|Ясно)/, said);
});

test('thinking words: his own, by role and by a woman\'s voice, never the same twice running', () => {
    const rng = createRng(11);
    let last = '';
    for (let i = 0; i < 40; i++) {
        const l = fillerLine({ role: i % 3 ? 'farmer' : 'knight', female: i % 2 === 0, text: 'почему так', last }, rng);
        assert.notEqual(l, last);
        assert.match(l, /[…!]$/);
        last = l;
    }
    const seen = new Set(Array.from({ length: 60 }, () => fillerLine({ role: 'farmer' }, rng)));
    assert.ok(seen.size >= 6, `varied: ${[...seen].join(' | ')}`);
});

test('thinking words by the kind of words and the language; Gemma 4 game actions are read', async () => {
    const { fillerKind, fillerPool, isEnglishText } = await import('../../src/ai/TalkMind.js');
    const { parseToolCalls } = await import('../../src/ai/TalkActions.js');
    assert.equal(fillerKind('почему так темно?'), 'question');
    assert.equal(fillerKind('помоги мне, пожалуйста'), 'request');
    assert.equal(fillerKind('', 'haggle'), 'trade');
    assert.equal(fillerKind('', 'greet'), 'greet');
    assert.ok(fillerPool({ female: true, kind: 'request' }).includes('Я поняла…'));
    assert.ok(!fillerPool({ female: false, kind: 'request' }).includes('Я поняла…'));
    assert.ok(fillerPool({ lang: 'en' }).every((l) => isEnglishText(l) || l.length < 4));
    assert.ok(isEnglishText('where is the market?') && !isEnglishText('где рынок?'));
    const r = parseToolCalls('Слушаюсь!<|tool_call>call:attack{target:<|"|>zombies<|"|>}<tool_call|><turn|>');
    assert.equal(r.text, 'Слушаюсь!');
    assert.deepEqual(r.calls, [{ name: 'attack', args: { target: 'zombies' } }]);
});

test('a big net (Gemma 4) answers the usual phrases itself — with the rules\' facts as a hint; prices stay the rules\'', async () => {
    const llm = fakeLLM('Здорово, добрый человек! Заходи, не стесняйся.');
    llm.strong = true;
    const mind = new TalkMind({ llm, rng: createRng(11) });
    // the way asked at length, «who are you»: the net is asked, the rules' answer is its hint («где рынок» alone: at once)
    for (const p of ['слушай, подскажи мне, а где тут у вас рынок находится', 'кто ты такой']) {
        const n = llm.asked.length;
        await mind.hear(brain('farmer', { seed: 11 }), p, {});
        assert.equal(llm.asked.length, n + 1, `the net hears «${p}»`);
    }
    assert.match(llm.asked[0].context, /Суть твоего ответа/);
    assert.match(llm.asked[0].context, /рын/i);
    assert.equal(llm.asked[0].system, llm.asked[1].system, 'the same system words for every question');
    // a greeting is answered at once, like a person does (the author: «моментально») — not after the net
    const g = llm.asked.length;
    const hi = await mind.hear(brain('farmer', { seed: 11 }), 'привет', {});
    assert.equal(llm.asked.length, g, 'a greeting: the rules at once');
    await mind.hear(brain('farmer', { seed: 11 }), 'где рынок', {});
    assert.equal(llm.asked.length, g, 'the way, asked shortly: at once');
    assert.ok(hi.reply);
    // the market's numbers: the rules only
    const n = llm.asked.length;
    const m = new VillagerBrain({ id: 'm1', name: 'Фома', role: 'merchant', seed: 3 }, { timeOfDay: 'day' }, { rng: createRng(3) });
    await mind.hear(m, 'сколько стоит хлеб', { nearbyGoods: [{ name: 'хлеб', price: 3 }] });
    assert.equal(llm.asked.length, n, 'a price is not the net\'s');
    // the same phrase with a small net: the rules at once (as before)
    const small = fakeLLM('Привет!');
    await new TalkMind({ llm: small, rng: createRng(11) }).hear(brain('farmer', { seed: 12 }), 'привет', {});
    assert.equal(small.asked.length, 0);
});

test('a big net keeps the rules\' action; its words never refuse what the villager is doing', async () => {
    const b = brain('knight', { king: true, seed: 13 });
    const ctx = { playerIsKing: true, players: PLAYERS };
    const rules = b.hear('пойдём со мной', ctx);
    assert.equal(rules.action, 'follow', 'the king\'s knight follows by the rules');
    // («пойдём со мной» is done at once by the rules — a person doesn't think about it; the net is not asked)
    const yes = fakeLLM('Слушаюсь, Ваше Величество, иду следом.');
    yes.strong = true;
    let r = await new TalkMind({ llm: yes, rng: createRng(13) }).hear(brain('knight', { king: true, seed: 14 }), 'пойдём со мной', ctx);
    assert.equal(r.action, 'follow');
    assert.equal(yes.asked.length, 0);
    assert.doesNotMatch(r.reply, /не пойду/);
    // (a longer request with the same meaning is the net's: its words, the rules' action)
    r = await new TalkMind({ llm: yes, rng: createRng(13) }).hear(brain('knight', { king: true, seed: 16 }), 'пойдём со мной, мне нужна твоя помощь в одном деле', ctx);
    assert.equal(r.action, 'follow');
    assert.equal(r.reply, 'Слушаюсь, Ваше Величество, иду следом.');
    const no = fakeLLM('Нет, не пойду я никуда.');
    no.strong = true;
    r = await new TalkMind({ llm: no, rng: createRng(13) }).hear(brain('knight', { king: true, seed: 15 }), 'пойдём со мной', ctx);
    assert.equal(r.action, 'follow');
    assert.doesNotMatch(r.reply, /не пойду/);
});

test('a big net that is slow on this computer: the rules answer what they understood at once, the net only the rest; an error — the rules, the reason kept', async () => {
    const llm = fakeLLM('Ну, слушай, расскажу.', { delay: 60 });
    llm.strong = true;
    const mind = new TalkMind({ llm, rng: createRng(21) });
    mind.speedMs = 6000; // (its first words took seconds here)
    const n = llm.asked.length;
    const r = await mind.hear(brain('farmer', { seed: 21 }), 'где рынок', {});
    assert.equal(llm.asked.length, n, 'the way: the rules, at once');
    assert.ok(r.reply.length > 0);
    await mind.hear(brain('farmer', { seed: 22 }), 'а почему маги не любят рыцарей короля скажи честно', {});
    assert.equal(llm.asked.length, n + 1, 'what the rules do not know: the net');
    assert.ok(mind.speedMs < 6000, 'its speed is measured again');
    // the net fails: the rules' answer, the reason kept for the journal
    const bad = { ready: true, strong: true, chat: () => Promise.reject(new Error('the program stopped')) };
    const m2 = new TalkMind({ llm: bad, rng: createRng(23) });
    const r2 = await m2.hear(brain('farmer', { seed: 23 }), 'расскажи что нибудь интересное', {});
    assert.ok(r2.reply.length > 0);
    assert.match(m2.lastError, /stopped/);
});
