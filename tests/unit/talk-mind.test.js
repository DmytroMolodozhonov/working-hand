import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/core/math.js';
import { VillagerBrain } from '../../src/game/VillagerBrain.js';
import { TOOLS, TOOL_NAMES, toolsFor, parseToolCalls, validateCall, detectOrder, resolveTarget } from '../../src/ai/TalkActions.js';
import { TalkMind, ROLE_PROMPTS, thinkingLine } from '../../src/ai/TalkMind.js';

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
    assert.match(req.system, /советник/);
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
    assert.match(last.system, /Дима/);
});
