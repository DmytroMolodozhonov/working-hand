/**
 * Trades.js — who works in the settlement buildings (Buildings.js; generation 11): the priest in the church, the smith at the forge, the
 * innkeeper in the tavern, the baker, the herbalist, the miller, the stableman, the granary's keeper.
 *
 * A tradesman is an ordinary person of the settlement (a farmer, a builder, a merchant — so every command, fear, night and fight rule
 * that exists for them works as it did) with a `trade` on his roster entry: only the look (clothes, hat, tool) and the title ("Кузнец",
 * "Пекарша") say what he does. Where he stands is decided by the building:
 *  - a building with a counter has a STALL record (`shop`): the merchant of that stall is its tradesman, he lives in that building (`houseOf`);
 *  - the other buildings (church, mill, stable, granary) have a HOUSE record with `trade`: the first of the people living there is the
 *    tradesman (the rest of the family are ordinary people).
 * Pure data and one cache; no THREE.
 */

/** trade → { m, f: the title for a man / a woman }. */
export const TRADE_TITLES = {
    smith: { m: 'Кузнец', f: 'Кузнец' },
    baker: { m: 'Пекарь', f: 'Пекарша' },
    innkeeper: { m: 'Трактирщик', f: 'Трактирщица' },
    herbalist: { m: 'Травник', f: 'Травница' },
    priest: { m: 'Священник', f: 'Священница' },
    miller: { m: 'Мельник', f: 'Мельничиха' },
    stableman: { m: 'Конюх', f: 'Конюх' },
    keeper: { m: 'Амбарщик', f: 'Амбарщица' },
};

/** The stall's `shop` → the trade of its seller. */
export const TRADE_OF_SHOP = { smith: 'smith', baker: 'baker', herbs: 'herbalist', tavern: 'innkeeper' };

export const tradeTitle = (trade, female) => (TRADE_TITLES[trade] ? (female ? TRADE_TITLES[trade].f : TRADE_TITLES[trade].m) : null);

/**
 * The roster entry with its trade (a copy; the same copy every time — def._trade caches by idx): a stall's merchant takes the trade
 * of his stall and lives in its building; the first person of a trade building's house takes the house's trade.
 * `homes(def)` → Map(house index → [idx…]) (CastleLife._homesOf).
 */
export function withTrade(def, e, homes) {
    if (!e || e.own) return e;
    const cache = def._trade || (def._trade = new Map());
    if (cache.has(e.idx)) return cache.get(e.idx);
    let r = e;
    const st = e.stall >= 0 ? def.stalls?.[e.stall] : null;
    if (st?.shop && TRADE_OF_SHOP[st.shop]) r = { ...e, trade: TRADE_OF_SHOP[st.shop], home: st.houseOf != null ? st.houseOf : e.home };
    else if (e.home >= 0 && def.houses?.[e.home]?.trade && e.role !== 'knight' && e.role !== 'king' && e.role !== 'advisor') {
        const list = homes(def).get(e.home);
        if (list && list[0] === e.idx) r = { ...e, trade: def.houses[e.home].trade };
    }
    cache.set(e.idx, r);
    return r;
}

/**
 * The tradesman's clothes on a villager look (VillagerModel.villagerLook): a changes of colours, a hat, a tool, an apron — the same
 * person always the same (the seed). `L.apron` and `L.cross` and the hat `chef` are drawn by VillagerModel.
 */
export function applyTradeLook(L, trade) {
    const s = (L.seed >>> 0) % 7;
    switch (trade) {
        case 'smith': // soot-dark clothes, a thick leather apron, a hammer, a beard
            L.shirt = 0x5a4a40; L.pants = 0x2f2a28; L.accent = 0x2a2018; L.boots = 0x241a14; L.sleeves = 'rolled'; L.hat = 'none'; L.tool = 'hammer';
            if (!L.female && L.beard === 'none') L.beard = 'full';
            L.dress = false;
            break;
        case 'baker': // white shirt, a white apron, a tall white cap
            L.shirt = 0xf4f0ea; L.pants = 0x7a6a50; L.accent = 0xe8e2d6; L.sleeves = 'rolled'; L.hat = 'chef'; L.hatColor = 0xf6f3ec; L.apron = 0xf0ece2; L.tool = 'none';
            L.dress = false; L.beard = L.female ? 'none' : (s < 3 ? 'moustache' : 'none');
            break;
        case 'innkeeper': // a rolled-sleeve shirt, a dark-red vest, a long apron
            L.shirt = 0xe8dcc0; L.pants = 0x4a3a2a; L.accent = 0x7a2a2a; L.sleeves = 'rolled'; L.hat = 'none'; L.apron = 0xd8ccb0; L.tool = 'none';
            if (!L.female && s < 5) L.beard = 'full';
            break;
        case 'herbalist': // a green dress or smock, a kerchief, a basket
            L.hat = 'scarf'; L.hatColor = [0x7a9a4a, 0xc9b24a, 0x5a8a5a][s % 3]; L.tool = 'basket';
            L.dress = true; L.dressColor = [0x5a7a4a, 0x6a8a5a, 0x7a6a3a][s % 3]; L.shirt = 0xe8e2c8; L.accent = 0x4a6a3a;
            break;
        case 'priest': // a long robe, grey hair, a golden cross on the chest, no hat
            L.dress = true; L.dressColor = [0x3a2a24, 0x2f2f3a, 0xe8e4d8][s % 3]; L.shirt = L.dressColor; L.accent = 0xd6b84a; L.hat = 'none'; L.tool = 'none'; L.cross = true; L.sleeves = 'long';
            L.hairColor = 0xc8c8c8; if (!L.female) L.beard = s < 4 ? 'goatee' : 'full';
            break;
        case 'miller': // flour-white from head to foot, a flour cap
            L.shirt = 0xece6d6; L.pants = 0xcbbfa6; L.accent = 0xcbbfa6; L.hat = 'cap'; L.hatColor = 0xf2eee4; L.sleeves = 'rolled'; L.tool = 'none'; L.apron = 0xe6dfcc;
            L.dress = false;
            break;
        case 'stableman': // a straw hat, a pitchfork, dark boots
            L.shirt = 0xc9b28a; L.pants = 0x5a4632; L.boots = 0x2b1f16; L.hat = 'straw'; L.hatColor = 0xd9b956; L.tool = 'pitchfork'; L.sleeves = 'rolled';
            L.dress = false;
            break;
        case 'keeper': // a granary's keeper: a cap and a hoe… a sack-cloth smock
            L.shirt = 0xb9a577; L.pants = 0x5d5a3a; L.hat = 'cap'; L.hatColor = 0x8a6d4a; L.tool = 'hoe'; L.apron = 0xa39367;
            break;
        default: break;
    }
}

/** How a tradesman talks about himself (the conversation brain's character line — TalkMind). Prices are the game's: never invented. */
export const TRADE_PROMPTS = {
    smith: 'Ты кузнец: у тебя горн и наковальня, ты куёшь мечи, топоры, щиты и наконечники стрел; простое оружие лежит на прилавке — цены называет сама игра, цифр не выдумывай. Говоришь коротко и громко, пахнешь углём.',
    baker: 'Ты пекарь: встаёшь затемно, печёшь хлеб и пироги в большой печи и продаёшь их в своей пекарне. Цены называет сама игра — цифр не выдумывай. Говоришь тепло и по-домашнему.',
    innkeeper: 'Ты хозяин таверны: у тебя стойка, камин, столы с лавками; ты продаёшь горячее мясо, сыр и пироги, любишь слухи и разговоры. Цены называет сама игра — цифр не выдумывай.',
    herbalist: 'Ты травник: собираешь и сушишь травы, варишь снадобья, знаешь, чем лечить простуду и раны; продаёшь фляги, яблоки и травы. Цены называет сама игра — цифр не выдумывай. Говоришь тихо и мудро.',
    priest: 'Ты священник: служишь в церкви, звонишь в колокол на рассвете, в полдень и на закате, утешаешь людей и советуешь добром. Говоришь мягко, спокойно и неспешно. Ты не воин.',
    miller: 'Ты мельник: ветряная мельница мелет зерно, ты весь в муке; зерно тебе привозят крестьяне. Говоришь добродушно, любишь поговорить о ветре и урожае. Ты не воин.',
    stableman: 'Ты конюх: ухаживаешь за конями, чистишь стойла, кормишь сеном и овсом, знаешь, как подойти к коню — их можно приручить яблоком. Говоришь просто и немногословно.',
    keeper: 'Ты хранитель амбара: следишь за закромами с зерном и сеном, мешками и бочками, считаешь запасы деревни. Говоришь просто, по-деревенски. Ты не воин.',
};
