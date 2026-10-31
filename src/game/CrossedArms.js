/**
 * CrossedArms.js — «Protection» жестом: руки скрещены перед грудью (просьба автора).
 *
 *   Не обязательно говорить: встаньте прямо и скрестите руки перед грудью, как будто защищаетесь (хоть «как у покойника
 *   в гробу» — кисти у плеч; примерно, не точно) — встанет обычный голубой щит «Protection» (цена та же: 5 маны и 0,5/с,
 *   пока держите). Разведёте руки — щит снимется сам. Голосовой «Protection» остаётся как был: его снимают «стоп» и рывок.
 *
 *   Меряем по точкам камеры (33 точки позы), а не по телу героя: тело сжимает кисти к середине, а камера честно видит,
 *   что запястья поменялись местами (левое правее правого — для человека).
 *
 *   СКОРОСТЬ (слова автора: «очень важное заклинание, которое нужно вызывать ОЧЕНЬ-ОЧЕНЬ быстро… но чтобы не было
 *   случайного вызова»; стенд `node tools/protectbench.mjs --check`, тест `protection-gesture.test.js`):
 *     - жест смотрит СЫРЫЕ точки камеры в миг прихода кадра (`CrossedShield.onPose` ← `PoseService.onRawPose`), не
 *       сглаженные (`PoseStabilizer` тянет позу назад) и не раз в игровой кадр — щит встаёт до урона в том же кадре;
 *     - вместо 0,35 с удержания — несколько признаков в ОДНОМ кадре (`CrossTrack`): запястья поменялись местами, обе
 *       кисти у груди, локти по своим сторонам и ниже плеч, И кисти уже остановились (`SLOW`) или тормозят так, что
 *       остановятся в позе (`brakeStop`); скорость — по буферу ~0,7 с через ≥ 60 мс (шум камеры не «бьётся» о кадры);
 *     - опережение: руки идут к кресту, прошли ~85 % пути (`PRED_SWAP`) и по траектории будут в кресте за `PRED_T` —
 *       «пробный» щит (`tent`): защищает сразу, но не виден, не звучит и не уходит по сети; подтвердилось — обычный щит
 *       (мана уже снята), не подтвердилось за `TENT_MAX` или руки ушли — снят, мана возвращена; принял удар — оплачен;
 *     - кисть пропала на 1–3 кадра — состояние держится (`LOST`), камера молчит 1 с — руки считаются разведёнными.
 *   Старый путь (сглаженные точки, `CrossedGesture` с HOLD 0,35 с, опрос раз в игровой кадр) оставлен только для сравнения
 *   в стенде (`--old`).
 *
 *   Допуски (в долях ширины плеч W; «вход» строже «выхода» — гистерезис, чтобы не мигало):
 *     - запястья поменялись местами (насколько левое ушло за правое):  вход ≥ 0,30 W,  выход ≥ 0,05 W
 *     - каждое запястье в пределах плеч по бокам от середины:           вход ≤ 0,9 W,   выход ≤ 1,2 W
 *     - каждое запястье за серединой тела (или почти, ≤ 0,1 W на своей стороне) — обе кисти с одной стороны: одна рука поперёк, не крест
 *     - высота запястья от линии плеч (вниз +):                         вход −0,35…1,5 W, выход −0,6…2,0 W
 *       (выше — рука у лица/рта, ниже — карман, пояс, руки опущены)
 *     - локти (если видны): каждый на своей стороне тела, ниже линии плеч на 0,4 W (прямые руки махом и растяжка — локти высоко), рука
 *       СОГНУТА — локоть ниже кисти или далеко в сторону от середины «плечо–кисть» (прямые руки, махом крест-накрест — разминка — не поза)
 *     - точки плеч видны не хуже 0,5, запястий — 0,4 (у скрещённых рук камера видит их хуже)
 */

export const CROSS = {
    HOLD: 0.35, // s — the OLD gesture's hold (CrossedGesture, kept for the bench's «before»)
    RELEASE: 0.2, // s the cross is open before the shield goes down
    SWAP_IN: 0.30, SWAP_OUT: 0.05, // the wrists changed places (× shoulder width)
    SIDE_IN: 0.9, SIDE_OUT: 1.2, // each wrist within this of the body's middle (arms crossed, not stretched aside)
    HIGH_IN: -0.35, HIGH_OUT: -0.6, LOW_IN: 1.5, LOW_OUT: 2.0, // the wrist's drop below the shoulder line (× shoulder width)
    VIS: 0.5, // the shoulders (and, in crossedPose, the wrists) seen at least this well
    // ---- the fast one (CrossTrack)
    WVIS: 0.4, // the wrists seen this well to start
    WVIS_KEEP: 0.25, // …and to count as seen while held
    MID: 0.1, // each wrist to start at most this far on its own side of the middle (× W): past it — or nearly
    W_MIN: 0.04, // the shoulders' width in the picture to start (far / turned sideways: the points are too noisy)
    ELBOW_SIDE: -0.15, // each elbow at least this far on its own side of the middle (× W)
    ELBOW_DROP: 0.4, // the elbows at least this far under the shoulder line (× W): crossed arms hang from the shoulders (straight arms swung across, a stretch — the elbows up)
    BENT_DOWN: 0.1, BENT_OUT: 0.2, // the arm bent: the elbow this far under its wrist, or this far out from the shoulder–wrist middle (× W)
    SPAN: 0.06, // s — the speed is read over at least this (the camera's noise)
    SPAN2: 0.12, // s — the second, steadier reading of «the wrists stand»
    SPAN_MAX: 0.25, // s — no older picture than this: the speed is unknown
    SLOW: 3.2, // W/s — both wrists this slow in a crossed picture: the arms have arrived
    FAST: 14, // W/s — faster: still swinging (the «crossed a few pictures» rule waits)
    GUESS_FAST: 30, // W/s — faster than this not even a guess (a flail)
    BRAKE: 0.8, // the speed fell at least to this share since the picture before: braking
    PREV_K: 0.6, // confirmed only if the picture before was crossed at least this share of SWAP_IN (one noisy picture is no cross; the guess protects meanwhile)
    PRED_SWAP: 0.08, // the swap from which a cross coming in is guessed (~85 % of the way from the arms at the sides)
    PRED_T: 0.12, // s — the swap's trend reaches SWAP_IN within this: guessed
    STAY: 0.12, // s crossed in a row (slower than FAST): it is a cross, whatever the speed says
    TENT_MAX: 0.3, // s a guessed shield waits to be confirmed
    TENT_OUT: 0.07, // s out of the loose limits: the guess is dropped
    LOST: 0.25, // s a wrist unseen keeps the state as it is (1–3 pictures)
    STALE: 1.0, // s with no picture at all: the arms are open
    // ---- a danger near (ShieldAlert.level ≥ ALERT_ON: a charge flying at me, a player casting / aiming, a foe): believed sooner
    ALERT_ON: 0.5,
    ALERT: {
        SLOW: 5, // W/s — «the wrists stand» looser
        MOVING: 10, // W/s — crossed and not faster than this: confirmed at once (no waiting for the stop)
        STAY: 0.06, // s crossed in a row
        PRED_SWAP: -0.1, // the guess from further back (~75 % of the way)
        PRED_T: 0.2,
    },
};

/**
 * Are the arms crossed? `p`: the camera's 33 pose points (x right, y down in the picture; 11 / 12 the shoulders, 15 / 16 the wrists
 * — the person's left / right); `held`: the cross is already on (the looser limits of the way out).
 */
export function crossedPose(p, held = false) {
    if (!p) return false;
    const ls = p[11], rs = p[12], lw = p[15], rw = p[16];
    if (!ls || !rs || !lw || !rw) return false;
    for (const q of [ls, rs, lw, rw]) if (!(q.visibility == null || q.visibility >= CROSS.VIS)) return false;
    const so = ls.x - rs.x, W = Math.abs(so);
    if (W < 0.02) return false; // (turned sideways or too small: no telling)
    const dir = so > 0 ? 1 : -1; // (the person's left shoulder on the picture's right: a camera, a mirror)
    const swap = -(lw.x - rw.x) * dir / W; // (> 0: the left wrist is on the right wrist's side)
    if (swap < (held ? CROSS.SWAP_OUT : CROSS.SWAP_IN)) return false;
    const mx = (ls.x + rs.x) / 2, sy = (ls.y + rs.y) / 2;
    for (const w of [lw, rw]) {
        if (Math.abs(w.x - mx) / W > (held ? CROSS.SIDE_OUT : CROSS.SIDE_IN)) return false;
        const drop = (w.y - sy) / W;
        if (drop < (held ? CROSS.HIGH_OUT : CROSS.HIGH_IN) || drop > (held ? CROSS.LOW_OUT : CROSS.LOW_IN)) return false;
    }
    return true;
}

/** The OLD hold / release timers round `crossedPose` (0.35 s to confirm) — the bench's «before» only. */
export class CrossedGesture {
    constructor() { this.on = false; this.t = 0; }
    reset() { this.on = false; this.t = 0; }
    /** @param {boolean|null} crossed the pose now (null: the hands are not seen / not allowed — counts as open) */
    step(dt, crossed) {
        if (!this.on) {
            this.t = crossed ? this.t + dt : 0;
            if (this.t >= CROSS.HOLD) { this.on = true; this.t = 0; return 'on'; }
        } else {
            this.t = crossed ? 0 : this.t + dt;
            if (this.t >= CROSS.RELEASE) { this.on = false; this.t = 0; return 'off'; }
        }
        return null;
    }
}

const vis = (q) => (q ? q.visibility ?? 1 : 0);

/**
 * The picture in the body's own measure: the wrists and elbows from the shoulders' middle, in shoulder widths
 * (u — towards the person's LEFT, v — down). Into `out` (no garbage); null — no shoulders to measure by.
 */
export function crossMeasure(p, out = {}) {
    if (!p) return null;
    const ls = p[11], rs = p[12], lw = p[15], rw = p[16];
    if (!ls || !rs || !lw || !rw || vis(ls) < CROSS.VIS || vis(rs) < CROSS.VIS) return null;
    if (!Number.isFinite(ls.x) || !Number.isFinite(rs.x) || !Number.isFinite(lw.x) || !Number.isFinite(rw.x)) return null;
    const so = ls.x - rs.x, W = Math.abs(so);
    if (W < 0.02) return null;
    const dir = so > 0 ? 1 : -1, mx = (ls.x + rs.x) / 2, sy = (ls.y + rs.y) / 2;
    out.W = W;
    out.lu = (lw.x - mx) * dir / W; out.lv = (lw.y - sy) / W;
    out.ru = (rw.x - mx) * dir / W; out.rv = (rw.y - sy) / W;
    out.wv = Math.min(vis(lw), vis(rw));
    const le = p[13], re = p[14];
    out.eOk = !!(le && re && vis(le) >= 0.3 && vis(re) >= 0.3 && Number.isFinite(le.x) && Number.isFinite(re.x));
    if (out.eOk) { out.leu = (le.x - mx) * dir / W; out.lev = (le.y - sy) / W; out.reu = (re.x - mx) * dir / W; out.rev = (re.y - sy) / W; }
    out.swap = out.ru - out.lu; // (> 0: the left wrist is on the right's side)
    return out;
}

/** The wrists (and elbows) where crossed arms are: strict — to start; loose — to hold. */
function inZone(lu, lv, ru, rv, strict) {
    const side = strict ? CROSS.SIDE_IN : CROSS.SIDE_OUT, hi = strict ? CROSS.HIGH_IN : CROSS.HIGH_OUT, lo = strict ? CROSS.LOW_IN : CROSS.LOW_OUT;
    return Math.abs(lu) <= side && Math.abs(ru) <= side && lv >= hi && lv <= lo && rv >= hi && rv <= lo;
}

/**
 * The elbows of crossed arms: each on its own side, not lifted, and the arm BENT — the elbow under the wrist, or well out
 * from the line shoulder–wrist (a straight arm swung across the chest — a warm-up — has its elbow midway: no cross).
 */
function elbowsOk(m) {
    if (!m.eOk) return true; // (not seen: the wrists decide)
    if (!(m.leu >= CROSS.ELBOW_SIDE && m.reu <= -CROSS.ELBOW_SIDE && m.lev >= CROSS.ELBOW_DROP && m.rev >= CROSS.ELBOW_DROP)) return false;
    const bentL = m.lev - m.lv >= CROSS.BENT_DOWN || m.leu - (0.5 + m.lu) / 2 >= CROSS.BENT_OUT;
    const bentR = m.rev - m.rv >= CROSS.BENT_DOWN || (-0.5 + m.ru) / 2 - m.reu >= CROSS.BENT_OUT;
    return bentL && bentR;
}

const BUF = 24; // pictures (~0.7 s at 30 a second, ~0.4 s at 60)

/**
 * The fast gesture: every camera picture as it comes (its own time, seconds). feed() →
 *   'tent'   — a cross guessed / coming in: protect now, unseen (CrossedShield: paid, hidden);
 *   'on'     — confirmed (from 'off' at once, or a 'tent' confirmed);
 *   'cancel' — the guess did not come true: take it down, give the mana back;
 *   'off'    — the arms opened: down;   null — nothing changed.
 * `why` — the signs that confirmed it (the journal).
 */
export class CrossTrack {
    constructor() {
        this.buf = Array.from({ length: BUF }, () => ({ t: 0, lu: 0, lv: 0, ru: 0, rv: 0, swap: 0 }));
        this._m = {};
        this.reset();
    }

    reset() {
        this.state = 'off';
        this.n = 0; this.head = 0;
        this.lastT = -Infinity; this.seenT = -Infinity;
        this.openT = 0; this.outT = 0; this.stayT = 0;
        this.tentAt = 0; this.metAt = null; this.why = '';
        this.sL = this.sR = null; // (the wrists' speeds now, W/s — the journal)
    }

    /** The k-th picture back (0 — the last one). */
    _at(k) { return this.buf[(this.head - 1 - k + BUF * 4) % BUF]; }

    _push(t, m) {
        const b = this.buf[this.head];
        b.t = t; b.lu = m.lu; b.lv = m.lv; b.ru = m.ru; b.rv = m.rv; b.swap = m.swap;
        this.head = (this.head + 1) % BUF;
        if (this.n < BUF) this.n++;
    }

    /** The newest picture at least SPAN older than `t` (from index `from` back), or null. */
    _back(t, from = 0, span = CROSS.SPAN) {
        for (let k = from; k < this.n; k++) {
            const b = this._at(k), dt = t - b.t;
            if (dt > CROSS.SPAN_MAX) return null;
            if (dt >= span - 1e-6) return b;
        }
        return null;
    }

    /**
     * No picture is coming (the game's frame). `gap` — seconds since the last picture ARRIVED (the game's clock, not the
     * pictures' own: they are stamped when taken, and may come late): silent too long → a guess dropped, the arms open.
     */
    idle(gap) {
        if (this.state === 'tent' && gap > CROSS.TENT_MAX) { this.state = 'off'; return 'cancel'; }
        if (this.state === 'on' && gap > CROSS.STALE) { this.state = 'off'; this.openT = 0; return 'off'; }
        return null;
    }

    /**
     * @param {number} t the picture's own time, s
     * @param {Array|null} p its 33 raw points (null: nothing to read — not allowed now, no body: counts as open arms)
     * @param {number} alert 0…1 — a danger near (ShieldAlert): ≥ ALERT_ON — one picture is enough, the guess comes sooner
     */
    feed(t, p, alert = 0) {
        const A = alert >= CROSS.ALERT_ON ? CROSS.ALERT : null;
        this.alerted = !!A;
        const dtp = Number.isFinite(this.lastT) ? Math.max(0, Math.min(0.25, t - this.lastT)) : 0;
        this.lastT = t;
        const m = p ? crossMeasure(p, this._m) : null;
        const seen = !!m && m.wv >= (this.state === 'off' ? CROSS.WVIS : CROSS.WVIS_KEEP);
        if (!seen) {
            // (a wrist lost for a picture: nothing is reset — the speed spans the gap, the «crossed in a row» count pauses)
            if (!p || t - this.seenT >= CROSS.LOST) { this.n = 0; this.stayT = 0; }
            // (a wrist lost for a moment — 1–3 pictures: the state stays; no body at all / not allowed: open at once)
            const lostShort = !!p && t - this.seenT < CROSS.LOST;
            if (this.state === 'tent') {
                if (!lostShort || t - this.tentAt > CROSS.TENT_MAX) { this.state = 'off'; return 'cancel'; }
                return null;
            }
            if (this.state === 'on') {
                if (lostShort) return null;
                this.openT += dtp;
                if (this.openT >= CROSS.RELEASE) { this.state = 'off'; this.openT = 0; return 'off'; }
            }
            return null;
        }
        this.seenT = t;
        const prevSwap = this.n ? this._at(0).swap : null; // (the picture before: one noisy picture is no cross)
        this._push(t, m);
        // the wrists' speeds (W/s) over ≥ SPAN, and the speeds the span before (braking)
        const a = this._back(t);
        let sL = null, sR = null, pL = null, pR = null, vlu = 0, vlv = 0, vru = 0, vrv = 0, dsw = null;
        if (a) {
            const dt = t - a.t;
            vlu = (m.lu - a.lu) / dt; vlv = (m.lv - a.lv) / dt; vru = (m.ru - a.ru) / dt; vrv = (m.rv - a.rv) / dt;
            sL = Math.sqrt(vlu * vlu + vlv * vlv); sR = Math.sqrt(vru * vru + vrv * vrv);
            dsw = (m.swap - a.swap) / dt;
            let ka = 0;
            for (; ka < this.n; ka++) if (this._at(ka) === a) break;
            const b = this._back(a.t, ka + 1);
            if (b) {
                const d2 = a.t - b.t;
                const xl = a.lu - b.lu, yl = a.lv - b.lv, xr = a.ru - b.ru, yr = a.rv - b.rv;
                pL = Math.sqrt(xl * xl + yl * yl) / d2; pR = Math.sqrt(xr * xr + yr * yr) / d2;
                this._dMid = (dt + d2) / 2; // (between the two speeds' middles)
            }
        }
        this.sL = sL; this.sR = sR;
        if (m.swap >= 0 && this.metAt == null) this.metAt = t; // (the wrists met: the journal's «from the pose's start»)
        if (m.swap < -0.2 && this.state === 'off') this.metAt = null;
        // (each wrist at or past the body's middle: both on one side is one arm across the chest — a stretch, a hand holding the other — not a cross)
        const past = m.lu <= CROSS.MID && m.ru >= -CROSS.MID;
        const strict = m.W >= CROSS.W_MIN && m.swap >= CROSS.SWAP_IN && past && inZone(m.lu, m.lv, m.ru, m.rv, true) && elbowsOk(m);
        const loose = m.swap >= CROSS.SWAP_OUT && inZone(m.lu, m.lv, m.ru, m.rv, false);
        // (crossed in a row: a single picture just off the strict limits — noise — pauses the count, out of the loose ones resets it)
        if (strict && (sL == null || Math.max(sL, sR) <= CROSS.FAST)) this.stayT += dtp;
        else if (!loose || (sL != null && Math.max(sL, sR) > CROSS.FAST)) this.stayT = 0;
        // (still: over ≥ 60 ms, or — a noisy camera, a far person — over ≥ 120 ms, where the noise weighs half)
        const SLOW = A ? A.SLOW : CROSS.SLOW;
        let slow = sL != null && sL <= SLOW && sR <= SLOW;
        if (!slow && strict) {
            const c = this._back(t, 0, CROSS.SPAN2);
            if (c) {
                const d = t - c.t, xl = m.lu - c.lu, yl = m.lv - c.lv, xr = m.ru - c.ru, yr = m.rv - c.rv;
                slow = Math.sqrt(xl * xl + yl * yl) / d <= SLOW && Math.sqrt(xr * xr + yr * yr) / d <= SLOW;
            }
        }
        const brake = sL != null && pL != null && this._brakes(m, sL, sR, pL, pR, vlu, vlv, vru, vrv);
        const stays = this.stayT >= (A ? A.STAY : CROSS.STAY) - 1e-6;
        // (the picture before crossed too — a danger near: this one is enough, and a cross still arriving, not too fast, counts)
        const twice = A ? true : prevSwap != null && prevSwap >= CROSS.SWAP_IN * CROSS.PREV_K;
        const moving = !!A && sL != null && Math.max(sL, sR) <= A.MOVING;
        const confirm = strict && twice && (slow || brake || stays || moving);
        this.flags = this.flags || {};
        this.flags.strict = strict; this.flags.loose = loose; this.flags.slow = slow; this.flags.brake = brake; this.flags.stay = this.stayT; this.flags.m = m;
        if (this.state === 'off') {
            if (confirm) { this.state = 'on'; this.openT = 0; this.why = (slow ? 'скрещены, кисти стоят' : brake ? 'скрещены, кисти тормозят в позе' : stays ? 'скрещены несколько кадров' : 'скрещены, руки ещё идут'); return 'on'; }
            const fastNow = sL != null && Math.max(sL, sR) > CROSS.GUESS_FAST;
            const coming = !strict && sL != null && !fastNow && m.W >= CROSS.W_MIN && m.swap >= (A ? A.PRED_SWAP : CROSS.PRED_SWAP) && dsw > 0
                && m.swap + dsw * (A ? A.PRED_T : CROSS.PRED_T) >= CROSS.SWAP_IN && inZone(m.lu, m.lv, m.ru, m.rv, true) && elbowsOk(m);
            if ((strict && !fastNow && sL != null) || coming) { this.state = 'tent'; this.tentAt = t; this.outT = 0; this.why = strict ? 'скрещены, руки ещё движутся' : 'руки идут к кресту'; return 'tent'; }
            return null;
        }
        if (this.state === 'tent') {
            if (confirm) { this.state = 'on'; this.openT = 0; this.why = (slow ? 'скрещены, кисти стоят' : brake ? 'скрещены, кисти тормозят в позе' : stays ? 'скрещены несколько кадров' : 'скрещены, руки ещё идут') + ' (было опережение)'; return 'on'; }
            this.outT = loose || m.swap >= CROSS.PRED_SWAP * 0.5 ? 0 : this.outT + dtp;
            if (this.outT >= CROSS.TENT_OUT || t - this.tentAt > CROSS.TENT_MAX || (sL != null && Math.max(sL, sR) > CROSS.GUESS_FAST)) { this.state = 'off'; return 'cancel'; }
            return null;
        }
        // on: the looser limits hold it; open for RELEASE — down
        this.openT = loose ? 0 : this.openT + dtp;
        if (this.openT >= CROSS.RELEASE) { this.state = 'off'; this.openT = 0; this.metAt = null; return 'off'; }
        return null;
    }

    /** Both wrists braking hard enough to stop inside the strict cross (where they will stop: v²/2a ahead). */
    _brakes(m, sL, sR, pL, pR, vlu, vlv, vru, vrv) {
        if (!(sL <= pL * CROSS.BRAKE + 0.3 && sR <= pR * CROSS.BRAKE + 0.3)) return false;
        // (how far ahead it stops: s² / 2a along its way — as a time k at the speed now, the stop point = here + v·k)
        const dm = this._dMid || 0.07;
        const kL = sL / (2 * Math.max(1e-3, (pL - sL) / dm)), kR = sR / (2 * Math.max(1e-3, (pR - sR) / dm));
        const lu = m.lu + vlu * kL, lv = m.lv + vlv * kL, ru = m.ru + vru * kR, rv = m.rv + vrv * kR;
        return ru - lu >= CROSS.SWAP_IN && inZone(lu, lv, ru, rv, true);
    }
}

/** The game's part: watches the hero's arms, puts «Protection» up and takes it down. */
export class CrossedShield {
    constructor(game) {
        this.game = game;
        this.track = new CrossTrack();
        this.refused = false; // (the spell did not come — no mana…: not asked again until the arms open)
        this.mine = false; // (the shield on now is the one this gesture put up)
        this.quiet = false; // (Combat.castProtection: a guessed shield makes no sound)
    }

    /** What keeps the arms from being a shield gesture right now (reading, pocket, the bow, the body not mine…). */
    blocked() {
        const g = this.game, c = g.combat;
        return !!(g.paused || c.dead || g.isDeadLocal || c.frozen || c.stunned || g.monster?.active || g.imperius?.busy || g.imperius?.puppet
            || g.beds?.lying || g.spiders?.held || g.books?.readingSide || g.scrolls?.readingSide || g.gear?.nock
            || g.inventory?.pocketCycling?.('left') || g.inventory?.pocketCycling?.('right')
            || g.flight?.busy || g.levitation?.lifted);
    }

    /**
     * A camera picture has just come (PoseService.onRawPose — before the game's frame: the shield is up before any blow
     * of the next frame is counted). `raw`: its 33 raw points; `tMs`: its own time (performance.now's clock).
     */
    onPose(raw, tMs) {
        const g = this.game;
        if (g.active === false) return;
        this._sync();
        this._quiet = 0;
        const ev = this.track.feed(tMs / 1000, this.blocked() ? null : raw, g.shieldAlert?.level || 0);
        if (ev && this.track.alerted) this._alertWhy = g.shieldAlert?.why || '';
        this._act(ev, tMs);
    }

    /** The game's frame: the camera silent / a guess left hanging. */
    update(dt) {
        this._sync();
        // (what blocks the gesture is asked picture by picture — onPose: a blocked picture counts as open arms, RELEASE as usual)
        const T = this.track, c = this.game.combat;
        if ((c.dead || this.game.isDeadLocal) && T.state !== 'off') { T.reset(); this._lower(); return; }
        // (the camera's silence counted by the game's own frames, each at most 0.1 s: after a hitch of the game the frame comes before
        // the pictures that queued meanwhile — that is no silence)
        this._quiet = (this._quiet ?? 1e9) + Math.min(Math.max(dt, 0), 0.1);
        this._act(T.idle(this._quiet), null);
    }

    /** The shield I raised is gone by itself (mana, a blow, «стоп») — nothing of mine to take down; a guessed one that held a blow is paid. */
    _sync() {
        const c = this.game.combat;
        if (this.mine && !c.shield?.gesture) { this.mine = false; this.tent = false; }
        if (this.tent && this.mine && c.shield && !c.shield.tent) this.tent = false; // (it held a blow: Combat._blocked made it real)
    }

    _act(ev, tMs) {
        if (!ev) { if (this.track.state === 'off') this.refused = false; return; }
        if (ev === 'tent') this._raise(true, tMs);
        else if (ev === 'on') { if (this.tent && this.mine) this._confirm(tMs); else this._raise(false, tMs); }
        else if (ev === 'cancel') this._cancel();
        else if (ev === 'off') { this._lower(); this.refused = false; }
    }

    _raise(tent, tMs) {
        const g = this.game, c = g.combat;
        if (c.shield || this.refused) return; // (a shield is already up — voice, dome, gods: the gesture adds nothing)
        // (a guess is made only when it can be paid: a «no mana» is said at the real cross, not at a guess)
        if (tent && c.manaOn && c.fatigue < c.costOf('Protection')) return;
        const hud = g.hud, hf = hud?.hintFilter;
        g._lastShieldCast = 0; // (the voice's «heard twice» guard is not for the arms: crossed again at once — up again)
        this.quiet = tent;
        if (tent && hud) hud.hintFilter = () => false; // (a guess says nothing)
        let name = null;
        try { name = g.castLocalSpell('protection', true); } finally { this.quiet = false; if (tent && hud) hud.hintFilter = hf; }
        if (!name) { if (!tent) this.refused = true; return; }
        if (c.shield?.type === 1 && !c.shield.gods) {
            c.shield.gesture = true; c.shield.wand = false; this.mine = true;
            if (tent) { c.shield.tent = true; this.tent = true; } else this._done(tMs);
        }
    }

    /** The guess came true: the same shield, now seen and heard (the mana was taken at the guess). */
    _confirm(tMs) {
        const g = this.game, c = g.combat;
        this.tent = false;
        if (!c.shield?.gesture) return;
        c.shield.tent = false;
        g.sound?.playIce?.();
        g.sync?.poseSoon?.();
        this._done(tMs, true);
    }

    /** The guess did not come true: down, unseen, the mana back. */
    _cancel() {
        const c = this.game.combat;
        if (this.mine && this.tent && c.shield?.gesture && c.shield.tent) { c.shield = null; c._refund('Protection'); }
        if (this.tent) this.mine = false;
        this.tent = false;
    }

    _lower() {
        const c = this.game.combat;
        if (this.tent) { this._cancel(); return; }
        if (this.mine && c.shield?.gesture) c.dropShield('🛡️ Руки разведены — щит снят');
        this.mine = false;
    }

    /** The journal (tag «Заклинания»): how fast it was and by what. */
    _done(tMs, guessed = false) {
        const g = this.game, T = this.track, now = performance.now();
        if (!guessed) g.sync?.poseSoon?.();
        const frame = Number.isFinite(tMs) ? Math.round(now - tMs) : null;
        const met = T.metAt != null && Number.isFinite(tMs) ? Math.round(tMs - T.metAt * 1000) : null;
        const sp = T.sL != null ? `, кисти ${T.sL.toFixed(1)}/${T.sR.toFixed(1)} ш/с` : '';
        const line = `🛡️ Protection жестом: ${met != null ? `руки сошлись → щит ${met} мс` : 'щит'}${frame != null ? `, кадр → щит ${frame} мс` : ''}; признаки: ${T.why}${sp}${guessed ? '; защита была с опережения' : ''}${T.alerted ? `; опасность рядом: ${this._alertWhy || g.shieldAlert?.why || ''}` : ''}`;
        try { if (g.spellLog) g.spellLog.note(line); else console.info(line); } catch (e) { console.info(line); }
    }
}
