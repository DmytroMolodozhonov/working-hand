/**
 * DragonAggro.js — когда дракон имеет право напасть (чистые правила, без THREE; тест `tests/unit/dragon-aggro.test.js`).
 *
 * Жалоба автора (мультиплеер): «Мы просто гуляли с другом, и на нас напал дракон… он сам прилетел и сам напал.
 * ТАКОГО НЕ ДОЛЖНО БЫТЬ. Чтобы дракон заагрился, мы должны ПРЯМО ПРИЦЕЛИТЬСЯ в него и ХОРОШО ПОПАСТЬ.
 * Обычно драконы пролетают где-то в небесах и УЛЕТАЮТ — они не должны взаимодействовать».
 *
 * Найденные причины (до правки): пролётный дракон садился НА ЗЕМЛЮ рядом с игроком (место посадки считалось от игрока),
 * а сидящий бросался на любого ближе 22 м; «ветер»/толчки/землетрясение злили того, кто просто был в конусе.
 * Теперь дракон нападает ТОЛЬКО по одной из причин таблицы `AGGRO_RULES`. Всё остальное — не причина (`NOT_A_REASON`).
 */

export const AGGRO = {
    LAIR_ZONE: 25, // м: вход в логово (устье) — «вторгся в логово»; сам зал и 10 м за его стеной считает `DRAGON.GUARD` (Dragons._intruder)
    KEEP_AWAY: 60, // м: пока дракон не в обиде, он целенаправленно ближе к людям не подходит и на посадку возле них не заходит
    SIT_LEAVE: 45, // м: сидящий (не в логове) дракон, к которому подошли ближе, взлетает и отлетает
    LAND_AVOID: 120, // м: место отдыха пролётного дракона — не ближе этого к любому игроку
    NEAR_OFFENDER: 20, // м: рядом с обидчиком достаётся и остальным (хвост, порыв крыльев, ударная волна посадки)
    FORGET_T: 50, // с: цель дальше FORGET_R всё это время — дракон забывает и возвращается к полёту / в логово
    FORGET_R: 150, // м
    WHY_EVERY: 0.5, // с: как часто «сторожевая проверка» смотрит, есть ли причина нападать
    NOTE_EVERY: 10, // с: строка «напал без причины» в журнал не чаще раза за это время на дракона
};

/**
 * Причины напасть (кто/что → да/нет). `id` попадает в журнал «решение:».
 */
export const AGGRO_RULES = [
    { id: 'wounded', why: 'ранен им', note: 'настоящее попадание ЛЮБЫМ заклинанием или оружием по телу дракона (урон > 0, либо прямое попадание «Джолт»/«Ground Vortex»); обида `grudge` держится TAME.GRUDGE_T = 150 с' },
    { id: 'thief', why: 'украл из логова', note: 'взял сокровище/яйцо — ярость, обида `grudge.thief`' },
    { id: 'lair', why: 'вторжение в логово', note: 'игрок в зале логова, в 10 м за его стеной или у устья (≤ 25 м)' },
    { id: 'imperius', why: 'под Империусом', note: 'в драконе чей-то разум (Империус Максима) — действует тот, кто в нём' },
    { id: 'near', why: 'рядом с обидчиком', note: 'в 20 м от того, кто ранил: хвост, крылья, ударная волна посадки достаются и ему — только пока обида свежа' },
];

/** Что причиной НЕ является (проверяет тест). */
export const NOT_A_REASON = [
    'игрок просто рядом / ближайший', 'крик, голос, заклинание в сторону, промах', 'шум рядом (взрыв, гром, Бум — будят в логове, но не злят)',
    'тревога жителей', 'чужое заклинание на игроке (Люмос, огонь, Нокс)', 'луч или конус рядом с телом без попадания', 'рёв и тревога', 'охота / поиск еды',
    'игрок вблизи сидящего дракона вне логова (дракон улетает)', 'удар странника-NPC по кому-то другому',
];

/**
 * Заклинания, которые дракона НЕ злят, даже если «задели» (по таблице ON_DRAGON: «не злит, обиды не копит» / «нечего делать»).
 */
export const HARMLESS = new Set([
    'Lumos', 'LumosMaxima', 'Nox', 'Accio', 'Lock', 'Alohomora', 'Stitching', 'CreateBridge', 'Groundprud', 'Drawdown', 'Levitation', 'Brainrot',
    'Pentagranium', 'Nihilis', 'VisibleGodi', 'Fireworks', 'Invisibility', 'Firefighting', 'FirefightingMaxima', 'WaterVortex', 'WaveAttack',
    'Wind', 'WindMaxima', 'WindImpulse', 'WindImpulseMaxima', 'Disarmor', 'Expelliarmus', 'Bounce',
]);

/** Нулевой урон, но это ПРЯМОЕ попадание по телу — оно считается ударом (дракон «разозлится»). */
export const DIRECT_ZERO = new Set(['Jolt', 'JoltMaxima', 'GroundVortex', 'IceDuel']);

/** Площадные: бьют (урон есть), но обиды у дракона не пишут — «в конусе» не значит «прицелился» (землетрясение). */
export const AREA_NO_GRUDGE = new Set(['Earthquake', 'EarthquakeMaxima']);

/**
 * Считается ли попавшее по телу дракона заклинание/оружие ударом, за который у дракона обида.
 * @param {string|null} kind  вид удара
 * @param {number} dmg  урон, который дракон ПОЛУЧИЛ (после таблицы ON_DRAGON)
 */
export function woundsGrudge(kind, dmg) {
    if (kind && (HARMLESS.has(kind) || AREA_NO_GRUDGE.has(kind))) return false;
    if (dmg > 0) return true;
    return !!kind && DIRECT_ZERO.has(kind);
}

/**
 * Причина напасть на игрока `id` (или null).
 * @param {{grudge?:object, imp?:boolean, aggro?:string|null, aggroWhy?:string|null}} d  дракон
 * @param {string} id  игрок
 * @param {{now:number, grudgeT:number, inLair?:boolean, nearOffender?:boolean}} c  обстановка
 * @returns {string|null}
 */
export function attackReason(d, id, c) {
    if (!d || !id) return null;
    if (d.imp) return 'imperius';
    const g = d.grudge?.[id];
    if (g && c.now - g.at < c.grudgeT) return g.thief ? 'thief' : 'wounded';
    if (d.aggro === id && d.aggroWhy) return d.aggroWhy === 'thief' ? 'thief' : d.aggroWhy === 'lair' ? 'lair' : 'wounded';
    if (c.inLair) return 'lair';
    if (c.nearOffender) return 'near';
    return null;
}

/** Дракон давно гонится за тем, кого не достать (далеко от дракона ≥ FORGET_T с) — пора забыть. */
export function shouldForget(lostT) { return lostT > AGGRO.FORGET_T; }

/** Сидящему (не в логове) дракону подошли слишком близко: он взлетает и отлетает, а не нападает. */
export function sitterLeaves(dist, hasReason) { return !hasReason && dist < AGGRO.SIT_LEAVE; }

/** Пролётному дракону можно отдыхать на этом месте: ни один игрок не ближе LAND_AVOID. */
export function restSpotOk(spot, players) {
    for (const q of players) if (Math.hypot(q.x - spot.x, q.z - spot.z) < AGGRO.LAND_AVOID) return false;
    return true;
}

/** Куда лететь пролётному дракону: если случайное направление ведёт к ближайшему игроку — разворачиваем (не на людей). → [dx, dz] */
export function dodgeHeading(dx, dz, toPlayer) {
    if (!toPlayer) return [dx, dz];
    const l = Math.hypot(dx, dz) || 1, m = Math.hypot(toPlayer.x, toPlayer.z) || 1;
    const dot = (dx * toPlayer.x + dz * toPlayer.z) / (l * m);
    return dot > 0.4 ? [-dx, -dz] : [dx, dz];
}
