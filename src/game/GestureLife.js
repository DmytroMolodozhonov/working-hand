/**
 * GestureLife.js — what a villager feels now and what his hands do about it (src/entities/Emotions.js, Gestures.js).
 * `stateOf(life, v, now)` → { emo, gctx, talk } for VillagerModel.update (cheap: the feeling is worked out 4 times a second at most);
 * `mark(v, kind, secs)` — an event of the last seconds (a blow, an insult, a compliment…) shows on the face at once;
 * `ctxOfLine(text)` — the situation of what he is saying (a greeting, a refusal, a question…) so the hands fit the words.
 * The feeling follows the same numbers as the rest of him: his mood, the three bars to the hero, his character, fear, wounds, the night.
 */

import { emotionOf } from '../entities/Emotions.js';

/** An intent of the talk (Relations.TONE keys, TalkMind intents) → an event of the face. */
const INTENT_EVENT = { insult: 'insult', threat: 'threat', compliment: 'compliment', thanks: 'thanks', joke: 'joke', flirt: 'flirt', greet: 'greet', bow: 'nice', help: 'thanks' };

export function mark(v, kind, secs = 3) {
    if (!v || !kind) return;
    v.emoEv = kind;
    v.emoUntil = performance.now() + secs * 1000;
}

export function markIntent(v, intent) {
    const ev = INTENT_EVENT[intent];
    if (ev) mark(v, ev, ev === 'joke' ? 4 : 3);
}

const RULES = [
    [/(привет|здравств|добр(ое|ый|ого)|приветству|рад.? видеть|мир вам)/i, 'greet'],
    [/(прощай|до свидан|до встречи|удачи|счастлив(ого|ой) пути|бывай)/i, 'bye'],
    [/(спасиб|благодар|признателен)/i, 'thanks'],
    [/(прости|извин|простите|виноват|сожале)/i, 'sorry'],
    [/(не могу|не буду|нет(?![а-яё])|ни за что|не согласен|не стану|отказываюсь|не пойду|не положено)/i, 'refuse'],
    [/(конечно|хорошо|слушаюсь|есть(?![а-яё])|будет сделано|согласен|договорились|так точно|ладно|разумеется)/i, 'agree'],
    [/(ха-?ха|хе-?хе|смешно|шутк|анекдот|умора)/i, 'joke'],
    [/(не знаю|без понятия|понятия не|затрудняюсь|не слыхал|не слышал)/i, 'unknown'],
    [/(тише|шепч|тайн|секрет|никому не)/i, 'secret'],
    [/(смотри|смотрите|гляди|вот там|вон там|вон тот|взгляни)/i, 'show'],
    [/(давным|когда-то|однажды|в старые|говорят|рассказывают|помню)/i, 'story'],
    [/(красив|милый|мила|любл|дорог(ой|ая)|сердце)/i, 'flirt'],
    [/(осторожно|берегись|опасн|назад|стой)/i, 'warn'],
    [/(идея|придумал|а что если|давай(те)? так)/i, 'idea'],
    [/(цена|монет|золот|стоит|дёшево|дорого|купи|продам)/i, 'trade'],
    [/(победа|победили|ура|славно|отлично)/i, 'win'],
];
export function ctxOfLine(text) {
    const t = String(text || '');
    for (const [re, c] of RULES) if (re.test(t)) return c;
    if (/\?\s*$/.test(t)) return 'question';
    if (t.length > 80) return 'explain';
    return 'answer';
}

/** A line begins to be said: the situation of the hands for the next seconds. */
export function sayCtx(v, text, secs = 4) {
    v.gctx = ctxOfLine(text);
    v.gctxUntil = performance.now() + Math.max(2500, secs * 1000);
    v.saidAt = performance.now();
}

const MEMO = new WeakMap();

/** → { emo, gctx, talk } (the same object each call: no garbage). */
export function stateOf(life, v, now = performance.now()) {
    let m = MEMO.get(v);
    if (!m) { m = { emo: 'neutral', gctx: 'listen', talk: false, at: -1e9 }; MEMO.set(v, m); }
    m.talk = (v.sayT > 0 || (v.saidAt && now - v.saidAt < 3500));
    m.gctx = v.gctxUntil > now ? v.gctx : (v.talking > 0 ? 'listen' : 'answer');
    if (now - m.at < 250) return m;
    m.at = now;
    const ev = v.emoUntil > now ? v.emoEv : null;
    // (the net and the bars are asked only about those the hero is dealing with: the others feel by their fear, wounds and the night)
    const dealt = v.talking > 0 || ev || (v.saidAt && now - v.saidAt < 20000);
    let eff, c, mood = 0;
    if (dealt) {
        try {
            eff = life.rel?.eff?.(v);
            const b = life.talk?.brain?.(v);
            c = b?.character; mood = b?.mood || 0;
        } catch (_) { /* (no brain yet: neutral) */ }
    }
    const fear = v.fleeT > 0 || v.fleeing ? 2 : v.fear ? Math.min(2, (v.fear.level ?? 1)) : 0;
    const hp = v.maxHp ? v.hp / v.maxHp : 1;
    m.emo = emotionOf({ mood, eff: eff || { sub: 0, fr: 0, lv: 0 }, ev, c: c || {}, fear, hp, night: !!life.game?.isNight });
    return m;
}
