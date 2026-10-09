import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../src/core/math.js';
import { VillagerBrain, detectIntent, INTENTS, ROLES, isMostlyRussian, sanitizeReply, normalize } from '../../src/game/VillagerBrain.js';
import { LocalLLM } from '../../src/ai/LocalLLM.js';
import { Speech } from '../../src/audio/Speech.js';

const WORLD = { castleName: 'Серый Утёс', kingName: 'Эдгар', playerIsKing: false, timeOfDay: 'day', danger: false };
const GOODS = [{ name: 'хлеб', price: 3 }, { name: 'сыр', price: 5 }, { name: 'яблоки', price: 2 }, { name: 'пирог с мясом', price: 7 }];
const NAMES = { builder: 'Ваня', farmer: 'Марфа', merchant: 'Фома', knight: 'Ратибор', king: 'Эдгар' };

function make(role, { mood = 0, seed = 11, female = role === 'farmer', world = WORLD } = {}) {
    return new VillagerBrain({ id: `${role}-${seed}`, name: NAMES[role], role, female, castleName: 'Серый Утёс', kingName: 'Эдгар', mood, seed }, world, { rng: createRng(seed) });
}

const CASES = [
    ['привет', 'greet'], ['приветик', 'greet'], ['здравствуйте', 'greet'], ['здрасте', 'greet'],
    ['добрый день', 'greet'], ['доброе утро', 'greet'], ['добрый вечер', 'greet'], ['эй', 'greet'],
    ['пока', 'bye'], ['до свидания', 'bye'], ['ну ладно мне пора', 'bye'], ['прощай', 'bye'],
    ['как тебя зовут', 'name_ask'], ['а как вас зовут', 'name_ask'], ['здравствуй как тебя зовут', 'name_ask'], ['твое имя', 'name_ask'],
    ['кто ты', 'who_are_you'], ['ты кто такой', 'who_are_you'],
    ['чем занимаешься', 'job'], ['а что ты тут делаешь', 'job'], ['кем работаешь', 'job'],
    ['как дела', 'how_are_you'], ['привет как дела', 'how_are_you'], ['как жизнь', 'how_are_you'], ['как поживаешь', 'how_are_you'],
    ['что нового', 'news'], ['какие новости', 'news'],
    ['меня зовут дима', 'tell_name'], ['привет меня зовут саша', 'tell_name'], ['зови меня артем', 'tell_name'],
    ['как меня зовут', 'ask_my_name'], ['ты помнишь мое имя', 'ask_my_name'],
    ['где рынок', 'where_market'], ['подскажи где тут рынок', 'where_market'], ['как пройти на базар', 'where_market'], ['где торговцы', 'where_market'],
    ['где трон', 'where_throne'], ['как попасть в тронный зал', 'where_throne'],
    ['где король', 'where_king'], ['как пройти к королю', 'where_king'],
    ['где выход', 'where_gate'], ['где ворота', 'where_gate'], ['как выйти из замка', 'where_gate'],
    ['где кухня', 'where_other'], ['где сокровищница', 'where_other'],
    ['продай хлеб', 'buy'], ['хочу купить сыр', 'buy'], ['куплю яблоко', 'buy'], ['дай мне пирог', 'buy'],
    ['сколько стоит хлеб', 'price'], ['почем сыр', 'price'], ['какая цена', 'price'],
    ['что продаешь', 'browse'], ['что у тебя есть', 'browse'], ['покажи товар', 'browse'],
    ['хочу продать меч', 'sell'], ['купишь мой меч', 'sell'], ['сколько дашь за топор', 'sell'],
    ['дорого', 'haggle'], ['давай за пять', 'haggle'], ['скинь цену', 'haggle'], ['а дешевле', 'haggle'],
    ['да', 'yes'], ['давай', 'yes'], ['ладно', 'yes'], ['согласен', 'yes'], ['по рукам', 'yes'], ['да беру', 'yes'], ['ну давай', 'yes'],
    ['нет', 'no'], ['не надо', 'no'], ['не хочу', 'no'], ['да нет', 'no'], ['нет спасибо', 'no'],
    ['ты дурак', 'insult'], ['тупой', 'insult'], ['ты идиот', 'insult'], ['пошел вон', 'insult'], ['заткнись', 'insult'], ['ты козел', 'insult'],
    ['ты молодец', 'compliment'], ['ты красивая', 'compliment'], ['какой ты умный', 'compliment'], ['отличная работа', 'compliment'],
    ['спасибо', 'thanks'], ['благодарю', 'thanks'], ['спасибо пока', 'bye'], ['до свидания', 'bye'],
    ['я тебя убью', 'threat'], ['сожгу твой дом', 'threat'], ['убью', 'threat'], ['я сожгу этот замок', 'threat'],
    ['расскажи о замке', 'about_castle'], ['что это за крепость', 'about_castle'],
    ['расскажи о короле', 'about_king'], ['какой у вас король', 'about_king'], ['как зовут короля', 'about_king'],
    ['какая погода', 'weather'], ['будет дождь', 'weather'],
    ['а зомби тут есть', 'zombies'], ['что бывает ночью', 'zombies'], ['я убью всех зомби', 'zombies'],
    ['ты знаешь магию', 'magic'], ['я есть хочу', 'food'],
    ['иди за мной', 'follow'], ['пошли со мной', 'follow'], ['стой', 'stop_follow'], ['подожди здесь', 'stop_follow'],
    ['поклонись', 'bow'], ['на колени', 'bow'], ['я твой король', 'claim_king'], ['помогите', 'help'],
    ['есть для меня задание', 'quest'], ['расскажи анекдот', 'joke'],
    ['бла бла бла', 'unknown'], ['', 'unknown'], ['я не дурак', 'unknown'],
];

test('detectIntent: realistic noisy speech-recognition phrases', () => {
    const wrong = [];
    for (const [text, want] of CASES) {
        const got = detectIntent(text).intent;
        if (got !== want) wrong.push(`«${text}» → ${got} (want ${want})`);
    }
    assert.deepEqual(wrong, []);
    for (const [, want] of CASES) assert.ok(INTENTS.includes(want), want);
});

test('detectIntent: slots (item, name, number, place) and punctuation/ё tolerance', () => {
    assert.equal(detectIntent('Продай-ка хлеба!').slots.item, 'хлеб');
    assert.equal(detectIntent('сколько стоят яблоки').slots.item, 'яблоко');
    assert.equal(detectIntent('меня зовут дима').slots.name, 'Дима');
    assert.equal(detectIntent('Меня зовут Алёна.').slots.name, 'Алена');
    assert.equal(detectIntent('давай за 4').slots.number, 4);
    assert.equal(detectIntent('отдашь за двадцать пять').slots.number, 25);
    assert.equal(detectIntent('скинь до пяти').slots.number, 5);
    assert.equal(detectIntent('где кухня').slots.place, 'kitchen');
    assert.equal(detectIntent('ПРИВЕТ!!!').intent, 'greet');
    assert.equal(normalize('  Ёлки,  палки! '), 'елки палки');
    assert.ok(detectIntent('привет ты молодец как дела').all.includes('compliment'));
});

test('replies are non-empty Russian for every role × mood', () => {
    const phrases = ['привет', 'как тебя зовут', 'кто ты', 'чем занимаешься', 'как дела', 'что нового', 'расскажи о замке', 'расскажи о короле', 'где рынок', 'где трон', 'где ворота', 'продай хлеб', 'какая погода', 'зомби', 'магия', 'спасибо', 'ты молодец', 'бла бла бла', 'семья', 'анекдот', 'задание', 'пока'];
    for (const role of ROLES) {
        for (const mood of [-0.9, -0.5, 0, 0.5, 0.9]) {
            for (const timeOfDay of ['day', 'night']) {
                const b = make(role, { mood, seed: 3, world: { ...WORLD, timeOfDay } });
                for (const p of phrases) {
                    const r = b.hear(p, { nearbyGoods: GOODS });
                    assert.ok(r.reply && r.reply.length > 1, `${role}/${mood}/${p}: empty`);
                    assert.ok(isMostlyRussian(r.reply), `${role}/${mood}/${p}: «${r.reply}»`);
                    assert.ok(!/\{|\}|undefined|NaN/.test(r.reply), `${role}/${p}: unfilled «${r.reply}»`);
                    assert.equal(typeof r.moodDelta, 'number');
                    b.mood = mood; // keep the band under test
                }
                const g = b.greet({ nearbyGoods: GOODS });
                assert.ok(g === null || isMostlyRussian(g), `greet ${role}: ${g}`);
                const a = b.ambient({ nearbyGoods: GOODS });
                assert.ok(isMostlyRussian(a) && !/\{|\}/.test(a), `ambient ${role}: ${a}`);
            }
        }
    }
});

test('every role has a big pool of small talk (≥15 distinct lines)', () => {
    for (const role of ROLES) {
        const seen = new Set();
        for (let s = 1; s <= 25; s++) {
            for (const mood of [-0.5, 0, 0.5]) {
                const b = make(role, { mood, seed: s });
                for (let i = 0; i < 12; i++) { seen.add(b.hear('ну и вот так оно', {}).reply); b.mood = mood; }
            }
        }
        assert.ok(seen.size >= 15, `${role}: only ${seen.size} small-talk lines`);
    }
});

test('a villager never says the same line twice in a row', () => {
    for (const role of ROLES) {
        const b = make(role, { seed: 5 });
        let last = null;
        for (const p of ['как дела', 'как дела', 'кто ты', 'кто ты', 'где рынок', 'где рынок', 'да', 'да', 'бла', 'бла']) {
            for (let i = 0; i < 6; i++) {
                const r = b.hear(p, {});
                assert.notEqual(r.reply, last, `${role}: repeated «${r.reply}»`);
                last = r.reply;
                b.mood = 0;
            }
        }
    }
});

test('insults lower mood, compliments raise it; low mood makes villagers rude', () => {
    for (const role of ROLES) {
        const b = make(role);
        const m0 = b.mood;
        const r = b.hear('ты дурак', {});
        assert.ok(r.moodDelta < 0 && b.mood < m0, `${role} insult`);
        const m1 = b.mood;
        const c = b.hear('ты молодец', {});
        assert.ok(c.moodDelta > 0 && b.mood > m1, `${role} compliment`);
        assert.equal(b.memory.insults, 1);
        assert.equal(b.memory.compliments, 1);
    }
    const f = make('farmer');
    for (let i = 0; i < 4; i++) f.hear('тупая', {});
    assert.equal(f.band, 'rude');
    assert.ok(f.mood < -0.6);
});

test('knight warns on the first insult, attacks after repeated ones', () => {
    const k = make('knight');
    const first = k.hear('ты дурак', {});
    assert.equal(first.action, null);
    assert.ok(/слово|пожалеешь|осторожн|язык|повторяю/i.test(first.reply), first.reply);
    let r;
    for (let i = 0; i < 4; i++) r = k.hear('тупой осел', {});
    assert.equal(r.action, 'hostile');
});

test('threats: villagers flee or call guards, the king calls guards, knights warn then fight', () => {
    for (const role of ['builder', 'farmer', 'merchant']) {
        const r = make(role).hear('я тебя убью', {});
        assert.ok(['flee', 'call_guards'].includes(r.action), role);
        assert.ok(r.moodDelta < 0);
    }
    assert.equal(make('king').hear('я тебя убью', {}).action, 'call_guards');
    const k = make('knight');
    assert.equal(k.hear('я тебя убью', {}).action, null);
    assert.equal(k.hear('сожгу тебя', {}).action, 'hostile');
});

test('trade flow: price → «да» buys, «нет» declines, haggling, no money, selling', () => {
    const m = make('merchant', { mood: 0.2 });
    // the player picks a good: the game asks for the price line
    const line = m.priceLine({ name: 'хлеб' }, 3);
    assert.match(line, /3 монет/);
    assert.equal(m.hear('да', {}).action, 'trade_yes');
    // offer passed by the game in ctx
    const offer = { item: 'сыр', price: 5, kind: 'buy' };
    const yes = m.hear('давай', { lastOffer: offer });
    assert.equal(yes.action, 'trade_yes');
    assert.deepEqual(yes.offer, offer);
    assert.equal(m.hear('нет', { lastOffer: offer }).action, 'trade_no');
    assert.equal(m.hear('да', { lastOffer: offer, coins: 2 }).action, 'trade_no');
    // asking by voice
    const ask = m.hear('сколько стоит хлеб', { nearbyGoods: GOODS });
    assert.equal(ask.action, 'offer_goods');
    assert.deepEqual(ask.offer, { item: 'хлеб', price: 3, kind: 'buy' });
    assert.match(ask.reply, /3 монет/);
    const browse = m.hear('что продаешь', { nearbyGoods: GOODS });
    assert.equal(browse.action, 'offer_goods');
    assert.match(browse.reply, /хлеб/);
    // haggle: the new price is lower and becomes the offer
    const m2 = make('merchant', { mood: 0.3, seed: 2 });
    m2.hear('продай пирог', { nearbyGoods: GOODS });
    const h = m2.hear('дорого', {});
    if (h.offer) assert.ok(h.offer.price < 7 && h.offer.price >= 5);
    assert.equal(m2.hear('да', {}).action, 'trade_yes');
    // selling a magic item to the merchant
    const s = m.hear('хочу продать', { heldItem: { name: 'волшебная палочка', magic: true } });
    assert.equal(s.action, 'offer_goods');
    assert.equal(s.offer.kind, 'sell');
    assert.ok(s.offer.price >= 100, `magic items are worth a lot: ${s.offer.price}`);
    assert.equal(m.hear('да', {}).action, 'trade_yes');
    // merchants never sell magic
    assert.match(m.hear('продай волшебную палочку', { nearbyGoods: GOODS }).reply, /маги|волшебн/i);
    // non-merchants send you to the market
    assert.equal(make('farmer').hear('продай хлеб', {}).action, 'guide:market');
    assert.equal(make('farmer').hear('да', { lastOffer: offer }).action, null);
    // phrases
    for (const f of ['soldLine', 'boughtLine', 'noMoneyLine', 'refuseLine']) assert.ok(isMostlyRussian(m[f]()), f);
});

test('directions: market, throne, gate', () => {
    for (const role of ['builder', 'farmer', 'merchant', 'knight']) {
        assert.equal(make(role).hear('где рынок', {}).action, 'guide:market', role);
        assert.equal(make(role).hear('где тронный зал', {}).action, 'guide:throne', role);
        assert.equal(make(role).hear('как пройти к королю', {}).action, 'guide:throne', role);
        assert.equal(make(role).hear('где выход', {}).action, 'guide:gate', role);
    }
    assert.equal(make('king').hear('где рынок', {}).action, null); // the king stays on the throne
    assert.match(make('king').hear('где рынок', {}).reply, /рынок|ворот/i);
});

test('the player name is remembered and used later', () => {
    const b = make('builder', { seed: 4 });
    const r = b.hear('привет меня зовут дима', {});
    assert.match(r.reply, /Дима/);
    assert.deepEqual(r.remember, { playerName: 'Дима' });
    assert.equal(b.memory.playerName, 'Дима');
    b.hear('как дела', {});
    assert.match(b.hear('как меня зовут', {}).reply, /Дима/);
    assert.match(b.hear('привет', {}).reply, /Дима/);
    assert.ok(b.memory.talks >= 4);
    assert.equal(b.memory.lastTopic, 'ask_my_name');
    // a villager that asked the name understands a one-word answer
    const f = make('farmer', { mood: 0.6, seed: 9 });
    for (let i = 0; i < 10 && f.memory.pending !== 'name'; i++) f.hear('как тебя зовут', {});
    if (f.memory.pending === 'name') {
        f.hear('коля', {});
        assert.equal(f.memory.playerName, 'Коля');
    }
    // without being told, the villager does not know
    assert.doesNotMatch(make('farmer').hear('как меня зовут', { playerName: 'Дима' }).reply, /Дима/);
    // memory survives save/load
    const saved = b.serialize();
    const b2 = new VillagerBrain({ id: 'x', name: 'Ваня', role: 'builder' }, WORLD, { memory: saved.memory });
    assert.equal(b2.memory.playerName, 'Дима');
});

test('king lines: the tone changes when the player is the new king', () => {
    const phrases = ['привет', 'как дела', 'чем занимаешься', 'бла бла', 'пока'];
    for (const role of ['builder', 'farmer', 'merchant', 'knight']) {
        const plain = make(role, { seed: 6 });
        const royal = make(role, { seed: 6 });
        for (const p of phrases) {
            const a = plain.hear(p, {}).reply;
            const k = royal.hear(p, { playerIsKing: true }).reply;
            assert.doesNotMatch(a, /Величеств/, `${role} plain: ${a}`);
            assert.match(k, /Величеств|король|королю/i, `${role} king: ${k}`);
            assert.notEqual(a, k);
        }
        assert.equal(royal.hear('иди за мной', { playerIsKing: true }).action, 'follow');
        assert.equal(royal.hear('поклонись', { playerIsKing: true }).action, 'bow');
        assert.notEqual(plain.hear('поклонись', {}).action, 'bow');
        assert.match(royal.greet({ playerIsKing: true }), /Величеств|король/i);
        assert.equal(royal.lastAction, 'bow');
        assert.match(royal.crowned(), /корол|Величеств/i);
    }
    // world flag works too (getter object)
    const w = { ...WORLD };
    const b = new VillagerBrain({ id: 1, name: 'Ваня', role: 'builder', seed: 1 }, { get playerIsKing() { return w.playerIsKing; }, castleName: 'Утёс' });
    assert.doesNotMatch(b.hear('как дела', {}).reply, /Величеств/);
    w.playerIsKing = true;
    assert.match(b.hear('как дела', {}).reply, /Величеств/);
});

test('hits and witnessed violence', () => {
    assert.equal(make('knight').reactHit(true).action, 'hostile');
    assert.equal(make('king').reactHit(true).action, 'call_guards');
    assert.ok(['flee', 'call_guards'].includes(make('farmer').reactHit(true).action));
    const f = make('farmer');
    const before = f.mood;
    f.reactHit(true);
    assert.ok(f.mood < before);
    assert.equal(make('knight').reactWitness('hit_villager').action, 'hostile');
    assert.equal(make('knight').reactWitness('hit_king').action, 'hostile');
    assert.equal(make('builder').reactWitness('hit_king').action, 'call_guards');
    assert.equal(make('builder').reactWitness('zombie').action, 'flee');
    assert.equal(make('knight').reactWitness('kill_king').action, 'bow');
    for (const role of ROLES) for (const kind of ['hit_villager', 'kill_knight', 'magic', 'zombie', 'fire']) {
        const r = make(role).reactWitness(kind);
        assert.ok(isMostlyRussian(r.reply), `${role}/${kind}: ${r.reply}`);
    }
    // as the king, knights do not attack the player
    assert.equal(make('knight').reactHit(true, { playerIsKing: true }).action, null);
    // a hostile player gets no chat
    assert.equal(make('knight').hear('привет', { hostile: true }).action, 'hostile');
    assert.ok(['flee', 'call_guards'].includes(make('farmer').hear('привет', { hostile: true }).action));
});

test('greet may stay silent, ambient always talks, merchants hawk goods', () => {
    let silent = 0, spoke = 0;
    for (let s = 1; s <= 60; s++) {
        const g = make('farmer', { seed: s, mood: -0.5 }).greet({});
        if (g === null) silent++; else spoke++;
    }
    assert.ok(silent > 0 && spoke > 0, `silent ${silent}, spoke ${spoke}`);
    const m = make('merchant', { seed: 1, mood: 0.5 });
    const lines = Array.from({ length: 30 }, () => m.ambient({ nearbyGoods: GOODS }));
    assert.ok(lines.some((l) => /монет|хлеб|сыр|пирог|яблок/i.test(l)));
    assert.ok(make('king').greet({}));
    const night = make('knight', { world: { ...WORLD, timeOfDay: 'night' }, seed: 2 });
    const nl = Array.from({ length: 10 }, () => night.ambient({}));
    assert.ok(nl.some((l) => /зомби|строй|факел|пост|ночь/i.test(l)));
});

test('deterministic with a seeded RNG', () => {
    const run = () => {
        const b = make('merchant', { seed: 42 });
        return ['привет', 'как дела', 'что продаешь', 'дорого', 'ты дурак', 'бла'].map((p) => b.hear(p, { nearbyGoods: GOODS }).reply);
    };
    assert.deepEqual(run(), run());
});

test('sanitizeReply / isMostlyRussian', () => {
    assert.equal(sanitizeReply('<think>хм, подумаю</think>Привет, путник! Хлеб свежий. И ещё. И ещё.'), 'Привет, путник! Хлеб свежий.');
    assert.equal(sanitizeReply('<think>бесконечные мысли'), '');
    assert.equal(sanitizeReply('Ваня: «Здравствуй!»', 'Ваня'), 'Здравствуй!');
    assert.ok(isMostlyRussian('Да, Ваше Величество.'));
    assert.ok(!isMostlyRussian('Hello there, traveller'));
});

test('hearSmart: LLM phrases the reply, game effects stay rule-based, falls back safely', async () => {
    const fake = (out) => ({ ready: true, generate: async (p) => { fake.last = p; return typeof out === 'function' ? out(p) : out; } });
    const m = make('merchant', { seed: 3 });
    const r = await m.hearSmart('сколько стоит хлеб', { nearbyGoods: GOODS }, fake('Хлебушек свежий, за 3 монеты отдам!'));
    assert.equal(r.reply, 'Хлебушек свежий, за 3 монеты отдам!');
    assert.equal(r.smart, true);
    assert.equal(r.action, 'offer_goods');
    assert.match(fake.last.system, /торгов/);
    assert.match(fake.last.system, /3 монет/);
    // wrong price → rule reply
    const r2 = await m.hearSmart('сколько стоит сыр', { nearbyGoods: GOODS }, fake('Сыр — 9 монет.'));
    assert.match(r2.reply, /5 монет/);
    assert.ok(!r2.smart);
    // English / empty / think-only / throwing / hanging → rule reply
    const b = make('builder', { seed: 3 });
    for (const llm of [fake('Sure! I am a builder.'), fake(''), fake('<think>...'), fake('мечхлебхлебхлебмонетыхлебхлеб'), fake('хлеб хлеб хлеб хлеб хлеб хлеб'), { ready: true, generate: async () => { throw new Error('boom'); } }]) {
        const x = await b.hearSmart('как дела', {}, llm);
        assert.ok(x.reply && isMostlyRussian(x.reply) && !x.smart, x.reply);
    }
    const hang = { ready: true, generate: () => new Promise(() => {}) };
    const t0 = Date.now();
    const h = await b.hearSmart('кто ты', {}, hang, { timeoutMs: 30 });
    assert.ok(Date.now() - t0 < 1000 && h.reply && !h.smart);
    // not ready / missing → plain hear
    assert.ok((await b.hearSmart('привет', {}, { ready: false })).reply);
    assert.ok((await b.hearSmart('привет', {}, null)).reply);
    // think tags are stripped
    const k = await make('knight').hearSmart('кто ты', {}, fake('<think>я рыцарь</think>Я Ратибор, страж этих стен.'));
    assert.equal(k.reply, 'Я Ратибор, страж этих стен.');
});

test('LocalLLM imports in node without loading anything', async () => {
    assert.ok(LocalLLM.MODELS.light.id.startsWith('onnx-community/'));
    assert.ok(LocalLLM.MODELS.smart.id.startsWith('onnx-community/'));
    const llm = new LocalLLM({ model: 'smart' });
    assert.equal(llm.ready, false);
    assert.equal(llm.modelKey, 'smart');
    assert.equal(LocalLLM.supported, typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined');
    await assert.rejects(llm.generate({ user: 'привет' }));
    if (!LocalLLM.supported) await assert.rejects(llm.load());
    llm.dispose();
    assert.equal(new LocalLLM({ model: 'nope' }).modelKey, 'light');
});

test('Speech is a no-op in node', () => {
    const s = new Speech();
    assert.equal(s.supported, false);
    assert.equal(s.say('Привет', { voiceKey: 'v1', role: 'king' }), false);
    assert.doesNotThrow(() => s.cancel());
    assert.equal(s.speaking, false);
    assert.equal(s.pickVoice('v1', true), null);
    const k = s.voiceParams({ voiceKey: 'a', role: 'king' });
    const f = s.voiceParams({ voiceKey: 'a', role: 'farmer', female: true });
    assert.ok(k.pitch < f.pitch && k.rate < f.rate);
});
