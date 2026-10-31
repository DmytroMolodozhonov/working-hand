/**
 * MonsterClimb.js — как монстр (×7) прыгает через уступы и не застревает в щелях между скал (чистые правила, без THREE).
 *
 * Жалоба автора: «монстр застревает в проходах между блоками/скалами (особенно в пустыне, узкие каньоны между скалами)…
 * добавь прыжок, залезание на уступы и выход из тесных щелей; не должно быть застреваний нигде. Монстр может ломать мелкое,
 * но не землю». Игровая часть — MonsterTransform (`_climbStep`), радиус тела для стен — Game._resolveMe (`monster.squeeze`).
 *
 * Лесенка (от мягкого к жёсткому), каждая ступень включается, только если прошлая не помогла:
 *   1. ПРЫЖОК НА УСТУП (`findHop` → `hopLaunch`): идёт, упёрся в стену (`STUCK_T` без пути) — выше обычного шага
 *      (STEP = 1,05 роста), но не выше `MAX_H` (2,7 роста ≈ 19 м): присел и прыгнул так, чтобы стопы оказались над кромкой, вперёд —
 *      на плато, где поместится всё тело (`landingOk`: ступня и круг вокруг неё ровные, над головой чисто). Землю не ломает.
 *   2. ПРОТИСНУТЬСЯ (`squeezeStep`): щель уже тела — радиус для стен плавно сужается до `SQUEEZE.MIN` (0,4 радиуса: 1,3 м),
 *      как большому зверю в расщелине; расширяется обратно только когда вокруг есть место (`roomFor`).
 *   3. ВЫТОЛКНУТЬ (`openWay`/`liftOut`): всё равно стоит — прыжок вверх в самую свободную сторону.
 *   4. ВЕРНУТЬ (`trailBack`): ничего не помогло — на место, где стоял несколько секунд назад (мягко, в журнал).
 * Прыжок игрока (настоящий) тоже ловит уступ: `assist` — направление и сила прыжка к кромке впереди (как `ledgePush` у героя).
 */

export const G = 20; // Jump.G — тяжесть героя (единицы / с²); здесь копия, чтобы модуль не тянул Jump.js

export const CLIMB = {
    STEP: 1.05,        // в ростах: обычная ступенька (Game._resolveMe stepHeight = 1,05 · S)
    AIR_STEP: 1.4,     // в ростах: в воздухе ступень выше (1,05 + JUMP_ASSIST 0,3 + запас)
    MAX_H: 2.7,        // в ростах: выше кромки не берёт (≈ 19 м)
    STUCK_T: 0.5,      // с без пути при ходьбе вперёд — «упёрся»
    PROGRESS: 0.2,     // доля ожидаемого пути в кадре, меньше — «не идёт»
    HOP_CD: 1.1,       // с между прыжками
    HOP_MIN: 0.6,      // в ростах: самый низкий вынос прыжка
    HOP_MAX: 2.0,      // в ростах: самый высокий
    SQUEEZE_AT: 0.9,   // с без пути, прыжка нет — начать протискиваться
    LIFT_AT: 2.6,      // с — выталкивать вверх
    LIFTS_MAX: 3,      // выталкиваний подряд на одном месте (в 12 м) — потом назад на прежнее место
    TRAIL_AT: 6,       // с — вернуть на прежнее место
    TRAIL_S: 4,        // с назад по следу
    TRAIL_STEP: 0.5,   // с: как часто след пополняется
};

export const SQUEEZE = {
    MIN: 0.4,    // доля радиуса тела против стен: меньше нельзя (радиус 3,36 · 0,4 = 1,3 м)
    IN: 0.9,     // 1/с: сужается
    OUT: 0.7,    // 1/с: расширяется, когда есть место
};

const FAN = [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.3, -1.3]; // лучи от того, куда смотрит тело (рад)

/** Сколько ожидается пути за кадр при ходьбе (как Character.update: 2,5 → 9,75 · sizeRun). */
export const expectedStep = (runIntensity, sizeRun, dt) => (2.5 + 7.25 * Math.max(0, Math.min(1, runIntensity || 0))) * (sizeRun || 1) * dt;

/** Копится ли «упёрся»: идёт (хочет) и пути почти нет. Возвращает новое значение `stuckT`. */
export function stuckStep(stuckT, intent, moved, expected, dt) {
    if (!intent) return Math.max(0, stuckT - dt * 3);
    if (moved < expected * CLIMB.PROGRESS) return stuckT + dt;
    return Math.max(0, stuckT - dt * 2);
}

/**
 * Годится ли площадка для посадки: ступня и круг вокруг неё — ровный пол (не ниже −STEP и не выше +STEP от центра), над ней чисто.
 * T: terrain (floorBelow, solidIn); (ix, iz) — столб-центр, L — слой пола в нём, S — рост, r — радиус тела, bodyH — высота.
 */
export function landingOk(T, ix, iz, L, S, r, bodyH) {
    const clear = Math.floor(bodyH * 0.8);
    if (T.solidIn(ix, iz, L + 1, L + clear)) return false;
    const rr = Math.max(1, r * 0.6);
    for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4, jx = Math.round(ix + Math.cos(a) * rr), jz = Math.round(iz + Math.sin(a) * rr);
        const l = T.floorBelow(jx, jz, L + Math.ceil(CLIMB.STEP * S));
        if (Math.abs(l - L) > CLIMB.STEP * S) return false;
        if (T.solidIn(jx, jz, l + 1, l + clear)) return false;
    }
    return true;
}

/**
 * Куда прыгать: уступ впереди, выше обычной ступени, но не выше MAX_H, с площадкой, где поместится тело.
 * T: terrain; (x, z) — тело; feet — y ступней; yaw — куда смотрит (вперёд = (−sin, −cos), как у Character); S — рост; r — радиус; bodyH — высота.
 * @returns {{fx, fz, h, d, x, z}|null}  fx/fz — единичное направление, h — высота кромки над ступнями, d — расстояние до центра площадки.
 */
export function findHop(T, x, z, feet, yaw, S, r, bodyH) {
    const lo = CLIMB.STEP * S + 0.15, hi = CLIMB.MAX_H * S;
    for (const off of FAN) {
        const a = yaw + off, fx = -Math.sin(a), fz = -Math.cos(a);
        let seen = false; // (стена уже была на пути: площадка за ней, а не ровный пол впереди)
        for (let d = r * 0.7; d <= r + 2.4 * S; d += Math.max(0.5, S * 0.35)) {
            const px = x + fx * d, pz = z + fz * d, ix = Math.round(px), iz = Math.round(pz);
            const L = T.floorBelow(ix, iz, Math.floor(feet + hi + 2.5));
            const h = L - 0.5 - feet;
            if (h > hi + 0.1) { seen = true; continue; } // (выше предела: ждём, не будет ли ниже дальше — ложбина)
            if (h < lo) { if (seen) break; continue; }
            if (!landingOk(T, ix, iz, L, S, r, bodyH)) continue;
            return { fx, fz, h, d, x: px, z: pz };
        }
    }
    return null;
}

/** Скорости прыжка к кромке: вверх `vy`, вперёд `vf` (единицы/с). `grav` — G·gravityK. */
export function hopLaunch(plan, S, r, grav = G) {
    const H = Math.max(CLIMB.HOP_MIN * S, Math.min(CLIMB.HOP_MAX * S, plan.h - (CLIMB.AIR_STEP - 0.45) * S));
    const vy = Math.sqrt(2 * grav * H);
    const tUp = vy / grav;
    const vf = Math.max(0.5 * S, Math.min(1.6 * S, (plan.d + r * 0.5) / Math.max(0.3, tUp * 0.85)));
    return { vy, vf, H };
}

/** Прыжок игрока (настоящий) у уступа: направление и скорость вперёд, чтобы взять кромку; null — уступа нет. */
export function assist(T, x, z, feet, yaw, S, r, bodyH, grav = G) {
    const plan = findHop(T, x, z, feet, yaw, S, r, bodyH);
    if (!plan) return null;
    const L = hopLaunch(plan, S, r, grav);
    return { x: plan.fx * L.vf, z: plan.fz * L.vf, vy: L.vy, plan };
}

/** Радиус для стен: сужается, пока стоит и прыжка нет; расширяется, когда вокруг есть место. */
export function squeezeStep(sq, stuckT, hopFound, room, dt) {
    if (stuckT >= CLIMB.SQUEEZE_AT && !hopFound) return Math.max(SQUEEZE.MIN, sq - SQUEEZE.IN * dt);
    if (sq < 1 && room && stuckT < CLIMB.SQUEEZE_AT * 0.5) return Math.min(1, sq + SQUEEZE.OUT * dt);
    return sq;
}

/**
 * Есть ли вокруг место для полного радиуса `r` на высотах тела (кольцо точек)? `blocked(x, y, z)` — твёрдое ли там.
 * Расширяться можно, только если да (иначе тело вдавится в скалу и снова застрянет).
 */
export function roomFor(blocked, x, feet, z, r, S) {
    for (const hy of [1.0, 2.2, 3.4]) {
        for (let k = 0; k < 12; k++) {
            const a = k * Math.PI / 6;
            if (blocked(x + Math.cos(a) * r, feet + hy * S, z + Math.sin(a) * r)) return false;
        }
    }
    return true;
}

/**
 * Куда свободнее всего (16 лучей на высотах груди и пояса): единичное направление и сколько метров чисто, или null.
 * `blocked(x, y, z)` — твёрдое ли.
 */
export function openWay(blocked, x, feet, z, S, reach = 3.5 * S) {
    const free = [];
    for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8, dx = Math.cos(a), dz = Math.sin(a);
        let f = 0;
        for (let d = 1; d <= reach; d += 1) {
            if (blocked(x + dx * d, feet + 1.2 * S, z + dz * d) || blocked(x + dx * d, feet + 2.4 * S, z + dz * d)) break;
            f = d;
        }
        free.push(f);
    }
    // (дальше всех и чтобы сбоку тоже было свободно: щель вдоль стены не годится — тело в ней и застряло)
    let best = null;
    for (let k = 0; k < 16; k++) {
        const score = free[k] + 0.5 * (free[(k + 15) % 16] + free[(k + 1) % 16]);
        if (!best || score > best.score) { const a = k * Math.PI / 8; best = { dx: Math.cos(a), dz: Math.sin(a), free: free[k], score }; }
    }
    return best && best.free >= 1 ? best : null;
}

/** Прыжок вверх (выталкивание) и в сторону `way`: скорости. */
export function liftOut(way, S, grav = G) {
    const H = 1.3 * S, vy = Math.sqrt(2 * grav * H);
    return { vy, x: way ? way.dx * 0.8 * S : 0, z: way ? way.dz * 0.8 * S : 0, H };
}

/** След тела (позиции раз в TRAIL_STEP с, хватает на TRAIL_S + запас): пополнить / взять давнюю точку. */
export function trailPush(trail, t, p) {
    const last = trail[trail.length - 1];
    if (last && t - last.t < CLIMB.TRAIL_STEP) return;
    trail.push({ t, x: p.x, y: p.y, z: p.z });
    while (trail.length > Math.ceil((CLIMB.TRAIL_S + 4) / CLIMB.TRAIL_STEP)) trail.shift();
}
export function trailBack(trail, t) {
    for (let i = trail.length - 1; i >= 0; i--) if (t - trail[i].t >= CLIMB.TRAIL_S) return trail[i];
    return trail[0] || null;
}
