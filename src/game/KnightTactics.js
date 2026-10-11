/**
 * KnightTactics.js — the squad brain of a castle's knights (pure, Node-testable).
 *
 * The knights of one castle after one foe are a squad. Its captain (the first of them by rank)
 * picks a PLAN, gives every knight a ROLE, and every few seconds asks: is it working? Are we
 * getting closer, is he hurt, are we losing men? If not — another plan, and the failed one is
 * remembered against THIS foe (not tried again for a while; a plan failed twice is a poor choice
 * for a long time). Circumstances change the plan too: he flies up — bows; he falls — all at once.
 *
 * Ten plans:
 *   assault    — straight in, swords drawn (the opening move);
 *   encircle   — spread out and close in from all sides at once (against a shield: from behind);
 *   shieldwall — shields in a tight row in front (they take the spells), swords strike past them;
 *   archers    — he can't be reached (a roof, in the air, in the water): bows, the others hold
 *                the ways down;
 *   climb      — find the way up (the castle's stairs) — or none: build steps of planks to him;
 *   siege      — surround the place he holds, guard every way down, wait, call for help;
 *   ambush     — some hide on the far side of him, the others drive him onto them;
 *   rush       — he is helpless right now (lying, out of mana, his hands busy with a held spell):
 *                everybody at once, now;
 *   fallback   — losing: back to the gate, a runner for reinforcements, catch breath, come back;
 *   kingguard  — he goes for the king: a ring round the king.
 * Every plan lists when it fits (a score — 0: never now), and when it has failed.
 *
 * The squad's situation `sit` (CastleLife builds it):
 *   n (knights able to fight), start (how many began), lost (fallen so far), lostRecent (in the
 *   last ~20 s), hpK (their mean health 0..1), shields (knights with a shield), dist (m, median),
 *   air (flying / levitating), high (standing well above them: a roof, a ledge, a wall), water
 *   (swimming / deep water), reach ('ground' | 'path' | 'steps' | null: how to get to him),
 *   lying, busy, noMana, shield (his shield up), servants, inside (a roof over his head),
 *   fled (he runs from them), kingAlive, kingThreat (near the king), t (s since the fight began).
 */

export const KT = {
    REVIEW: 2.5, // s: how often the captain weighs the plan
    MIN_PLAN: 4, // s: a plan is given at least this long (only a big chance or a big danger cuts it short)
    FAIL_MEMORY: 45, // s: a plan that failed against this foe is not tried again for this long
    JITTER: 0.3, // how freely the captain thinks (the same situation does not always give the same plan)
    SWITCH: 0.6, // how much better another plan must look to drop a plan that still works
    HELP_AGAIN: 60, // s: reinforcements are called at most this often
    FALLBACK_AGAIN: 50, // s: they fall back at most this often
};

export const unreach = (s) => !!(s.air || s.water || (s.high && s.reach !== 'ground'));

/** The plans: when each fits (score; 0 — not now) and when it has failed or is done. */
export const PLANS = {
    assault: {
        score: (s) => (unreach(s) ? 0 : s.t < 6 ? 1.6 : 1.0),
        review: (s, p) => {
            if (p.t > 10 && p.hurt <= 0 && p.blows === 0 && p.closer < 2) return fail('stuck');
            if (p.lost >= 2 && p.hurt <= 0) return fail('losing');
            return null;
        },
    },
    encircle: {
        score: (s) => (unreach(s) || s.n < 3 ? 0 : 1.1 + (s.shield ? 0.8 : 0) + (s.servants ? 0.6 : 0) + (s.inside ? 0.7 : 0)),
        review: (s, p) => {
            if (p.t > 14 && p.hurt <= 0 && p.blows === 0 && p.closer < 2) return fail('stuck');
            if (p.lost >= 2 && p.hurt <= 0) return fail('losing');
            return null;
        },
    },
    shieldwall: {
        score: (s) => (unreach(s) || s.n < 3 || s.shields < 2 ? 0 : 0.8 + (s.lostRecent > 0 ? 0.9 : 0) + (s.hpK < 0.7 ? 0.4 : 0)),
        review: (s, p) => {
            if (p.t > 16 && p.hurt <= 0 && p.blows === 0) return fail('stuck');
            if (p.lost >= 2) return fail('losing');
            return null;
        },
    },
    archers: {
        score: (s) => (unreach(s) ? 1.8 + (s.air ? 0.6 : 0) + (s.water ? 0.3 : 0) : s.fled && s.dist > 14 ? 0.9 : 0.1),
        review: (s, p) => {
            // (he came down within reach of the swords: the bows were the right thing, now the swords)
            if (!unreach(s) && s.dist < 9) return done('reachable');
            if (p.t > 18 && p.hurt <= 0 && p.shots >= 5) return fail('cover');
            return null;
        },
    },
    climb: {
        score: (s) => (s.high && !s.air && (s.reach === 'path' || s.reach === 'steps') ? (s.reach === 'path' ? 1.7 : 1.35) : 0),
        review: (s, p) => {
            if (!s.high) return done('down');
            if (p.t > (s.reach === 'steps' ? 40 : 22) && !p.up) return fail('noway');
            return null;
        },
    },
    siege: {
        score: (s) => (unreach(s) && s.n >= 3 ? 1.0 + (s.air ? 0 : 0.3) + (s.water ? 0.3 : 0) : 0),
        review: (s, p) => {
            if (!unreach(s)) return done('down');
            if (p.t > 30) return fail('patience');
            return null;
        },
    },
    ambush: {
        score: (s) => (unreach(s) || s.n < 4 ? 0 : s.fled || s.dist > 12 ? 1.25 : 0.35),
        review: (s, p) => {
            if (p.t > 20 && p.hurt <= 0 && p.blows === 0) return fail('nobait');
            return null;
        },
    },
    rush: {
        score: (s) => ((s.lying || s.busy || s.noMana) && !unreach(s) ? 3.0 : 0),
        review: (s, p) => (p.t > 7 || (p.t > 2.5 && !s.lying && !s.busy && !s.noMana) ? done('over') : null),
    },
    fallback: {
        keep: true, // (once begun, it is finished even when the danger is gone)
        score: (s) => (s.start >= 3 && (s.n <= s.start * 0.5 || s.lostRecent >= 2 || s.hpK < 0.35) && !s.noFallback ? 2.4 : 0),
        review: (s, p) => (p.t > 12 ? done('regrouped') : null),
    },
    kingguard: {
        score: (s) => (s.kingAlive && s.kingThreat && s.n >= 2 ? 2.2 : 0),
        review: (s, p) => (p.t > 6 && !s.kingThreat ? done('safe') : null),
    },
};
export const PLAN_IDS = Object.keys(PLANS);
export const fail = (why) => ({ fail: true, why });
export const done = (why) => ({ done: true, why });

/** A squad's memory against one foe: {failed: Map(plan → {n, at}), tried: Set, plan, at}. */
export function newMemory() { return { failed: new Map(), tried: new Set(), plan: null, at: 0, helpAt: -1e9, fallbackAt: -1e9 }; }

/**
 * The captain picks a plan. now: s. rng: () → 0..1. Returns {id, score, why}.
 * The current plan (if it has not failed) is kept unless another looks clearly better;
 * a plan failed against this foe lately is skipped; the same situation does not always
 * give the same answer (they think, not follow a script).
 */
export function choosePlan(sit, mem, now, rng = Math.random, plans = PLANS) {
    const s = { ...sit, noFallback: now - mem.fallbackAt < KT.FALLBACK_AGAIN };
    const cand = [];
    for (const id of Object.keys(plans)) {
        let sc = plans[id].score(s);
        if (sc <= 0) continue;
        const f = mem.failed.get(id);
        const fresh = f && now - f.at < KT.FAIL_MEMORY;
        if (f) sc *= fresh ? 0.12 : Math.pow(0.55, f.n);
        if (!mem.tried.has(id)) sc *= 1.1; // (something new is worth a try)
        if (id === mem.plan && !fresh) sc += KT.SWITCH; // (a working plan is not dropped for a whim)
        sc += rng() * KT.JITTER;
        cand.push({ id, score: sc, fresh });
    }
    cand.sort((a, b) => b.score - a.score);
    const ok = cand.filter((c) => !c.fresh);
    const best = ok[0] || cand[0];
    return best ? { id: best.id, score: best.score } : { id: Object.keys(plans)[0], score: 0 };
}

/**
 * Is the plan still working? prog: {t (s in it), closer (m nearer than at its start), hurt
 * (his health lost meanwhile), blows (sword blows landed), shots (arrows shot), lost (men fallen
 * meanwhile), up (a climber got up to him)}. Returns null (go on) | {fail, why} | {done, why}.
 */
export function reviewPlan(id, sit, prog, plans = PLANS) {
    const P = plans[id];
    if (!P) return done('none');
    // the circumstances changed so that it can't work at all now (he flew up, he is in the water…)
    if (P.score({ ...sit, noFallback: false }) <= 0 && !P.keep) return done('unfit');
    return P.review(sit, prog);
}

/** Note the end of a plan in the squad's memory. */
export function remember(mem, id, res, now) {
    if (res?.fail) {
        const f = mem.failed.get(id);
        mem.failed.set(id, { n: (f?.n || 0) + 1, at: now });
    }
}

/** Start a plan (memory: tried, the time). */
export function begin(mem, id, now) {
    mem.plan = id; mem.at = now; mem.tried.add(id);
    if (id === 'fallback') mem.fallbackAt = now;
}

/**
 * Roles for a plan. men: [{id, idx, d (m to the foe), dk (m to the king, or Infinity), shield}]
 * Returns Map id → role: 'sword' | 'shield' | 'archer' | 'watch' | 'climber' | 'hide' | 'runner' |
 * 'retreat' | 'guard'. The captain is the first by rank (lowest idx): opts.captain gets his id.
 * opts: {kingAlive, help (may send a runner for reinforcements)}.
 */
export function castRoles(plan, men, opts = {}) {
    const out = new Map();
    if (!men.length) return out;
    const byRank = [...men].sort((a, b) => a.idx - b.idx);
    if (opts.captain) opts.captain.id = byRank[0].id;
    let free = [...men];
    const take = (list, role) => { for (const m of list) { out.set(m.id, role); free = free.filter((x) => x !== m); } };
    const nearest = (n, key = 'd') => [...free].sort((a, b) => a[key] - b[key]).slice(0, Math.max(0, n));
    const farthest = (n) => [...free].sort((a, b) => b.d - a.d).slice(0, Math.max(0, n));
    // somebody always stays by the king while the others hunt (not when he is the one in danger,
    // not when everyone is needed at once)
    if (opts.kingAlive && men.length >= 5 && !['rush', 'kingguard', 'fallback'].includes(plan)) take(nearest(1, 'dk'), 'guard');
    const n = free.length;
    switch (plan) {
        case 'shieldwall': {
            take(free.filter((m) => m.shield).sort((a, b) => a.d - b.d).slice(0, 3), 'shield');
            take(free, 'sword');
            break;
        }
        case 'archers': {
            if (n <= 2) { take(free, 'archer'); break; }
            take(farthest(Math.ceil(n * 0.6)), 'archer');
            take(free, 'watch');
            break;
        }
        case 'climb': {
            take(nearest(Math.min(2, n)), 'climber');
            take(farthest(Math.ceil(free.length / 2)), 'archer');
            take(free, 'watch');
            break;
        }
        case 'siege': {
            if (opts.help && n >= 4) take(farthest(1), 'runner');
            take(free, 'watch');
            break;
        }
        case 'ambush': {
            take(farthest(n >= 6 ? 2 : 1), 'hide');
            take(free, 'sword');
            break;
        }
        case 'fallback': {
            if (opts.help && n >= 2) take(nearest(1, 'dk'), 'runner');
            take(free, 'retreat');
            break;
        }
        case 'kingguard': {
            take(nearest(Math.ceil(n / 2), 'dk'), 'guard');
            take(free, 'sword');
            break;
        }
        default: take(free, 'sword'); // assault, encircle, rush
    }
    return out;
}

/** How the swords come in under a plan (the melee places round him). */
export function meleeStyle(plan) {
    switch (plan) {
        case 'encircle': return { front: 3, spread: true, speed: 'run' };
        case 'rush': return { front: 4, spread: true, speed: 'run', close: true };
        case 'shieldwall': return { front: 3, wall: true, speed: 'walk' };
        case 'ambush': return { front: 2, speed: 'walk' };
        default: return { front: 3, speed: 'run' };
    }
}

/**
 * Bearings round the foe for n knights spread evenly, starting at `base` (rad). Used for the
 * ring of watchers under a roof, the archers' arc, the encirclement.
 */
export function spread(n, base, arc = Math.PI * 2) {
    const out = [];
    if (n <= 0) return out;
    const full = arc >= Math.PI * 2 - 1e-6;
    for (let i = 0; i < n; i++) out.push(base + (full ? (i / n) * arc : n === 1 ? 0 : (i / (n - 1) - 0.5) * arc));
    return out;
}

/**
 * Steps of blocks up to a foe standing high (a roof, a wall top) when there is no way up.
 * t: terrain data ({floorBelow(ix,iz,L), solidIn(ix,iz,L0,L1), get(ix,L,iz)}); foe: {x, y (feet), z};
 * from: {x, y (feet), z} where the knights are. A knight climbs a ledge of 2–3 blocks
 * (CastleLife._tryClimb) and needs 5 free layers over his head, so: columns going out from the
 * edge, each 2 lower than the one before. Returns {cells: [[x, L, z]…] (bottom up, the outer
 * column first), base: {x, z} (where to stand to build), dir (out from him), top: L of the roof floor} — or null.
 */
export function planSteps(t, foe, from, maxBlocks = 40) {
    const Lf = Math.round(foe.y + 1.5); // the air layer his feet are in
    const roof = Lf - 1;
    const Lg = Math.round(from.y + 1.5);
    const fx = Math.round(foe.x), fz = Math.round(foe.z);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const want = Math.atan2(from.z - foe.z, from.x - foe.x);
    dirs.sort((a, b) => angDiff(Math.atan2(a[1], a[0]), want) - angDiff(Math.atan2(b[1], b[0]), want));
    // (the side facing the knights first; the first side that works)
    for (const [dx, dz] of dirs) {
        // walk out from him along the roof to its edge: the first column whose floor drops far
        let k = 1, edge = -1, g = 0;
        for (; k <= 14; k++) {
            const x = fx + dx * k, z = fz + dz * k;
            const f = t.floorBelow(x, z, Lf + 1);
            if (f >= roof - 1) continue; // (still the roof, give or take a step)
            if (t.solidIn(x, z, f + 1, Lf + 3)) break; // (something in the way out there)
            edge = k; g = f;
            break;
        }
        if (edge < 0) continue;
        if (Math.abs(g - (Lg - 1)) > 3) continue; // (the ground out there is not where the knights are)
        const rise = roof - g;
        if (rise <= 3) return { cells: [], base: { x: fx + dx * edge, z: fz + dz * edge }, dir: { x: dx, z: dz }, top: roof, k: edge }; // (a ledge they climb as it is)
        const cells = [];
        let j = 0, ok = true, last = edge;
        for (; j < 8; j++) {
            const top = roof - 2 * (j + 1);
            if (top <= g) break;
            const x = fx + dx * (edge + j), z = fz + dz * (edge + j);
            const f = t.floorBelow(x, z, Lf + 1);
            if (f > g + 1 || t.solidIn(x, z, f + 1, top + 5)) { ok = false; break; } // (no room for a column here)
            for (let L = f + 1; L <= top; L++) cells.push([x, L, z]);
            last = edge + j;
            if (top - g <= 3) { j++; break; }
        }
        if (!ok || !cells.length || cells.length > maxBlocks) continue;
        // where to stand: just beyond the outer column, on the ground
        const bx = fx + dx * (last + 1), bz = fz + dz * (last + 1);
        if (Math.abs(t.floorBelow(bx, bz, Lf + 1) - g) > 1) continue;
        return { cells, base: { x: bx, z: bz }, dir: { x: dx, z: dz }, top: roof, k: edge };
    }
    return null;
}

/**
 * Aim an arrow: from → at the target point moving with vel, launch speed S, gravity G.
 * Returns {x, y, z} (velocity) or null (out of range). The low arc, led for his motion.
 */
export function aimArrow(from, to, vel = null, S = 42, G = 9.8) {
    let tx = to.x, ty = to.y, tz = to.z;
    for (let it = 0; it < 2; it++) {
        const dx = tx - from.x, dz = tz - from.z, dy = ty - from.y;
        const D = Math.hypot(dx, dz);
        if (D < 0.5) return { x: 0, y: dy > 0 ? S : -S, z: 0 };
        const S2 = S * S, disc = S2 * S2 - G * (G * D * D + 2 * dy * S2);
        if (disc < 0) return null;
        const th = Math.atan((S2 - Math.sqrt(disc)) / (G * D));
        const T = D / (S * Math.cos(th));
        if (vel && it === 0) { tx = to.x + vel.x * T; ty = to.y + (vel.y || 0) * T; tz = to.z + vel.z * T; continue; }
        return { x: (dx / D) * S * Math.cos(th), y: S * Math.sin(th), z: (dz / D) * S * Math.cos(th) };
    }
    return null;
}

/** What they shout: the captain's orders (by plan) and what the knights see. */
export const LINES = {
    plan: {
        assault: ['За мной! В атаку!', 'Вперёд, братья! Взять его!', 'Мечи наголо — на него!'],
        encircle: ['Окружай! Слева и справа!', 'Обходи с флангов!', 'Берём в кольцо!', 'Не толпиться! Заходи с боков!'],
        shieldwall: ['Щиты вперёд! Стеной!', 'Сомкнуть щиты! Шаг за шагом!', 'Щиты поднять — он колдует!'],
        archers: ['Лучники — ко мне! Стрелять!', 'Луки к бою! Снимем его оттуда!', 'Стрелы на него! Остальные — стеречь спуски!'],
        climb: ['Ищите лестницу! Двое — наверх!', 'Наверх по лестнице! Остальные — прикрыть!', 'Лезь за ним! Лучники — прикрыть!'],
        climbBuild: ['Хода наверх нет — строим ступени!', 'Тащите доски! Сложим лестницу!', 'Ставь доски уступом — залезем!'],
        siege: ['Окружить и ждать! Никуда не денется!', 'Стеречь все спуски!', 'Слезай, колдун! Мы подождём!'],
        ambush: ['Двое — в засаду! Остальные — гоните его!', 'Спрятаться! Пусть сам к нам придёт!', 'Обходи тихо, с той стороны! Гоним на них!'],
        rush: ['Все разом — сейчас!', 'Пока он не опомнился — вперёд!'],
        fallback: ['Отступаем к воротам!', 'Назад! Перестроиться!', 'Отходим! Зовите подмогу!'],
        kingguard: ['Защищать короля!', 'К королю! Стеной вокруг трона!'],
    },
    rushWhy: { lying: ['Он упал! Бей, пока лежит!', 'Лежит! Все на него!'], noMana: ['Он без маны — вперёд!', 'Выдохся колдун! В атаку!'], busy: ['Он колдует — руки заняты! Сейчас!', 'Пока колдует — все разом!'] },
    fail: {
        stuck: ['Не подойти!', 'Так его не взять!', 'Без толку! Иначе надо!'],
        losing: ['Он нас косит!', 'Так всех положит!'],
        cover: ['Стрелы не берут — прячется!', 'Не попасть!'],
        noway: ['Не залезть!', 'Наверх хода нет!'],
        patience: ['Не слезает, хитрец!', 'Ждать надоело!'],
        nobait: ['Не идёт в засаду!', 'Не попался!'],
    },
    seen: {
        air: ['Он летит!', 'В небе! Он в воздухе!'],
        high: ['Он на крыше!', 'Он наверху!', 'Залез наверх, гад!'],
        water: ['Он в воде!', 'Уплыл, гад!'],
        shield: ['У него щит! Заходи сзади!', 'Щит! Бей со спины!'],
        servants: ['У него слуги! Разделиться!'],
        inside: ['Засел в доме! Все двери — взять!'],
        down: ['Слез! Взять его!', 'Он внизу! Вперёд!'],
    },
    runner: ['Бегу за подмогой!', 'Позову наших!'],
    help: ['Подмога! Рыцари, к бою!', 'Мы здесь! Где он?'],
    ambushNow: ['Попался!', 'Сейчас! Из засады!'],
    up: ['Я наверху!', 'Залез! Держись, колдун!'],
    build: ['Ещё доску!', 'Держи ступень!'],
    callDown: ['Слезай! Всё равно достанем!', 'Спускайся, трус!', 'Долго не просидишь!'],
};

const TAU = Math.PI * 2;
function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return Math.abs(d); }
