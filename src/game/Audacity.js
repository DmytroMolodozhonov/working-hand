/**
 * Audacity.js — «наглость» игрока в поселении: чем больше он грабит, убивает и поджигает на глазах у жителей, тем решительнее
 * они действуют ВМЕСТЕ (pure logic: no three.js, no game — AudacityLife.js runs it; tests/unit/audacity.test.js).
 *
 * Слова автора: «В поселениях жители, если быть сильно наглым — грабить и убивать, — должны атаковать совместно (всей толпой),
 * а те, кто боится, — убегать из деревни».
 *
 * One hidden number per (place, player), 0…100, never shown (the journal «решение:» tells of it):
 *   - grows with deeds that SOMEBODY SAW (no witness — no points): a robbery, a killing, a fire among the houses, wreckage,
 *     a blow (a lone blow is little: «одного случайного удара мало»; the 2nd, 3rd victim in two minutes weigh more);
 *   - falls with time (after CALM_S without a new deed) — only while the place is awake;
 *   - phases (with a hysteresis, so that the crowd does not flicker): calm → wary (they mutter, look askance) → fear
 *     (the timid leave the village) → mob (those who can fight gather and fall on him together).
 *
 * «На кого и на что» (CLAUDE.md): ROLE_MOB — who fights in a crowd and with what, who runs; NO_REASON — who is never touched.
 * Knights, the guard, the king and the wizards work by their old rules (CastleLife, WizardLife) and the crowd joins them.
 */

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = (x) => Math.round(x * 10) / 10;

export const AUD = {
    MAX: 100,
    WARY: 18, // от этого — косятся, шепчутся
    FEAR: 35, // от этого — слабые и робкие уходят из деревни
    MOB: 60, // от этого — те, кто может драться, собираются и нападают вместе
    MOB_KEEP: 38, // толпа держится, пока наглость не упала ниже этого (гистерезис)
    CALM: 20, // ниже этого — страх прошёл: вернувшиеся идут домой
    CALM_S: 30, // с без новых поступков — потом наглость спадает
    DECAY: 1 / 4, // очков в секунду (60 → 20 за ~160 с)
    WITNESS_R: 25, // м: видят поступок
    AWARE_R: 90, // м: узнают о толпе / набате сразу (дальше — по набату, ниже)
    MULTI_T: 120, // с: «нападение на нескольких» — разные жертвы за это время
    MULTI_PER: 4, // очков за каждую следующую жертву (вторая, третья…)
    MULTI_CAP: 16,
};

/** Очки за поступок (`n` — число жертв/блоков/предметов, где это важно). */
export const DEEDS = {
    hurt: 6, // ударил жителя: одного случайного удара мало
    slay: 35, // убил жителя
    rob: 25, // взял чужое из дома/сундука/с прилавка
    arson: 28, // поджёг среди домов
    wreck: 0.5, // за блок (потолок WRECK_CAP за раз)
};
export const WRECK_CAP = 25;
/** Свидетели убитого главы (король/глава башни) — не наглость жителей, а война замка (Wanted/CastleLife); очки не даём. */
export const NO_POINTS_ROLES = new Set(['king']);

/** Новая пустая запись. */
export const blank = () => ({ v: 0, quiet: 0, victims: {}, phase: 'calm' });

/** Число 0…100 из записи. */
export const valueOf = (rec) => clamp(Number(rec && rec.v) || 0, 0, AUD.MAX);

/**
 * Поступок. `witnesses` — сколько живых людей его видели и знали, кто это (0 → без очков).
 * `victimId` — кого ударили/убили (для «нескольких»), `now` — с игрового времени (для окна MULTI_T).
 * → { rec, add } — новая запись (rec меняется на месте и возвращается) и сколько добавилось.
 */
export function deed(rec, kind, { witnesses = 0, n = 1, victimId = null, now = 0 } = {}) {
    rec = rec || blank();
    if (!(witnesses > 0)) return { rec, add: 0 };
    let add = (DEEDS[kind] || 0) * (kind === 'wreck' ? Math.max(0, n) : 1);
    if (kind === 'wreck') add = Math.min(add, WRECK_CAP);
    if ((kind === 'hurt' || kind === 'slay') && victimId != null) {
        const fresh = Object.keys(rec.victims).filter((k) => now - rec.victims[k] < AUD.MULTI_T);
        if (fresh.length && !fresh.includes(String(victimId))) add += Math.min(AUD.MULTI_CAP, AUD.MULTI_PER * fresh.length);
        rec.victims[victimId] = now;
        for (const k of Object.keys(rec.victims)) if (now - rec.victims[k] > AUD.MULTI_T * 2) delete rec.victims[k]; // (не копится)
    }
    // (больше свидетелей — чуть сильнее: толпа глазеющих злит больше, но не втрое)
    add *= 1 + Math.min(0.3, (witnesses - 1) * 0.06);
    if (!(add > 0)) return { rec, add: 0 };
    rec.v = r1(clamp(valueOf(rec) + add, 0, AUD.MAX));
    rec.quiet = 0;
    return { rec, add: r1(add) };
}

/** Время идёт (только пока место проснулось): спадает после CALM_S без новых поступков. */
export function ease(rec, dt) {
    if (!rec) return rec;
    rec.quiet = (rec.quiet || 0) + dt;
    const over = rec.quiet - AUD.CALM_S; // (сколько секунд из этого шага уже «после тишины»)
    if (over > 0 && rec.v > 0) rec.v = r1(clamp(rec.v - Math.min(dt, over) * AUD.DECAY, 0, AUD.MAX));
    return rec;
}

/** Фаза по числу, с гистерезисом: `prev` — прошлая фаза. */
export function phaseOf(v, prev = 'calm') {
    if (v >= AUD.MOB || (prev === 'mob' && v >= AUD.MOB_KEEP)) return 'mob';
    if (v >= AUD.FEAR || (prev === 'fear' && v >= AUD.CALM)) return 'fear';
    if (v >= AUD.WARY || (prev === 'wary' && v >= AUD.WARY * 0.6)) return 'wary';
    return 'calm';
}

export const PHASE_NAME = { calm: 'спокойно', wary: 'косятся', fear: 'боятся', mob: 'толпа' };

// ------------------------------------------------------------------------------------------------ кто что делает
/**
 * Роль → поведение в толпе. `brave` — порог храбрости (0…1, из семени человека), `weapon` — чем бьёт.
 * 'rules' — работают по прежним правилам замка (рыцари, стража, король, визирь, волшебники): к толпе присоединяются.
 * Остальные: сильные и смелые — бьют вместе; слабые, дети, старики, женщины, раненые, торговцы с товаром — бегут из деревни.
 */
export const ROLE_MOB = {
    farmer: { fights: true, brave: 0.3, why: 'вилы или мотыга' },
    builder: { fights: true, brave: 0.25, why: 'молот' },
    merchant: { fights: true, brave: 0.55, why: 'торговец покрепче: кухонный нож, молот кузнеца, кулаки; у прилавка с товаром — бежит' },
    seller: { fights: true, brave: 0.6, why: 'продавец: как торговец, но у прилавка с товаром — бежит' },
    knight: { rules: true, why: 'рыцарь: прежние правила замка, идёт первым — ориентир толпы' },
    king: { rules: true, why: 'король: прежние правила (KingNerve), в толпу не идёт' },
    advisor: { rules: true, why: 'визирь: не воюет, предупреждает короля' },
    wizard: { rules: true, why: 'волшебники — WizardLife (свои правила, пентаграммы)' },
};

/** Кому наглость игрока не касается ВООБЩЕ (нет причины нападать — как «дракон не нападает без причины»). */
export const NO_REASON = [
    'игрок — хозяин места (король): его дела — «недовольство» (Rebellion.js)',
    'друг короля (Ranks.isForgiven): проступки прощены',
    'дуэльный режим / законный бой на арене: ArenaDuels.peace()',
    'никто не видел поступка (невидимый, стена, ночь): нет очков',
    'житель спит, связан приказом, в плену Империуса, в руках Левиосы',
];

/** Человек с этими приметами не дерётся (бежит): женщина-хранительница, ребёнок, старик, слабый, раненый, торговец у товара. */
export function fightsInMob(p) {
    const R = ROLE_MOB[p.role];
    if (!R || R.rules) return false;
    if (!R.fights) return false;
    if (p.weak || p.elder || p.child || p.kid) return false;
    if (p.hpFrac != null && p.hpFrac < 0.6) return false; // (раненый не лезет)
    if (p.atStall) return false; // (товар не бросают)
    if (p.trade === 'priest') return false; // (священник не дерётся: уводит людей — бежит со всеми)
    // «мужчины-крестьяне, строители»: женщина с вилами — не по умолчанию; торговец-женщина — нет
    if (p.female && !(p.role === 'builder' && p.brave >= 0.8) && !(p.role === 'farmer' && p.brave >= 0.85)) return false;
    return (p.brave ?? 0.5) >= R.brave;
}

/**
 * Не боец (не «по правилам») — пугается. Король/визирь/рыцари/волшебники — по своим правилам.
 * Слова автора: слабые бегут В СВОЙ ДОМ и запираются (HomeDefence.js), а не из деревни.
 */
export function shelters(p) {
    const R = ROLE_MOB[p.role];
    if (!R || R.rules) return false;
    return !fightsInMob(p);
}

/**
 * Уходит из деревни: не боец И дома для него нет (нет своего/сгорел/разрушен — `home: false`). Без сведений о доме (`home` не задан) —
 * как раньше: не боец. С домом (`home: true`) — не уходит, а бежит домой.
 */
export function leavesVillage(p, home) {
    if (home === true) return false;
    return shelters(p);
}

/** Чем бьёт: 'pitchfork' | 'hoe' | 'hammer' | 'knife' | 'none' (кулаки). По месту работы человека. */
export function weaponFor(p) {
    const t = p.trade || null;
    if (t === 'smith') return 'hammer';
    if (t === 'baker' || t === 'innkeeper' || t === 'herbalist' || t === 'miller') return 'knife';
    if (t === 'stableman') return 'pitchfork';
    if (t === 'keeper') return 'hoe';
    if (p.role === 'builder') return 'hammer';
    if (p.role === 'farmer') return p.tool === 'hoe' ? 'hoe' : 'pitchfork';
    if (p.role === 'merchant' || p.role === 'seller') return 'knife';
    return 'none';
}

/** Код оружия в битах `fx` жителя (для гостей): (fx >> 2) & 7. 0 — ничего своего. */
export const MOB_TOOLS = ['', 'pitchfork', 'hoe', 'hammer', 'knife', 'none', 'axe'];
export const FX_MOB_SHIFT = 2, FX_MOB_MASK = 7 << 2;
export const toolCode = (tool) => Math.max(0, MOB_TOOLS.indexOf(tool));
export const withTool = (fx, tool) => ((fx | 0) & ~FX_MOB_MASK) | (toolCode(tool) << FX_MOB_SHIFT);
export const toolOf = (fx) => MOB_TOOLS[((fx | 0) >> FX_MOB_SHIFT) & 7] || '';

// ------------------------------------------------------------------------------------------------ сбор толпы
export const MOB = {
    R: 75, // м от игрока: кто слышит клич
    MAX: 14, // не больше в одной толпе (остальные — глазеют издали / бегут)
    MIN: 2, // меньше двоих не «толпа»: один — не лезет (кроме рыцарей)
    STAND: 11, // м от цели: место сбора (вне досягаемости клинка)
    SLOT: 2.4, // м между сборщиками (тела не налезают)
    GO_FRAC: 0.6, // атака, когда подошла эта доля от собравшихся
    GO_WAIT: 7, // с: дольше не ждут
    GO_NEAR: 8, // м: игрок подошёл так близко к сборщикам — бьют сразу
    TIDE: 14, // с: толпа не растёт сама после старта (потом по 2 с «подтягиваются» опоздавшие)
    FOE_S: 25, // с: «враждебность» к игроку, пока толпа жива (обновляется)
    STYLE: { front: 5, spread: true, close: false }, // как стоят вокруг цели в бою: до 5 одновременно со всех сторон (CastleLife._fight)
};

/** Лидер толпы: рыцарь, если есть, иначе самый смелый боец. members: [{id, role, brave, d}] */
export function pickLeader(members) {
    let best = null, bs = -Infinity;
    for (const m of members) {
        const s = (m.role === 'knight' ? 10 : 0) + (m.brave ?? 0.5) * 2 - m.d * 0.01;
        if (s > bs) { bs = s; best = m; }
    }
    return best;
}

/**
 * Место сбора k-го из n: на стороне лидера от цели, на расстоянии STAND, дугой; лидер — в середине.
 * → {x, z}. `leader`, `target`: {x, z}. Слоты на дуге разведены на SLOT метров (тела не накладываются).
 */
export function musterSpot(leader, target, k, n) {
    const dx = leader.x - target.x, dz = leader.z - target.z, d = Math.hypot(dx, dz) || 1;
    const base = Math.atan2(dz, dx);
    const R = Math.max(MOB.STAND, Math.min(d, MOB.STAND + 3));
    const step = MOB.SLOT / R; // радиан между слотами
    const off = (k - (n - 1) / 2) * step;
    return { x: target.x + Math.cos(base + off) * R, z: target.z + Math.sin(base + off) * R };
}

/** Пора ли бить: `ready` — сколько уже на месте, `total` — сколько собралось, `t` — с с клича, `nearest` — ближайший к игроку из них. */
export function goNow({ ready, total, t, nearest = Infinity }) {
    if (total <= 0) return false;
    if (nearest < MOB.GO_NEAR) return true;
    if (t >= MOB.GO_WAIT) return true;
    return ready >= Math.max(1, Math.ceil(total * MOB.GO_FRAC)) && total >= MOB.MIN;
}

// ------------------------------------------------------------------------------------------------ бегущие из деревни
export const EXODUS = {
    OUT: 24, // м за границей земли (def.zone)
    RING: 3, // м между убежищами (не кучей)
    WAIT_MAX: 150, // с: сидит за границей не дольше (если игрока нет рядом)
    HARD_MAX: 300, // с: совсем предел
    NEAR_KEEP: 40, // м: пока игрок ближе, не возвращается
    NBR_R: 900, // м: соседнее поселение, в сторону которого бегут (если не навстречу игроку)
    ELDER: 0.55, // скорость стариков
    STUCK_S: 3, // с на месте — «иду» не получается: прячется там, где стоит
};

/**
 * Куда бежать: точка за границей земли поселения (def.x/z, def.zone — квадрат), в стороне ОТ игрока, а если рядом
 * (в пределах ±60°) соседнее поселение — к нему. `k` — номер бегущего (разводим дугой, чтобы не кучей).
 * Никогда — мимо игрока: точка, лежащая ближе к игроку, чем сама деревня, отбрасывается.
 */
export function refugeSpot(def, player, neighbor, k = 0) {
    let ax = def.x - player.x, az = def.z - player.z;
    let L = Math.hypot(ax, az);
    if (L < 1) { ax = 1; az = 0; L = 1; } // (игрок в самом центре: куда угодно, но в одну сторону)
    let a = Math.atan2(az, ax);
    if (neighbor) {
        const b = Math.atan2(neighbor.z - def.z, neighbor.x - def.x);
        let da = b - a;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < Math.PI / 3) a += da * 0.6; // (к соседям, но не навстречу игроку)
    }
    // (разведены дугой в обе стороны: 0, +, −, ++, −− …)
    const side = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2);
    const R = def.zone + EXODUS.OUT + (k % 3) * EXODUS.RING;
    const aa = a + side * (EXODUS.RING / R) * 1.5;
    // (квадратная земля: идём лучом, пока не выйдем за её край + OUT)
    const cx = Math.cos(aa), cz = Math.sin(aa);
    const m = Math.max(Math.abs(cx), Math.abs(cz)) || 1;
    const r = (def.zone + EXODUS.OUT + (k % 3) * EXODUS.RING) / m;
    return { x: def.x + cx * r, z: def.z + cz * r };
}

/** Можно ли уже возвращаться из убежища: `waited` с, `audacity` 0…100 у самого страшного игрока, `playerD` — до него. */
export function mayReturn({ waited, audacity, playerD, mobOn }) {
    if (waited >= EXODUS.HARD_MAX && playerD > 15) return true;
    if (playerD < EXODUS.NEAR_KEEP) return false;
    if (mobOn) return false; // (идёт бой — сидит)
    if (audacity < AUD.CALM) return true;
    return waited >= EXODUS.WAIT_MAX && audacity < AUD.FEAR;
}

/** Строка для журнала: «решение:». */
export function levelText(v) { return `наглость ${Math.round(v)} (${PHASE_NAME[phaseOf(v)]})`; }
