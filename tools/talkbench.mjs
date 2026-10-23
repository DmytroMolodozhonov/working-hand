#!/usr/bin/env node
/**
 * talkbench.mjs — how fast the villagers answer (the author: «жители МЕДЛЕННО отвечают… нужен конкретный
 * тест-бенчмарк. Скорость должна быть моментальной, как у человека»).
 *
 *   node tools/talkbench.mjs            (= --fake) the whole way of a talk turn, with model networks
 *   node tools/talkbench.mjs --real     the real speech network (GigaAM), the real villagers' voices
 *                                       (Supertonic) and — if it runs here — the real villagers' net
 *                                       (llama-server: --llm http://127.0.0.1:PORT, or ZNS_LLM_URL)
 *   options: --from f.json (the real networks' measurements made before: tools/talkbench_native.py)
 *            --json out.json   --check (exit 1 when a budget below is broken)   --pp 100 --tg 12 (the net's
 *            speed in --fake: tokens/s reading / writing)   --only id,id
 *
 * Every scenario (tests/fixtures/talk-scenarios.json: a greeting, the way, a price, orders, the crew, an
 * insult, a threat, a hard question, mumbling) goes the way a phrase goes in the game, measured from the
 * moment the player's speech ENDS (by the sound):
 *   услышал    the words reach the villagers (voice_native: VAD, the looks, the phrase's end — real looks in --real)
 *   понял      the rules / the order (the game's own code: VillagerBrain, TalkMind.first, detectOrder — timed)
 *   действие   he turns to me / the order is carried out
 *   отклик     the first sound of him (a line made in advance: at once; else its making — the voice network)
 *   ответ      the first word of his real answer (the net: read the words, write the first clause, make its voice)
 * Twice: «было» (the way before this work: the phrase's end after 0.85 s of quiet, every line made when said,
 * the game's voices held 0.9 s after the player spoke, the net reading the villager's whole description anew)
 * and «стало» (TalkFlow: words answered by the quiet; lines made in advance; the net warmed up while the
 * player comes near). The means and the 95th percentiles per kind of turn.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lookAt } from '../src/input/NativeVoice.js';
import { TalkFlow, QUIET, quickOrder, crewOrder } from '../src/ai/TalkFlow.js';
import { ackFor } from '../src/ai/TalkAcks.js';
import { TalkMind } from '../src/ai/TalkMind.js';
import { VillagerBrain } from '../src/game/VillagerBrain.js';
import { quantile } from '../src/ai/TalkTrace.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCEN = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/talk-scenarios.json'), 'utf8'));

/** Timings of the game's own way (the code's constants — the «было» column used these). */
export const LEGACY = { segEnd: 0.864, duckHold: 900, prewarm: false, acks: false, flow: false, netAll: true };
export const NOW = { segEnd: 0.864, duckHold: 0, prewarm: true, acks: true, flow: true, netAll: true };
/** The live loop: a microphone sample is read this long after it was heard (the echo canceller's lead). */
export const LAG = 90;
/** The page gets the levels every 50 ms. */
const LV_EVERY = 50;
/** The sound card's delay before a line is heard. */
const OUT = 25;
/** --check: budgets (ms after the speech's end, p95). Only ever made stricter. */
export const BUDGET = { orderAct: 600, orderAck: 650, talkAck: 900, netAck: 900, crewAck: 600 }; // (on the real networks: a little looser than the unit test's models)

/** The voice network's time to make a line (ms): measured lines → a + b × letters. */
export function ttsModel(rows) {
    if (!rows?.length) return { a: 600, b: 15 };
    const xs = rows.map((r) => r.text.length), ys = rows.map((r) => r.ms);
    const n = xs.length, mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    const b = sxx ? Math.max(0, sxy / sxx) : 0;
    return { a: Math.max(0, my - b * mx), b };
}
const ttsMs = (m, text) => m.a + m.b * String(text).length;

/** Model looks at a phrase (--fake): the speech network's timing as measured in --real on a 4-core processor. */
export function fakeLooks(sc, { cost = 150, perSec = 25 } = {}) {
    const words = sc.say.replace(/[!?.,…]/g, '').split(/\s+/);
    const dur = 300 + 330 * words.length; // ms of speech
    const t0 = 500, end = t0 + dur, vadLag = 110;
    const ev = [];
    const look = (t1, q, final) => {
        const said = Math.max(0, Math.min(words.length, Math.round(words.length * Math.min(1, (t1 - t0 - q * 1000) / dur))));
        ev.push({ fake: true, id: 1, final, t0, t1, q, cost: cost + perSec * (t1 - t0) / 1000, written: words.slice(0, said).join(' ').toLowerCase() });
    };
    for (let t = t0 + 300; t < end + vadLag; t += 140) look(t, 0, false);
    const qs = end + vadLag; // (the quiet starts — as the VAD tells it)
    look(qs + 64, 0.064, false);
    for (let q = 192; q < 864; q += 140) look(qs + q, q / 1000, false);
    look(qs + 864, 0.864, true);
    return { id: sc.id, end_ms: end, events: ev };
}

/**
 * When each look reaches the page. One worker: a look at a phrase still said is made only when the worker is
 * free (voice_native._listen: never a queue of old looks) — the one at the quiet's edge waits for it; the
 * phrase's end is always made.
 */
function arrivals(events) {
    let free = 0;
    const out = [];
    for (const e of events) {
        const ready = e.t1 + LAG;
        if (!e.final && !(e.q > 0 && e.q < 0.1) && free > ready + 20) continue; // (busy: this look is never made)
        const start = Math.max(ready, free);
        free = start + (e.cost || 0);
        out.push({ e, at: free + 3 });
    }
    return out;
}

/** What a look gives the page (the real lookAt for real looks). */
function heardText(e, seg) {
    if (e.fake) return { text: e.written || null, seg };
    const r = lookAt({ ...e, far: e.far || 0 }, seg);
    return { text: r.say && !r.say.byWords && (r.say.talkOnly || !r.heard.sure) ? r.say.text : null, seg: r.seg };
}

/** The rules' answer for the scenario (the game's own brain), timed. */
function rules(sc, mind) {
    const role = sc.to === 'sailor' ? 'builder' : sc.to;
    const brain = new VillagerBrain({ id: 7, name: 'Тихон', role, female: false, castleName: 'Каменный Утёс', kingName: 'Ульрих', seed: 7 },
        () => ({ castleName: 'Каменный Утёс', kingName: 'Ульрих', playerIsKing: !!sc.king, timeOfDay: 'day', danger: !!sc.danger }));
    const ctx = { playerIsKing: !!sc.king, players: [{ id: 'me', name: 'Дима' }], selfId: 'me', danger: !!sc.danger, coins: 20, nearbyGoods: sc.to === 'merchant' ? [{ name: 'хлеб' }] : [] };
    const t = process.hrtime.bigint();
    const first = mind.first(brain, sc.say, ctx);
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    return { first, ms, brain, ctx };
}

/** Tokens of Russian words for the net (Gemma's vocabulary: ~3.4 letters a token). */
const tokens = (s) => Math.ceil(String(s || '').length / 3.4);

/**
 * One scenario, one way of the game (LEGACY or NOW) → the moments (ms after the speech's end).
 * @param {object} sc scenario  @param {object} asr {end_ms, events}  @param {object} o {way, tts, llm, mind}
 */
export function simulate(sc, asr, { way = NOW, tts = { a: 600, b: 15 }, llm = { pp: 60, tg: 12, real: null }, mind = new TalkMind({ llm: { ready: true, strong: true } }) } = {}) {
    const end = asr.end_ms;
    const looks = arrivals(asr.events);
    // 1) when the words reach the villagers
    let handT = null, handText = null, seg = {};
    if (way.flow) {
        const flow = new TalkFlow({ now: () => clock, fire: (text) => { if (handT == null) { handT = clock; handText = text; } } });
        let clock = 0;
        // (the levels: the quiet as the program counts it, sent every 50 ms — from the looks' own quiet)
        const quietAt = (T) => {
            let e = null;
            for (const x of asr.events) if (x.t1 <= T) e = x;
            return !e || !(e.q > 0) ? 0 : e.q + (T - e.t1) / 1000;
        };
        const finalAt = looks.find((l) => l.e.final)?.at ?? Infinity;
        const times = [...looks.map((l) => ({ t: l.at, l }))];
        for (let t = 0; t < finalAt + 400; t += LV_EVERY) times.push({ t, lv: true });
        times.sort((a, b) => a.t - b.t);
        for (const x of times) {
            clock = x.t;
            if (handT != null) break;
            if (x.lv) { flow.quiet(quietAt(x.t - LAG - 20)); continue; }
            const h = heardText(x.l.e, seg);
            seg = h.seg;
            if (!h.text) continue;
            if (x.l.e.final) { handT = x.t; handText = h.text; break; }
            if (!x.l.e.cut) flow.offer(h.text, { seg: 1, q: x.l.e.q });
        }
    } else {
        const f = looks.find((l) => l.e.final);
        for (const l of looks) { const h = heardText(l.e, seg); seg = h.seg; if (l === f) { handT = l.at; handText = h.text; } }
    }
    const res = { id: sc.id, kind: sc.kind, text: handText };
    if (handT == null) return { ...res, heard: null };
    const heard = handT - end;
    // 2) the rules / the order (the game's code)
    const r = rules(sc, mind);
    const understood = heard + r.ms;
    const order = !!quickOrder(sc.say) || !!crewOrder(sc.say) || !!r.first.res.action;
    // (who answers: before — a big net answered every talk but the market's while it was quick (TalkMind before
    // this work); now — TalkMind.first: the rules answer at once what they know well, the net the rest)
    const MARKET = new Set(['yes', 'no', 'buy', 'price', 'browse', 'sell', 'haggle']);
    const legacyNet = !!r.first.res.reply && !MARKET.has(r.first.res.intent) && r.first.res.action !== 'ignore' && !r.first.res.offer && !(quickOrder(sc.say) && r.first.res.order);
    const toNet = sc.kind !== 'crew' && (way === LEGACY ? legacyNet : !r.first.done);
    // (the game's voices held while the player speaks — before: 0.9 s after his last loud sound)
    const hold = way.duckHold ? Math.max(0, 70 + way.duckHold - understood) : 0;
    // 3) the first sound and the answer
    let ack, voice, act = understood;
    const reply = r.first.res.reply || '';
    if (sc.kind === 'crew' || (order && !toNet)) {
        const line = way.acks ? ackFor({ order: quickOrder(sc.say) || r.first.res.action, role: sc.to, king: !!sc.king, danger: !!sc.danger }) : reply;
        const made = way.acks ? 0 : ttsMs(tts, line || reply);
        ack = understood + hold + made + OUT;
        voice = ack;
    } else if (!toNet) {
        // (a rules' answer: its line is made when said; now a short word of his own made in advance comes first)
        const made = ttsMs(tts, reply.split(/(?<=[.!?…])\s/)[0]);
        voice = understood + hold + made + OUT;
        ack = way.acks && made > 250 ? understood + OUT : voice;
    } else {
        // the net: a thinking word, then its first clause as soon as written, then that clause's voice
        const filler = way.acks ? 0 : ttsMs(tts, 'Хм, дай подумать…');
        ack = understood + hold + filler + OUT;
        const persona = mind.persona(r.brain, { ...r.ctx, hint: r.first.res.reply });
        const unread = (way.prewarm ? 0 : tokens(persona) + 12) + tokens(sc.say) + 8;
        const firstClause = 9; // tokens of «Король у нас строгий, но справедливый,» to its comma
        const net0 = understood;
        const tok1 = net0 + (llm.real?.ttft ?? (unread / llm.pp * 1000 + 1000 / llm.tg));
        const sent = tok1 + (llm.real?.perTok ?? 1000 / llm.tg) * firstClause;
        voice = Math.max(ack + 250, sent + ttsMs(tts, 'Король у нас строгий,') + OUT);
        res.net = { unread, tok1: Math.round(tok1), sent: Math.round(sent) };
    }
    return { ...res, heard: Math.round(heard), understood: Math.round(understood), act: Math.round(act), ack: Math.round(ack), voice: Math.round(voice), net: res.net, toNet };
}

/** Means and p95 per kind. */
export function summary(rows, key) {
    const out = {};
    for (const kind of ['order', 'crew', 'talk', 'net']) {
        const xs = rows.filter((r) => r.kind === kind && Number.isFinite(r[key])).map((r) => r[key]);
        if (xs.length) out[kind] = { mean: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), p95: quantile(xs, 0.95), n: xs.length };
    }
    return out;
}

async function realLLM(url) {
    // the time to the first word and per word of the real net, on a villager's question (no warm-up, then warm)
    const ask = async (messages) => {
        const t0 = performance.now();
        const r = await fetch(url.replace(/\/$/, '') + '/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, max_tokens: 24, stream: true, temperature: 0.4, chat_template_kwargs: { enable_thinking: false } }) });
        const rd = r.body.getReader(); const dec = new TextDecoder();
        let first = null, n = 0, buf = '';
        for (;;) {
            const { value, done } = await rd.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            for (const m of buf.matchAll(/"content":"([^"]*)"/g)) if (m[1]) { n++; if (first == null) first = performance.now() - t0; }
            buf = buf.slice(buf.lastIndexOf('\n') + 1);
        }
        return { ttft: first, perTok: n > 1 ? (performance.now() - t0 - first) / (n - 1) : 80 };
    };
    const mind = new TalkMind({ llm: { ready: true, strong: true } });
    const brain = new VillagerBrain({ id: 3, name: 'Олег', role: 'advisor', female: false, castleName: 'Каменный Утёс', kingName: 'Ульрих', seed: 3 }, () => ({}));
    const sys = { role: 'system', content: mind.basePrompt() };
    const user = (w) => ({ role: 'user', content: `[${mind.persona(brain, {})}]\n\nСобеседник говорит тебе: ${w}` });
    await ask([sys, { role: 'user', content: 'Привет' }]); // (the common words read once)
    const cold = await ask([sys, user('Почему король не любит волшебников?')]);
    const warm = await ask([sys, user('А где тронный зал?')]);
    return { cold, warm };
}

async function main() {
    const args = process.argv.slice(2);
    const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
    const real = args.includes('--real');
    const only = opt('only', null)?.split(',');
    let tts = { a: 600, b: 15 }, asr = null, ttsRows = null, src = 'модель (--fake)';
    if (real || opt('from', null)) {
        let data;
        if (opt('from', null)) data = JSON.parse(fs.readFileSync(opt('from'), 'utf8'));
        else {
            console.log('Настоящие сети: синтез фраз игрока, распознавание GigaAM, голоса жителей (≈ 2 мин)…');
            const py = process.platform === 'win32' ? 'python' : 'python3';
            const r = spawnSync(py, [path.join(ROOT, 'tools/talkbench_native.py'), path.join(ROOT, 'tests/fixtures/talk-scenarios.json')], { encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, ZNS_VOICE_MODELS: process.env.ZNS_VOICE_MODELS || '', ZNS_TTS_DIR: process.env.ZNS_TTS_DIR || '' } });
            if (r.status !== 0) { console.error(r.stderr?.slice(-2000)); process.exit(2); }
            data = JSON.parse(r.stdout);
        }
        asr = new Map(data.asr.map((a) => [a.id, a]));
        ttsRows = data.tts;
        tts = ttsModel(data.tts);
        src = `настоящие GigaAM + Supertonic (${data.cpu} ядер, голос в ${data.tts_threads} потоке)`;
    }
    let llm = { pp: Number(opt('pp', 100)), tg: Number(opt('tg', 12)), real: null };
    const url = opt('llm', process.env.ZNS_LLM_URL || null);
    let llmNote = `модель нейросети: чтение ${llm.pp} ток/с, письмо ${llm.tg} ток/с (--pp/--tg)`;
    if (url) {
        try { const m = await realLLM(url); llm = { ...llm, realCold: m.cold, real: m.warm }; llmNote = `настоящая нейросеть ${url}: первое слово без подогрева ${Math.round(m.cold.ttft)} мс, с подогревом ${Math.round(m.warm.ttft)} мс, ${Math.round(m.warm.perTok)} мс/ток`; } catch (e) { llmNote += ` (llama-server не ответил: ${e.message})`; }
    }
    const rows = { before: [], after: [] };
    for (const sc of SCEN) {
        if (only && !only.includes(sc.id)) continue;
        const a = asr?.get(sc.id) || fakeLooks(sc);
        const llmB = llm.realCold ? { ...llm, real: llm.realCold } : llm;
        rows.before.push(simulate(sc, a, { way: LEGACY, tts, llm: llmB }));
        rows.after.push(simulate(sc, a, { way: NOW, tts, llm }));
    }
    const f = (x) => (x == null ? '—' : String(x).padStart(5));
    console.log(`\ntalkbench: ${src}; ${llmNote}`);
    console.log(`голос жителя: строка делается за ${Math.round(tts.a)} + ${tts.b.toFixed(1)}×букв мс${ttsRows ? ` (измерено: ${ttsRows.map((r) => `«${r.text}» ${Math.round(r.ms)}`).slice(0, 4).join(', ')}…)` : ''}`);
    console.log('мс после конца речи игрока: было → стало');
    console.log('сценарий'.padEnd(30) + 'услышал'.padStart(14) + 'действие'.padStart(14) + 'отклик'.padStart(14) + 'ответ'.padStart(14) + '   слова');
    rows.after.forEach((n, i) => {
        const b = rows.before[i];
        const sc = SCEN.find((s) => s.id === n.id);
        console.log(`${sc.ru}`.padEnd(30) + `${f(b.heard)}→${f(n.heard)}`.padStart(14) + `${f(b.act)}→${f(n.act)}`.padStart(14) + `${f(b.ack)}→${f(n.ack)}`.padStart(14) + `${f(b.voice)}→${f(n.voice)}`.padStart(14) + `   «${n.text || ''}»${n.toNet ? ' [сеть]' : ''}`);
    });
    console.log('\nсредн / 95%:');
    for (const key of ['heard', 'act', 'ack', 'voice']) {
        const b = summary(rows.before, key), a = summary(rows.after, key);
        console.log(`  ${{ heard: 'услышал', act: 'действие', ack: 'отклик', voice: 'ответ' }[key]}: ` + Object.keys(a).map((k) => `${{ order: 'приказы', crew: 'экипаж', talk: 'разговор', net: 'нейросеть' }[k]} ${b[k]?.mean}/${b[k]?.p95} → ${a[k].mean}/${a[k].p95}`).join('; '));
    }
    if (opt('json', null)) fs.writeFileSync(opt('json'), JSON.stringify({ src, llmNote, tts, rows }, null, 1));
    if (args.includes('--check')) {
        const a = { act: summary(rows.after, 'act'), ack: summary(rows.after, 'ack') };
        const bad = [];
        if (a.act.order?.p95 > BUDGET.orderAct) bad.push(`приказ: действие ${a.act.order.p95} > ${BUDGET.orderAct}`);
        if (a.ack.order?.p95 > BUDGET.orderAck) bad.push(`приказ: отклик ${a.ack.order.p95} > ${BUDGET.orderAck}`);
        if (a.ack.crew?.p95 > BUDGET.crewAck) bad.push(`экипаж: отклик ${a.ack.crew.p95} > ${BUDGET.crewAck}`);
        if (a.ack.talk?.p95 > BUDGET.talkAck) bad.push(`разговор: отклик ${a.ack.talk.p95} > ${BUDGET.talkAck}`);
        if (a.ack.net?.p95 > BUDGET.netAck) bad.push(`нейросеть: отклик ${a.ack.net.p95} > ${BUDGET.netAck}`);
        if (bad.length) { console.log('\n❌ ' + bad.join('; ')); process.exit(1); }
        console.log('\n✅ в бюджете');
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
