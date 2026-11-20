// Reaction.js — how a person answers ANYTHING done to or near him (pure; src/game/Interactions.js is the catalogue, NpcMind.js his inner life, ReactionLines.js his words).
// The author 19.11: «чтобы реально казалось, что ты с человеком разговариваешь… он должен любое взаимодействие реагировать так же, как человек: ситуация, характер,
// память, и как он сам движется и чего хочет». Built on an appraisal theory of emotion (OCC: an event is weighed against the person's goals, who did it and why) with
// memory (gratitude / grudge per person, getting used to a thing), and on the believability criteria of the bot Turing tests (not repetitive, not predictable, context-bound).
//
//   react(mind, ev, ctx) → { ignored? | { emotion, intensity, valence, arousal, intent, say, delay, body, rel: {s,f,l}, mood, memory, flags… } }
//   ev   { kind, by, power 0…1.5, item: {kind, value, count}, accident, witness (done to someone else), thrown, fromDist }
//   ctx  { now (s), role, rel: {sub, fr, lv} (what he feels for the doer: the bars), state: { busy, asleep, stuck, hpK, afraid, night, hungry, atPost, crowd } }
//
// What a person does NOT do: answer the same way twice in a row, answer a friend like a stranger, answer a gift from an enemy like one from a friend, be pleased with the
// hundredth gift as with the first, forget a rescue in a minute, forget a blow in a minute, stand and talk in the middle of a fight, take a prank at midnight like one at noon.
import { KINDS, has, itemClass } from './Interactions.js';
import { bondOf, countRecent, remember, rnd, tick } from './NpcMind.js';
import { LINES, flavour } from './ReactionLines.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** Kinds that are small harassments: repeated, they run out of patience. */
export const HARASS = new Set(['insult', 'shout_loud', 'laugh_at', 'stare_long', 'approach_close', 'tap_shoulder', 'push_hard', 'follow_him_long', 'block_path', 'point_at_him', 'wave_away', 'ignore_him', 'stand_behind_him', 'draw_weapon_near', 'aim_wand_at', 'slap']);
const LOVE_KINDS = new Set(['flirt', 'hug', 'compliment', 'give_hand', 'return_lost_item']);
const HELP_BIG = new Set(['help_unstick', 'help_levitate_free', 'save_drowning', 'save_from_monster', 'put_out_fire_on_him', 'free_from_ice_or_web', 'find_his_lost_child_or_pet', 'heal_him', 'heal_potion']);
const PHYSICAL_HARM = new Set(['slap', 'punch', 'kick', 'sword_hit', 'push_hard', 'knock_down', 'spell_hit_harmful', 'burn_him', 'freeze_him', 'cut_limb', 'spell_hits_him_accident', 'throw_at_hit', 'explosion_near']);

/** What a handed thing is worth to THIS person (−0.8…+0.8): the thing against his needs, his trade and his greed. */
export function itemValence(ev, mind, st = {}, role = '') {
    const it = ev.item; if (!it) return 0;
    const cls = itemClass(it.kind), T = mind.traits;
    const worth = clamp((it.value ?? 20) / 200, 0, 1);
    let v = 0.1 + worth * 0.4 * (0.6 + T.greedy * 0.8);
    if (cls === 'gross') return -0.8;
    if (cls === 'junk') v -= 0.15;
    if (cls === 'food') v += st.hungry ? 0.4 : 0.1;
    if (cls === 'drink') v += st.hurt || st.hungry ? 0.3 : 0.05;
    if (cls === 'coin') v += 0.15 * (0.5 + T.greedy);
    if (cls === 'weapon') v += /knight|guard|king|sailor/.test(role) ? 0.3 : (/farmer|child|student/.test(role) ? -0.1 : 0);
    if (cls === 'magic') v += /wizard|teacher|student/.test(role) ? 0.35 : -0.05;
    if (cls === 'armor') v += /knight|guard|king/.test(role) ? 0.3 : 0;
    if (cls === 'tool') v += /farmer|builder|sailor/.test(role) ? 0.25 : 0.05;
    return clamp(v, -0.8, 0.8);
}

/** The state of the moment weighs on every answer. */
function stateMods(K, ev, st, mind) {
    let dv = 0, da = 0, ignore = null, gain = 1;
    if (st.asleep) { da += 0.3; if (!has(ev.kind, 'p')) dv -= 0.2; }
    if (st.busy === 'fight' && K.arousal < 0.45 && K.valence > -0.3 && !has(ev.kind, 'p')) ignore = 'в бою — не до мелочей';
    if (st.busy === 'flee' && K.arousal < 0.35) ignore = 'бежит — не слышит';
    if (st.busy === 'trade' && K.group === 'social' && has(ev.kind, 's') && K.valence < 0.35) dv -= 0.08; // (small talk over a deal is a little tiresome)
    if (st.stuck && has(ev.kind, 'p')) gain *= 1.5;
    if (st.hpK != null && st.hpK < 0.4) { if (has(ev.kind, 'p')) gain *= 1.25; else if (K.valence < 0) { dv -= 0.1; da += 0.15; } }
    if (st.afraid) da += 0.15;
    if (st.night && K.group === 'presence') { dv -= 0.12; da += 0.12; }
    if (st.night && ev.kind === 'enter_house_uninvited') dv -= 0.2;
    if (st.crowd && K.valence < 0 && K.group === 'social') dv -= 0.1; // (insulted before people)
    return { dv, da, ignore, gain };
}

/** Pick a line for an intent, not one of his last few. */
function sayFor(mind, intent, ctx) {
    const bank = LINES[intent];
    if (!bank || !bank.length) return null;
    const recent = new Set(mind.said.slice(-4));
    let c = bank.filter((l) => !recent.has(l));
    if (!c.length) c = bank;
    const text = c[Math.floor(rnd(mind) * c.length) % c.length];
    const out = flavour(intent, text, mind.traits, rnd(mind));
    mind.said.push(text); if (mind.said.length > 12) mind.said.shift();
    return out;
}

export function react(mind, ev, ctx = {}) {
    const now = ctx.now ?? 0, st = ctx.state || {}, rel = ctx.rel || { sub: 0, fr: 0, lv: 0 }, role = ctx.role || mind.role;
    tick(mind, now);
    const K = KINDS[ev.kind];
    if (!K) return { ignored: 'неизвестное взаимодействие', kind: ev.kind };
    const T = mind.traits, b = bondOf(mind, ev.by);
    const power = clamp(ev.power ?? 1, 0.2, 1.5);
    const witness = has(ev.kind, 'w') && !has(ev.kind, 'd');
    const mods = stateMods(K, ev, st, mind);
    if (mods.ignore) return { ignored: mods.ignore, kind: ev.kind, intent: 'ignore', say: null, delay: 0, body: { act: 'none' }, rel: { s: 0, f: 0, l: 0 }, mood: mind.mood };

    // ---- 1. what it is worth to him
    let v = K.valence * power;
    if (has(ev.kind, 'i') && ev.item) v = has(ev.kind, 'p') || K.valence > 0 ? Math.max(v * 0.5, 0) + itemValence(ev, mind, st, role) * 0.8 : v + itemValence(ev, mind, st, role) * 0.5;
    if (ev.kind === 'give_junk' && ev.item) v = Math.min(v + itemValence(ev, mind, st, role), 0.15);
    if (ev.kind === 'give_gross') v = -0.7;
    const accident = !!ev.accident && has(ev.kind, 'a');
    if (accident && v < 0) v *= 0.35;
    v += mods.dv;
    // ---- 2. who did it (the bars)
    const fr = rel.fr + rel.lv * 0.5, sub = rel.sub || 0;
    if (v < 0) v *= clamp(1 - fr / 250, 0.55, 1.4);
    else v *= rel.fr < -30 ? 0.55 : 1 + clamp(fr / 300, 0, 0.3);
    // ---- 3. what he remembers of him
    if (v < 0) v *= clamp(1 - b.gr * 0.4 + b.gu * 0.3, 0.5, 1.5); else v *= clamp(1 - b.gu * 0.5 + b.gr * 0.1, 0.4, 1.3);
    // ---- 4. his character
    if (has(ev.kind, 's') || K.group === 'social') {
        if (T.proud > 0.6 && v < 0) v *= 1 + (T.proud - 0.6);
        if (T.proud > 0.6 && ev.kind === 'compliment') v *= 1.25;
        if (T.humor > 0.55 && (ev.kind === 'joke' || ev.kind === 'sing_dance')) v *= 1 + T.humor * 0.6;
        if (T.shy > 0.6 && (ev.kind === 'flirt' || ev.kind === 'hug' || ev.kind === 'compliment')) v *= 0.6;
    }
    if (T.wary > 0.6 && v > 0 && (K.group === 'gift' || K.group === 'trade') && rel.fr < 20) v *= 0.75;
    if (T.kind > 0.6 && (witness && v < 0)) v *= 1.2;
    if (T.greedy > 0.65 && (ev.kind === 'steal_from_pocket' || ev.kind === 'take_his_goods' || ev.kind === 'pay_short')) v *= 1.2;
    if (T.bold > 0.65 && ev.kind === 'threat_say') v *= 0.7;
    // ---- 5. habit: the nth time
    const n = countRecent(mind, ev.by, ev.kind, now);
    let enough = false;
    if (v > 0) v *= Math.max(0.35, Math.pow(0.8, n));
    else if (v < 0) { v *= Math.min(2, Math.pow(1.2, n)); if (HARASS.has(ev.kind) && n >= 2) enough = true; }
    if (HARASS.has(ev.kind) && n >= 1 && v > -0.2) v = n >= 2 ? -0.3 : -0.17; // (the same poke again: now it annoys; a third time — enough)
    v *= v > 0 ? mods.gain : 1;
    v = clamp(v, -1.4, 1.4);
    let a = clamp(K.arousal * power + mods.da + (T.shy > 0.6 && has(ev.kind, 'h') ? 0.15 : 0), 0, 1);

    // ---- 6. the feeling
    const fearScore = (1 - T.bold) * 0.6 + T.shy * 0.3 + (st.hpK != null && st.hpK < 0.5 ? 0.2 : 0) + (sub > 50 ? 0.25 : 0) - (/knight|guard/.test(role) ? 0.25 : 0);
    const angerScore = T.bold * 0.6 + T.proud * 0.3 + (rel.fr < 0 ? 0.1 : 0) + (/knight|guard/.test(role) ? 0.2 : 0);
    let emotion, intent;
    const crimeKind = has(ev.kind, 'c');
    if (K.group === 'witness' && v < -0.4) { emotion = T.kind > 0.55 || fearScore > angerScore ? 'grief' : 'anger'; intent = emotion === 'grief' ? 'grief' : (/guard|knight|king/.test(role) || T.bold > 0.6 ? 'alarm_report' : 'angry_protest'); if (/guard|knight/.test(role) && crimeKind) intent = 'alarm_report'; }
    else if (K.group === 'witness' && v > 0.2) { emotion = 'pleased'; intent = has(ev.kind, 'p') && ev.kind === 'kill_monster_seen' ? 'thank' : 'accept'; if (ev.kind !== 'kill_monster_seen') intent = 'flattered'; }
    else if (v >= 0.55) {
        if (has(ev.kind, 'p') && K.group === 'help') { emotion = 'gratitude'; intent = HELP_BIG.has(ev.kind) || v > 0.9 ? 'thank_big' : 'thank'; if (a > 0.6 && (ev.kind === 'save_drowning' || ev.kind === 'save_from_monster' || ev.kind === 'put_out_fire_on_him')) intent = 'relief'; }
        else if (K.group === 'gift' || K.group === 'trade') { emotion = 'joy'; intent = v > 0.8 ? 'delight' : 'accept'; }
        else if (ev.kind === 'compliment') { emotion = 'pleased'; intent = 'flattered'; }
        else if (K.group === 'magic') { emotion = 'wonder'; intent = 'wonder'; }
        else { emotion = 'pleased'; intent = 'accept'; }
    } else if (v >= 0.2) {
        if (K.group === 'gift') { emotion = 'pleased'; intent = T.wary > 0.6 && rel.fr < 20 ? 'suspicious_accept' : 'accept'; }
        else if (ev.kind === 'joke' || ev.kind === 'sing_dance') { emotion = 'amusement'; intent = 'amused'; }
        else if (ev.kind === 'compliment') { emotion = 'pleased'; intent = 'flattered'; }
        else if (ev.kind === 'flirt' || ev.kind === 'hug') { emotion = T.shy > 0.55 ? 'embarrassment' : 'pleased'; intent = T.shy > 0.55 ? 'embarrassed' : 'flattered'; }
        else if (ev.kind === 'apology_after_harm' || ev.kind === 'sorry_say') { emotion = 'pleased'; intent = b.gu > 0.15 || b.wrongs ? 'forgive' : 'accept'; }
        else if (K.group === 'magic') { emotion = 'wonder'; intent = 'wonder'; }
        else if (ev.kind === 'thanks_say') { emotion = 'pleased'; intent = 'accept'; }
        else if (has(ev.kind, 'p')) { emotion = 'gratitude'; intent = 'thank'; }
        else { emotion = 'pleased'; intent = ev.kind === 'greet_word' || ev.kind === 'greet_wave' || ev.kind === 'greet_bow' || ev.kind === 'hand_shake' ? 'greet_back' : 'accept'; }
    } else if (v > -0.15) {
        emotion = 'neutral'; intent = 'greet_back';
        if (ev.kind === 'farewell') intent = 'farewell_back';
        else if (ev.kind === 'question_ask') { intent = T.wary > 0.65 && rel.fr < 10 ? 'ask_back' : 'answer'; emotion = 'curiosity'; }
        else if (has(ev.kind, 'r')) { const obeys = sub >= 30 || rel.fr >= 20 || (T.kind > 0.55 && v >= 0) || rel.lv >= 30; emotion = obeys ? 'neutral' : 'reluctance'; intent = obeys ? 'comply' : (T.wary > 0.55 ? 'ask_why' : 'decline'); }
        else if (K.group === 'show') { emotion = 'curiosity'; intent = ev.kind === 'show_danger' ? 'startle' : (ev.kind === 'show_item' ? 'curious' : 'look_report'); if (ev.kind === 'show_point') intent = 'curious'; }
        else if (K.group === 'gift') { emotion = 'curiosity'; intent = ev.kind === 'drop_item_near' ? 'pickup_remark' : 'confused'; }
        else if (ev.kind === 'whisper_secret' || ev.kind === 'gossip_share') { emotion = 'curiosity'; intent = 'curious'; }
        else if (K.group === 'magic') { emotion = 'curiosity'; intent = 'curious'; }
        else if (ev.kind === 'sleep_near' || ev.kind === 'fly_over') { emotion = 'neutral'; intent = 'look_report'; }
        else if (ev.kind === 'greet_word' || ev.kind === 'greet_wave' || ev.kind === 'greet_bow') intent = T.shy > 0.7 && rel.fr < 10 ? 'shy_greet' : 'greet_back';
        else if (mind.mood < -0.45) intent = 'curt';
        else if (ev.kind === 'approach_close' || ev.kind === 'knock_door' || ev.kind === 'appear_sudden') intent = 'answer';
    } else {
        // a hurt, a harm, a disrespect: anger or fear (or disgust)
        const gross = ev.kind === 'give_gross' || (ev.item && itemClass(ev.item.kind) === 'gross');
        if (gross) { emotion = 'disgust'; intent = 'disgust'; }
        else if (fearScore > angerScore + 0.05 || (sub > 60 && v < -0.5)) { emotion = 'fear'; intent = v < -0.7 && fearScore > 0.55 ? (T.shy > 0.55 ? 'flee' : 'plead') : 'startle'; if (ev.kind === 'show_danger') intent = 'startle'; }
        else { emotion = 'anger'; intent = v > -0.4 ? 'annoyed' : v > -0.7 ? 'warn' : 'angry_protest'; if (v <= -0.75 && (T.bold > 0.55 || /knight|guard|king/.test(role)) && !st.asleep && sub <= 50) intent = 'retaliate'; }
        if (PHYSICAL_HARM.has(ev.kind) && !gross && (emotion === 'anger' || emotion === 'fear') && v < -0.5 && a > 0.7 && rnd(mind) < 0.5) intent = emotion === 'fear' ? intent : 'angry_protest';
        if (PHYSICAL_HARM.has(ev.kind) && !accident && v < -0.55 && !gross && emotion !== 'fear' && rnd(mind) < 0.3) intent = 'angry_protest';
        if (enough) { emotion = 'anger'; intent = n >= 3 ? 'retaliate' : 'enough'; if (n >= 3 && !(T.bold > 0.5 || /knight|guard|king/.test(role))) intent = 'enough'; if (fearScore > angerScore + 0.2 && sub > 40) { emotion = 'fear'; intent = 'plead'; } }
        if (ev.kind === 'sword_hit' || ev.kind === 'cut_limb' || ev.kind === 'punch' || ev.kind === 'kick' || ev.kind === 'slap' || ev.kind === 'throw_at_hit' || ev.kind === 'knock_down') { if (intent !== 'retaliate' && intent !== 'flee' && intent !== 'plead') intent = intent === 'startle' ? 'pain' : (rnd(mind) < 0.6 ? 'pain' : intent); }
        if (ev.kind === 'burn_him' || ev.kind === 'spell_hit_harmful' || ev.kind === 'freeze_him') { if (emotion === 'fear' && v < -0.8) intent = 'flee'; }
        if (ev.kind === 'lie_caught' || ev.kind === 'pay_short') { emotion = 'anger'; intent = v > -0.55 ? 'annoyed' : 'warn'; }
    }
    // a special case: freed from a trap / stuck — a rescue is a relief first
    if (st.stuck && has(ev.kind, 'p') && HELP_BIG.has(ev.kind)) { emotion = 'gratitude'; intent = 'thank_big'; v = Math.max(v, 0.9); }
    if (ev.kind === 'sleep_near' && st.asleep) intent = 'look_report';
    if (st.asleep && v < 0.3 && intent !== 'retaliate' && intent !== 'flee' && intent !== 'plead' && intent !== 'pain') { intent = v < 0 ? 'wake_grumpy' : 'wake_grumpy'; emotion = 'annoyance'; }

    // ---- 7. what he says, how fast, what his body does
    const cutSay = ['look_report'].includes(intent) && (T.shy > 0.6 || mind.mood < -0.3) && rnd(mind) < 0.35; // (sometimes a person just nods and says nothing)
    let say = cutSay || (has(ev.kind, 's') === false && K.arousal < 0.12 && rnd(mind) < 0.45 && K.valence >= 0 && !has(ev.kind, 'p')) ? null : sayFor(mind, intent, ctx);
    if (intent === 'thank_big' || (intent === 'thank' && b.favours >= 1 && b.gr > 0.5)) {
        // (a debt of gratitude: he offers to repay — now and then)
        if (rnd(mind) < 0.45 && say) say = say + ' ' + (sayFor(mind, 'repay', ctx) || '');
    }
    const delay = clamp(0.22 + (1 - a) * 0.55 + rnd(mind) * 0.35 + (st.asleep ? 1.3 : 0) + (T.shy > 0.65 ? 0.15 : 0) - (intent === 'retaliate' || intent === 'flee' ? 0.15 : 0), 0.12, 3);
    const body = bodyOf(intent, ev, K, T, st, a);

    // ---- 8. the bars, the memory, the mood
    const side = witness ? 0.6 : 1;
    let df = v * (v > 0 ? 3 : 6) * (0.5 + a * 0.5) * side;
    df = clamp(df, -14, 10);
    const dl = v > 0.2 && LOVE_KINDS.has(ev.kind) && T.shy < 0.9 ? clamp(v * 0.8, 0, 3) : 0;
    const ds = ev.kind === 'greet_bow' || (ev.kind === 'order_say' && intent === 'comply') ? 0.8 : (v < -0.5 ? -clamp(-v * 3, 0, 4) : 0);
    const relD = { s: +ds.toFixed(2), f: +df.toFixed(2), l: +dl.toFixed(2) };
    if (has(ev.kind, 'p') && v > 0) { b.gr = clamp(b.gr + v * 0.5 * (st.stuck ? 1.3 : 1), 0, 1); b.favours++; b.tr = clamp(b.tr + 0.1 * v, -1, 1); if (HELP_BIG.has(ev.kind)) b.owed = Math.min(5, b.owed + 1); }
    else if (v < 0 && !accident && !witness) { b.gu = clamp(b.gu - v * 0.5, 0, 1); b.wrongs++; b.tr = clamp(b.tr + 0.15 * v, -1, 1); }
    else if (witness && v < -0.4) { b.gu = clamp(b.gu - v * 0.25, 0, 1); b.tr = clamp(b.tr + 0.08 * v, -1, 1); }
    if (ev.kind === 'apology_after_harm' || ev.kind === 'sorry_say') { if (v > 0.1) b.gu = Math.max(0, b.gu - 0.25); }
    b.n[ev.kind] = (b.n[ev.kind] || 0) + 1;
    mind.mood = clamp(mind.mood + v * 0.5 * (0.5 + a), -1, 1);
    const out = { kind: ev.kind, emotion, intent, valence: +v.toFixed(3), arousal: +a.toFixed(3), intensity: +clamp(Math.abs(v), 0, 1).toFixed(3), say, delay: +delay.toFixed(2), body, rel: relD, mood: +mind.mood.toFixed(3), n,
        gossip: crimeKind || (has(ev.kind, 'p') && v > 0.7) || (K.group === 'witness' && Math.abs(v) > 0.5), crime: crimeKind && !witness, report: intent === 'alarm_report', retaliate: intent === 'retaliate', flee: intent === 'flee', freed: !!(st.stuck && has(ev.kind, 'p') && HELP_BIG.has(ev.kind)), repay: b.owed > 0 && v > 0.7, accident, witness, enough };
    remember(mind, ev, now, out);
    return out;
}

/** What his body does: a small vocabulary the game maps onto its gestures and walking (InteractionLife). */
export function bodyOf(intent, ev, K, T, st, a) {
    const act = (name, extra = {}) => ({ act: name, ...extra });
    switch (intent) {
        case 'thank': case 'thank_big': return act(intent === 'thank_big' ? 'bow' : 'nod', { face: true, approach: intent === 'thank_big' ? 0.5 : 0 });
        case 'relief': return act('sag', { face: true });
        case 'delight': return act(ev.thrown || ev.item ? 'take_item' : 'clap', { face: true, eat: ev.item && itemClass(ev.item.kind) === 'food' && st.hungry });
        case 'accept': case 'suspicious_accept': return act(ev.item ? 'take_item' : 'nod', { face: true, wary: intent === 'suspicious_accept', eat: ev.item && itemClass(ev.item.kind) === 'food' && st.hungry, wield: ev.item && /weapon|sword|axe/.test(ev.item.kind) });
        case 'refuse': case 'decline': return act('shake_head', { face: true });
        case 'confused': return act('shrug', { face: true });
        case 'disgust': return act('recoil', { face: true, back: 1 });
        case 'greet_back': return act('wave', { face: true });
        case 'shy_greet': return act('look_away_nod', { face: true });
        case 'farewell_back': return act('wave', { face: false });
        case 'answer': case 'ask_back': case 'ask_why': return act('face_listen', { face: true });
        case 'comply': return act('nod', { face: true, comply: true });
        case 'annoyed': case 'curt': return act('frown', { face: true });
        case 'warn': return act('guard_stance', { face: true, back: 0 });
        case 'enough': return act('guard_stance', { face: true, approach: 0.3 });
        case 'angry_protest': return act('fist', { face: true });
        case 'retaliate': return act('attack', { face: true, approach: 1 });
        case 'startle': return act('flinch', { face: true, back: 0.6 });
        case 'pain': return act('hurt_clutch', { face: true, back: 0.3 });
        case 'flee': return act('flee', { face: false });
        case 'plead': return act('cover_head', { face: true, back: 0.5 });
        case 'grief': return act('bow_head', { face: false });
        case 'amused': return act('laugh', { face: true });
        case 'embarrassed': return act('look_away', { face: false, back: 0.2 });
        case 'flattered': return act('smile_nod', { face: true });
        case 'curious': case 'look_report': return act('look_at_point', { face: false, glance: true });
        case 'wonder': return act('gaze_up', { face: false });
        case 'alarm_report': return act('point_alarm', { face: true, call: true });
        case 'forgive': return act('nod', { face: true });
        case 'pickup_remark': return act('crouch_pickup', { approach: 1, item: true });
        case 'wake_grumpy': return act('sit_up_frown', { face: true });
        default: return act('none');
    }
}
