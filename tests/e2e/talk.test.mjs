/**
 * Villagers really talk and carry out orders — in a real browser.
 * The neural net is replaced by a fake one that answers with tool calls.
 * Run: node --test tests/e2e/talk.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8163;
let srv, browser;

test.before(async () => {
    srv = await startServer(PORT);
    browser = await launch({});
});
test.after(async () => {
    await browser?.close();
    srv?.stop();
});

async function toCastle(page) {
    await page.evaluate(() => {
        const g = window.__zns.game;
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        g.character.group.position.set(c.gate.x, c.gate.y + 2.2, c.gate.z);
        g.world.terrain.flushAround(c.gate.x, c.gate.z);
        g.castleLife.talk._llmTried = true; // (no real download in the tests)
        // (the hero can't die in this test)
        g.combat.damage = () => {}; g.damageLocalPlayer = () => {};
        // helpers in the page
        window.__frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 30)); };
        window.__standBy = (v) => {
            const me = g.character.group.position;
            me.set(v.x + 1.6, v.y + 1.95, v.z);
            g.character.group.rotation.y = Math.atan2(1.6, 0); // (facing the villager: -x)
            for (const o of g.castleLife.byId.values()) { o.talking = 0; o.bowT = 999; } // (no bowing to the new king in the middle)
        };
        window.__knights = () => [...(g.castleLife.castles.get(window.__castle.id)?.active.values() || [])].filter((v) => v.role === 'knight' && !v.dead);
    });
    for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (await page.evaluate(() => (window.__knights?.() || []).length >= 4)) break;
    }
}

test('talk: the king\'s advisor by the throne; a stranger\'s army orders are refused; the king gathers the army, sends it at the zombies, «отбой»', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await toCastle(page);
    const advisor = await page.evaluate(() => {
        const a = [...window.__zns.game.castleLife.byId.values()].find((v) => v.role === 'advisor');
        const c = window.__castle;
        return a ? { title: a.title, job: a.job, nearThrone: Math.hypot(a.x - c.throneFront.x, a.z - c.throneFront.z) < 8 } : null;
    });
    assert.ok(advisor && advisor.nearThrone && advisor.job === 'guard', `advisor: ${JSON.stringify(advisor)}`);
    assert.match(advisor.title, /Советни/);

    // a stranger orders a knight: refused, nobody moves
    const stranger = await page.evaluate(async () => {
        const g = window.__zns.game;
        const k = window.__knights().find((v) => v.job === 'guard');
        window.__standBy(k);
        const heard = g.castleLife.talk.hear('собери войско');
        await window.__frames(10);
        return { heard, text: g.castleLife.talk.brain(k).memory.lastReply || '', following: window.__knights().filter((v) => v.follow === g.localId).length };
    });
    assert.ok(stranger.heard);
    assert.equal(stranger.following, 0, 'a stranger has no army');
    assert.match(stranger.text, /корол|командир|не /i, stranger.text);

    // now I am the king: «собери войско» — every knight comes and follows me
    const gather = await page.evaluate(async () => {
        const g = window.__zns.game, L = g.castleLife;
        L.state(window.__castle.id).owner = g.localId;
        const k = window.__knights().find((v) => v.job === 'guard');
        window.__standBy(k);
        L.talk.hear('собери войско');
        await window.__frames(10);
        const army = window.__knights();
        return { n: army.length, following: army.filter((v) => v.follow === g.localId).length, text: L.talk.brain(k).memory.lastReply || '' };
    });
    assert.ok(gather.following >= 4 && gather.following === gather.n, JSON.stringify(gather));
    assert.match(gather.text, /Величеств|Есть|исполнено/);

    // a zombie near: «в атаку на зомби» — the knights go and cut it down with their swords
    const attack = await page.evaluate(async () => {
        const g = window.__zns.game, L = g.castleLife, T = window.__zns.THREE;
        const me = g.character.group.position;
        const k = window.__knights()[0];
        window.__standBy(k);
        const z = g._createZombie(new T.Vector3(me.x + 6, me.y - 1.5, me.z + 2));
        z.update = () => {}; // (it stands still: we watch the knights)
        const hp0 = z.health;
        L.talk.hear('в атаку на зомби');
        await window.__frames(5);
        const hunting = window.__knights().filter((v) => v.order?.kind === 'hunt').length;
        let hit = false;
        for (let i = 0; i < 80 && !hit; i++) { await window.__frames(5); hit = z.health < hp0 || z.isDead || z.isDying; }
        return { hunting, hit, attacking: window.__knights().some((v) => v.mode === 'attack') || hit };
    });
    assert.ok(attack.hunting >= 3, `hunting: ${attack.hunting}`);
    assert.ok(attack.hit, 'a knight\'s sword reached the zombie');

    // «отбой»: back to their places
    const stop = await page.evaluate(async () => {
        const g = window.__zns.game;
        window.__standBy(window.__knights()[0]);
        g.castleLife.talk.hear('отбой');
        await window.__frames(5);
        return window.__knights().filter((v) => v.order || v.follow).length;
    });
    assert.equal(stop, 0);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('talk: the neural net (a fake one) understands free words — «Хм…» first, then its tool call is carried out; the game still checks it', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await toCastle(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, L = g.castleLife, T = L.talk;
        const asked = [];
        let answer = 'Будет исполнено, Ваше Величество! <tool_call>{"name": "defend_castle", "arguments": {}}</tool_call>';
        T.llm = { ready: true, chat: (req) => { asked.push(req); return new Promise((res) => setTimeout(() => res(answer), 400)); }, dispose() {} };
        // a stranger first: the net "agrees", the game refuses
        const k = window.__knights().find((v) => v.job === 'guard');
        window.__standBy(k);
        T.hear('ребята не пускайте никого за стены');
        await new Promise((res) => setTimeout(res, 60));
        const thinking = k.bubble?.text || '';
        await new Promise((res) => setTimeout(res, 700));
        const strangerDefends = window.__knights().filter((v) => v.order?.kind === 'defend').length;
        // the king
        L.state(window.__castle.id).owner = g.localId;
        window.__standBy(k);
        T.hear('ребята не пускайте никого за стены');
        await new Promise((res) => setTimeout(res, 800));
        await window.__frames(3);
        const defenders = window.__knights().filter((v) => v.order?.kind === 'defend').length;
        const said = T.brain(k).memory.lastReply || '';
        // a plain talk with no call: the net's words
        answer = 'Стены крепкие, Ваше Величество, не извольте беспокоиться.';
        window.__standBy(k);
        T.hear('как там наши стены');
        await new Promise((res) => setTimeout(res, 800));
        return { thinking, strangerDefends, defenders, said, plain: T.brain(k).memory.lastReply || '', tools: asked[0]?.tools?.map((t) => t.function.name) || [], system: asked[1]?.system || '' };
    });
    assert.match(r.thinking, /^(Так|Хм)/, `thinking: ${r.thinking}`);
    assert.equal(r.strangerDefends, 0, 'the game refuses a stranger');
    assert.ok(r.defenders >= 4, `defenders: ${r.defenders}`);
    assert.equal(r.said, 'Будет исполнено, Ваше Величество!');
    assert.match(r.plain, /Стены крепкие/);
    assert.ok(r.tools.includes('defend_castle') && r.tools.includes('follow_me'));
    assert.match(r.system, /КОРОЛЬ этого замка/);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
