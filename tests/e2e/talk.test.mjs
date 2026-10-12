/**
 * Villagers really talk and carry out orders — in a real browser.
 * The neural net is replaced by a fake one that answers with tool calls.
 * Run: node --test tests/e2e/talk.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openPage, startFromMenu, waitHudVisible, realErrors } from './harness.mjs';
import { feed } from './poses.mjs';

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
    assert.match(r.thinking, /…$/, `his own thinking words first: ${r.thinking}`);
    assert.equal(r.strangerDefends, 0, 'the game refuses a stranger');
    assert.ok(r.defenders >= 4, `defenders: ${r.defenders}`);
    assert.equal(r.said, 'Будет исполнено, Ваше Величество!');
    assert.match(r.plain, /Стены крепкие/);
    assert.ok(r.tools.includes('defend_castle') && r.tools.includes('follow_me'));
    assert.match(r.system, /КОРОЛЬ этого замка/);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('talk: the villager answers as soon as my words stop changing (not after the browser\'s late «final»), and the final of the same words is no second question', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await toCastle(page);
    const r = await page.evaluate(async () => {
        const g = window.__zns.game, T = g.castleLife.talk, V = window.__zns.voice;
        const k = window.__knights().find((v) => v.job === 'guard');
        window.__standBy(k);
        g.lastMagicTime = 0;
        const asked = [];
        const hear = T.hear.bind(T);
        T.hear = (text) => { asked.push([Math.round(performance.now()), text]); return hear(text); };
        const t0 = performance.now();
        V.onResult('как тебя', false);
        await new Promise((res) => setTimeout(res, 300));
        V.onResult('как тебя зовут', false);
        await new Promise((res) => setTimeout(res, 500));
        const early = asked.length; // (0.5 s after the last change: not yet)
        await new Promise((res) => setTimeout(res, 500));
        const after = asked.map((a) => a[1]);
        const ms = asked.length ? asked[0][0] - t0 - 300 : null;
        V.onResult('как тебя зовут', true); // (the browser's final, late)
        await new Promise((res) => setTimeout(res, 900));
        const finalAgain = asked.length;
        V.onResult('а что у вас нового', true); // (a new question)
        await new Promise((res) => setTimeout(res, 300));
        return { early, after, ms, finalAgain, total: asked.length };
    });
    assert.equal(r.early, 0, 'not while I may still be saying it');
    assert.deepEqual(r.after, ['как тебя зовут'], 'answered after the words stopped changing');
    assert.ok(r.ms < 1000, `${r.ms} ms after my last word`);
    assert.equal(r.finalAgain, 1, 'the late final of the same words is not asked again');
    assert.equal(r.total, 2, 'a new question is heard');
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});

test('market: a brush of the open hand takes nothing from the counter — only closed fingers do; the villager\'s own voice in the microphone is not an answer', async () => {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true });
    await startFromMenu(page, 'freeworld');
    await waitHudVisible(page);
    await page.evaluate(() => {
        const g = window.__zns.game;
        const c = g.world.terrain.data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__castle = c;
        const s = c.stalls[0];
        g.character.group.position.set(s.front.x, s.front.y + 2.2, s.front.z);
        g.world.terrain.flushAround(s.front.x, s.front.z);
        g.castleLife.talk._llmTried = true;
    });
    let uid = null;
    for (let i = 0; i < 60 && !uid; i++) {
        await new Promise((r) => setTimeout(r, 250));
        uid = await page.evaluate(() => { const g = window.__zns.game; for (const [, s] of g.castleLife.talk.stalls) for (const u of s.goods) if (g.items.loose.get(u)?.item.shop) return u; return null; });
    }
    assert.ok(uid, 'a good on the counter');
    // the hand lies on the good with the fingers open: nothing is taken
    await feed(page, { arms: 'forward', rightCurl: 0, leftCurl: 0 }, 5, 40);
    const r = await page.evaluate(async (uid) => {
        const g = window.__zns.game, ch = g.character, T = window.__zns.THREE;
        const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 30)); };
        const L = g.items.loose.get(uid);
        const origPos = ch.getHandWorldPosition.bind(ch), origCurl = ch.getGripCurl.bind(ch), origTr = ch.isHandTracked?.bind(ch);
        let curl = 0;
        ch.getHandWorldPosition = (side, out = new T.Vector3()) => (side === 'right' ? out.copy(L.model.position) : origPos(side, out));
        ch.getGripCurl = (side) => (side === 'right' ? curl : 0);
        // (the hand is AT the good: the fingers close where it lies — the grip point in the palm on it)
        const origPF = g.weapons.palmFrame.bind(g.weapons);
        g.weapons.palmFrame = (side, out) => {
            const f = origPF(side, out);
            if (side === 'right' && g.items.loose.has(uid)) f.G.copy(L.model.localToWorld(L.shape.c.clone()));
            return f;
        };
        ch.isHandTracked = () => true;
        g.currentPose = g.currentPose || {};
        await frames(15);
        const brushed = g.items.loose.has(uid);
        curl = 1;
        await frames(15);
        const took = !g.items.loose.has(uid) && (g.items.held.right?.item.uid === uid || g.items.held.left?.item.uid === uid);
        ch.getHandWorldPosition = origPos; ch.getGripCurl = origCurl; if (origTr) ch.isHandTracked = origTr; g.weapons.palmFrame = origPF;
        const unpaid = !!(g.items.held.right?.item.shop || g.items.held.left?.item.shop);
        // the merchant's line comes back through the microphone: nobody answers it
        const T2 = g.castleLife.talk;
        const m = T2.offer?.v;
        const said = (T2._spoken || []).slice(-1)[0]?.text || m?.bubble?.text || '';
        const echo = said ? T2.hear(said) : null;
        // my own answer that repeats some of his words is not an echo; words a villager understands are talk, not a spell
        T2._spoken = [{ text: 'Меня зовут Мария. А тебя?', at: performance.now() }];
        const notEcho = !T2._echo('меня зовут дима') && T2._echo('меня зовут мария');
        const claims = { order: T2.claims('собери войско'), thanks: T2.claims('спасибо'), spell: T2.claims('бомбардо') };
        // a villager who gives me a hand turns his face to me — not his back (the face of the model is at −z)
        const me = ch.group.position;
        let face = null;
        if (m) {
            g.handHold._faceVillager(m, me, 1);
            g.handHold._faceVillager(m, me, 1);
            const fx = -Math.sin(m.yaw), fz = -Math.cos(m.yaw);
            const d = Math.hypot(me.x - m.x, me.z - m.z) || 1;
            face = (fx * (me.x - m.x) + fz * (me.z - m.z)) / d;
        }
        // knocks of the hand are between the two of us (the author: no guards for that): the first — told off,
        // the second — offended, the third — this merchant fights me; the castle never turns on me for it
        let bump = null;
        if (m) {
            const st = () => (m.foe === g.localId ? 'fights' : 'calm') + (m.cs.hostile.has(g.localId) ? '+castle' : '');
            m.damageCooldown = 0; g.onLocalHit(m, 1, null, false);
            const first = st();
            m.damageCooldown = 0; g.onLocalHit(m, 1, null, false);
            const second = st();
            m.damageCooldown = 0; g.onLocalHit(m, 1, null, false);
            bump = { first, second, third: st() };
        }
        return { brushed, took, unpaid, offered: T2.offer?.kind === 'buy', said, echo, face, bump, notEcho, claims };
    }, uid);
    assert.ok(r.brushed, 'an open hand on the good takes nothing');
    assert.ok(r.took && r.unpaid && r.offered, `closed fingers take it, the merchant names the price: ${JSON.stringify(r)}`);
    assert.equal(r.echo, false, 'the merchant\'s own words from the speakers are not an answer');
    assert.ok(r.notEcho, 'my answer repeating his words is heard; his own line is not');
    assert.deepEqual(r.claims, { order: true, thanks: true, spell: false }, '«собери войско» / «спасибо» go to the villager, «бомбардо» stays a spell');
    assert.deepEqual(r.bump, { first: 'calm', second: 'calm', third: 'fights' }, 'a knock is forgiven, the second offends, the third — he fights me himself; no guards');
    assert.ok(r.face > 0.9, `the merchant faces me when giving a hand (${r.face})`);
    assert.deepEqual(realErrors(errors), []);
    await page.close();
});
