/**
 * MonsterForm.js — «Пентаграмма страшного монстра»: правила превращения (pure, no THREE, node-testable).
 *
 * Слова автора (смысл): нарисовал пентаграмму, встал на неё — 200 маны — и тело превращается в накачанного монстра,
 * «немного похожего на Халка, но не чёрного, скорее как волкодав», в 7 раз больше обычного игрока по росту, весу и
 * размеру; 10 минут, на экране видно, сколько осталось; потом обратное превращение на том же месте. Пока монстр — палочки
 * нет (колдовать нельзя), бьёт всех кулаками, ломает дома, шаги проседают землю, 500 HP, простейшие заклинания на него
 * не действуют (как на дракона), сбить его заклинанием нельзя. Чёрная магия: +25 к уровню тьмы за каждое превращение.
 *
 * Здесь — числа и решения «кто/что × как действует»; игровая часть — MonsterTransform.js, модель — MonsterBody.js.
 *
 * Мерки (CLAUDE.md): блок 1 м, герой — ноги на `group.y − 2,0`, рост для стен BODY_H 3,5, радиус 0,48. Монстр — всё ×7:
 * группа модели масштабом (новой геометрии на размер нет), ноги на `group.y − 14`, рост 24,5 м, радиус 3,36 м, шаг
 * вверх без прыжка 7,35 м (через забор, стену деревни, крышу сарая перешагивает), глаза ×7 (камера из глаз — сама,
 * через мировую матрицу головы).
 */

import { isDivine } from './ProtectionGods.js';
import { isFire } from './DragonKinds.js';
import { BLOCK } from '../world/Terrain.js';
import { isEnchanted } from '../world/EnchantedStone.js';
import { CHUNK } from './MonsterChunks.js';

export const MONSTER = {
    ID: 'monster',          // строка таблицы PENTAGRAMS
    COST: 200,              // маны, один раз — когда встал на нарисованный круг
    DURATION: 600,          // с (10 минут)
    HP: 500,                // здоровье монстра (своё; человеческое ждёт возвращения)
    SCALE: 7,               // рост, вес, размер — ×7 по всему
    GROW_S: 5,              // с: превращение (судороги → рост → рёв)
    SHRINK_S: 4,            // с: обратное превращение
    // ходьба: шаг в 7 раз длиннее, а скорость — нет (иначе не играть): бег героя 9,75 → 25,4 м/с, шаг 2,5 → 6,5 м/с
    RUN_K: 2.6,
    JUMP_K: 2.6,            // скорость отрыва ×2,6 → прыжок до ~16 м (у героя 2,4)
    RADIUS: 0.48 * 7,       // 3,36 м
    BODY_H: 3.5 * 7,        // 24,5 м
    STEP_UP: 1.05 * 7,      // 7,35 м — перешагивает без прыжка
    STEADY: 100,            // устойчивость на время формы (сбить заклинанием нельзя)
    FALL_KNOCK: 5 * 7,      // падение, которое валит с ног (у героя 5 м)
    VIEW_BOOST: 0,          // дальность видимости сверх обычной (как в полёте). 0: с высоты 29 м и так видны крыши всей деревни (+180 отрисовок
                            // к 376 человека — tools/monsterbench.mjs), а 0,6 давало 1000+ — FPS важнее (CLAUDE.md «Производительность»)
    HP_AFTER_FALL_K: 0.25,  // монстр убит: человек остаётся с четвертью своего прежнего здоровья (минимум 1)
    DARK: 25,               // +25 к уровню тьмы за каждое превращение (addDark(hero, 25, 'ritual'); потолок 100 — DarkMagic.addDark)
};

/**
 * Ледяной Жезл (дар богов; им колдует Ледяная Королева и тот, кто взял его) замораживает монстра — слова автора: «если у неё
 * божественный ледяной посох, он может кого угодно». Обычный холод («Айс», «Frozen» без жезла, лёд, снег) его по-прежнему не берёт.
 * Монстр огромен, поэтому лёд держится дольше обычного и жезлу нужно больше времени (замах Королевы — IceQueen.ICE.GIANT).
 */
export const FROZEN = { MIN: 8, MAX: 15, K: 1.25, HIT_K: 0.25 };
/** Сколько с заморожен монстр, когда жезл дал `rodT` секунд человеку (всегда в пределах MIN…MAX). */
export const frozenTime = (rodT) => Math.max(FROZEN.MIN, Math.min(FROZEN.MAX, (rodT || 6) * FROZEN.K));

/** «9:58» — сколько осталось (счётчик на экране). */
export function fmtLeft(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

/**
 * Рост тела во время превращения (k 0…1 по времени превращения) → {size, beast, shake}: size 1 → 7 рывками, как
 * удары сердца (тело не «надувается» ровно — растёт толчками), beast — сколько от монстра (шерсть, мускулы: 0 человек,
 * 1 монстр), shake — судороги. Обратное превращение — та же кривая назад (`back`).
 */
export function growAt(k, back = false) {
    k = clamp(k, 0, 1);
    if (back) {
        const r = growAt(1 - k);
        return { size: r.size, beast: r.beast, shake: r.shake * 0.7 };
    }
    // 0…0.15 — судороги в человеческом теле; 0.15…0.9 — рост толчками; 0.9…1 — выпрямился (рёв)
    const g = smooth((k - 0.15) / 0.75);
    const beat = Math.max(0, Math.sin(k * Math.PI * 9)) * (1 - g) * g * 0.6; // (толчки поверх роста)
    const size = 1 + (MONSTER.SCALE - 1) * clamp(g + beat * 0.12, 0, 1);
    const beast = smooth((k - 0.08) / 0.55);
    const shake = k < 0.9 ? 0.4 + 0.6 * Math.abs(Math.sin(k * 41)) * (1 - g * 0.5) : 0;
    return { size, beast, shake };
}

/** Монстр убит (HP 0): здоровье человека после того, как разорванное тело зверя опало. */
export const hpAfterFall = (origHp) => Math.max(1, Math.round((origHp || 1) * MONSTER.HP_AFTER_FALL_K));

// ============================================================ что действует на монстра (таблица «кто/что»)

/** Простейшие заклинания — не действуют, как на дракона (Dragons: огонь не берёт, слабые заряды — искры). */
const SIMPLE = new Set([
    'Stupefy', 'LevitateDuel', 'SapiraDuel', 'Sapira', 'SandsDuel', 'Sands', 'Expelliarmus', 'Disarmor',
    'IceDuel', 'Ice', 'IceBall', 'Frozen', 'chill', 'cold', 'iceBite', 'Jolt', 'JoltMaxima', 'Wind', 'WindMaxima',
    'WindImpulse', 'WindImpulseMaxima', 'Thunderwave', 'Levitation', 'Accio', 'Bombardo', 'Stand', 'Slow',
    'WaterVortex', 'Water', 'thrown', 'Imperius',
]);
/** Сильные — половина: монстр огромен, но это настоящая сила. */
const HALF = new Set(['BombardoMaxima', 'Accentric', 'Pilbidrio', 'Electrum', 'Lightning', 'Earthquake', 'CircleAttack', 'TotalDestruction', 'Hellfire', 'Liquidation', 'WaterStorm', 'IceDuelMaxima', 'Cannon']);
/** Полный урон и толчок (их не держит ни одна защита, кроме богов). */
const FULL = new Set(['Inspirius', 'TotalDestructionMaxima']);
/** Удары телом, когти, оружие, укусы — четверть: шкура зверя толстая, а он в 7 раз больше. */
const PLAIN = new Set(['knight', 'guard', 'iceMonster', 'spider', 'Spider', 'animal', 'horn', 'kick', 'melee', 'arrow', 'bite', 'zombie', 'tail', 'punch', 'claw', 'fist', 'blade', 'sword', 'pistol', 'Servants', 'crush', 'collapse']);

/**
 * Таблица для справочника и тестов: вид → {does: 'none'|'quarter'|'half'|'full'|'breaks', why}.
 * Неизвестное заклинание — половина (`spellOnMonster`).
 */
export const MONSTER_VS = {
    fire: { does: 'none', why: 'огонь (Инферно, огонь дракона, горение, лава) не берёт, как дракона: шерсть тлеет и гаснет' },
    simple: { does: 'none', why: 'простейшие заклинания (Ступефай, Джолт, Ветер, лёд, Сапира, Левиоса, обычная Бомбарда…) — искры о шкуру, ни урона, ни толчка' },
    strong: { does: 'half', why: 'сильные (Бомбарда Максима, Электрум, Акцентрик, молния, землетрясение, Total Destruction…) — половина урона, сбить не могут' },
    plain: { does: 'quarter', why: 'мечи, стрелы, укусы, кулаки — четверть: шкура толстая, а сам он в 7 раз больше' },
    Inspirius: { does: 'full', why: '«Инспириус» — полный урон и толчок (как на любого)' },
    TotalDestructionMaxima: { does: 'full', why: '«Total Destruction Максима» — полный урон и толчок' },
    divine: { does: 'full', why: 'заклинания богов действуют на всё (слова автора: «на то они и божественные»)' },
    AvadaKedavra: { does: 'breaks', why: '«Авада» рвёт тёмную плоть: форма монстра падает сразу, человек выживает (проклятие приняло тело зверя) с четвертью прежнего здоровья' },
    rodFreeze: { does: 'freezes', why: 'Ледяной Жезл (дар богов) замораживает монстра на 8–15 с: он замирает, не ломает и не двигается, ледяная корка; удары по льду его не разбивают, разморозка не убивает. Обычный холод не берёт' },
    fall: { does: 'none', why: 'падения ниже 35 м (5 м × 7) не ранят и не валят' },
    knock: { does: 'none', why: 'сбить с ног может только божественное, «Инспириус» и «Total Destruction Максима» — устойчивость 100 на время формы' },
};

/**
 * Как удар/заклинание `kind` действует на монстра: {k: множитель урона, push: толкает ли, breaks: рвёт ли форму}.
 */
export function spellOnMonster(kind) {
    if (!kind) return { k: 0.25, push: false, breaks: false };
    if (isDivine(kind)) return { k: 1, push: true, breaks: false };
    if (kind === 'AvadaKedavra' || kind === 'avada') return { k: 0, push: false, breaks: true };
    if (FULL.has(kind)) return { k: 1, push: true, breaks: false };
    if (isFire(kind) || kind === 'Inferno' || SIMPLE.has(kind)) return { k: 0, push: false, breaks: false };
    if (kind === 'fall') return { k: 0, push: false, breaks: false };
    if (PLAIN.has(kind)) return { k: 0.25, push: false, breaks: false };
    if (HALF.has(kind)) return { k: 0.5, push: false, breaks: false };
    return { k: 0.5, push: false, breaks: false };
}

/** Сбивает ли это монстра с ног (Knockdown.knock: всё прочее — «устоял»). */
export const knocksMonster = (kind) => !!kind && (isDivine(kind) || FULL.has(kind));

// ============================================================ кулаки (таблица «кто/что»)

/**
 * Что делает кулак монстра (настоящая рука: скорость кулака в мире, хват — кулак) — каждому виду существ и мира.
 * dmg: сколько HP при ударе со скоростью FIST.FULL (меньше — меньше), push: толчок (м/с на массу 1), how — как решено.
 */
export const FIST_TARGETS = {
    zombie: { dmg: 60, push: 40, how: 'рассыпается, отлетает (CreatureImpact)' },
    villager: { dmg: 60, push: 40, how: 'жители, рыцари, король, волшебники, торговцы — урон и полёт; виновник — герой, если видели' },
    animal: { dmg: 60, push: 35, how: 'звери отлетают (масса — CREATURE_BODY)' },
    sailor: { dmg: 60, push: 40, how: 'моряки, пираты, скелеты (кости ломаются — kind "fist")' },
    tree: { dmg: 40, push: 0, how: 'ожившее дерево — урон, его корни держат' },
    dragon: { dmg: 45, push: 0, how: 'дракон — урон и обида (Dragons.hit → _anger); его не отбросить' },
    spider: { dmg: 45, push: 0, how: 'паучиха — урон' },
    ice: { dmg: 45, push: 30, how: 'Ледяная Королева и её создания — кулак не холод и не заклинание: обычный удар (iceDamage PLAIN)' },
    phoenix: { dmg: 40, push: 30, how: 'феникс — урон, отлетает' },
    owl: { dmg: 40, push: 30, how: 'сова — урон, отлетает' },
    canary: { dmg: 40, push: 30, how: 'канарик — урон, отлетает; лагерь сердится' },
    player: { dmg: 20, push: 40, how: 'другой игрок — урон и полёт (через его компьютер, как удар)' },
    blocks: { dmg: 0, push: 0, how: 'стены, дома, заборы, деревья, земля — ломаются в шаре у кулака (кроме бедрока, заколдованного камня и даров богов)' },
    items: { dmg: 0, push: 20, how: 'вещи на земле отлетают' },
    ships: { dmg: 0, push: 0, how: 'корпус корабля — не блоки мира: кулак упирается (корабль качает), не ломает' },
    godGift: { dmg: 0, push: 0, how: 'не действует — дар богов (храм, пьедесталы, Ледяной Жезл): кулак упирается в золотую защиту' },
};

export const FIST = {
    MIN: 14,         // м/с кулака относительно тела (рука ×7: взмах руки игрока 2 м/с — уже 14 м/с у монстра)
    FULL: 45,        // м/с — полный урон (резкий удар, ~6,5 м/с рукой игрока)
    COOLDOWN: 0.35,  // с между ударами одной руки
    BLOCK_R: 4.2,    // м: шар блоков, который ломает кулак (кулак ×7 — прежние 2,2 м были меньше самой лапы)
    BLOCKS_MAX: 260, // блоков за один удар
    PIERCE: 15,      // м: резкий удар кулаком пробивает насквозь — дом, стену башни, дерево (туннель за кулаком)
    PIERCE_R: 2.5,   // м: радиус туннеля
    PIERCE_MIN: 0.55,// сила удара (0…1), с которой кулак пробивает насквозь, а не только вмято
    REACH: 3.2,      // м: от кулака до тела существа (оно маленькое, кулак огромный)
};

/**
 * Взять в лапу кусок постройки (сжать у стены — связный обломок ломается в лапе по частям, разжать — летит со скоростью руки и ложится,
 * где упал). Числа куска и его правила — MonsterChunks.js (CHUNK, impactOf, CHUNK_TARGETS).
 */
export const GRAB = {
    OPEN: 0.35, CLOSE: 0.65, // хват (getGripCurl): разжата / сжата
    R: CHUNK.R,              // м: шар у ладони
    MAX: CHUNK.MAX,          // блоков в одной лапе
    FLY_MAX: CHUNK.FLY_MAX,  // блоков в полёте разом
    HIT_SPEED: CHUNK.HIT_V,  // м/с: летящий кусок бьёт
};

/** Сила удара 0…1 по скорости кулака (м/с), 0 — не удар. */
export const fistPower = (speed) => (speed < FIST.MIN ? 0 : clamp((speed - FIST.MIN) / (FIST.FULL - FIST.MIN), 0.25, 1));

// ============================================================ блоки: что ломается

/** Земля (не построенное): тело её не сносит — по ней шагают (кулак — бьёт). */
const GROUND = new Set([BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SNOW, BLOCK.SAND, BLOCK.ICE, BLOCK.GRAVEL, BLOCK.DEEPSTONE,
    BLOCK.REGOLITH, BLOCK.PLANET_ROCK, BLOCK.PLANET_ICE, BLOCK.PLANET_DARK, BLOCK.PLANET_GRASS, BLOCK.FARMLAND, BLOCK.PATH]);
/** Не ломается ничем, что делает монстр (бедрок, вода, заколдованный камень; дары богов — data.set/godGiftAt). */
export const unbreakable = (t) => t === BLOCK.AIR || t === BLOCK.WATER || t === BLOCK.BEDROCK || t === BLOCK.ICE_SHAPE || isEnchanted(t);
/** Кулак берёт любой блок, кроме неразрушимых. */
export const fistBreaks = (t) => !unbreakable(t);
/** Корпус на ходу сносит построенное и деревья (стены, заборы, крыши, листву, стволы), не землю. */
export const bodyBreaks = (t) => !unbreakable(t) && !GROUND.has(t);
/** Мягкая земля, где остаётся след ноги. */
const SOFT = new Set([BLOCK.GRASS, BLOCK.DIRT, BLOCK.SAND, BLOCK.SNOW, BLOCK.GRAVEL, BLOCK.FARMLAND, BLOCK.PATH, BLOCK.PLANET_GRASS, BLOCK.REGOLITH]);
export const softGround = (t) => SOFT.has(t);

export const STOMP = {
    EVERY: 1.0,       // с: не чаще одного следа (иначе за 10 минут — тысячи правок мира, сеть и сохранение)
    MAX: 400,         // следов за одно превращение
    RUN_MIN: 0.35,    // бег слабее — шаги мягкие, следов нет
    LAND_DROP: 6,     // м: приземление с такой высоты — воронка
    CRATER_R: 3,      // м: воронка от приземления
    BREAK_PER_S: 2600,// блоков в секунду сносит корпус (предел: правки по сети, обрушения); было 500 — «ломает недостаточно сильно»
};

/** Корпус: сколько сносит на ходу (слова автора: «в целом ломает, но недостаточно сильно»). Радиус от размера тела и скорости бега. */
export const SMASH = {
    K: 1.45,        // × радиус тела (0,48 × размер): корпус сносит шире, чем стоит ступня — плечи, бёдра, локти
    PAD: 1.2,       // м сверху
    RUN: 0.25,      // × размер × бег (0…1): на бегу сносит ещё шире — разгон
    FOOT_R: 3.2,    // м: ступня проламывает крышу/пол под собой (шаг по зданию)
    FOOT_DEPTH: 3,  // слоёв вниз под ступнёй
    STEP: 0.45,     // м: корпус заново проверяется, только если сдвинулся на столько
};

/** Топот: шаги и приземление трясут землю — существа рядом шатаются, оступаются, мелкие падают. */
export const TREMOR = {
    R: 24,          // м от ступни
    PUSH: 7,        // м/с толчка на массу 1 у самой ступни (убывает с расстоянием)
    TOSS: 4,        // подброс
    MAX: 14,        // существ за один шаг (предел работы)
    SHAKE: 0.45,    // тряска экрана на бегу (у самого героя); рядом с монстром у других — от расстояния
    LAND_K: 2.2,    // приземление с высоты бьёт сильнее шага
};

/**
 * След ноги (вмятина): клетки, которые проседают. Ступня ×7 (у героя 0,5 × 0,7 м) — ≈ 3,5 × 5 м: овал пятки и подушки,
 * четыре пальца с когтями впереди; пятка глубже (2 блока), остальное — 1. `yaw` — куда смотрит тело (−Z вперёд).
 * @returns {{dx:number, dz:number, depth:number}[]} смещения клеток от центра стопы
 */
export function footprint(yaw, deep = false) {
    const out = [], seen = new Set();
    const s = Math.sin(yaw), c = Math.cos(yaw);
    const put = (fx, fz, depth) => {
        // (fx — вбок, fz — вперёд по ступне) → мир (тело смотрит в −Z при yaw 0)
        const dx = Math.round(fx * c - fz * s), dz = Math.round(-fx * s - fz * c), key = dx * 64 + dz;
        if (seen.has(key)) { const o = out.find((p) => p.dx === dx && p.dz === dz); if (o && depth > o.depth) o.depth = depth; return; }
        seen.add(key); out.push({ dx, dz, depth });
    };
    for (let fz = -2; fz <= 1.5; fz += 0.5) for (let fx = -1.5; fx <= 1.5; fx += 0.5) {
        const e = (fx / 1.6) ** 2 + ((fz + 0.3) / 2.1) ** 2;
        if (e <= 1) put(fx, fz, fz < -1 && Math.abs(fx) < 1 && deep ? 2 : 1); // (пятка — сзади, глубже)
    }
    for (const fx of [-1.5, -0.5, 0.5, 1.5]) put(fx, 2.5, 1); // пальцы
    return out;
}

/** Воронка от приземления (r м): смещения и глубина (середина глубже). */
export function crater(r = STOMP.CRATER_R) {
    const out = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dz) / r;
        if (d > 1) continue;
        out.push({ dx, dz, depth: d < 0.45 ? 2 : 1 });
    }
    return out;
}

/**
 * После обратного превращения — место, где человек помещается (не в потолке, не в земле): сначала прямо тут, потом
 * вверх по этому столбу (стоял в комнате, которую монстр собой заполнял — потолок над головой человека, — встаёт на
 * то, что под ногами; был в скале — на её верх), потом кольцами вокруг до `far` м.
 * `fits(x, feetY, z)` — помещается ли тело человека; `floor(x, z, fromY)` — пол (верх блока) не выше fromY.
 * @returns {{x, y, z}|null} где ноги
 */
export function freeSpot(fits, floor, x, feetY, z, far = 14) {
    if (fits(x, feetY, z)) return { x, y: feetY, z };
    // этот столб: ближайший пол ниже, на который можно встать, — потом выше
    for (let up = 0; up <= 32; up += 1) {
        const y = floor(x, z, feetY + up);
        if (y != null && Number.isFinite(y) && y >= feetY - 3 && fits(x, y, z)) return { x, y, z };
    }
    for (let r = 1; r <= far; r++) {
        const n = Math.max(8, Math.round(r * 6));
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
            for (const fy of [feetY, feetY + 1, feetY + 2, feetY - 1, feetY + 4, feetY + 8]) {
                const y = floor(px, pz, fy + 0.5);
                if (y != null && Number.isFinite(y) && Math.abs(y - feetY) <= 12 && fits(px, y, pz)) return { x: px, y, z: pz };
            }
        }
    }
    return null;
}

/** Что запрещено в форме монстра (палочки нет; огромное тело не влезает): ответ игроку — только по действию. */
export const MONSTER_BLOCKS = {
    spells: 'все заклинания (палочки нет); «стоп» — только остановить своё',
    wand: 'палочка исчезает из руки (слот тот же), появляется после возвращения',
    ride: 'лошади, дракон, доски, корабельные снасти, кровати — не для 24-метрового тела',
    items: 'вещи из рук падают (кроме палочки — она прячется)',
    flight: 'полёт — нет (это заклинание)',
};

/** Жители: страшное существо — строка `monster` в Danger.DANGERS (alarm(pos, 'monster', by, r)). */
export const MONSTER_DANGER = 'monster';
