// THE SUPER-TEST (the author 19.11: «500 взаимодействий с жителем… он должен любое взаимодействие реагировать так же, как человек»): 600+ interactions of every kind
// with people of every trade, character, state and past — through Reaction.js — and what a believable person must and must not do (the criteria of the bot Turing tests:
// not repetitive, not predictable, bound to the context; the appraisal theory of emotion: what it is worth to him, who did it, why, what he remembers).
import test from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, KIND_IDS, has } from '../../src/game/Interactions.js';
import { react, HARASS } from '../../src/game/Reaction.js';
import { newMind, rand01, bondOf } from '../../src/game/NpcMind.js';
import { LINES } from '../../src/game/ReactionLines.js';

const ROLES = ['farmer', 'knight', 'wizard', 'merchant', 'student', 'teacher', 'child', 'builder', 'guard', 'sailor', 'king', 'seller'];
const ITEMS = [{ kind: 'apple', value: 5 }, { kind: 'bread', value: 6 }, { kind: 'coins', value: 50, count: 50 }, { kind: 'sword', value: 120 }, { kind: 'wand', value: 200 }, { kind: 'bones', value: 1 }, { kind: 'stick', value: 1 }, { kind: 'potion', value: 60 }, { kind: 'pickaxe', value: 30 }, { kind: 'robe', value: 150 }];
const ok = (x) => Number.isFinite(x);
const POSITIVE = new Set(['gratitude', 'joy', 'pleased', 'wonder', 'amusement', 'embarrassment', 'curiosity', 'neutral', 'relief']);
const NEGATIVE = new Set(['anger', 'fear', 'disgust', 'grief', 'annoyance']);
const INTENTS = new Set([...Object.keys(LINES), 'none', 'ignore', 'pain']);

function scenario(i) {
    const r = (k) => rand01(i * 131 + k * 17);
    const role = ROLES[Math.floor(r(1) * ROLES.length)];
    const mind = newMind('npc' + (i % 97) + role, role);
    const kind = KIND_IDS[Math.floor(r(2) * KIND_IDS.length)];
    const ev = { kind, by: r(3) < 0.2 ? 'friend' : 'p1', power: 0.5 + r(4) * 0.8, accident: r(5) < 0.12 };
    if (has(kind, 'i')) ev.item = ITEMS[Math.floor(r(6) * ITEMS.length)];
    const rel = r(7) < 0.5 ? { sub: 0, fr: 0, lv: 0 } : { sub: Math.round((r(8) - 0.3) * 80), fr: Math.round((r(9) - 0.5) * 140), lv: Math.round(r(10) * 40) };
    const state = { busy: ['idle', 'work', 'trade', 'talk', 'fight', 'flee'][Math.floor(r(11) * 6)], asleep: r(12) < 0.08, stuck: r(13) < 0.08, hpK: r(14) < 0.25 ? 0.3 : 1, afraid: r(15) < 0.15, night: r(16) < 0.35, hungry: r(17) < 0.3, crowd: r(18) < 0.2 };
    return { mind, ev, ctx: { now: 100 + i * 7, role, rel, state }, role };
}

test('600 interactions: every one gets a believable, consistent answer (no crash, no nonsense, no contradiction)', () => {
    const N = 640, said = new Set(), delays = [], arous = [];
    let ignored = 0, spoke = 0, answered = 0;
    for (let i = 0; i < N; i++) {
        const { mind, ev, ctx, role } = scenario(i), K = KINDS[ev.kind];
        const o = react(mind, ev, ctx);
        const label = `#${i} ${role} ${ev.kind} ${JSON.stringify(ctx.state)}`;
        if (o.ignored) { ignored++; assert.ok(o.ignored.length > 3, label); continue; } // (busy fighting / fleeing: he does not stop for a trifle)
        answered++;
        for (const f of ['valence', 'arousal', 'delay', 'mood']) assert.ok(ok(o[f]), `${label}: ${f}`);
        assert.ok(o.valence >= -1.4 && o.valence <= 1.4 && o.arousal >= 0 && o.arousal <= 1 && o.delay >= 0.12 && o.delay <= 3, label);
        assert.ok(INTENTS.has(o.intent), `${label}: intent ${o.intent}`);
        assert.ok(o.body && typeof o.body.act === 'string', label);
        assert.ok([o.rel.s, o.rel.f, o.rel.l].every(ok), label);
        // the sign of the feeling follows the sign of the deed (a rescue never angers, a blow never pleases) — whatever his character, the state, the past
        const strong = Math.abs(K.valence) >= 0.5 && !ev.accident;
        if (strong && K.valence > 0 && !has(ev.kind, 'i') && !ctx.state.asleep) assert.ok(o.valence > -0.2, `${label}: a good deed took as an insult (${o.valence})`);
        if (strong && K.valence < 0 && !has(ev.kind, 'i') && !ctx.state.asleep) assert.ok(o.valence < 0.2, `${label}: a harm took as a favour (${o.valence})`);
        // no contradiction between the intent and the feeling
        if (o.intent === 'retaliate') assert.ok(o.valence <= -0.55, `${label}: retaliates over a trifle (${o.valence})`);
        if (o.intent === 'thank' || o.intent === 'thank_big') assert.ok(o.valence > 0.1 && POSITIVE.has(o.emotion), `${label}: thanks for nothing`);
        if (o.intent === 'flee' || o.intent === 'plead') assert.equal(o.emotion, 'fear', label);
        if (o.intent === 'warn' || o.intent === 'enough' || o.intent === 'angry_protest') assert.equal(o.emotion, 'anger', label);
        if (NEGATIVE.has(o.emotion) && o.emotion !== 'annoyance' && o.emotion !== 'grief') assert.ok(o.valence < 0.05 || ctx.state.asleep, `${label}: angry/afraid at something good (${o.valence}, ${o.emotion})`);
        if (o.say) { spoke++; said.add(o.say); assert.ok(o.say.length > 3 && !/undefined|NaN|\[object/.test(o.say), label); }
        // a favour must be answered in words (people thank); a crime seen is told
        if (has(ev.kind, 'p') && o.valence > 0.5 && !ctx.state.asleep) assert.ok(o.say, `${label}: no word of thanks`);
        if (has(ev.kind, 'c') && !has(ev.kind, 'w')) assert.ok(o.crime, `${label}: a crime not marked`);
        delays.push(o.delay); arous.push(o.arousal);
    }
    assert.ok(answered >= 500, `answered ${answered} of ${N} (ignored ${ignored})`);
    assert.ok(spoke / answered > 0.8, `most answers have words: ${spoke}/${answered}`);
    assert.ok(said.size >= 120, `variety of his words: ${said.size} different lines`);
    // not a metronome: the reaction time varies, and a shock is answered faster than a trifle
    const mean = delays.reduce((a, b) => a + b, 0) / delays.length, sd = Math.sqrt(delays.reduce((a, b) => a + (b - mean) ** 2, 0) / delays.length);
    assert.ok(sd > 0.1 && Math.max(...delays) - Math.min(...delays) > 0.6, `reaction times vary: sd ${sd.toFixed(2)}`);
    const ma = arous.reduce((a, b) => a + b, 0) / arous.length;
    const cov = delays.reduce((s, d, i) => s + (d - mean) * (arous[i] - ma), 0);
    assert.ok(cov < 0, 'the higher the shock, the quicker the answer');
});

test('every kind in the catalogue is answered by every trade (129 kinds × 12 trades), in calm and in a bad moment', () => {
    for (const role of ROLES) for (const kind of KIND_IDS) for (const bad of [false, true]) {
        const mind = newMind('x-' + role + kind, role), ev = { kind, by: 'p', item: has(kind, 'i') ? ITEMS[0] : undefined };
        const o = react(mind, ev, { now: 50, role, rel: { sub: 0, fr: 0, lv: 0 }, state: bad ? { hpK: 0.3, afraid: true, night: true, crowd: true } : {} });
        assert.ok(o && (o.ignored || (INTENTS.has(o.intent) && o.body)), `${role} ${kind}`);
    }
});

test('the author\'s own case: a man stuck, I help with a spell — «ого, я благодарен»; he remembers, offers to repay, and is friendlier after', () => {
    const m = newMind('stuck-1', 'farmer');
    const before = react(newMind('stuck-1', 'farmer'), { kind: 'greet_word', by: 'p' }, { now: 5, state: {} });
    const o = react(m, { kind: 'help_levitate_free', by: 'p' }, { now: 10, state: { stuck: true } });
    assert.equal(o.intent, 'thank_big'); assert.equal(o.emotion, 'gratitude'); assert.ok(o.freed && o.say && o.valence >= 0.9);
    assert.ok(o.rel.f > 2, 'friendship grows: ' + o.rel.f);
    assert.ok(o.gossip, 'he tells people');
    assert.ok(bondOf(m, 'p').gr > 0.4 && bondOf(m, 'p').favours === 1);
    const later = react(m, { kind: 'greet_word', by: 'p' }, { now: 400, state: {} });
    assert.ok(later.valence >= before.valence, 'friendlier than before (gratitude lasts)');
    // (and a stranger who only stood and watched is not thanked)
    const w = react(newMind('stuck-1', 'farmer'), { kind: 'show_point', by: 'q' }, { now: 10, state: { stuck: true } });
    assert.ok(!['thank', 'thank_big'].includes(w.intent));
});

test('memory: gratitude eases a later blow; a grudge sours a later gift; both fade with time; nobody forgets in a minute', () => {
    const base = (by) => ({ kind: 'push_hard', by });
    const a = newMind('mem-a', 'farmer'), b = newMind('mem-a', 'farmer'); // (the same person)
    react(a, { kind: 'save_drowning', by: 'hero' }, { now: 0, state: {} });
    const excused = react(a, base('hero'), { now: 60, state: {} }), stranger = react(b, base('other'), { now: 60, state: {} });
    assert.ok(excused.valence > stranger.valence, `a friend who saved me: ${excused.valence} vs a stranger ${stranger.valence}`);
    const c = newMind('mem-c', 'farmer'), d = newMind('mem-c', 'farmer');
    react(c, { kind: 'punch', by: 'bully' }, { now: 0, state: {} });
    const sour = react(c, { kind: 'give_food', by: 'bully', item: { kind: 'apple', value: 5 } }, { now: 30, state: {} }), plain = react(d, { kind: 'give_food', by: 'bully', item: { kind: 'apple', value: 5 } }, { now: 30, state: {} });
    assert.ok(sour.valence < plain.valence, 'a gift from the one who beat me is taken coldly');
    assert.ok(['suspicious_accept', 'accept', 'confused'].includes(sour.intent) || sour.valence < 0.5);
    // time heals: after a long while the grudge is lighter
    const e = newMind('mem-e', 'farmer'); react(e, { kind: 'punch', by: 'bully' }, { now: 0, state: {} });
    const soon = bondOf(e, 'bully').gu; react(e, { kind: 'greet_word', by: 'other' }, { now: 5000, state: {} });
    assert.ok(bondOf(e, 'bully').gu < soon * 0.5, 'the grudge fades, slowly');
    assert.ok(soon > 0.3, 'but is not gone at once');
});

test('getting used to it: the hundredth gift is not the first; the third poke is «enough»; friends forgive more than strangers', () => {
    const m = newMind('hab-1', 'farmer'), vals = [];
    for (let i = 0; i < 6; i++) vals.push(react(m, { kind: 'give_food', by: 'p', item: { kind: 'apple', value: 5 } }, { now: 10 + i * 20, state: {} }).valence);
    for (let i = 1; i < vals.length; i++) assert.ok(vals[i] <= vals[i - 1] + 1e-9, 'the pleasure only fades: ' + vals.join(', '));
    assert.ok(vals[5] < vals[0] * 0.7, 'the sixth is far less than the first');
    const h = newMind('hab-2', 'knight'), seq = [];
    for (let i = 0; i < 4; i++) seq.push(react(h, { kind: 'tap_shoulder', by: 'p' }, { now: 10 + i * 5, state: {} }));
    assert.ok(seq.slice(2).some((o) => o.intent === 'enough' || o.intent === 'retaliate'), 'patience runs out: ' + seq.map((o) => o.intent).join(' → '));
    assert.ok(seq[3].valence < seq[0].valence, 'the same poke annoys more each time');
    const fr = react(newMind('hab-3', 'farmer'), { kind: 'insult', by: 'p' }, { now: 5, rel: { sub: 0, fr: 60, lv: 30 }, state: {} });
    const st = react(newMind('hab-3', 'farmer'), { kind: 'insult', by: 'p' }, { now: 5, rel: { sub: 0, fr: -40, lv: 0 }, state: {} });
    assert.ok(fr.valence > st.valence, 'a friend\'s insult is taken lighter than an enemy\'s');
    const gift1 = react(newMind('hab-4', 'farmer'), { kind: 'give_hand', by: 'p', item: { kind: 'apple', value: 5 } }, { now: 5, rel: { sub: 0, fr: 60, lv: 0 }, state: {} });
    const gift2 = react(newMind('hab-4', 'farmer'), { kind: 'give_hand', by: 'p', item: { kind: 'apple', value: 5 } }, { now: 5, rel: { sub: 0, fr: -60, lv: 0 }, state: {} });
    assert.ok(gift1.valence > gift2.valence, 'a gift from a friend warms more than one from an enemy');
});

test('the moment weighs: asleep, in a fight, busy trading, at night, hurt, hungry, stuck', () => {
    const calm = (kind, st, extra = {}, role = 'farmer') => react(newMind('st-' + kind, role), { kind, by: 'p', ...extra }, { now: 5, role, rel: { sub: 0, fr: 0, lv: 0 }, state: st });
    assert.equal(calm('greet_word', { asleep: true }).intent, 'wake_grumpy', 'woken by a greeting: grumpy');
    assert.ok(calm('greet_word', { busy: 'fight' }).ignored, 'in a fight a greeting is not heard');
    assert.ok(!calm('sword_hit', { busy: 'fight' }).ignored, 'a blow in a fight is felt');
    assert.ok(calm('greet_word', { busy: 'trade' }).valence <= calm('greet_word', {}).valence, 'small talk over a deal is a little tiresome');
    assert.ok(calm('approach_close', { night: true }).valence < calm('approach_close', {}).valence, 'a stranger at night is more alarming');
    assert.ok(calm('give_food', { hungry: true }, { item: { kind: 'bread', value: 6 } }).valence > calm('give_food', {}, { item: { kind: 'bread', value: 6 } }).valence, 'food to the hungry');
    assert.ok(calm('heal_him', { hpK: 0.3 }).valence > calm('heal_him', { hpK: 1 }).valence, 'healing the hurt');
    assert.ok(calm('help_unstick', { stuck: true }).valence > calm('help_unstick', {}).valence, 'freeing one who is stuck');
    assert.ok(calm('give_hand', {}, { item: { kind: 'sword', value: 120 } }, 'knight').valence > calm('give_hand', {}, { item: { kind: 'sword', value: 120 } }, 'child').valence, 'a sword to a knight, not a child');
    assert.ok(calm('give_hand', {}, { item: { kind: 'wand', value: 200 } }, 'wizard').valence > calm('give_hand', {}, { item: { kind: 'wand', value: 200 } }, 'farmer').valence, 'a wand to a wizard');
    assert.equal(calm('give_gross', {}, { item: { kind: 'bones', value: 1 } }).intent, 'disgust', 'a bone in the hand: disgust');
});

test('character: the proud take an insult harder, the bold a threat lighter, the shy blush at a flirt, a joker laughs, the greedy like coins, the wary doubt a gift', () => {
    const pick = (cond, role = 'farmer') => { for (let i = 0; i < 4000; i++) { const m = newMind('c' + i, role); if (cond(m.traits)) return m; } throw new Error('no such person'); };
    const same = (m) => newMind(m.id, m.role);
    const proud = pick((t) => t.proud > 0.85), humble = pick((t) => t.proud < 0.2);
    const ins = (m) => react(m, { kind: 'insult', by: 'p' }, { now: 5, state: {} }).valence;
    assert.ok(ins(same(proud)) < ins(same(humble)), 'pride hurts');
    const bold = pick((t) => t.bold > 0.8), meek = pick((t) => t.bold < 0.25);
    const thr = (m) => react(m, { kind: 'threat_say', by: 'p' }, { now: 5, state: {} });
    assert.ok(thr(same(bold)).valence > thr(same(meek)).valence, 'the bold shrug a threat off');
    const shy = pick((t) => t.shy > 0.7 && t.proud < 0.8);
    assert.equal(react(same(shy), { kind: 'flirt', by: 'p' }, { now: 5, rel: { sub: 0, fr: 30, lv: 10 }, state: {} }).intent, 'embarrassed');
    const humor = pick((t) => t.humor > 0.8), grave = pick((t) => t.humor < 0.2);
    const jk = (m) => react(m, { kind: 'joke', by: 'p' }, { now: 5, state: {} }).valence;
    assert.ok(jk(same(humor)) > jk(same(grave)), 'a joker enjoys a joke more');
    const greedy = pick((t) => t.greedy > 0.8), lean = pick((t) => t.greedy < 0.2);
    const gc = (m) => react(m, { kind: 'give_coins', by: 'p', item: { kind: 'coins', value: 100 } }, { now: 5, state: {} }).valence;
    assert.ok(gc(same(greedy)) > gc(same(lean)), 'the greedy like money more');
    const wary = pick((t) => t.wary > 0.8), open = pick((t) => t.wary < 0.3);
    const gw = (m) => react(m, { kind: 'give_hand', by: 'stranger', item: { kind: 'apple', value: 20 } }, { now: 5, rel: { sub: 0, fr: 0, lv: 0 }, state: {} }).valence;
    assert.ok(gw(same(wary)) < gw(same(open)), 'the wary doubt a gift from a stranger');
});

test('not a mirror and not a record: two people answer the same thing differently; one person does not say the same line three times running', () => {
    const lines = new Set();
    for (let i = 0; i < 30; i++) lines.add(react(newMind('p' + i, 'farmer'), { kind: 'greet_word', by: 'p' }, { now: 5, state: {} }).say);
    assert.ok(lines.size >= 6, 'thirty people, ' + lines.size + ' different greetings');
    const m = newMind('rep-1', 'farmer'), seq = [];
    for (let i = 0; i < 40; i++) seq.push(react(m, { kind: i % 2 ? 'greet_word' : 'thanks_say', by: 'p' + (i % 7) }, { now: 10 + i * 30, state: {} }).say);
    for (let i = 2; i < seq.length; i++) assert.ok(!(seq[i] && seq[i] === seq[i - 1] && seq[i] === seq[i - 2]), 'three times the same: ' + seq[i]);
    for (let i = 1; i < seq.length; i++) assert.ok(!(seq[i] && seq[i] === seq[i - 1]), 'twice running: ' + seq[i]);
});

test('witnessing: a killing in front of him, a thief, a rescue — he is moved; the guard reports a crime, the gentle grieve, the bold are angry', () => {
    const g = react(newMind('w-g', 'guard'), { kind: 'kill_neighbour_seen', by: 'p' }, { now: 5, role: 'guard', state: {} });
    assert.equal(g.intent, 'alarm_report'); assert.ok(g.report && g.gossip);
    const kind = (() => { for (let i = 0; i < 400; i++) { const m = newMind('w' + i, 'farmer'); if (m.traits.kind > 0.7 && m.traits.bold < 0.5) return m; } })();
    const k = react(kind, { kind: 'kill_neighbour_seen', by: 'p' }, { now: 5, state: {} });
    assert.ok(['grief', 'alarm_report', 'angry_protest'].includes(k.intent) && k.valence < -0.5, k.intent);
    assert.ok(react(newMind('w-h', 'farmer'), { kind: 'kill_monster_seen', by: 'p' }, { now: 5, state: {} }).valence > 0.3, 'a monster killed in front of him: relief and thanks');
    assert.ok(react(newMind('w-s', 'farmer'), { kind: 'steal_seen', by: 'p' }, { now: 5, state: {} }).crime === false, '(a witness is not the victim: no crime record of his own)');
});

test('rank and request: the one he obeys is obeyed, a stranger\'s order is questioned; an accident is forgiven faster than a deed', () => {
    const order = (rel, role = 'farmer') => react(newMind('o-' + JSON.stringify(rel), role), { kind: 'order_say', by: 'p' }, { now: 5, role, rel, state: {} });
    assert.equal(order({ sub: 70, fr: 0, lv: 0 }).intent, 'comply', 'the king is obeyed');
    assert.ok(['decline', 'ask_why'].includes(order({ sub: 0, fr: -20, lv: 0 }).intent), 'a stranger who orders about: no');
    const acc = react(newMind('ac', 'farmer'), { kind: 'push_hard', by: 'p', accident: true }, { now: 5, state: {} }), dl = react(newMind('ac', 'farmer'), { kind: 'push_hard', by: 'p' }, { now: 5, state: {} });
    assert.ok(acc.valence > dl.valence, 'an accident is excused');
    assert.ok(react(newMind('sorry', 'farmer'), { kind: 'apology_after_harm', by: 'p' }, { now: 5, state: {} }).valence > 0.1, 'an apology is heard');
});

test('harassment is a pattern: the HARASS kinds are all negative and every one runs out his patience', () => {
    for (const k of HARASS) assert.ok(KINDS[k] && KINDS[k].valence < 0.01, k);
});
