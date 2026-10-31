/**
 * DiabolosRules.js — Дьяволос, огромный прикованный дьявол ада: чистые правила и числа (без THREE, проверяются в node).
 *
 * Слова автора: «В аду, если какое-то время пройти, можно заметить ОГРОМНОГО ДЬЯВОЛА. Размером как страшный монстр
 * (пентаграмма монстра), но В 5 РАЗ БОЛЬШЕ… с ОГРОМНЫМИ РОГАМИ, накачанный и массивный (автор поправил: «не толстый»), с КОПЫТАМИ. ОДНО КОПЫТО У НЕГО ПРИКОВАНО:
 * большая ЦЕПЬ. Обычно просто СИДИТ И СПИТ. Можно ПОТРЕВОЖИТЬ — тогда он ходит… дойдя до грани, цепь держит, он ЗЛИТСЯ.
 * Дьявол БЕССМЕРТЕН: его вообще нельзя никак убить, даже «Дай» не берёт (он СОЗДАЛ «Дай» — бог Дьяволос создал чёрную
 * магию, был наказан и помещён в подземный мир). ПЛЮЁТСЯ ОГНЁМ — В 5 РАЗ БОЛЬШЕ и ДЛИННЕЕ, чем у дракона, или ШАРАМИ ОГНЯ —
 * летят и ВЗРЫВАЮТСЯ. Шары ПРОБИВАЮТ Protection и Protection Maxima — просто ЛОМАЮТ: тебе ничего не будет, но защита
 * сломается; нужно опять поднять руки и сказать заклинание — каждый раз».
 *
 * Мерки (CLAUDE.md «Размеры от мерок мира»): монстр пентаграммы — герой ×7 (MonsterForm.MONSTER: рост 24,5 м, радиус
 * 3,36 м). Дьяволос — монстр ×5 (DEVIL.VS_MONSTER):
 *
 *   | мерка                   | монстр (MonsterForm) | Дьяволос (×5)                 |
 *   |-------------------------|----------------------|-------------------------------|
 *   | рост до макушки         | 24,5 м               | 122,5 м (рога выше ещё ~25 м) |
 *   | радиус тела             | 3,36 м               | 16,8 м → 21 м (массивный: грудь 32 м в ширину) |
 *   | шаг вверх без прыжка    | 7,35 м               | 36,75 м                       |
 *   | досягаемость кулака     | 4,2 м (FIST ×)       | 52 м                          |
 *
 * Огонь дракона (DragonKinds: FLAME_REACH 14 + 9 × сила; конус 0,7 + 0,17 × путь — Dragons.inFlame): у обычного дракона
 * (сила 1) 23 м, у конца ширина 4,6 м. Струя Дьяволоса ×5: 115 м, у конца ширина 23 м (FIRE.R0 = 0,7 × 5, тот же угол).
 */

import { isDivine } from './ProtectionGods.js';

export const DEVIL = {
    ID: 'diabolos',
    NAME: 'Дьяволос',
    VS_MONSTER: 5,           // ×5 к монстру пентаграммы
    HEIGHT: 24.5 * 5,        // 122,5 м — макушка стоящего (без рогов)
    RADIUS: 21,              // м — тело для стен, игроков и толпы (×5 монстра — 16,8 м; массивный: плечи шире — замер Box3)
    BELLY_R: 23,             // м — корпус для зарядов и ударов (полуширина груди 0,92 × 35 у плеч, талия 0,54 × 35)
    MODEL_H: 3.5,            // рост формы модели (в единицах героя): группа ×35
    get SCALE() { return this.HEIGHT / this.MODEL_H; }, // 35
    SEAT_MIN_R: 90,
    SEAT_OFF: 40,            // м — сидит так далеко от столба цепи (столб в середине котловины — HellMap)
    PILLAR_R: 6,             // м — столб: тело не заходит в него (держится в PILLAR_R + RADIUS)          // м — котловина под ним не меньше (тело 17 м + цепь 70 м)
    CHAIN_LEN: 70,           // м — от якоря до копыта (свободный ход)
    CHAIN_SOFT: 0.86,        // доля CHAIN_LEN: дальше цепь натягивается (мягкая пружина), у CHAIN_LEN — жёсткий предел
    CHAIN_LINKS: 44,         // звеньев (каждое ~3,6 м длиной, шаг цепи 1,82 м — звенья продеты друг в друга)
    LINK_LEN: 3.6,           // м — длина звена
    LINK_PITCH: 1.82,        // м — шаг (внутренняя длина звена): длина цепи 44 × 1,82 = 80 м ≥ 70 м хода + высота якоря
    WALK: 5.2,               // м/с — тяжёлый шаг (герой бегом 9,75: от него можно уйти)
    TURN: 0.55,              // рад/с — поворот всем телом
    SLEEP_AFTER: [40, 90],   // с: успокоился → сел → заснул через столько
    LOSE_T: 25,              // с без цели — успокаивается
    FORGET_R: 260,           // м — обидчик дальше — «потерян»
    GRUDGE_T: 120,           // с — обида держится
    NEAR_FRIEND: 20,         // м — злится и на тех, кто рядом с обидчиком
    ACTIVE_R: 900,           // м — ближе этого кто-то из игроков: Дьяволос «проснулся» в мире (модель, цепь); дальше — выгружен
};

/**
 * Он ВИДИТ НЕВИДИМЫХ (слова автора): то же зрение, что у прошедшего «Pentagranium Spectris» (Invisibles.seesInvisible).
 * Невидимость (зелье, заклинание, плащ — любой источник) от него не спасает: цели, обида, пробуждение, шары, струя, хват —
 * по настоящему месту (Diabolos._players не спрашивает g.invis.aiPos). Свет/тень/дальность — как для видимых.
 */
export const SEES_INVISIBLE = true;
export const DEVIL_SENSES = {
    seesInvisible: { on: SEES_INVISIBLE, why: 'древний бог создал магию невидимости — видит любого невидимого (игрока и существо), как прошедший «Pentagranium Spectris»' },
};

/** Что будит спящего (слова задачи): только то, что ПОТРЕВОЖИЛО, — не шаги и не далёкие шумы. */
export const WAKE = {
    NEAR: 35,      // м — подошёл к спящему ближе
    NOISE: 40,     // м — крик / взрыв ближе
    CHEST: 70,     // м — взял что-то из сундука рядом
    LUMOS: 90,     // м — Люмос/фонарик в лицо с такого расстояния
    LUMOS_COS: 0.97, // луч света смотрит в лицо (cos угла)
    GROGGY: 3.2,   // с — пробуждение (потягивание, взгляд) до первого шага
};

/**
 * Будит ли событие спящего Дьяволоса. ev: {kind: 'hit'|'noise'|'near'|'chest'|'lumos'|'step', d (м), loud, aim (cos луча к лицу)}
 * → причина (строка для журнала) или null.
 */
export function wakes(ev) {
    if (!ev) return null;
    const d = ev.d ?? Infinity;
    switch (ev.kind) {
        case 'hit': return 'по нему попали';
        case 'noise': return ev.loud && d <= WAKE.NOISE ? 'громко рядом' : null; // (крик, взрыв; шорох и далёкое — нет)
        case 'near': return d <= WAKE.NEAR ? 'подошли вплотную' : null;
        case 'chest': return d <= WAKE.CHEST ? 'взяли из сундука рядом' : null;
        case 'lumos': return d <= WAKE.LUMOS && (ev.aim ?? 0) >= WAKE.LUMOS_COS ? 'свет в лицо' : null;
        case 'step': return null; // (шаги не будят: он спит тысячу лет)
        default: return null;
    }
}

// ------------------------------------------------------------------ цепь
/**
 * Где может стоять тело: копыто (смещено от середины тела на `foot`) не дальше CHAIN_LEN от якоря.
 * → {x, z (поправленная середина тела), t (натяжение 0…1: 0 — свободно, 1 — у предела), at (у грани)}.
 */
export function leash(ax, az, x, z, fx = 0, fz = 0, len = DEVIL.CHAIN_LEN) {
    let hx = x + fx - ax, hz = z + fz - az;
    const d = Math.sqrt(hx * hx + hz * hz);
    const soft = len * DEVIL.CHAIN_SOFT;
    if (d <= soft) return { x, z, t: 0, at: false, d };
    if (d > len) { const k = len / d; hx *= k; hz *= k; x = ax + hx - fx; z = az + hz - fz; }
    return { x, z, t: Math.min(1, (Math.min(d, len) - soft) / (len - soft)), at: d >= len * 0.985, d: Math.min(d, len) };
}

/**
 * Цепь — верёвка из точек (verlet 1D, шаг цепи DEVIL.LINK_PITCH): node 0 у якоря, последняя — у копыта. Одинаково
 * на всех компьютерах (те же входы, тот же шаг) — звенья по сети не идут. ground(x, z) → высота земли (звенья ложатся
 * на неё и волочатся, сквозь землю не проходят).
 */
export class ChainRope {
    constructor(n = DEVIL.CHAIN_LINKS, pitch = DEVIL.LINK_PITCH) {
        this.n = n; this.pitch = pitch;
        this.p = new Float64Array((n + 1) * 3); // точки
        this.o = new Float64Array((n + 1) * 3); // прошлые (verlet)
        this.speed = 0; // м/с — средняя скорость звеньев (звон цепи)
        this.taut = 0;  // 0…1 — натяжение (по прямой копыто–якорь против длины)
        this._acc = 0;
        this.ready = false;
        this.free = false; // (цепь сорвана с копыта — смерть Дьяволоса: конец лежит свободно)
    }
    /** Уложить цепь по земле от якоря к копыту (загрузка, пробуждение мира). */
    lay(a, h, ground) {
        const n = this.n;
        for (let i = 0; i <= n; i++) {
            const k = i / n;
            // (лишняя длина лежит змейкой в сторону — не копится в одной точке)
            const sx = Math.sin(k * Math.PI * 3) * 4 * (1 - Math.abs(2 * k - 1));
            const x = a.x + (h.x - a.x) * k + sx, z = a.z + (h.z - a.z) * k;
            const g = typeof ground === 'function' ? ground(x, z) : 0;
            const y = Math.max(g + 0.6, a.y + (h.y - a.y) * k);
            this.p[i * 3] = this.o[i * 3] = x; this.p[i * 3 + 1] = this.o[i * 3 + 1] = y; this.p[i * 3 + 2] = this.o[i * 3 + 2] = z;
        }
        this.ready = true;
    }
    /** Шаг физики: a — якорь, h — ушко кандалов на копыте; фиксированный шаг 1/60 с (одинаково везде). */
    step(dt, a, h, ground, iters = 14) {
        if (!this.ready) this.lay(a, h, ground);
        this._acc = Math.min(this._acc + dt, 0.1);
        const H = 1 / 60, P = this.p, O = this.o, n = this.n, L = this.pitch;
        let moved = 0, steps = 0;
        while (this._acc >= H) {
            this._acc -= H; steps++;
            for (let i = 1; i < n; i++) {
                const j = i * 3;
                for (let c = 0; c < 3; c++) {
                    const v = (P[j + c] - O[j + c]) * 0.985; // (воздух и тяжесть железа гасят качание)
                    O[j + c] = P[j + c];
                    P[j + c] += v + (c === 1 ? -9.8 * H * H : 0);
                }
            }
            P[0] = a.x; P[1] = a.y; P[2] = a.z;
            const e = n * 3;
            if (!this.free && h) { P[e] = h.x; P[e + 1] = h.y; P[e + 2] = h.z; }
            else { for (let c = 0; c < 3; c++) { const v = (P[e + c] - O[e + c]) * 0.985; O[e + c] = P[e + c]; P[e + c] += v + (c === 1 ? -9.8 * H * H : 0); } }
            for (let it = 0; it < iters; it++) {
                for (let i = 0; i < n; i++) {
                    const j = i * 3, k = j + 3;
                    const dx = P[k] - P[j], dy = P[k + 1] - P[j + 1], dz = P[k + 2] - P[j + 2];
                    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
                    if (d <= L) continue; // (цепь не держит сжатие — звенья складываются)
                    const f = (d - L) / d;
                    const wa = i === 0 ? 0 : 0.5, wb = i + 1 === n && !this.free ? 0 : 0.5, s = wa + wb || 1;
                    P[j] += dx * f * wa / s; P[j + 1] += dy * f * wa / s; P[j + 2] += dz * f * wa / s;
                    P[k] -= dx * f * wb / s; P[k + 1] -= dy * f * wb / s; P[k + 2] -= dz * f * wb / s;
                }
                // земля: звено толщиной ~0,6 м лежит на ней, волочится с трением
                if (ground) for (let i = 1; i < (this.free ? n + 1 : n); i++) {
                    const j = i * 3, g = (typeof ground === 'function' ? ground(P[j], P[j + 2]) : ground[i]) + 0.55; // (массив — земля под каждой точкой, взятая раз в кадр)
                    if (P[j + 1] < g) { P[j + 1] = g; O[j] += (P[j] - O[j]) * 0.35; O[j + 2] += (P[j + 2] - O[j + 2]) * 0.35; O[j + 1] = Math.min(O[j + 1], g); }
                }
            }
            for (let i = 1; i < n; i++) { const j = i * 3; const vx = P[j] - O[j], vy = P[j + 1] - O[j + 1], vz = P[j + 2] - O[j + 2]; moved += Math.sqrt(vx * vx + vy * vy + vz * vz); }
        }
        if (steps) this.speed = this.speed * 0.8 + 0.2 * (moved / steps / (n - 1)) / H;
        const hx = h ? h.x : P[n * 3], hy = h ? h.y : P[n * 3 + 1], hz = h ? h.z : P[n * 3 + 2];
        const dx = hx - a.x, dy = hy - a.y, dz = hz - a.z;
        this.taut = Math.max(0, Math.min(1, (Math.sqrt(dx * dx + dy * dy + dz * dz) / (n * L) - 0.7) / 0.3));
        return this;
    }
    /** Точка i (0 — якорь, n — копыто) → out {x, y, z}. */
    at(i, out) { const j = i * 3; out.x = this.p[j]; out.y = this.p[j + 1]; out.z = this.p[j + 2]; return out; }
}

// ------------------------------------------------------------------ ходы
/**
 * Ходы Дьяволоса (только дописывать в конец MOVE_IDS: номер идёт по сети в строке `dvl`).
 *   wind — замах (с), hit — миг удара от начала, dur — весь ход, rest — пауза после, reach — м (от середины тела)
 */
export const MOVES = {
    fist:  { wind: 1.5, hit: 1.75, dur: 3.4, rest: 2.5, reach: 52, dmg: 45, wave: 25, smashK: 3 },   // удар кулаком сверху: ударная волна 25 м
    stomp: { wind: 1.2, hit: 1.5, dur: 2.8, rest: 2.0, reach: 26, dmg: 999, wave: 18, smashK: 3 },  // топтание: под копытом — смерть
    grab:  { wind: 1.6, hit: 2.0, dur: 10.5, rest: 4.0, reach: 46, lift: 3.2, hold: 5, laugh: 7.4, crush: 9.4 }, // хват → подъём → держит (пальцы сжимаются) → хохот → раздавил (GRAB)
    clap:  { wind: 1.1, hit: 1.45, dur: 2.6, rest: 3.0, reach: 60, dmg: 22, cone: 0.6 },           // хлопок ладонями: волна огня конусом
    roar:  { wind: 0.6, hit: 1.0, dur: 3.2, rest: 3.0, reach: 200 },                                // рёв: пугает всех, тремор
    fire:  { wind: 1.6, hit: 1.6, dur: 5.6, rest: 6.0, reach: 115 },                                // струя: вдох 1,6 с + 4 с огня, потом 6 с пауза
    ball:  { wind: 1.3, hit: 1.3, dur: 2.2, rest: 1.6, reach: 220 },                                // шар огня из пасти
    rage:  { wind: 0, hit: 0.8, dur: 3.6, rest: 1.0, reach: 999, wave: 20, smashK: 1.5 },          // ярость у предела цепи: рывок, рёв, удары по земле
    kick:  { wind: 0.9, hit: 1.25, dur: 2.5, rest: 1.6, reach: 140, n: 5, dmg: 18, r: 6 },          // пинок камней: копыто подбрасывает глыбы к цели (дуга видна, шаг в сторону — промах)
};
export const MOVE_IDS = ['fist', 'stomp', 'grab', 'clap', 'roar', 'fire', 'ball', 'rage', 'kick']; // (только дописывать: индекс уходит по сети)

/**
 * Хват и раздавливание (слова автора: «если игрок достаточно близко — СХВАТИТЬ кистью, поднять, держать, через несколько секунд
 * ЗАСМЕЯТЬСЯ и РАЗДАВИТЬ — игрок умирает»). Замах виден 2 с (шаг в сторону — промах: в миг хвата цель должна быть у кисти).
 * Пока держат — не колдовать (только «стоп»); щиты, вихри, дары, устойчивость, мантия НЕ спасают. Спасение — честный шанс:
 * сильнейшее божественное («Инспириус», «Бум», «Тотальное разрушение Максима») по нему, пока он держит, — оторопь, и он
 * РОНЯЕТ жертву (урон от падения). Ход редкий (GRAB.CD) и медленный — его видно заранее.
 */
export const GRAB = {
    CD: 26,              // с между хватами (ярость сокращает — rageTempo)
    CATCH_R: 14,         // м от кисти в миг хвата: дальше — промах
    LIFT_H: 105,         // м — поднимает к морде (жертва перед глазами)
    FALL_DMG: 0.5,       // доля от урона падения: уронил — падение как с этой высоты (обычные правила падения)
    CREATIVE_DMG: 30,    // в Творческом смерти нет — выпускает с уроном
};
/** Кто/что может быть в его кулаке (жертвы). Сейчас хватает игроков; существа — та же лапа, когда цель — существо. */
export const GRAB_TARGETS = {
    player:   { grab: true, why: 'игрок: хватает, поднимает, держит, хохочет и раздавливает (Combat.die «devilCrush»); в Творческом — выпускает с уроном' },
    rider:    { grab: true, why: 'всадник (лошадь, дракон): хватает всадника — тот слетает с седла; дракон без всадника падает/улетает сам' },
    imperius: { grab: true, why: 'вселившийся «Империусом»: хват разрывает связь — разум возвращается в своё тело, которое он и держит' },
    humanoid: { grab: true, why: 'жители, волшебники, Тароны: та же лапа (раздавлен), когда цель — они' },
    animal:   { grab: true, why: 'звери: та же лапа' },
    dragon:   { grab: false, why: 'дракон велик для кисти — бьёт кулаком' },
    ghost:    { grab: false, why: 'призрака не схватить — у него нет тела' },
};
/** Фаза хвата по времени хода t: 'wind' | 'lift' | 'hold' | 'laugh' | 'crush' | 'done'. */
export function grabPhase(t) {
    const M = MOVES.grab;
    return t < M.hit ? 'wind' : t < M.lift ? 'lift' : t < M.laugh ? 'hold' : t < M.crush ? 'laugh' : t < M.dur ? 'crush' : 'done';
}

/**
 * Сильнейшее божественное (слова автора: «Дьяволоса МОЖНО ранить "Инспириусом" и "Бумом"… это не урон — сначала РАСТЕРЯН 2–4 с,
 * потом ЗЛИТСЯ: ярость нарастает с каждым попаданием, затухает за 60–90 с, и он АКТИВНЕЕ: чаще атакует, быстрее к ближним ходам,
 * чаще хватает, дольше струя, меньше пауз, злее у предела цепи»). «Тотальное разрушение Максима» — так же, но слабее.
 */
export const STUN = {
    S: [2, 4],           // с растерянности (вздрагивает, морщится, отшатывается, рёв боли — без атаки)
    RAGE_STEP: { Inspirius: 0.35, Boom: 0.35, TotalDestructionMaxima: 0.2 },
    RAGE_DECAY: 1 / 75,  // ярости в секунду (полная гаснет за 75 с)
};
/** Попало сильнейшее божественное? → {stun (с), rage (+)} или null. r — 0…1 (длительность оторопи). */
export function godStrike(spell, r = 0.5) {
    const k = STUN.RAGE_STEP[spell];
    if (!k) return null;
    return { stun: (STUN.S[0] + (STUN.S[1] - STUN.S[0]) * r) * (k < 0.3 ? 0.7 : 1), rage: k };
}
/** Темп по ярости 0…1: паузы короче, кулдауны короче, струя дольше, хват чаще. */
export function rageTempo(rage) {
    const r = Math.max(0, Math.min(1, rage || 0));
    return { rest: 1 - 0.55 * r, cd: 1 - 0.5 * r, fireTime: 1 + 0.6 * r, grabCd: 1 - 0.6 * r, near: 1 + 0.4 * r };
}

/**
 * Смерть (слова автора: убить можно ТОЛЬКО божественным мечом — пронзить в руке или вонзить залпом «Левиоса Максима Атак»;
 * «место попадания начинает СВЕТИТЬСЯ, он УДИВЛЁН — и начинает светиться, его РАЗЪЕДАЕТ, как рана… трещины света — и он умирает»).
 * Фазы (с от пронзания): shock — оторопь, взгляд на рану; agony — трещины света разбегаются, держится за рану, рёв, бьёт землю,
 * цепь трескается и осыпается, беспорядочный огонь; fall — светится изнутри, осыпается золой, падает на колени, рога трескаются,
 * хрип; ash — вспышка, распадается на светящийся пепел столбом вверх, земля содрогается; потом тишина и СУНДУКИ из пепла.
 */
export const DEATH = {
    T: 20,
    PHASES: [['shock', 0], ['agony', 1], ['fall', 6], ['ash', 14], ['gone', 20]],
    CHESTS: 4,            // сундуков босса из пепла (3–5 по правилу)
    CHEST_R: 14,          // м — кругом у места смерти
    ACH: 'devilSlayer',
};
export function deathPhase(t) {
    let p = 'shock';
    for (const [id, t0] of DEATH.PHASES) if (t >= t0) p = id;
    return p;
}
/** Чем пронзили: только божественный клинок убивает (DivineSword.isDivine). via: 'hand' | 'swarm'. */
export const pierceKills = (via, divine = true) => !!divine && (via === 'hand' || via === 'swarm');

/** Струя огня: ×5 к дракону силы 1 (DragonKinds: 14 + 9 = 23 м; конус 0,7 + 0,17·путь). */
export const FIRE = {
    DRAGON_LEN: 23, K: 5,
    get LEN() { return this.DRAGON_LEN * this.K; }, // 115 м
    R0: 0.7 * 5,            // 3,5 м у пасти
    SLOPE: 0.17,            // тот же угол, что у дракона → у конца 23 м (×5)
    TIME: 4,                // с огня
    ARC: 0.45,              // рад — дуга, которой ведёт струю (±)
    PLAYER: 9,              // HP за касание (раз в TICK)
    TICK: 0.4,
    SHIELD_K: 2,            // щит держит, но ману тратит вдвое быстрее (огонь «давит»)
};
/** Внутри струи? (o — пасть, d — ед. направление, p — точка, bodyR — радиус тела). Как Dragons.inFlame, только ×5. */
export function inDevilFire(o, d, p, bodyR = 0.5, len = FIRE.LEN) {
    const px = p.x - o.x, py = p.y - o.y, pz = p.z - o.z;
    const along = px * d.x + py * d.y + pz * d.z;
    if (along < -bodyR || along > len + bodyR) return false;
    const qx = px - d.x * along, qy = py - d.y * along, qz = pz - d.z * along;
    return Math.sqrt(qx * qx + qy * qy + qz * qz) < FIRE.R0 + Math.max(0, along) * FIRE.SLOPE + bodyR;
}

/** Шар огня: виден замах, свечение, след (как снаряды Королевы — QueenBolts), летит медленно: увернуться можно. */
export const BALL = {
    R: 3,                   // м — диаметр 6 м
    SPEED: [28, 38],        // м/с
    GRAVITY: 2.5,           // м/с² — тяжёлый, чуть проседает (видно дугу)
    LIFE: 9,                // с — дальше гаснет
    BLAST_R: 14,            // м — взрыв
    DMG: 25,                // без щита: −25 и поджог
    MAX: 6,                 // в воздухе одновременно (не больше)
};
/** Скорость шара к цели на расстоянии d (ближе — медленнее и выше видна дуга). */
export const ballSpeed = (d) => BALL.SPEED[0] + (BALL.SPEED[1] - BALL.SPEED[0]) * Math.max(0, Math.min(1, (d - 30) / 150));
/** Урон взрыва шара на расстоянии d от центра (край — ноль). */
export const ballDamage = (d) => (d >= BALL.BLAST_R ? 0 : Math.round(BALL.DMG * (1 - 0.6 * (d / BALL.BLAST_R))));

/**
 * Шар в игрока со щитом: что будет (слова автора: «тебе ничего не будет, но сама защита сломается»).
 *   shield: 'protection' | 'maxima' | 'gods' | 'vortex' (заслон «Ground Vortex») | 'swarm' (щит из вещей) | 'hand' (щит в руке) | null
 *   armor: на нём магическая мантия/доспехи
 * → {breaks, dmg, ignite, wear (списать прочность мантии), why}
 */
export function ballVerdict({ shield = null, armor = false, d = 0 } = {}) {
    if (shield === 'gods') return { breaks: false, dmg: 0, ignite: false, wear: 0, why: 'золотую защиту богов шар не ломает: боги сильнее того, кого заточили' };
    if (shield === 'protection' || shield === 'maxima' || shield === 'vortex' || shield === 'swarm')
        return { breaks: true, dmg: 0, ignite: false, wear: 0, why: 'шар сломал защиту — вас не задело; поднимите руки и скажите заклинание снова' };
    if (shield === 'hand') return { breaks: true, dmg: Math.round(ballDamage(d) * 0.4), ignite: false, wear: 0, why: 'шар выбил щит из руки' };
    const dmg = ballDamage(d);
    return { breaks: false, dmg, ignite: dmg > 0, wear: armor ? dmg : 0, why: armor ? 'мантия не защищает от адского огня — прочность сгорела' : '' };
}

/**
 * Выбор хода (хост, раз в «мысль»). s: {dist (м до цели, по земле), beyond (цель за пределом цепи), atLeash (тело у предела),
 * faced (повёрнут к цели), rest (с до готовности), fireCd, ballCd, grabCd, roarCd, rageCd, air (цель высоко над землёй)}
 * → id хода | 'walk' | 'turn' | null
 */
/**
 * Режиссёр боя (жалоба автора: «он просто метает шары, одно и то же… должен ХОДИТЬ, проявлять себя больше и разнообразнее»).
 * Вес каждого хода — по расстоянию (ближе — ближние, дальше — ходьба к пределу цепи, шары, струя), по тому, что он уже делал
 * (тот же ход больше 2 раз подряд — никогда, недавний — реже), по доле ходьбы (меньше 30 % — ходит чаще), цель в воздухе
 * (копыто и пинок не достают), за цепью (только дальнее, рёв, ярость), спрятался (идёт к месту, где видел, и заглядывает).
 * Между ударами — поступки характера (оглядывается, чешет рог, тянет цепь, бьёт в грудь…) и блеф (рёв без атаки).
 * s: {dist, beyond, atLeash, faced, rest, cd: {id: с}, air, high, hidden, recent: [id новые первыми], walkShare 0…1, fury, rage}
 * → {kind: 'move'|'walk'|'act'|'turn'|'wait', id?, t? (с ходьбы), bluff?, peek?}
 */
export const DIRECTOR = {
    SAME_MAX: 2,          // один ход подряд не больше 2 раз
    RECENT_K: 0.45,       // ход из последних трёх — вес ×0,45
    WALK_SHARE: 0.3,      // ходьбы меньше 30 % — ходьба ×3
    WALK_T: [2.2, 5],     // с — один заход ходьбы
    CLOSE: 30, MID: 62,   // м — полосы расстояния (от середины тела до цели)
    ACT_W: 0.55,          // вес поступка характера между ударами
    BLUFF_W: 0.35,        // вес рёва-блефа
    BATTLE_ACTS: ['lookAround', 'scratchHorn', 'chainPull', 'chestBeat', 'knuckleCrack', 'headShake', 'tongueTaunt', 'sighSit', 'stretch'],
};
const BANDS = { // вес хода по полосе: близко / средне / далеко (дальше FIRE.LEN — только то, что долетает)
    stomp: [3, 0, 0], grab: [2, 1.6, 0], fist: [2.2, 2.4, 0], clap: [1.2, 2, 0], kick: [1.4, 2, 1.6],
    ball: [0.4, 1, 1.8], fire: [0.3, 1.2, 2.4], roar: [0.4, 0.6, 0.8], rage: [0.2, 0.2, 0.2],
};
const ACT_CD = { fire: 'fire', ball: 'ball', grab: 'grab', clap: 'clap', roar: 'roar', rage: 'rage', kick: 'kick' };
export function planMove(s, rnd = Math.random) {
    if (s.hidden && !s.beyond) return { kind: 'walk', t: DIRECTOR.WALK_T[1], peek: true }; // (за скалой: подходит и заглядывает)
    if (!s.faced) return { kind: 'turn' }; // (лицом к цели: не плюёт и не бьёт, пока не развернулся — кружат вокруг, он поворачивается)
    const d = s.dist, recent = s.recent || [], cd = s.cd || {};
    if (s.rest > 0) return !s.beyond && d > DIRECTOR.CLOSE ? { kind: 'walk', t: s.rest } : { kind: 'wait' }; // (переводит дух — идёт ближе)
    const band = d <= DIRECTOR.CLOSE ? 0 : d <= DIRECTOR.MID ? 1 : 2;
    const hits = recent.filter((x) => MOVES[x]); // (только удары: ходьба и поступки между ними не «разбавляют» повтор)
    const W = [];
    for (const id in BANDS) {
        const M = MOVES[id];
        let w = BANDS[id][band];
        if (id === 'rage') w = s.atLeash && s.beyond ? 3 : (s.fury || 0) > 0.6 || (s.rage || 0) > 0.3 ? 0.9 : w; // (у предела цепи; в ярости бьёт по земле)
        if (id === 'roar') w += s.beyond ? 0.8 : 0;
        if (w <= 0 || d > M.reach || (cd[ACT_CD[id]] ?? 0) > 0) continue;
        if (s.air && (id === 'stomp' || id === 'kick' || id === 'fist')) continue; // (в воздухе копыто и кулак по земле не достают)
        if (s.high && id === 'grab') continue; // (выше руки)
        if (hits[0] === id && hits[1] === id) continue; // (не больше 2 раз подряд)
        if (hits.slice(0, 3).includes(id)) w *= DIRECTOR.RECENT_K;
        W.push(['move', id, w]);
    }
    if (!s.beyond && d > DIRECTOR.CLOSE * 0.8) {
        let w = band === 2 ? 2.4 : 1.4;
        if ((s.walkShare ?? 1) < DIRECTOR.WALK_SHARE) w *= 3;
        if (recent[0] === 'walk' && recent[1] === 'walk') w *= 0.3;
        W.push(['walk', null, w]);
    }
    if (recent[0] !== 'act') W.push(['act', null, DIRECTOR.ACT_W * (s.beyond ? 1.6 : 1)]);
    if (recent[0] !== 'bluff' && (cd.roar ?? 0) <= 0) W.push(['bluff', 'roar', DIRECTOR.BLUFF_W]);
    let sum = 0;
    for (const w of W) sum += w[2];
    if (sum <= 0) return { kind: 'wait' };
    let r = rnd() * sum;
    let pick = W[W.length - 1];
    for (const w of W) { r -= w[2]; if (r <= 0) { pick = w; break; } }
    if (pick[0] === 'walk') return { kind: 'walk', t: DIRECTOR.WALK_T[0] + rnd() * (DIRECTOR.WALK_T[1] - DIRECTOR.WALK_T[0]) };
    if (pick[0] === 'act') { const L = DIRECTOR.BATTLE_ACTS.filter((a) => a !== s.lastAct); return { kind: 'act', id: L[Math.floor(rnd() * L.length) % L.length] }; }
    if (pick[0] === 'bluff') return { kind: 'move', id: 'roar', bluff: true };
    return { kind: 'move', id: pick[1] };
}

/** (прежний строгий выбор — для сравнения; игра берёт planMove) */
export function chooseMove(s) {
    if (s.rest > 0) return null;
    if (!s.faced) return 'turn'; // (лицом к цели: не плюёт и не бьёт, пока не развернулся)
    const d = s.dist;
    if (s.atLeash && s.beyond && (s.rageCd ?? 0) <= 0) return 'rage';
    if (d <= MOVES.stomp.reach && !s.air) return 'stomp';
    if (d <= MOVES.grab.reach && (s.grabCd ?? 0) <= 0 && !s.air) return 'grab';
    if (d <= MOVES.fist.reach) return 'fist';
    if (d <= MOVES.clap.reach && (s.clapCd ?? 0) <= 0) return 'clap';
    if (d <= 60) return (s.ballCd ?? 0) <= 0 ? 'ball' : s.beyond ? null : 'walk';
    if (!s.beyond && d > 60 && (s.walkFirst ?? true) && (s.fireCd ?? 0) > 0) return 'walk';
    if (d <= FIRE.LEN && (s.fireCd ?? 0) <= 0) return 'fire';
    if ((s.ballCd ?? 0) <= 0) return 'ball';
    if ((s.roarCd ?? 0) <= 0 && s.beyond) return 'roar';
    return s.beyond ? null : 'walk';
}

// ------------------------------------------------------------------ бессмертие: кто/что на него действует
/**
 * Таблица «заклинание/удар → что с Дьяволосом». Убить нельзя НИЧЕМ, кроме божественного меча (DEATH, pierce; здоровья нет: урон только злит; сильный удар
 * на миг сбивает дыхание — `stagger`). Каждое «не действует» — с причиной (журнал «Дьяволос: <заклинание> — причина»).
 */
const DARK = new Set(['AvadaKedavra', 'Die', 'Imperius', 'ImperiusMaxima', 'Brainrot', 'BrainrotMaxima', 'Hellfire', 'Nihilis', 'Pentagranium', 'MonsterForm', 'Sands']);
const FIREK = new Set(['Inferno', 'Fire', 'FireMaxima', 'Hellfire', 'dragonFire', 'Burning', 'LightningStrike', 'Cauldron']);
const COLD = new Set(['Ice', 'Frozen', 'IceMaxima', 'IceCastle', 'IceBridge', 'Snowman', 'IceRod', 'QueenFreeze']);
const PUSH = new Set(['Wind', 'WindMaxima', 'WindImpulse', 'WindImpulseMaxima', 'Jolt', 'JoltMaxima', 'Levitation', 'LevitationMaxima', 'LevitationSuperMaxima', 'Accio', 'Gather', 'Earthquake', 'EarthquakeMaxima', 'Stand', 'Groundprud', 'GroundVortex', 'Drawdown', 'DrawdownMaxima', 'Stitching', 'WallRise', 'WallRiseMaxima']);
const BLAST = new Set(['Bombardo', 'BombardoMaxima', 'TotalDestruction', 'TotalDestructionMaxima', 'Boom', 'Inspirius', 'CircleAttack', 'CircleAttackMaxima', 'Thunderwave', 'Cannon', 'Pilbidrio', 'Accentric', 'Electrum', 'crush', 'DevilBall']);
const WATER = new Set(['Waterball', 'WaterForming', 'WaterVortex', 'WaterVortexSuperMaxima', 'WaveAttack', 'WaveAttackMaxima', 'LetItRain', 'Liquidation', 'LiquidationMaxima', 'LiquidationDuel', 'LiquidationMaximaDuel', 'PlanetLiquidation', 'Firefighting', 'FirefightingMaxima']);
const CONTROL = new Set(['Stupefy', 'Expelliarmus', 'Disarmor', 'Alive', 'AliveMaxima', 'Overgrown', 'OvergrownMaxima', 'Sapira', 'Alohomora', 'AlohomoraMaxima', 'Lock', 'Reveal', 'Invisibility', 'ToTheSun', 'Rescue']);
const WEAPON = new Set(['melee', 'fist', 'arrow', 'punch', 'sword', 'axe', 'spear']);
/** Божественные (Mana.GOD_SPELLS + ProtectionGods): ломают любую защиту боссов — но Дьяволос не умирает, его заточили, а не убили. */
const GODS = new Set(['Boom', 'Inspirius', 'CreatePlanet', 'EnlargePlanet', 'TerraformPlanet', 'PlanetLiquidation', 'ProtectionGods', 'ProtectionGodsMaxima', 'FlyingMaxima', 'TotalDestructionMaxima']);
/** Не направлены на существо (свет, щиты, стройка, полёт…): ни урона, ни обиды. */
const SELF = /^(Lumos|LumosMaxima|Nox|LumosAhead|LumosFollowing|Protection|ProtectionMaxima|ProtectionGods|ProtectionGodsMaxima|ProtectionHouse|ProtectionInvisible|ProtectionHouseGrant|Flight|FlyingMaxima|Create|Build|Improve|Strengthen|Change|Suit|Unfurl|Furl|Up|Pause|Attack|Maxima|Stop|Draw|Fireworks|Air|Breakthrough|GiveMyPower|DivineCreation|WardDispel|MonsterBack|Visible|Ground(Shield)?$|Enlarge|Terraform|IceBridge)/;

export const DEVIL_VS = {
    death:   'он создал заклинания смерти и чёрную магию — у него иммунитет («Дай», «Авада» его не берут)',
    dark:    'он сам создал это заклинание (вся чёрная магия — его) — у него иммунитет',
    fire:    'огнеупорен: он и есть адский огонь',
    cold:    'лёд тает и шипит на раскалённой коже',
    push:    'слишком велик и тяжёл: не сдвинуть, не поднять, не притянуть',
    blast:   'взрыв ломает камень вокруг, а его только злит',
    water:   'вода шипит и уходит паром с раскалённой кожи',
    control: 'не действует: древний бог, его разум и тело не подчиняются',
    weapon:  'оружие только царапает толстую шкуру — убить его нельзя',
    gods:    'даже заклинания богов его не убивают: боги не убили его — заточили',
    stun:    'сильнейшее божественное ранит его гордость: растерян 2–4 с, потом ярость растёт — но не убивает',
    divine:  'божественный клинок — единственное, что его убивает (пронзить: в руке или вонзить залпом)',
    self:    'не направлено на него',
    other:   'не действует: Дьяволос бессмертен',
};

/**
 * Что делает заклинание/удар `spell` с Дьяволосом. → {acts: false (никогда), cat, why, anger, stagger (с)}
 * anger — злит (и будит); stagger — на миг сбивает дыхание (сильный удар), но не останавливает надолго.
 */
export function devilVerdict(spell) {
    const s = String(spell || '');
    let cat = 'other';
    if (STUN.RAGE_STEP[s]) cat = 'stun';
    else if (s === 'AvadaKedavra' || s === 'Die' || s === 'Sands' || s === 'Nihilis') cat = 'death';
    else if (DARK.has(s)) cat = 'dark';
    else if ((GODS.has(s) || isDivine(s)) && !SELF.test(s)) cat = 'gods';
    else if (FIREK.has(s)) cat = 'fire';
    else if (COLD.has(s)) cat = 'cold';
    else if (BLAST.has(s)) cat = 'blast';
    else if (WATER.has(s)) cat = 'water';
    else if (PUSH.has(s)) cat = 'push';
    else if (WEAPON.has(s)) cat = 'weapon';
    else if (CONTROL.has(s)) cat = 'control';
    else if (SELF.test(s)) cat = 'self';
    const anger = cat !== 'self';
    const stagger = cat === 'stun' ? 0 : cat === 'gods' ? 1.2 : cat === 'blast' && /Maxima|Boom|Inspirius/.test(s) ? 0.8 : cat === 'blast' ? 0.3 : 0;
    return { acts: false, cat, why: DEVIL_VS[cat], anger, stagger };
}

/** Здоровье Дьяволоса никогда не падает: «урон» только копит ярость (0…1) — больше злости, чаще огонь. */
export const furyAfter = (fury, dmg) => Math.min(1, (fury || 0) + Math.min(0.25, Math.max(0, dmg) / 400));

// ------------------------------------------------------------------ состояния и сеть
/** Состояния (номер — в строке сети `dvl`; только дописывать). */
export const STATES = ['sleep', 'wake', 'stand', 'walk', 'act', 'strain', 'back', 'sit', 'stun', 'dying', 'dead'];

/** После скольких секунд покоя засыпает (детерминированно по зерну). */
export const sleepDelay = (seed) => DEVIL.SLEEP_AFTER[0] + (DEVIL.SLEEP_AFTER[1] - DEVIL.SLEEP_AFTER[0]) * (((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1);

/** Поворот к цели: разница углов (рад, со знаком). Повёрнут ли достаточно для хода. */
export function yawTo(yaw, fx, fz, tx, tz) {
    const want = Math.atan2(-(tx - fx), -(tz - fz)); // (модель смотрит в −Z, как герой)
    let d = want - yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
}
export const FACE_OK = 0.32; // рад — достаточно лицом к цели (ход «лицом к цели»)

/** Место из плана ада (контракт HellMap.hellPlan: devilSeat {x,z,r}, chainAnchor {x,y,z}, chainLen) → проверенное. */
export function seatFrom(plan) {
    const s = plan?.devilSeat, a = plan?.chainAnchor;
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.z)) return null;
    const r = Math.max(+s.r || 0, 0);
    const len = Math.max(30, Math.min(+plan.chainLen || DEVIL.CHAIN_LEN, 200));
    const anchor = a && Number.isFinite(a.x) && Number.isFinite(a.z) ? { x: a.x, y: Number.isFinite(a.y) ? a.y : null, z: a.z } : { x: s.x, y: null, z: s.z + 30 };
    let x = s.x, z = s.z;
    // столб цепи в середине котловины (HellMap: chainAnchor = середина devilSeat) — сидит в SEAT_OFF м от него, лицом к дороге от места прибытия
    if (Math.hypot(anchor.x - x, anchor.z - z) < DEVIL.SEAT_OFF * 0.5) {
        const sp = plan.spawn, dx = sp ? sp.x - anchor.x : 0, dz = sp ? sp.z - anchor.z : -1, d = Math.hypot(dx, dz) || 1;
        x = anchor.x + dx / d * DEVIL.SEAT_OFF; z = anchor.z + dz / d * DEVIL.SEAT_OFF;
    }
    return { x, z, r, y: Number.isFinite(s.y) ? s.y : null, cx: s.x, cz: s.z, anchor, len, small: r > 0 && r < DEVIL.SEAT_MIN_R };
}
