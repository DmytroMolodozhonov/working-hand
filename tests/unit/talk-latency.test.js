// The talk's speed guard (the author: «жители должны отвечать МОМЕНТАЛЬНО, как человек… нужен конкретный
// тест-бенчмарк»). People answer ~200 ms after the other stops (Levinson & Torreira 2015; Stivers et al. 2009).
// The whole way of a talk turn — the looks of the speech program at the phrase (their real timing measured on a
// 4-core processor: tools/talkbench.mjs --real), TalkFlow (when the words go to the villagers), the game's own
// rules (VillagerBrain, TalkMind.first), the quick words made in advance, the net's first sentence — is run on
// model networks, and each kind of turn must fit its budget (ms after the player's speech ended, 95th percentile).
// The budgets are only ever made stricter — never looser to let a change through.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { simulate, summary, fakeLooks, LEGACY, NOW } from '../../tools/talkbench.mjs';
import { TalkFlow, QUIET, readiness, quickOrder, crewOrder, openEnd } from '../../src/ai/TalkFlow.js';
import { TalkTrace, quantile } from '../../src/ai/TalkTrace.js';
import { ackFor, ackPool, CREW_ACKS } from '../../src/ai/TalkAcks.js';
import { TalkMind } from '../../src/ai/TalkMind.js';
import { VillagerBrain } from '../../src/game/VillagerBrain.js';
import { Speech } from '../../src/audio/Speech.js';

const SCEN = JSON.parse(fs.readFileSync(new URL('../fixtures/talk-scenarios.json', import.meta.url), 'utf8'));

/** ms after the speech's end, 95th percentile (measured 23.10.2026 on these models: order act 500, ack 525, crew 435, talk 855,
 *  net «Хм…» 635, its first clause 2620 — the way before: 2300 / 2020 / 2180 / 2330, the net's clause 6330). Only ever lower these. */
export const BUDGET = {
    orderAct: 520, // the order carried out / he turned to me
    orderAck: 550, // «Слушаюсь!» heard
    crewAck: 480, // «Есть поднять паруса!» heard
    talkAck: 900, // the first sound of a rules' answer (a hanging «э-э… ну это самое…» waits 0.6 s of quiet)
    netAck: 700, // «Хм…» while the net thinks
    netVoice: 2800, // the net's first clause heard (the net 100/12 tokens/s, the voice 0.6 s a line)
};

const run = (way) => SCEN.map((sc) => simulate(sc, fakeLooks(sc), { way }));

test('talkbench: every kind of turn fits its budget (p95), and the way before was at least twice slower', () => {
    const now = run(NOW), before = run(LEGACY);
    const act = summary(now, 'act'), ack = summary(now, 'ack'), voice = summary(now, 'voice');
    assert.ok(act.order.p95 <= BUDGET.orderAct, `order act ${act.order.p95}`);
    assert.ok(ack.order.p95 <= BUDGET.orderAck, `order ack ${ack.order.p95}`);
    assert.ok(ack.crew.p95 <= BUDGET.crewAck, `crew ack ${ack.crew.p95}`);
    assert.ok(ack.talk.p95 <= BUDGET.talkAck, `talk ack ${ack.talk.p95}`);
    assert.ok(ack.net.p95 <= BUDGET.netAck, `net ack ${ack.net.p95}`);
    assert.ok(voice.net.p95 <= BUDGET.netVoice, `net voice ${voice.net.p95}`);
    const old = summary(before, 'ack');
    for (const k of ['order', 'crew', 'talk']) assert.ok(old[k].mean >= 2 * ack[k].mean, `${k}: ${old[k].mean} → ${ack[k].mean}`);
    // the words handed early are the whole phrase (never a piece of it)
    for (const r of now) assert.equal(r.text, SCEN.find((s) => s.id === r.id).say.toLowerCase().replace(/[!?.,…]/g, '').replace(/\s+/g, ' ').trim(), r.id);
});

test('TalkFlow: an order after 0.12 s of quiet, a finished phrase after 0.25 s, a hanging one after 0.6 s', () => {
    let t = 0;
    const fired = [];
    const flow = new TalkFlow({ now: () => t, fire: (text, info) => fired.push({ text, at: t, kind: info.kind }) });
    // an order
    flow.offer('все в атаку', { seg: 1, q: 0.064 });
    flow.quiet(0.1);
    assert.equal(fired.length, 0);
    flow.quiet(QUIET.order);
    assert.deepEqual(fired.map((f) => f.text), ['все в атаку']);
    // a question
    flow.offer('как пройти к тронному залу', { seg: 2, q: 0.064 });
    flow.quiet(0.2);
    assert.equal(fired.length, 1);
    flow.quiet(0.26);
    assert.equal(fired.length, 2);
    // a hanging phrase: «как пройти к…» — the speaker is thinking
    flow.offer('как пройти к', { seg: 3, q: 0.064 });
    flow.quiet(0.5);
    assert.equal(fired.length, 2);
    flow.quiet(0.61);
    assert.equal(fired.length, 3);
    // a look made while the words were still said (no quiet in it) is never answered — its end may be missing
    flow.offer('расскажи почему король не любит', { seg: 4, q: 0 });
    flow.quiet(0.9);
    assert.equal(fired.length, 3);
    // the speaker goes on: the quiet is broken, nothing is answered until a new look
    flow.offer('привет как дела', { seg: 5, q: 0.064 });
    flow.quiet(0);
    flow.quiet(0.3);
    assert.equal(fired.length, 3);
    assert.equal(readiness('рыцарь'), 'open', 'a call alone: the rest is coming');
    assert.equal(readiness('э ну это самое'), 'open');
    assert.equal(readiness('огонь из пушек'), 'order');
    assert.ok(openEnd('я хотел спросить про'));
});

test('TalkFlow: the phrase\'s end after an early answer — the same words are no second question; another order is', () => {
    let t = 0;
    const flow = new TalkFlow({ now: () => t, fire: () => {} });
    flow.offer('все в атаку', { seg: 1, q: 0.064 });
    flow.quiet(0.2);
    assert.equal(flow.final('все в атаку', 1), 'handled');
    flow.offer('в атаку', { seg: 2, q: 0.064 });
    flow.quiet(0.2);
    assert.equal(flow.final('в атаку нет отбой', 2), 'changed', '«в атаку… нет, отбой»: the new order counts');
    flow.offer('привет как дела', { seg: 3, q: 0.064 });
    flow.quiet(0.3);
    assert.equal(flow.final('привет как дело', 3), 'handled', 'a letter heard otherwise is the same question');
    flow.offer('привет', { seg: 4, q: 0.064 });
    flow.quiet(0.3);
    assert.equal(flow.final('привет а где тут рынок у вас', 4), 'changed', 'more words: a new question');
    assert.equal(flow.final('что-то', 9), 'new');
});

test('the quick words: orders, the crew, the alarm — by role, the king\'s or a stranger\'s; few enough to be made in advance', () => {
    assert.equal(quickOrder('поднять паруса'), 'crew:sails');
    assert.equal(crewOrder('на абордаж'), 'board');
    assert.equal(crewOrder('право на борт'), 'helm');
    assert.equal(crewOrder('огонь по ним'), 'fire');
    assert.ok(CREW_ACKS.sails.includes(ackFor({ order: 'crew:sails', role: 'sailor' })));
    assert.match(ackFor({ order: 'attack', role: 'knight', king: true }), /атак|Вперёд|короля|Бей/);
    assert.match(ackFor({ order: 'attack', role: 'knight', king: false }), /корол|командир/i, 'a stranger: refused at once');
    // a woman's forms
    assert.equal(ackFor({ order: 'short', role: 'farmer', female: true }, () => 0.45), 'Поняла!');
    // the made ones first
    assert.equal(ackFor({ order: 'crew:fire', role: 'sailor' }, Math.random, (l) => l === 'Залп!'), 'Залп!');
    for (const role of ['knight', 'farmer', 'sailor']) assert.ok(ackPool({ role, king: true }).length <= 12, role);
});

test('the net: «Хм…» at once, the first sentence before the whole answer, and the rules when it is slow', async () => {
    const brain = () => new VillagerBrain({ id: 'a1', name: 'Олег', role: 'advisor', seed: 5 }, { timeOfDay: 'day' });
    // a streaming net: words come every 30 ms
    const words = 'Король у нас строгий, но справедливый. Магов он не жалует. Давно это было.'.split(' ');
    const llm = { ready: true, strong: true, chat: ({ onPartial }) => new Promise((resolve) => {
        let i = 0;
        const step = () => { if (i < words.length) { onPartial?.((i ? ' ' : '') + words[i++]); setTimeout(step, 30); } else resolve(words.join(' ')); };
        setTimeout(step, 30);
    }) };
    const mind = new TalkMind({ llm });
    const t0 = Date.now();
    const marks = {};
    const res = await mind.hear(brain(), 'расскажи почему король не любит волшебников из башни', {}, {
        onThinking: () => { marks.think = Date.now() - t0; },
        onToken: () => { marks.tok ??= Date.now() - t0; },
        onSentence: (line, i) => { if (i === 0) marks.sent = Date.now() - t0; },
    });
    const total = Date.now() - t0;
    assert.ok(marks.think <= 5, `«Хм…» at once: ${marks.think} ms`);
    assert.ok(marks.tok < marks.sent && marks.sent < total - 100, `the first sentence (${marks.sent}) long before the whole answer (${total})`);
    assert.ok(res.smart);
    // a net that says nothing in time: the rules answer after the first-sentence deadline, not after 8 s
    const slow = new TalkMind({ llm: { ready: true, strong: true, chat: () => new Promise(() => {}) } });
    slow.firstMs = 60;
    const s0 = Date.now();
    const r2 = await slow.hear(brain(), 'расскажи почему король не любит волшебников из башни', {}, { onSentence: () => {} });
    assert.ok(Date.now() - s0 < 400, `the rules after ${Date.now() - s0} ms`);
    assert.ok(r2.reply);
    // a greeting, an insult, «за мной»: the rules at once even with a big net (a person doesn't think about them)
    const asked = [];
    const big = new TalkMind({ llm: { ready: true, strong: true, chat: (q) => { asked.push(q); return Promise.resolve('Да.'); } } });
    for (const p of ['привет', 'ты дурак', 'иди за мной']) assert.equal(big.first(brain(), p, {}).done, true, p);
    // in danger: what the rules know, at once
    assert.equal(big.first(brain(), 'где ворота', { danger: true }).done, true);
    assert.equal(asked.length, 0);
});

test('the net reads a villager ahead: the warm-up asks the same words the next question will begin with', async () => {
    const asked = [];
    const llm = { ready: true, strong: true, chat: (q) => { asked.push(q); return Promise.resolve('Хорошо.'); } };
    const mind = new TalkMind({ llm });
    const b = new VillagerBrain({ id: 'f1', name: 'Ян', role: 'farmer', seed: 9 }, { timeOfDay: 'day' });
    const w = mind.warmRequest(b, {});
    await mind.hear(b, 'расскажи что у вас нового в замке за последнее время', {}, {});
    const q = asked[0];
    assert.equal(q.system, w.system);
    assert.deepEqual(q.history, w.history);
    // the description: the same up to the hint (said last)
    const cut = (s) => s.split('\nСуть твоего ответа')[0].split('\nОтвечай ТОЛЬКО')[0];
    assert.equal(cut(q.context), cut(w.context));
});

test('the stopwatch: one line per turn, from the speech\'s end; the means and p95 per kind', () => {
    let t = 1000;
    const lines = [];
    const tr = new TalkTrace({ now: () => t, sink: (l) => lines.push(l) });
    const a = tr.begin('в атаку', { end: 700, kind: 'order', who: 'knight Ян' });
    t = 1010; tr.mark(a, 'rules'); tr.mark(a, 'act');
    t = 1040; tr.mark(a, 'ack'); tr.mark(a, 'voice');
    tr.done(a);
    assert.match(lines[0], /разговор: «в атаку» → knight Ян \[приказ\].*услышал 300.*понял 310.*действие 310.*отклик 340/);
    assert.deepEqual(tr.stats('ack'), { order: { n: 1, mean: 340, p95: 340 } });
    assert.equal(quantile([1, 2, 3, 4, 100], 0.95), 100);
});

test('Speech: an answer to my words is said at once even while «I speak» holds the game\'s voices; its first sound is reported', async () => {
    const played = [];
    const ctx = {
        state: 'running', currentTime: 10, destination: {},
        createBuffer: (ch, len, sr) => { const d = new Float32Array(len); return { length: len, sampleRate: sr, getChannelData: () => d }; },
        createBufferSource: () => { const src = { playbackRate: { value: 1 }, connect() {}, start(at) { src.at = at; played.push(src); }, stop() {}, onended: null }; return src; },
        createGain: () => ({ gain: { value: 1, setTargetAtTime() {}, cancelScheduledValues() {} }, connect() {} }),
    };
    const nv = { state: 'ready', get ready() { return true; }, synth: (text, o) => Promise.resolve().then(() => { o.onChunk?.(new Float32Array(4410), 44100, true); return { pcm: new Float32Array(4410), sampleRate: 44100 }; }) };
    const s = new Speech({ neural: nv, audioContext: () => ctx });
    s.duck(true);
    s.say('Ага.', { voiceKey: 'a' });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(played.length, 0, 'a line of the village waits while I speak');
    let heard = null;
    s.say('Слушаюсь!', { voiceKey: 'k', reply: true, onStart: (at) => { heard = at; } });
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(played.length >= 1, 'the answer is said now');
    assert.ok(Number.isFinite(heard), 'its first sound is reported');
});
