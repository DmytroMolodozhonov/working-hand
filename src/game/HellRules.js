/**
 * HellRules.js — правила АДА и «Пентаграммы ада» (`Pentagranium Infernum`), чистые (node-тесты). Игровая часть — HellGate.js (врата, переход,
 * возврат), HellRealm.js (небо, туман, свет, лава, искры, звук); план мира — src/world/HellMap.js (контракт), земля — HellLand.js.
 *
 * Слова автора: «ПЕНТАГРАММА АДА… это пентаграмма ЧЁРНОЙ МАГИИ, даёт СРАЗУ +10 к уровню чёрного мага. Как только человек найдёт эту пентаграмму (свиток) и
 * воспользуется, СОЗДАСТ пентаграмму, ему нужно ПРИНЕСТИ ЖЕРТВУ… нужно положить на пентаграмму ОДНО мёртвое существо (НЕ кости). После этого подходишь и
 * ТЕЛЕПОРТИРУЕШЬСЯ В АД… Там, где ты заспавнился в аду, будет ТА ЖЕ метка… для возврата нужна ГОЛОВА ГОРГУЛЬИ — она выпадает, если убил горгулью, с
 * ШАНСОМ 25 %. Голову нужно ПОСТАВИТЬ на метку… иначе не вернёшься. В Творческом условий нет».
 *
 *   Слово: палочка на землю + «Pentagranium Infernum» → 150 маны, СРАЗУ +10 к тьме (≤ 100), рисунок рисуется сам (врата с пламенем и рогами).
 *   Жертва (вне Творческого): ОДНО тело на круге — любое убитое существо (житель, игрок, зомби с телом, туша зверя), НЕ кости и не тело с силой героя
 *   (`anyBody`) → 3,2 с тёмного пламени (Offerings) → тело сгорает → круг ОТКРЫТ `OPEN_S` с (горит красным, луч вверх).
 *   Переход: постоять в открытом круге `STEP_S` с → затемнение/вспышка `FADE_S` с, звук → герой в аду у метки (HeroApply ждёт землю воркеров).
 *   Возврат: на метке в аду ПОЛОЖИТЬ голову горгульи (на земле круга, не в руке/сумке) → 3,2 с пламени → голова сгорает → метка открыта → шаг в круг →
 *   на Земле у ТОЙ пентаграммы, через которую вошёл (её нет / место занято — ближайшее твёрдое; у каждого игрока своя точка).
 *   Творческий: круг открыт сразу и всё время, голова не нужна.
 */

import { HELL, inHell } from '../world/HellMap.js';

export const INFERNUM = {
    COST: 50, // маны за создание круга; отдельной платы за жертву нет
    DARK: 10, // сразу к уровню тьмы (потолок 100 — DarkMagic.addDark)
    OPEN_S: HELL.OPEN_S, // с: круг открыт после жертвы (войти могут несколько)
    STEP_S: HELL.STEP_S, // с: постоять в открытом круге — переход
    FADE_S: HELL.FADE_S, // с: затемнение и вспышка
    BACK_CD: 4, // с: только что прибыл — круг под ногами не уносит обратно, пока не сойдёшь с него
};

/**
 * Переход (замечание автора: «пока появляешься в аду, мир ещё секунды три догружается на глазах»): экран держится тёмным, пока вокруг не нарисована вся
 * земля в RING_M м (TerrainView.ringMissing = 0), не включились небо/свет ада и не сделан Дьяволос; не меньше MIN_S (Тароны лагеря успевают встать) и не
 * дольше HOLD_S после того, как герой встал на землю (не успело — открывается плавно всё равно). Пока круг открыт и герой рядом (PRE_NEAR), воркеры уже
 * делают землю той стороны (TerrainView.prefetch) — ожидание почти нулевое. Так же при возврате на Землю.
 */
export const PASS = { RING_M: 200, MIN_S: 0.6, HOLD_S: 8, PRE_NEAR: 30 };

/** Голова горгульи: выпадает из убитой горгульи (оружием, заклинанием — не от луча «To the Sun»: та сгорела). */
export const HEAD = { CHANCE: 0.25, DARK_MAGE: 0.005, KIND: 'gargoyleHead' }; // (25 % from a killed gargoyle; 0.5 % from a black mage — a wanderer's body, a lone black mage's chest)
/** The head is NEVER bought or sold anywhere (the author): no shop has it, no merchant, fence or pawnbroker takes it, no price is named. */
export const unsellable = (it) => !!it && it.kind === HEAD.KIND;
/** A black mage's head (0.5 %): only a black mage — a wanderer, or a lone wizard in his own house — never a plain one, a castle, a dungeon, a ship. */
export const darkMageHead = (isDarkMage, r = Math.random()) => !!isDarkMage && r < HEAD.DARK_MAGE;
/** Выпала ли голова? `how`: 'kill' (оружие, заклинание, падение) | 'sun' (сгорела в луче «To the Sun») | 'ritual' (ушла сама). `r` — случайное 0…1. */
export const headDrops = (how, r = Math.random()) => how === 'kill' && r < HEAD.CHANCE;

/** Лава: горит, как огонь, и убивает быстро (герою ~3 с); существа ада огнеупорны. */
export const LAVA = { DPS: 8, BURN_S: 4, REACH: 0.6, TEXT: 'Вас сожгла лава' };
/** Вещи, которые лава сжигает (дерево, бумага, ткань, кожа, еда, травы); металл, камень, кристаллы, стекло — лежат на лаве целыми. */
export const LAVA_BURNS = new Set(['scroll', 'book', 'wand', 'bow', 'arrows', 'logs', 'wool', 'bread', 'cheese', 'pie', 'meat', 'steak', 'apple', 'redApple', 'baksadi_pear', 'backpack', 'fern_frond', 'web', 'canaryHide', 'robe', 'owlFeather', 'spencerFeather', 'beslanGrass', 'carnivoreHead', 'telewilpinLeaf', 'glowcap_mushroom', 'azure_berry', 'sun_herb']);
export const lavaBurnsItem = (it) => !!it && (LAVA_BURNS.has(it.kind) || (it.kind === 'shield' && !it.magic && it.type === 0));

/** Падение в пропасть ада: ниже этого слоя — смерть (лава там на дне). */
export const ABYSS_Y = HELL.LAVA_Y - 6;

/**
 * Годится ли тело для жертвы ада: ЛЮБОЕ убитое существо (не обязательно человекоподобное): тело жителя/рыцаря/волшебника/моряка, игрока, зомби
 * (если оставил тело), туша зверя. Кости — нет; тело, в котором лежит сила героя (`b.lg`), — нет (её может забрать только хозяин). → { ok, why? }
 */
export function anyBody(b) {
    if (!b) return { ok: false, why: 'Нужно тело убитого существа' };
    if (b.bones || b.stage === 'bones') return { ok: false, why: 'Кости не подходят — нужно тело, которое ещё не стало скелетом' };
    if (b.lg) return { ok: false, why: 'В этом теле лежит сила героя — оно не подходит' };
    return { ok: true };
}

/** Что лежит на круге для обряда (Offerings): вход — одно тело; возврат — голова горгульи. */
export const HELL_OFFERINGS = {
    infernum: { id: 'infernum', bodies: 1, any: true, things: [], mana: 0, what: 'тело' }, // (создание круга: 50; жертва без дополнительной платы)
    hellBack: { id: 'hellBack', bodies: 0, things: [{ kind: HEAD.KIND, name: 'голова горгульи' }], mana: 0, what: 'голова горгульи' },
};

/** Тексты для человека (на «вы», просто). */
export const HELL_TEXT = {
    drawn: 'Положите на круг тело любого убитого существа (не кости) — оно сгорит, и врата в ад откроются',
    drawnCreative: 'Встаньте в круг и постойте немного — врата в ад открыты',
    open: '🔥 Врата открыты! Встаньте в круг и постойте немного — вы окажетесь в аду',
    openBack: '🔥 Врата открыты! Встаньте в круг и постойте немного — вы вернётесь на Землю',
    going: '🔥 Стойте в круге…',
    arrived: '🔥 Вы в аду. Чтобы вернуться, положите на эту метку голову горгульи',
    arrivedCreative: '🔥 Вы в аду. Встаньте на метку — и вернётесь на Землю',
    needHead: '🔥 Чтобы вернуться, положите на метку голову горгульи',
    back: '🌍 Вы вернулись на Землю',
    noLand: '🔥 Врата ещё не готовы — подождите немного',
    closed: '🔥 Врата закрылись',
    imperius: '🔥 В чужом теле врата не пускают — сначала «стоп»',
    duel: '🔥 Во время дуэли врата не пускают',
    mount: '🔥 Слезьте — врата пропускают только вас самих',
    monster: '🔥 В облике монстра врата не пускают',
    noSleep: '🔥 В аду не уснуть',
};

/**
 * Заклинания в аду (как `spaceSpellBlock` для космоса): вода и холод в адском жаре испаряются и тают — не действуют, с причиной. Остальное (Левиоса, Бомбардо,
 * огонь, Инферно, Люмос, полёт, «стоп», «Give Me My Power»…) работает. Огонь на лаве бессмыслен, но произносится.
 */
const STEAM = /^(Waterball|WaterForming|WaterVortex|WaterVortexSuperMaxima|WaveAttack|WaveAttackMaxima|Drawdown|DrawdownMaxima|AirBubble|AirBubbleMaxima)$/; // («Firefighting» is no water — it takes the air away: it works in hell too and puts out the lava's fire)
// («Let it rain» is NOT here: the author 07.11 — in hell it can be called, but the rain is BLOOD and puts out nothing: RainDouse.js)
const COLD = /^(Ice|IceMaxima|Frozen|IceCastle|IceBridge|Snowman)$/;
export function hellSpellBlock(name) {
    if (STEAM.test(name || '')) return '♨️ В адском жаре вода испаряется, не успев появиться — это заклинание здесь не действует';
    if (COLD.test(name || '')) return '♨️ В адском жаре лёд и снег тают, не успев появиться — это заклинание здесь не действует';
    if (name === 'Axis') return '🌍 В аду вечные сумерки — суток нет, поворачивать нечего';
    if (name === 'Helios') return '☀️ В аду нет неба — Солнцу негде повиснуть';
    if (name === 'BrainrotMaxima') return '🐉 В аду нет земных драконов — «Брейнрот Максима» некого успокоить';
    return null;
}

/**
 * КТО ЖИВЁТ В АДУ (правка автора: «в аду есть сова — убрать; только оговорённые существа»). Белый список — ровно эти; всё остальное в аду не рождается и,
 * оказавшись там (прилетело за героем, сохранение), убирается (`hellForeign`/`hellSweep` в HellRealm, хост, раз в секунду). Питомцы и призывы игрока
 * (ездовая лошадь, приручённый дракон, ожившее дерево, добрый снеговик) — не «лишние»: их привёл игрок.
 */
export const HELL_CREATURES = {
    diabolos: { sys: 'diabolos', why: 'бог ада, прикован в котловине' },
    taron: { sys: 'tarons', why: 'Тароны — лагеря ада' },
    hellGargoyle: { sys: 'gargoyles', why: 'горгульи ада — только патруль (`o.patrol`); горгульи ритуала Земли в ад не попадают (ритуал — только под небом Земли)' },
    players: { sys: null, why: 'герой и другие игроки' },
};
/**
 * Все остальные системы существ и почему их в аду нет. `spawn` — как запрет на рождение устроен (`earthly`: x < ZONE_X − 64, ад x ≥ 462016; `offEarth` —
 * места мира: замки, деревни, логова, данжи, пещеры, болота — в аду их нет), `sweep` — убирается ли случайно попавший (система с `list` и `_remove`).
 */
export const HELL_SYSTEMS = {
    owls: { spawn: 'earthly (раньше — realmAt: ад за планетами считался «Землёй», и сова рождалась и вела героя по аду — исправлено)', sweep: true },
    phoenixes: { spawn: 'earthly', sweep: true },
    animals: { spawn: 'earthly (стада, яблони)', sweep: true, keep: 'ездовая лошадь героя и лошади повозок игрока' },
    spencers: { spawn: 'earthly (рядом с видящим на Земле)', sweep: true },
    spiders: { spawn: 'earthly (ночь, логово, пещера паучихи — места Земли)', sweep: true },
    dragons: { spawn: 'earthly (логова Земли)', sweep: true, keep: 'приручённый дракон (`d.tame`)' },
    zombies: { spawn: 'earthly (ZombieSpawn: тьма Земли, пещеры)', sweep: false },
    books: { spawn: 'earthly (книги-птицы)', sweep: false },
    runner: { spawn: 'earthly (бегущая книга)', sweep: false },
    travelers: { spawn: 'earthly (дороги Земли)', sweep: false },
    canaries: { spawn: 'offEarth (лагеря на болотах Земли)', sweep: false },
    ghosts: { spawn: 'offEarth (только в Замке призраков Земли)', sweep: false },
    castleLife: { spawn: 'offEarth (жители, рыцари, король — места Земли)', sweep: false },
    wizards: { spawn: 'offEarth (башня, города, одиночки)', sweep: false },
    sailors: { spawn: 'море Земли (в аду моря нет)', sweep: false },
    iceCastle: { spawn: 'карта Королевы / дворец Земли', sweep: false },
    livingTrees: { spawn: 'призыв игрока («Alive») — не лишнее', sweep: false },
};
const _posOf = (c) => c?.pos || c?.position || c?.model?.position || c?.mesh?.position || c?.group?.position || null;
/** Лишнее ли существо этой системы в аду (стоит в аду и не питомец игрока)? */
export function hellForeign(sysKey, c, game = null) {
    const S = HELL_SYSTEMS[sysKey], p = _posOf(c);
    if (!S || !p || !inHell(p.x, p.z) || c.dead) return false;
    if (sysKey === 'animals' && (c === game?.animals?.riding || c.carriage || c.owner)) return false;
    if (sysKey === 'dragons' && c.tame) return false;
    return true;
}
/** (хост) Убрать из ада всё лишнее: системы с `list` и `_remove`. → сколько убрано по системам { owls: 1 … }. */
export function hellSweep(game) {
    const out = {};
    for (const k in HELL_SYSTEMS) {
        if (!HELL_SYSTEMS[k].sweep) continue;
        const sys = game?.[k];
        if (!sys?.list || typeof sys._remove !== 'function') continue;
        for (let i = sys.list.length - 1; i >= 0; i--) {
            const c = sys.list[i];
            if (hellForeign(k, c, game)) { sys._remove(c); out[k] = (out[k] || 0) + 1; }
        }
    }
    return out;
}

/** НА КОГО / НА ЧТО (CLAUDE.md): «Пентаграмма ада» и сам ад. */
export const HELL_TARGETS = {
    me: { does: 'travel', why: 'колдующий платит 150 маны и получает +10 тьмы при слове; жертва — одно тело; шаг в открытый круг — в ад; голова горгульи на метке — назад' },
    players: { does: 'travel', why: 'каждый игрок, постоявший в открытом круге, переносится сам (у каждого своя точка возврата); остальные видят пламя и луч (pgm k hell)' },
    bodies: { does: 'consume', why: 'тело ЛЮБОГО убитого существа (житель, рыцарь, волшебник, моряк, игрок, зомби с телом, туша зверя) сгорает; кости и тело с силой героя — нет' },
    items: { does: 'consume', why: 'на метке в аду сгорает голова горгульи (для возврата); остальные вещи на круге не трогаются' },
    zombies: { does: 'none', why: 'мёртвый зомби тела не оставляет — не считается; живые зомби Земли в ад не попадают (earthly)' },
    villagers: { does: 'alarm', why: 'чёрная магия: жители пугаются (castleLife.alarm "dark"); сами в круг не заходят и в ад не уходят' },
    animals: { does: 'none', why: 'туша зверя годится как жертва; живые звери через врата не проходят' },
    dragons: { does: 'none', why: 'дракон через врата не проходит (переносится только сам герой); в аду земных драконов нет' },
    gargoyles: { does: 'drop', why: 'убитая горгулья (и Земли, и ада) с шансом 25 % роняет голову; сгоревшая в луче «To the Sun» — нет' },
    mounts: { does: 'none', why: 'на лошади / драконе / метле в круге — врата не пускают: «слезьте»' },
    ships: { does: 'none', why: 'пентаграмма не ложится на палубу (Pentagranium.groundAt): корабли через врата не идут' },
    imperius: { does: 'none', why: 'под Империусом в чужом теле врата не пускают (сначала «стоп»)' },
    duel: { does: 'none', why: 'во время дуэли и на арене врата не пускают' },
    space: { does: 'none', why: 'в космосе нет земли — пентаграмма не ложится; на других планетах рисуется, врата ведут в тот же ад' },
    lava: { does: 'burn', why: 'лава жжёт: 8 HP/с, пока в ней, и поджигает огнём вдвое сильнее обычного (Burning.BURN.LAVA_K), который горит и после выхода, пока не потушат «Firefighting»; существа ада и драконы огнеупорны; деревянные и бумажные вещи на лаве сгорают (LAVA_BURNS), металл и камень лежат целыми' },
    abyss: { does: 'kill', why: 'падение в пропасть ада — смерть' },
    spells: { does: 'mixed', why: 'вода и холод в аду не действуют (испаряются / тают — hellSpellBlock); остальное как на Земле' },
    creative: { does: 'free', why: 'в Творческом жертва и голова не нужны: круг открыт сразу' },
    death: { does: 'earth', why: 'умер в аду — возрождение на Земле (кровать / начало мира); вещи остаются у тела в аду' },
    save: { does: 'keep', why: 'вышел из игры в аду — при загрузке герой в аду на том же месте; точка возврата (`from`) сохраняется' },
};
