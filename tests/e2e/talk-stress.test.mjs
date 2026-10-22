/**
 * A talk never crashes the game: many questions in a row to every villager of a castle, the (fake) net
 * answering with every game action, streamed sentence by sentence, broken answers, errors and silence.
 * The game's frames must never fail, and every question gets an answer.
 * Run: node --test tests/e2e/talk-stress.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8167;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

test('talk: a series of questions to everybody — the game never fails, every question is answered quickly', async () => {
    const { page, errors, logs } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        g.character.group.position.set(c.gate.x, c.gate.y + 2.2, c.gate.z);
        g.world.terrain.flushAround(c.gate.x, c.gate.z);
        g.castleLife.talk._llmTried = true;
        g.combat.damage = () => {}; g.damageLocalPlayer = () => {};
    });
    for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (await page.evaluate(() => (g => [...(g.castleLife.castles.get(window.__castle.id)?.active.values() || [])].length >= 6)(window.__zns.game))) break;
    }
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, L = g.castleLife, T = L.talk;
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const calls = [
            '', '<tool_call>{"name": "follow_me", "arguments": {}}</tool_call>', '<tool_call>{"name": "stay", "arguments": {"all": true}}</tool_call>',
            ...['market', 'throne', 'gate', 'walls', 'barracks', 'home', 'moon'].map((p) => `<tool_call>{"name": "go_to", "arguments": {"place": "${p}"}}</tool_call>`),
            ...['zombies', 'spider', 'animals', 'enemies', 'Олег', ''].map((t) => `<tool_call>{"name": "attack", "arguments": {"target": "${t}"}}</tool_call>`),
            '<tool_call>{"name": "gather_army", "arguments": {}}</tool_call>', '<tool_call>{"name": "defend_castle", "arguments": {}}</tool_call>',
            '<tool_call>{"name": "bow", "arguments": {}}</tool_call>', '<tool_call>{"name": "trade_yes", "arguments": {}}</tool_call>', '<tool_call>{"name": "trade_no", "arguments": {}}</tool_call>',
            '<tool_call>{"name": "flee", "arguments": {}}</tool_call>', '<tool_call>{"name": "call_guards", "arguments": {}}</tool_call>',
            '<tool_call>{"name": "go_to", "arguments": "сломано"}</tool_call>', '<|tool_call>call:go_to{place:<|"|>market<|"|>}<tool_call|>', '<tool_call>{"name": 5}', '{{{{',
        ];
        let k = 0;
        // the fake net: streams its words piece by piece, then the whole; sometimes fails, sometimes says nothing
        T.llm = {
            ready: true, device: 'native',
            chat: ({ onPartial }) => {
                const n = k++;
                if (n % 11 === 5) return Promise.reject(new Error('the program stopped'));
                if (n % 13 === 7) return new Promise(() => {}); // (never answers: the timeout)
                const words = (n % 2 ? 'Ну что ж, путник, расскажу тебе, как есть. Замок у нас крепкий, король строгий!' : 'Хорошо, сделаю.') + ' ' + calls[n % calls.length];
                return new Promise((res) => {
                    let i = 0;
                    const step = () => {
                        if (i >= words.length) { res(words); return; }
                        const piece = words.slice(i, i + 5); i += 5;
                        try { onPartial?.(piece); } catch (e) { /* (the game's own business) */ }
                        setTimeout(step, 15);
                    };
                    setTimeout(step, slowFirst || 80);
                });
            },
            dispose() {},
        };
        T.mind.timeoutMs = 2500;
        // what each villager says, and when (the thinking words apart)
        const said = [];
        const say = L._say.bind(L);
        L._say = (v, text, ...rest) => { said.push({ v, text, at: performance.now(), filler: !!T._fillerNow }); return say(v, text, ...rest); };
        const think = T._sayThinking.bind(T);
        T._sayThinking = (...a) => { T._fillerNow = true; try { return think(...a); } finally { T._fillerNow = false; } };
        let slowFirst = 0; // (ms before the fake net's first word)
        const questions = ['привет', 'как тебя зовут', 'где рынок', 'пойдём со мной', 'стой', 'собери войско', 'в атаку на зомби',
            'защищайте замок', 'отбой', 'а почему маги не любят рыцарей короля скажи честно', 'что у вас нового', 'продай хлеб',
            'отведи меня к трону', 'беги отсюда', 'стража сюда', 'how are you', 'ты кто такой вообще', 'какая сегодня погода', '???', 'а'];
        const people = [...(L.castles.get(window.__castle.id)?.active.values() || [])].filter((v) => !v.dead);
        const out = { asked: 0, answered: 0, slow: [], roles: new Set(), errors0: g._errors || 0, times: [], thinkTimes: [] };
        for (let round = 0; round < 3; round++) {
            if (round === 1) L.state(window.__castle.id).owner = g.localId; // (now the king)
            if (round === 2) slowFirst = 2000; // (a slow computer: the net's first word after 2 s)
            for (let q = 0; q < questions.length; q++) {
                const p = people[(q + round * 7) % people.length];
                if (!p || p.dead) continue;
                const me = g.character.group.position;
                me.set(p.x + 1.6, p.y + 1.95, p.z);
                g.character.group.rotation.y = Math.atan2(1.6, 0);
                p.talking = 0; p.bowT = 999;
                const v = T._listener(); // (who hears me: the one I face — another may stand nearer)
                if (!v) continue;
                const b = T.brain(v);
                const before = (b.memory.log || []).length;
                const t0 = performance.now();
                let heard = false;
                try { heard = T.hear(questions[q]); } catch (e) { out.thrown = String(e?.stack || e); break; }
                if (!heard) continue;
                out.asked++;
                out.roles.add(v.role);
                // the answer: the first line he says that is not a thinking word
                let ms = null, think = null;
                for (let w = 0; w < 80; w++) {
                    await sleep(50);
                    const f = said.find((l) => l.v === v && l.at >= t0 && l.filler);
                    if (f && think == null) think = f.at - t0;
                    const a = said.find((l) => l.v === v && l.at >= t0 && !l.filler);
                    if (a) { ms = a.at - t0; break; }
                }
                void before;
                if (ms != null) { out.answered++; out.times.push(Math.round(ms)); }
                out.thinkTimes.push(think == null ? Math.round(ms ?? 9999) : Math.round(think));
                if (ms == null || ms > 3200) out.slow.push(`${questions[q]} (${v.role}, round ${round}): ${ms == null ? 'no answer' : Math.round(ms) + ' ms'}`);
                await sleep(300);
            }
        }
        // the actions given run for a while: no frame may fail
        await sleep(3000);
        out.frameErrors = (g._errors || 0) - out.errors0;
        out.active = g.active;
        out.roles = [...out.roles];
        return out;
    });
    console.log(JSON.stringify({ slow: r.slow, times: r.times, think: r.thinkTimes }));
    const frameLogs = logs.filter((l) => /frame error/.test(l)).slice(0, 3);
    assert.equal(r.thrown, undefined, r.thrown);
    assert.equal(r.frameErrors, 0, `frame errors: ${frameLogs.join('\n')}`);
    assert.ok(r.active, 'the game runs');
    assert.ok(r.asked >= 25, `asked ${r.asked}`);
    assert.equal(r.answered, r.asked, `unanswered/slow: ${r.slow.join('; ')}`);
    // something is heard at once after every question (the answer, or his thinking words before it)
    assert.ok(Math.max(...r.thinkTimes) <= 1500, `first words after ${Math.max(...r.thinkTimes)} ms`);
    assert.deepEqual(realErrors(errors), []);
    const sorted = [...r.times].sort((a, b) => a - b);
    console.log(`asked ${r.asked}, answered ${r.answered}, roles ${r.roles.join(', ')}; answer ms: median ${sorted[sorted.length >> 1]}, max ${sorted[sorted.length - 1]}; first words max ${Math.max(...r.thinkTimes)} ms; slow: ${r.slow.join('; ') || 'none'}`);
    await page.close();
});
