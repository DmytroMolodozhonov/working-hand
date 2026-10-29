/**
 * FleetMath.js — the pure part of the orders a king gives to the crew of his own ship (Node-testable, no THREE).
 *
 * The ship's frame: x — starboard (right side), z — aft (stern); the bow is −z. A ship of yaw Y looks along
 * (−sin Y, −cos Y); its starboard is (cos Y, −sin Y). The guns (ShipLayout: `side`) fire straight out of the side.
 *
 *  - parseCrewOrder(text)   what was said to the crew («к бою», «огонь по кораблю», «на абордаж», «отбой»…)
 *  - broadside(lx, lz)      which side of the ship a target (ship-local) is on, how far off the beam it is
 *  - gunsBear(b, dist)      do that side's guns bear (right abeam, in range)
 *  - beamTurn(yaw, ψ)       the yaw that puts the target abeam with the smaller turn
 *  - lineOfFire(...)        fly the ball in the air (the same physics as Cannons._fly): who is in the way
 */

export const FLEET = {
    GUN_MIN: 14, // m: nearer than this the balls only fly over (they are not fired)
    GUN_MAX: 260, // m: the farthest a ball is sent (Cannons: 70 m/s, at 45° it flies ~500 m — the aim gets rough long before)
    TOL_MIN: 5, // m: the least miss across (a ball flies straight out of the side) that still counts as «on target»
    RELOAD: 10, // s: one gun loaded again (the crew reloads by hand)
    BOARD_GAP: 8, // m: hull to hull — the boarders leap across
    BOARD_NEAR: 60, // m: a ship this near can be run alongside to board
    FIRE_NEAR: 450, // m: a target further off is not seen well enough to be fired at
};

const TAU = Math.PI * 2;
export const angleDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

const SECTORS = ['прямо по курсу', 'справа по носу', 'правый борт', 'справа по корме', 'прямо за кормой', 'слева по корме', 'левый борт', 'слева по носу'];

/**
 * Where a ship-local point is: the side whose guns would reach it, how far off the beam (0 = right abeam,
 * π/2 = dead ahead or astern), the distance, and a name of the direction (8 sectors) for the captain's report.
 */
export function broadside(lx, lz) {
    const side = lx >= 0 ? 1 : -1;
    const dist = Math.hypot(lx, lz);
    const off = Math.atan2(Math.abs(lz), Math.abs(lx)); // (0: abeam)
    const rel = Math.atan2(lx, -lz); // (0: dead ahead, +π/2: starboard)
    const k = ((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8;
    return { side, off, dist, along: Math.abs(lx), across: Math.abs(lz), rel, name: SECTORS[k], sector: k };
}

/**
 * Do the guns of that side bear on the target: in range, and the line straight out of the side passes within `tol` m
 * of it (a ship: most of her half-length; a spot: a few metres). `why`: 'near' | 'far' | 'angle'.
 */
export function gunsBear(b, opts = {}) {
    const min = opts.min ?? FLEET.GUN_MIN, max = opts.max ?? FLEET.GUN_MAX;
    const tol = Math.max(FLEET.TOL_MIN, opts.tol ?? 0);
    if (b.dist < min) return { ok: false, why: 'near' };
    if (b.dist > max) return { ok: false, why: 'far' };
    if (b.across > tol) return { ok: false, why: 'angle' };
    return { ok: true, why: null };
}

/** The ship's yaw that puts a target (bearing ψ: the yaw that faces it) abeam; the side with the smaller turn. */
export function beamTurn(yaw, psi) {
    const a1 = psi + Math.PI / 2, a2 = psi - Math.PI / 2; // (a1: the target on the starboard side; a2: on the port)
    const d1 = angleDiff(a1, yaw), d2 = angleDiff(a2, yaw);
    return Math.abs(d1) <= Math.abs(d2) ? { yaw: a1, side: 1, turn: d1 } : { yaw: a2, side: -1, turn: d2 };
}

/** The yaw that faces a world point from (x, z). */
export const yawFacing = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

/**
 * Fly a ball from `from` along the unit direction (dx, dz) raised by `pitch`, as Cannons._fly does (speed, gravity,
 * the first 0.25 s the firing ship is skipped). `probe(x, y, z, t)` says what is there: null / 'target' / 'ship' / 'land' /
 * 'own'. The result: {clear, blockedBy, t, x, y, z} — clear when the first thing hit is the target (or nothing before
 * the ball has gone `reach` m).
 */
export function lineOfFire(from, dx, dz, pitch, probe, opts = {}) {
    const speed = opts.speed ?? 70, g = opts.g ?? 9.8, reach = opts.reach ?? 1e9, dt = opts.dt ?? 0.04;
    const h = Math.hypot(dx, dz) || 1;
    const c = Math.cos(pitch), s = Math.sin(pitch);
    let vx = (dx / h) * c * speed, vy = s * speed, vz = (dz / h) * c * speed;
    let x = from.x, y = from.y, z = from.z, t = 0;
    const water = opts.water ?? -Infinity;
    while (t < (opts.maxT ?? 8)) {
        vy -= g * dt; x += vx * dt; y += vy * dt; z += vz * dt; t += dt;
        const hit = probe(x, y, z, t);
        if (hit === 'target') return { clear: true, blockedBy: null, t, x, y, z };
        if (hit) return { clear: false, blockedBy: hit, t, x, y, z };
        if (Math.hypot(x - from.x, z - from.z) >= reach) return { clear: true, blockedBy: null, t, x, y, z };
        if (y < water) return { clear: true, blockedBy: null, t, x, y, z }; // (into the sea — nothing was in the way)
    }
    return { clear: true, blockedBy: null, t, x, y, z };
}

// ------------------------------------------------------------------- what the king said
const norm = (text) => ' ' + String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';

/**
 * The words said to the crew → {kind, target?, dir?} or null (not an order). kinds: 'battle' (к бою), 'cease' (отбой),
 * 'fire' (огонь; target: 'ship' | 'shore' | 'aim' | 'any'), 'load' (заряжай), 'board' (на абордаж), 'sails' (open: bool),
 * 'cast' (отдать швартовы), 'turn' (dir −1 left / +1 right), 'halt'. Short commands only: a long talk is not an order.
 */
export function parseCrewOrder(text) {
    const t = norm(text);
    const words = t.trim().split(' ').filter(Boolean);
    if (!words.length || words.length > 9) return null;
    const has = (re) => re.test(t);
    if (has(/ (отбой|отставить|отставь|отставить|прекратить (огонь|стрельбу)|прекрати (огонь|стрельбу)|не стреляйте|не стреляй|хватит стрелять|прекратите (огонь|стрельбу)|вольно|отозвать) /) || has(/ (стоп|стой) (огонь|стрельба|пушки) /)) return { kind: 'cease' };
    if (has(/ (на абордаж|абордаж|идем на абордаж|брать на абордаж|берем на абордаж|абордажная команда|абордажники) /)) return { kind: 'board' };
    if (has(/ (отдать швартовы|отдай швартовы|отвязать корабль|отвязывай|отдать концы|отдай концы|отплываем|отчаливай|отчаливаем|снимаемся с якоря|в море) /)) return { kind: 'cast' };
    // the wheel: «отойди от штурвала» (the helmsman steps aside), «встань к штурвалу» (he is back at it)
    if (has(/ (отойди|отойдите|отойти|уйди|уйдите|отступи|оставь|оставьте|брось|бросьте) (от |с )?(штурвал|штурвала|руля|руль|штурвале) /)) return { kind: 'leaveHelm' };
    if (has(/ (встань|встаньте|становись|становитесь|вернись|вернитесь|стань|станьте) (к|за|на) (штурвал|штурвалу|рулю|руль|руле|штурвале) /)) return { kind: 'takeHelm' };
    const sails = has(/ (парус|паруса|парусов) /);
    if (sails && has(/ (подня|ставь|ставить|поставить|распусти|раскрой|раскрыть|распустить|развернуть|разверни|открыть|подними|поднять) /)) return { kind: 'sails', open: true };
    if (sails && has(/ (убра|убер|убрать|убери|свер|скатай|спусти|спустить|зарефь|зарефить|закрыть|закрой) /)) return { kind: 'sails', open: false };
    if (has(/ (поворот|поворачивай|поворачиваем|право на борт|лево на борт|лево руля|право руля|руль) /) || has(/ (поворот|поверни|повернуть)/)) {
        if (has(/ (лев|влево|лево|налево|левый|port) /) || has(/ лев/)) return { kind: 'turn', dir: -1 };
        if (has(/ (прав|вправо|право|направо|правый|starboard) /) || has(/ прав/)) return { kind: 'turn', dir: 1 };
    }
    if (has(/ (заряжай|заряжайте|зарядить|заряди|зарядите|набить пушки|набейте пушки|ядра в пушки|ядра в стволы) /)) return { kind: 'load' };
    const fire = has(/ (огонь|пли|залп|стреляй|стреляйте|палить|пали|пальнуть|пальни|открыть огонь|открывай огонь|открыть стрельбу) /);
    if (fire) {
        let target = 'any';
        if (has(/ (по )?(тому|этому|этой|той)( кораблю| судну| цели)?( |$)| (туда|в ту сторону|сюда|по цели|по тому|по этому|куда показываю|куда показываю) /)) target = 'aim';
        if (has(/ по (берег|башн|порт|замк|причал|форт|стен|пирс)/)) target = 'shore';
        if (has(/ по (корабл|судн|пират|чужому|чужим|врагу|вражескому|вражеским|противнику|черному|чер)/)) target = 'ship';
        return { kind: 'fire', target };
    }
    if (has(/ (пушки к бою|к бою|боевая тревога|тревога|к оружию|приготовиться|приготовьтесь|приготовься|все по местам|по местам|свистать всех наверх|готовь пушки|пушки готовь) /)) return { kind: 'battle' };
    return null;
}

/** The target kinds that need a ship (or a spot) the king points at. */
export const orderNeedsAim = (o) => !!o && (o.kind === 'fire' && (o.target === 'aim' || o.target === 'shore'));

// ------------------------------------------------------------------- the captain's words
export const REPLY = {
    ok: ['Слушаюсь, ваше величество!', 'Есть, ваше величество!', 'Так точно, ваше величество!'],
    battle: ['К бою! Пушки к бою, братва!', 'Свистать всех наверх! К орудиям!', 'Все по местам! Пушки заряжать!'],
    helmOff: ['Есть, отхожу от штурвала.', 'Слушаюсь, штурвал свободен.'],
    helmOn: ['Есть, встаю к штурвалу!', 'Есть у штурвала!'],
    cease: ['Отбой! Пушки на предохранитель.', 'Отставить! Фитили гасить.'],
    noTarget: ['Не вижу цели, ваше величество. Покажите рукой — и прикажите огонь.', 'По кому, ваше величество? Укажите цель.'],
    far: ['Далеко, ваше величество, ядра не долетят. Сначала сойдёмся.', 'Цель за пределами выстрела. Сближаемся?'],
    near: ['Слишком близко, ваше величество — ядра перелетят. Или на абордаж?'],
    noBalls: ['Ядер нет, ваше величество!', 'В пороховом погребе пусто — ядер не осталось.'],
    noGunners: ['Некому стрелять, ваше величество — канониров нет.'],
    cannot: ['Не можем, ваше величество: цель не с борта, а штурвал держите вы.', 'Корабль не повернуть, пока штурвал у вас в руках, ваше величество.'],
    moored: ['Мы ещё у причала, ваше величество. Отдать швартовы?'],
    blocked: ['Свои на линии огня, ваше величество — залпа не будет.', 'Перед нами причал — ядра лягут в свои. Не стреляем.'],
    maneuver: ['Поворачиваем бортом к цели!', 'Лево руля, борт к цели!', 'Разворачиваемся — сейчас дадим залп!'],
    fire: ['Пли!', 'Огонь по готовности!', 'Залп!'],
    board: ['На абордаж, братва! Крючья готовь!', 'На абордаж! Руби их!'],
    boardFar: ['Далеко для абордажа, ваше величество. Сближаемся!', 'Подойдём борт к борту — тогда прыгаем!'],
    boardNone: ['Некого брать на абордаж, ваше величество.'],
    boardBack: ['Все на борт! Отходим!'],
    sailsUp: ['Паруса поднять!', 'Ставить паруса!'],
    sailsDown: ['Паруса убрать!', 'Убрать паруса, живо!'],
    cast: ['Отдать швартовы!', 'Концы долой!'],
    turn: ['Лево на борт!', 'Право на борт!'],
    nonFriend: ['Вы не наш король, чтобы приказывать.'],
};
