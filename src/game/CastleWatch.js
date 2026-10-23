/**
 * CastleWatch.js — слежка внутри замка (чистые правила + мелкий класс-помощник; без three.js).
 *
 * Слова автора: «Если ты входишь в замок, один рыцарь — не из главной стражи — будет всё равно периодически
 * следить за тобой. Нельзя просто ходить внутри замка… внутри крепостных стен — это охраняемая территория:
 * ходить там в теории можно, но за тобой будут следить.»
 *
 * Кто: чужой герой внутри стен (`def.walls`), не король замка (`owner`), не воюющий с замком (с ним и так бой).
 * Кто следит: один рыцарь на героя — не главная стража (job 'guard': трон и ворота), а «дворовый»/«дозорный»
 * (job 'yard' / 'patrol'), свободный (нет врага, не спит, не телохранитель, не в отряде).
 * Как: держится в 8–11 м, поворачивается к герою; время от времени подходит на 5 м (не вплотную) и
 * редко говорит («Я за тобой слежу»). Невидимого герой не видит — тогда это последняя известная позиция (`_playerPos`).
 * Нападает только по обычным правилам (преступление → Danger/страж), сама слежка бой не начинает.
 */

export const WATCH = {
    STAND: 9.5, // m: обычная дистанция наблюдения
    NEAR: 5, // m: «подошёл посмотреть» (не ближе: не вплотную, не толкается)
    FAR: 16, // m: дальше — идёт к герою по путям замка
    LOSE: 60, // m: так далеко от рыцаря герой — берёт другого
    STAND_S: [10, 22], // с: сколько стоит на дистанции
    CLOSE_S: [3, 5.5], // с: сколько стоит близко
    SAY_EVERY_S: 150, // с: не чаще одной реплики на героя
    PICK_R: 70, // m: из кого выбираем наблюдателя
    JOBS: ['yard', 'patrol'], // «не главная стража»
};

export const WATCH_LINES = ['Я за тобой слежу.', 'Веди себя тихо.', 'Я вас вижу, не шалите.', 'Не забывайте: вы в замке короля.'];

/** Герой внутри крепостных стен (двор, залы, стены)? `walls` — {x0,x1,z0,z1} из плана замка. */
export function inGuardedLand(walls, p) {
    return !!walls && !!p && p.x >= walls.x0 && p.x <= walls.x1 && p.z >= walls.z0 && p.z <= walls.z1;
}

/** Надо ли следить за героем. */
export function needsWatch({ inside, isOwner, kingDead, hostile }) {
    if (!inside || isOwner) return false;
    if (hostile) return false; // (с враждующим и так бой — рыцари идут на него по обычным правилам)
    return true;
}

/** Годится ли рыцарь в наблюдатели. */
export function canWatch(v) {
    return !v.dead && !v.removable && v.role === 'knight' && WATCH.JOBS.includes(v.job) && !v.foe && !v.sleep && v.gOwner == null && v.servantOf == null
        && !v.tac && !v.order && !v.handLink && !v.lev && !(v.stunT > 0) && !(v.fleeT > 0) && !v.arena && !v.investigate;
}

/** Выбрать наблюдателя: ближайший годный, у которого ещё нет героя. cands: [{v, d}] */
export function pickWatcher(cands) {
    let best = null;
    for (const c of cands) if (c.d <= WATCH.PICK_R && (!best || c.d < best.d)) best = c;
    return best ? best.v : null;
}

/** Куда ему стать и куда смотреть: фаза 'stand' | 'close'. Возвращает цель по расстоянию до героя. */
export function standDist(phase) { return phase === 'close' ? WATCH.NEAR : WATCH.STAND; }

/** Смена фазы по времени: [фаза, сколько секунд]. rnd — 0…1. */
export function nextPhase(phase, rnd) {
    const next = phase === 'stand' ? 'close' : 'stand';
    const [a, b] = next === 'close' ? WATCH.CLOSE_S : WATCH.STAND_S;
    return [next, a + (b - a) * rnd];
}

/** Можно ли сейчас заговорить (редко, не чаще SAY_EVERY_S, и только вблизи). */
export function maySay(sinceLastS, d) { return d < WATCH.NEAR + 3 && sinceLastS > WATCH.SAY_EVERY_S; }

/**
 * Назначения слежки замка. Хранит, кто за кем (heroId → knight id). Само ничего не двигает: движение — в `step`.
 * `life` — CastleLife (нужны _playerPos, _goSpot, _face, _say, _sees, _players, state).
 */
export class CastleWatch {
    constructor(life) {
        this.life = life;
        this.by = new Map(); // heroId -> knight (v)
        this.saidAt = new Map(); // heroId -> clock s
    }

    /** Раз в ~0.7 с на замок: решить, за кем следят, и назначить/снять наблюдателей. */
    assign(cs, dt) {
        const L = this.life, def = cs.def, st = L.state(def.id);
        if (!def.walls || def.kind === 'hamlet') return;
        const want = new Set();
        for (const pl of L._players()) {
            if (!L._isPlayer(pl.id)) continue;
            const p = L._playerPos(pl.id); // (невидимый: только где его в последний раз заметили)
            if (!p || !L._inLand(def, p, 0) || !inGuardedLand(def.walls, pl.p)) continue;
            if (!needsWatch({ inside: true, isOwner: st.owner === pl.id, kingDead: st.kingDead, hostile: cs.hostile.get(pl.id) > Date.now() })) continue;
            want.add(pl.id);
            const cur = this.by.get(pl.id);
            if (cur && canWatch(cur) && cur.cs === cs && cur.watch?.pid === pl.id && Math.hypot(cur.x - p.x, cur.z - p.z) < WATCH.LOSE) continue;
            if (cur) this._free(pl.id);
            const taken = new Set([...this.by.values()]);
            const cands = [];
            for (const v of cs.active.values()) if (!taken.has(v) && canWatch(v)) cands.push({ v, d: Math.hypot(v.x - p.x, v.z - p.z) });
            const v = pickWatcher(cands);
            if (v) { v.watch = { pid: pl.id, phase: 'stand', t: 3 + Math.random() * 6, sayT: 0 }; v.path = null; this.by.set(pl.id, v); }
        }
        for (const [pid, v] of [...this.by]) if (v.cs === cs && !want.has(pid)) this._free(pid);
    }

    _free(pid) {
        const v = this.by.get(pid);
        if (v) { v.watch = null; v.path = null; v.speed = 0; }
        this.by.delete(pid);
    }

    /** Наблюдатель умер/деактивирован. */
    drop(v) { if (v.watch) this._free(v.watch.pid); }

    /** Шаг наблюдателя: true — он занят слежкой в этом кадре. */
    step(v, dt) {
        const w = v.watch;
        if (!w) return false;
        const L = this.life;
        if (!canWatch(v)) { this._free(w.pid); return false; }
        const p = L._playerPos(w.pid);
        if (!p) { this._free(w.pid); return false; }
        const d = Math.hypot(p.x - v.x, p.z - v.z);
        w.t -= dt;
        if (w.t <= 0) { const [ph, t] = nextPhase(w.phase, Math.random()); w.phase = ph; w.t = t; }
        const want = standDist(w.phase);
        const foot = { x: p.x, y: p.y - 1.95, z: p.z };
        // идёт к герою (по путям замка, если стены между), пока дальше нужного; ближе NEAR−1 — отступает на шаг (не толкается)
        if (d > want + 1.5) {
            const k = (d - want) / d;
            L._goSpot(v, v.x + (p.x - v.x) * k, v.z + (p.z - v.z) * k, d > WATCH.FAR ? 4.4 : 2.4, dt, 0.8, foot.y);
            v.mode = v.speed > 3.5 ? 'run' : v.speed > 0 ? 'walk' : 'idle';
        } else if (d < Math.min(want, WATCH.NEAR) - 1) {
            const k = (want - d) / (d || 1);
            L._steer(v, v.x - (p.x - v.x) * k, v.z - (p.z - v.z) * k, 2.2, dt, 0.4);
            v.mode = v.speed > 0 ? 'walk' : 'idle';
        } else { v.speed = 0; v.path = null; v.mode = 'idle'; }
        if (v.speed === 0 && d < 40 && L._sees(v, p)) L._face(v, p, dt);
        L._ground(v);
        // редкая реплика: вблизи, не чаще раза в SAY_EVERY_S на героя
        const last = this.saidAt.get(w.pid);
        if (w.phase === 'close' && L._sees(v, p) && maySay(last == null ? Infinity : L._clock - last, d)) {
            this.saidAt.set(w.pid, L._clock);
            L._say(v, WATCH_LINES[Math.floor(Math.random() * WATCH_LINES.length)], 3);
        }
        return true;
    }
}
