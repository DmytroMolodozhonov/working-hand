/**
 * PlantHunt.js — the hunt of the carnivorous head as a pure little simulation (no THREE: Plants.js runs it, the tests and
 * tools/huntbench.mjs run the very same code).
 *
 * Слова автора: «оно должно уметь РАСТЯГИВАТЬСЯ и реалистично ХВАТАТЬ животное… ЧЕЛЮСТЯМИ щупать и проглатывать… сейчас животное
 * как будто ТЕЛЕПОРТИРУЕТСЯ ему в рот». Поэтому жертва НИКОГДА не ставится в пасть: пасть сама тянется к ней (шея растягивается),
 * щупальца обвивают и подтягивают (не быстрее TUG_V), челюсти смыкаются там, где жертва уже есть, и дальше жертва едет за пастью
 * (пасть + небольшой «хват», который сам плавно сходит к месту во рту). Каждый кадр жертва сдвигается не дальше, чем пасть + хват
 * могут (`maxPreyStep`) — это проверяет тест и стенд.
 *
 * Координаты — МЕСТНЫЕ в растении (метры при размере 1, ось y вверх, земля у основания y = 0, рост растения не учтён).
 *
 *   idle  ждёт, пасть полуоткрыта, голова следит за ближайшим живым      grab  шея растягивается к жертве, щупальца тянутся
 *   wrap  щупальца обвили и подтягивают к пасти                          snap  челюсти захлопнулись на жертве
 *   pull  шея сокращается, жертва поднимается к основному положению       bite  жуёт (несколько сжатий)
 *   gulp  глоток: жертва уходит в горло                                  digest горло вздуто, волна идёт вниз по шее
 *   spit  шея опускается и выпускает                                     cool/frozen пауза, холод
 */

export const HUNT_STATES = ['idle', 'grab', 'pull', 'bite', 'gulp', 'digest', 'spit', 'cool', 'frozen', 'wrap', 'snap'];
/** Indices of the states that carry the prey with them (the hold). */
export const HOLD_STATES = new Set(['wrap', 'snap', 'pull', 'bite', 'gulp', 'digest', 'spit']);

export const HUNT = {
    START_R: 9.2, // m: a living thing this near (from the root, on the ground) is hunted
    GIVE_UP_R: 11.8, // m: prey farther than this is let go (it ran away)
    NECK_MAX: 9.6, // m: the farthest the hinge of the jaws goes from the root of the neck (the neck stretches to ~1.7× its rest length)
    REST_NECK: 5.2, // m: the neck at rest (the old stem was 5.8 m high)
    REACH_V: 11, // m/s the head lunges
    NEAR_R: 4.6, // m: nearer than this the head slows down: the tendrils do the catching
    NEAR_V: 2.6,
    TENDRIL_R: 4.4, // m from the hinge: the tendrils reach this far
    WRAP_T: 0.45, // s the tendrils need to reach and coil
    TUG_V: 3.2, // m/s the wrapped prey is drawn toward the jaws (never faster: nothing teleports)
    HOVER: 2.0, // m: the open mouth stops this far from the prey; the tendrils (not the jaws) draw it the rest of the way
    SNAP_R: 1.3, // m: the prey is this near the mouth → the jaws slam shut
    SNAP_T: 0.32, // s of the slam
    PULL_V: 4.4, // m/s the neck draws back with the prey
    GRIP_V: 4.5, // m/s the prey slides to its place in the mouth
    GRAB_MAX_T: 2.6, WRAP_MAX_T: 2.4, PULL_MAX_T: 7,
    GULP_T: 0.9, // the swallow (the prey shrinks into the throat)
    SPIT_V: 8, // m/s the neck lowers the prey to put it down
    SPIT_OUT: 4.6, SPIT_Y: 2.6, // m: where the neck puts it down (out from the root, above the ground)
    MOUTH_F: 1.5, MOUTH_U: 0.15, // the mouth point in the head's own axes (hinge → mouth)
    BITES: 3, BITE_EVERY: 0.72,
    DIGEST: 5, INSIDE_MAX: 10, SPIT_ARMOUR: 7,
    COOL: 6, COOL_MAN: 25, COOL_LOST: 3.5, // s before it hunts again
    FIT: 2.15, // prey of size ≤ FIT × the plant's size fits the jaws (the table maxPrey)
    GRIP_FINAL: [0, -0.5, 0.1], // where a body hangs in the mouth, from the mouth point (world axes)
};

/**
 * ТАБЛИЦА maxPrey: кого пасть вмещает (размер из Animals.SPECIES.size × FIT растения; сверено с телами моделей).
 * Мелкое — глотает целиком; корова — только у крупных голов; конь и всё больше — нет; человек (3,5 м) целиком не глотается —
 * его держат в горле, как и раньше (`inside`); житель — кусает и выплёвывает.
 */
export const PREY_SIZE = { pig: 1.45, sheep: 1.55, cow: 2.0, horse: 2.3 };
export function preyFits(size, s = 1) { return size <= HUNT.FIT * s + 1e-9; }
/** The biggest animal size this plant swallows. */
export const maxPrey = (s = 1) => HUNT.FIT * s;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const wrapAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** The mouth point from the hinge `H` with the head turned by `yaw` and `pitch` (positive pitch looks down; Euler order YXZ). */
export function mouthOf(H, yaw, pitch, out = [0, 0, 0]) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw), F = HUNT.MOUTH_F, U = HUNT.MOUTH_U;
    out[0] = H[0] + cp * sy * F + sp * sy * U; out[1] = H[1] - sp * F + cp * U; out[2] = H[2] + cp * cy * F + sp * cy * U;
    return out;
}
/** The unit direction the jaws point to. */
export function aimDir(yaw, pitch, out = [0, 0, 0]) {
    const cp = Math.cos(pitch);
    out[0] = cp * Math.sin(yaw); out[1] = -Math.sin(pitch); out[2] = cp * Math.cos(yaw);
    return out;
}

/**
 * The neck: a cubic Bezier from the root `base` (leaving straight up) to the hinge `H` (arriving along the head's axis).
 * Fills `out` (N points, each [x,y,z]) and returns the length of the curve.
 */
export function neckSpine(base, H, yaw, pitch, out, N = out.length) {
    const d = aimDir(yaw, pitch, _d), chord = dist(base, H);
    const k0 = 0.42 * chord + 1.1, k1 = 0.32 * chord + 0.5;
    const p1 = _p1, p2 = _p2;
    p1[0] = base[0]; p1[1] = base[1] + k0; p1[2] = base[2]; p2[0] = H[0] - d[0] * k1; p2[1] = H[1] - d[1] * k1; p2[2] = H[2] - d[2] * k1;
    let L = 0, px = base[0], py = base[1], pz = base[2];
    for (let i = 0; i < N; i++) {
        const t = i / (N - 1), u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
        const o = out[i] || (out[i] = [0, 0, 0]);
        o[0] = a * base[0] + b * p1[0] + c * p2[0] + e * H[0]; o[1] = a * base[1] + b * p1[1] + c * p2[1] + e * H[1]; o[2] = a * base[2] + b * p1[2] + c * p2[2] + e * H[2];
        if (i) L += Math.sqrt((o[0] - px) ** 2 + (o[1] - py) ** 2 + (o[2] - pz) ** 2);
        px = o[0]; py = o[1]; pz = o[2];
    }
    return L;
}
const _d = [0, 0, 0], _p1 = [0, 0, 0], _p2 = [0, 0, 0];
/** How thick the neck stays when it stretches (it thins, like a stretched stalk, but never to a thread). */
export const neckThin = (L) => Math.max(0.62, Math.min(1, Math.sqrt(HUNT.REST_NECK / Math.max(1, L))));

/** The farthest a prey moves in one frame (m/s ceiling): the mouth at its fastest + the sliding of the grip. */
export const maxPreyV = () => Math.max(HUNT.REACH_V, HUNT.PULL_V, HUNT.SPIT_V, HUNT.TUG_V) + HUNT.GRIP_V + 1;
export const maxPreyStep = (dt) => maxPreyV() * dt;

export class Hunt {
    /** `restH`: the hinge at rest; `base`: the root of the neck; `restYaw`: where the head looks at rest. */
    constructor(restH = [0.4, 5.8, 0.3], base = [0, 0.8, 0], restYaw = 0) {
        this.rest = restH.slice(); this.base = base.slice(); this.restYaw = restYaw;
        this.H = restH.slice(); this.yaw = restYaw; this.pitch = 0.1;
        this.st = 'idle'; this.t = 0; this.cool = 0; this.speed = 0; this.clock = 0;
        this.prey = null; // {kind:'a'|'v'|'p', size, verdict:'eat'|'tire'|'spit', inside}
        this.preyPos = [0, 0, 0]; this.preyScale = 1; this.grip = [0, 0, 0]; this.owned = false;
        this.tendril = 0; this.bites = 0; this.tire = 0; this.digest = 0; this.spat = false; this.spitAt = null;
        this.events = []; this.mouth = [0, 0, 0]; this.bulge = -1; this.look = null; this._t = [0, 0, 0]; this._a = [0, 0];
        mouthOf(this.H, this.yaw, this.pitch, this.mouth);
    }

    get holding() { return HOLD_STATES.has(this.st) && !!this.prey && (this.st !== 'digest' || !!this.prey.inside); }

    enter(st) { this.st = st; this.t = 0; if (st === 'spit') { this.spat = false; this.spitAt = null; } }

    /** (host) Start hunting `prey` seen at `pos`. */
    begin(prey, pos) {
        this.prey = prey; this.preyPos = pos.slice(); this.preyScale = 1; this.owned = false;
        this.tendril = 0; this.bites = 0; this.tire = 0; this.spat = false;
        this.enter('grab'); this.events.push('lash');
    }
    /** Let the prey go (it ran, died, or was put down); the plant rests `cool` seconds. */
    letGo(cool, why = 'letgo') {
        if (this.prey) this.events.push(why);
        this.prey = null; this.owned = false; this.preyScale = 1; this.tendril = 0; this.cool = cool; this.bulge = -1;
        this.enter('idle');
    }
    /** (guest) The host's state: the same motion, no decisions. */
    setNet(st, t, prey) {
        if (st !== this.st) { this.enter(st); this.t = t; if (st === 'idle') { this.owned = false; this.tendril = 0; } }
        else if (Math.abs(this.t - t) > 0.4) this.t = t;
        this.prey = prey || (st === 'idle' ? null : this.prey);
    }
    freeze() { this.prey = null; this.owned = false; this.tendril = 0; this.bulge = -1; this.enter('frozen'); }

    /**
     * One frame. `o`: { auth, prey: observed [x,y,z] of a prey that is not ours yet, alive, struck (the plant was hit this frame),
     * sway (idle drift on/off) }. Returns the events of this frame (strings).
     */
    step(dt, o = {}) {
        const ev = this.events; ev.length = 0;
        const auth = o.auth !== false;
        this.t += dt; this.clock += dt;
        const prey = this.prey, st = this.st;
        const alive = o.alive !== false;
        // ---- the observed prey (until the plant owns it)
        if (prey && !this.owned && o.prey) { this.preyPos[0] = o.prey[0]; this.preyPos[1] = o.prey[1]; this.preyPos[2] = o.prey[2]; }
        const own = HOLD_STATES.has(st) && !!prey && (st !== 'digest' || prey.inside);
        if (own && !this.owned) { this.owned = true; sub(this.preyPos, mouthOf(this.H, this.yaw, this.pitch, this.mouth)).forEach((v, i) => { this.grip[i] = v; }); }
        if (!own && this.owned) this.owned = false;

        // ---- decisions (host)
        if (auth && prey) this._decide(dt, o, alive);
        else if (auth && !prey && st === 'digest') { if (this.t >= this.digest) this.letGo(HUNT.COOL); } // (the meal was an animal: only the swelling goes down)
        else if (auth && !prey && st !== 'idle' && st !== 'frozen' && st !== 'cool') this.enter('idle');
        if (this.cool > 0 && this.st === 'idle') this.cool -= dt;

        // ---- the head: where it goes, how fast, where it looks
        const S = this.st;
        const tgt = this._target(S), vmax = this._vmax(S);
        const dx = tgt[0] - this.H[0], dy = tgt[1] - this.H[1], dz = tgt[2] - this.H[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const want = Math.min(vmax, d * 6);
        this.speed += (want - this.speed) * Math.min(1, dt * 10);
        const mv = Math.min(d, this.speed * dt);
        if (d > 1e-6) { this.H[0] += dx / d * mv; this.H[1] += dy / d * mv; this.H[2] += dz / d * mv; }
        // the neck's limit: the hinge cannot go farther than the neck stretches
        const bx = this.H[0] - this.base[0], by = this.H[1] - this.base[1], bz = this.H[2] - this.base[2], bl = Math.sqrt(bx * bx + by * by + bz * bz);
        if (bl > HUNT.NECK_MAX) { const k = HUNT.NECK_MAX / bl; this.H[0] = this.base[0] + bx * k; this.H[1] = this.base[1] + by * k; this.H[2] = this.base[2] + bz * k; }
        if (this.H[1] < 0.5) this.H[1] = 0.5; // (the jaws never go under the ground)
        // aim
        const aim = this._aim(S);
        const k = 1 - Math.exp(-dt * (S === 'grab' || S === 'wrap' ? 9 : 5));
        this.yaw += wrapAng(aim[0] - this.yaw) * k; this.pitch += (aim[1] - this.pitch) * k;
        mouthOf(this.H, this.yaw, this.pitch, this.mouth);

        // ---- the prey follows (physically, a step at a time)
        this._carry(dt, S);
        // tendrils: out while hunting, coiled while holding, in otherwise
        const tw = (S === 'grab' && d < 99 && prey && dist(this.H, this.preyPos) < HUNT.TENDRIL_R) || S === 'wrap' || S === 'snap' || S === 'pull' || (S === 'bite' && prey);
        this.tendril = Math.max(0, Math.min(1, this.tendril + (tw ? dt / HUNT.WRAP_T : -dt * 2.5)));
        return ev;
    }

    _decide(dt, o, alive) {
        const st = this.st, prey = this.prey, ev = this.events;
        const m = this.mouth, pp = this.preyPos;
        switch (st) {
            case 'grab': {
                if (!alive || dist(pp, this.base) > HUNT.GIVE_UP_R) { this.letGo(HUNT.COOL_LOST, 'lost'); return; }
                if (this.t > HUNT.GRAB_MAX_T) { this.letGo(HUNT.COOL_LOST, 'lost'); return; }
                if (dist(m, pp) < HUNT.SNAP_R) { ev.push('hold'); this.enter('snap'); ev.push('snap'); return; }
                if (this.tendril >= 1) { ev.push('hold', 'wrap'); this.enter('wrap'); }
                return;
            }
            case 'wrap':
                if (!alive || o.struck || this.t > HUNT.WRAP_MAX_T || dist(pp, this.H) > HUNT.TENDRIL_R * 1.7) { this.letGo(HUNT.COOL_LOST, 'lost'); return; }
                if (dist(m, pp) < HUNT.SNAP_R) { this.enter('snap'); ev.push('snap'); }
                return;
            case 'snap':
                if (!alive) { this.letGo(HUNT.COOL_LOST, 'lost'); return; }
                if (prey.verdict === 'spit') { this.enter('spit'); return; } // (a magic robe: it will not hold it)
                if (this.t >= HUNT.SNAP_T) this.enter('pull');
                return;
            case 'pull':
                if (!alive) { this.letGo(HUNT.COOL_LOST, 'lost'); return; }
                if (dist(this.H, this.rest) < 0.6 || this.t > HUNT.PULL_MAX_T) { this.bites = 0; this.tire = 0; this.enter('bite'); }
                return;
            case 'bite': {
                if (!alive) { this.letGo(HUNT.COOL_LOST, 'lost'); return; }
                this.tire += dt;
                const n = Math.floor(this.t / HUNT.BITE_EVERY);
                if (n > this.bites) { this.bites = n; ev.push('bite'); }
                if (prey.verdict === 'tire') { if (this.tire >= HUNT.SPIT_ARMOUR) this.enter('spit'); return; }
                if (this.bites >= HUNT.BITES && this.t >= HUNT.BITES * HUNT.BITE_EVERY) this.enter(prey.kind === 'v' ? 'spit' : 'gulp');
                return;
            }
            case 'gulp':
                if (!alive) { this.letGo(HUNT.COOL_LOST, 'lost'); return; }
                if (this.t >= HUNT.GULP_T) {
                    ev.push('gulp');
                    if (prey.kind === 'a') { ev.push('eaten'); this.prey = null; this.owned = false; this.preyScale = 1; this.digest = HUNT.DIGEST; this.bulge = 0.97; }
                    else { prey.inside = true; this.digest = this.digestFor ?? HUNT.INSIDE_MAX; }
                    this.enter('digest'); this.tendril = 0;
                }
                return;
            case 'digest':
                if (this.t >= this.digest) { if (this.prey) this.enter('spit'); else this.letGo(HUNT.COOL); }
                return;
            case 'spit':
                if (!this.spat) {
                    if (!this.spitAt) this.spitAt = this._spitPoint();
                    if (dist(this.H, this.spitAt) < 0.5 || this.t > 1.2) { this.spat = true; this.spitT = this.t; ev.push('spit'); this.owned = false; }
                } else if (this.t - this.spitT >= 0.7) this.letGo(prey.kind === 'p' ? HUNT.COOL_MAN : HUNT.COOL, 'done');
                return;
            default: return;
        }
    }

    _spitPoint() {
        const a = this.yaw;
        return [this.base[0] + Math.sin(a) * HUNT.SPIT_OUT, HUNT.SPIT_Y, this.base[2] + Math.cos(a) * HUNT.SPIT_OUT];
    }
    _target(S) {
        const prey = this.prey, pp = this.preyPos;
        switch (S) {
            case 'grab': {
                // stop short of the prey along the line from the head, so the MOUTH ends up on it
                const vx = pp[0] - this.H[0], vy = pp[1] - this.H[1], vz = pp[2] - this.H[2], l = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1, back = HUNT.MOUTH_F + HUNT.HOVER;
                if (l <= back) return this.H; // (near enough: the head waits for the tendrils)
                const T = this._t; T[0] = pp[0] - vx / l * back; T[1] = pp[1] - vy / l * back + 0.1; T[2] = pp[2] - vz / l * back; return T;
            }
            case 'wrap': case 'snap': case 'bite': case 'gulp': return this.H;
            case 'spit': return this.spitAt || (this.spitAt = this._spitPoint());
            case 'idle': case 'cool': case 'frozen': case 'digest': case 'pull': default: {
                if (S === 'idle' || S === 'cool') {
                    const c = this.clock, T = this._t;
                    T[0] = this.rest[0] + Math.sin(c * 0.5) * 0.28; T[1] = this.rest[1] + Math.sin(c * 0.73) * 0.16; T[2] = this.rest[2] + Math.cos(c * 0.42) * 0.28; return T;
                }
                return this.rest;
            }
        }
    }
    _vmax(S) {
        if (S === 'grab') { const d = this.prey ? dist(this.H, this.preyPos) : 99; return d > HUNT.NEAR_R ? HUNT.REACH_V : HUNT.NEAR_V + (HUNT.REACH_V - HUNT.NEAR_V) * Math.max(0, (d - 1.5) / HUNT.NEAR_R) * 0.4; }
        if (S === 'pull') return HUNT.PULL_V;
        if (S === 'spit') return HUNT.SPIT_V;
        if (S === 'idle' || S === 'cool' || S === 'frozen' || S === 'digest') return 3.4;
        return 0;
    }
    /** [yaw, pitch] the head turns to. */
    _aim(S) {
        const pp = this.preyPos;
        const A = this._a;
        if ((S === 'grab' || S === 'wrap' || S === 'snap') && this.prey) {
            const vx = pp[0] - this.H[0], vy = pp[1] - this.H[1], vz = pp[2] - this.H[2], h = Math.sqrt(vx * vx + vz * vz);
            A[0] = h > 0.05 ? Math.atan2(vx, vz) : this.yaw; A[1] = Math.max(-0.4, Math.min(1.3, Math.atan2(-vy, Math.max(0.5, h)))); return A;
        }
        if (S === 'pull' || S === 'bite' || S === 'gulp') { A[0] = this.yaw; A[1] = 0.32; return A; }
        if (S === 'spit') { A[0] = this.yaw; A[1] = 0.55; return A; }
        if (S === 'digest') { A[0] = this.yaw; A[1] = 0.12; return A; }
        if (this.look) {
            const vx = this.look[0] - this.H[0], vy = this.look[1] - this.H[1], vz = this.look[2] - this.H[2], h = Math.sqrt(vx * vx + vz * vz);
            A[0] = Math.atan2(vx, vz); A[1] = Math.max(-0.2, Math.min(0.8, Math.atan2(-vy, Math.max(1, h)) * 0.8)); return A;
        }
        const c = this.clock;
        A[0] = this.restYaw + Math.sin(c * 0.4) * 0.35; A[1] = 0.1 + 0.05 * Math.sin(c * 0.7); return A;
    }

    /** The prey moves with the plant: toward the mouth by the tendrils, then in the mouth (never faster than REACH_V + GRIP_V). */
    _carry(dt, S) {
        const prey = this.prey;
        if (!prey || !this.owned) return;
        const m = this.mouth;
        if (S === 'wrap') {
            const v = sub(m, this.preyPos), l = len(v), step = Math.min(l, HUNT.TUG_V * dt);
            if (l > 1e-6) { this.preyPos[0] += v[0] / l * step; this.preyPos[1] += v[1] / l * step; this.preyPos[2] += v[2] / l * step; }
            this.grip[0] = this.preyPos[0] - m[0]; this.grip[1] = this.preyPos[1] - m[1]; this.grip[2] = this.preyPos[2] - m[2];
            return;
        }
        // in the jaws: the hold slides to its place in the mouth (inside a man: the throat), at a limited speed
        const fin = S === 'gulp' ? this._throat() : (prey.inside || S === 'digest') ? this._inside() : HUNT.GRIP_FINAL;
        const v = [fin[0] - this.grip[0], fin[1] - this.grip[1], fin[2] - this.grip[2]], l = len(v), step = Math.min(l, HUNT.GRIP_V * dt * (S === 'gulp' ? 0.7 : 1));
        if (l > 1e-6) { this.grip[0] += v[0] / l * step; this.grip[1] += v[1] / l * step; this.grip[2] += v[2] / l * step; }
        this.preyPos[0] = m[0] + this.grip[0]; this.preyPos[1] = m[1] + this.grip[1]; this.preyPos[2] = m[2] + this.grip[2];
        this.preyScale = S === 'gulp' ? 1 - 0.7 * ease(this.t / HUNT.GULP_T) : 1;
    }
    /** Where the swallowed body goes: back into the throat (toward the hinge). */
    _throat() {
        const d = aimDir(this.yaw, this.pitch, _d2);
        return [-d[0] * 1.3, -d[1] * 1.3 - 0.2, -d[2] * 1.3];
    }
    /** Where a man kept inside hangs: just behind the mouth. */
    _inside() {
        const d = aimDir(this.yaw, this.pitch, _d2);
        return [-d[0] * 0.5, -d[1] * 0.5 - 0.3, -d[2] * 0.5];
    }

    /** 0…1 how open the jaws want to be (the game smooths it). */
    jawTarget() {
        const S = this.st, c = this.clock;
        switch (S) {
            case 'grab': return 0.85 - 0.12 * Math.min(1, this.t * 2); // (each jaw turns this much: the gape is twice)
            case 'wrap': return 0.72;
            case 'snap': return this.t < 0.05 ? 0.7 : 0.06;
            case 'pull': return this.prey?.kind === 'p' ? 0.3 : 0.12;
            case 'bite': { const ph = (this.t % HUNT.BITE_EVERY) / HUNT.BITE_EVERY; return 0.1 + 0.36 * Math.pow(Math.cos(ph * Math.PI * 0.5), 3); }
            case 'gulp': return Math.max(0.02, 0.3 - this.t * 0.35);
            case 'digest': return 0.02;
            case 'spit': return this.spat ? 0.8 : 0.1;
            case 'frozen': return 0.3;
            default: {
                const near = this.look ? 0.32 : 0.1; // (it has noticed someone near: the trap opens wider)
                return near + 0.05 * Math.sin(c * 1.3);
            }
        }
    }
    /** The swelling on the neck, as the point along it (1 = at the head … 0 = the root), or -1 when there is none. */
    bulgeAt() {
        if (this.st === 'gulp') return 0.96;
        if (this.st === 'digest' && !this.prey) return Math.max(0.05, 0.96 - 0.9 * Math.min(1, this.t / this.digest));
        if (this.st === 'digest' && this.prey) return 0.9; // (a man inside the throat)
        return -1;
    }
}
const _d2 = [0, 0, 0];

/** The verdict on a prey the head can reach: 'eat' | 'tire' | 'spit' | 'big' (does not fit the jaws) — one place for the game and the tests. */
export function huntVerdict(kind, size, s, gearVerdict) {
    if (kind === 'a' && !preyFits(size, s)) return 'big';
    return gearVerdict;
}
