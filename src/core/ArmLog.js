/**
 * ArmLog.js — the arms' diary (shoulder → elbow → wrist; NOT the palms and fingers).
 *
 * The author: «добавил бы детальное логирование рук на всякий случай» — the arms shook when
 * raised over the head (the camera does not see the whole arm there). So every second one
 * line per arm: how well the network saw the elbow and the wrist, how much of the time they
 * were out of the picture (and where: top/bottom/sides), how much was held from the last good
 * picture (ArmGuard), how often a bone came longer than it is (cut back), the biggest jump of
 * the raw point, and what the hero's arm did with it (Character: raised how high, how much the
 * «arm straight up» turn fix was on, the biggest turn in one frame — a shake shows there).
 * Plus event lines the moment something happens (a point lost / seen again, a jerk).
 *
 * Kept small (CappedLog) and written to zns-arms.log next to the game (server.py /api/armlog):
 * Settings → Журнал → «Руки». Off: localStorage['zns.armlog'] = '0'.
 * In the console: __znsArmLog.text() — the last lines.
 */

import { CappedLog } from './CappedLog.js';

export const ARM_LOG_MAX = 1500;

const pad = (n) => String(n).padStart(2, '0');
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0').slice(0, 1)}`;
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const pct = (a, n) => (n > 0 ? `${Math.round((100 * a) / n)}%` : '-');
const SIDE = { left: 'Л', right: 'П' };
const JOINT = { elbow: 'локоть', wrist: 'запястье' };
const WHERE = { top: 'сверху', bottom: 'снизу', left: 'слева', right: 'справа' };

function newJoint() {
    return { n: 0, vis: 0, visMin: 1, trust: 0, held: 0, out: 0, where: {}, clamped: 0, jumpMax: 0, speed: 0, speedMax: 0 };
}
function newRender() {
    return { n: 0, lift: 0, liftMax: 0, fix: 0, fixMax: 0, turn: 0, turnMax: 0, jerks: 0 };
}

export class ArmLog {
    constructor({ send = typeof window !== 'undefined', period = 1000, max = ARM_LOG_MAX, now = () => performance.now() } = {}) {
        this.send = send;
        this.period = period;
        this.now = now;
        this.lines = new CappedLog(max);
        this.enabled = true;
        try { if (globalThis.localStorage?.getItem('zns.armlog') === '0') this.enabled = false; } catch (e) { /* no storage */ }
        this._started = false;
        this._queue = [];
        this._sendTimer = 0;
        this._eventsThisSec = 0;
        this._reset(this.now());
        this.lost = {}; // 'left.wrist' → since (ms): the point is not trusted now
        this.speedNow = { left: 0, right: 0 };
    }

    _reset(t) {
        this.since = t;
        this.results = 0;
        this.frames = 0;
        this.j = { left: { elbow: newJoint(), wrist: newJoint() }, right: { elbow: newJoint(), wrist: newJoint() } };
        this.r = { left: newRender(), right: newRender() };
        this._eventsThisSec = 0;
    }

    /** One camera result arrived (ArmGuard, once per picture). */
    result() {
        if (!this.enabled) return;
        this.results++;
        this._maybeFlush();
    }

    /**
     * One arm point of one camera result (ArmGuard).
     * d: {vis, trust, edge (min distance to the picture's edge, <0 outside), where, clamped, jump (sw), speed (sw/s)}
     */
    joint(side, name, d) {
        if (!this.enabled) return;
        const a = this.j[side]?.[name];
        if (!a) return;
        a.n++;
        a.vis += d.vis; a.visMin = Math.min(a.visMin, d.vis);
        a.trust += d.trust;
        if (d.trust < 0.5) a.held++;
        if (d.edge < 0) { a.out++; if (d.where) a.where[d.where] = (a.where[d.where] || 0) + 1; }
        if (d.clamped) a.clamped++;
        this.speedNow[side] = Math.max(name === 'elbow' ? 0 : this.speedNow[side] || 0, d.speed || 0); // (the arm's speed now: a jerk is a big turn of a still arm)
        a.jumpMax = Math.max(a.jumpMax, d.jump || 0);
        a.speed += d.speed || 0; a.speedMax = Math.max(a.speedMax, d.speed || 0);
        // events: lost / seen again (with hysteresis: lost below 0.3, back above 0.7)
        const key = `${side}.${name}`;
        const t = this.now();
        if (this.lost[key] == null && d.trust < 0.3) {
            this.lost[key] = t;
            const why = d.edge < 0 ? `за кадром ${WHERE[d.where] || ''}`.trim() : 'сеть не уверена';
            this.event(`${SIDE[side]} ${JOINT[name]}: потерян (${why}, видимость ${f(d.vis)}) → держу от прошлого кадра`);
        } else if (this.lost[key] != null && d.trust > 0.7) {
            this.event(`${SIDE[side]} ${JOINT[name]}: снова виден через ${Math.round(t - this.lost[key])} мс`);
            this.lost[key] = null;
        }
        if ((d.jump || 0) > 1.2) this.event(`${SIDE[side]} ${JOINT[name]}: скачок сырой точки ${f(d.jump, 1)} ширины плеч за кадр (видимость ${f(d.vis)})`);
    }

    /**
     * One drawn frame of the hero's arm (Character.updateArmsLookAt).
     * d: {lift (deg: 0 hanging, 90 forward/sideways, 180 straight up), fix (0..1: the straight-arm turn fix),
     *     turn (deg the upper arm + forearm turned this frame), dt}
     */
    render(side, d) {
        if (!this.enabled) return;
        const a = this.r[side];
        if (!a) return;
        if (side === 'left') this.frames++;
        a.n++;
        a.lift += d.lift; a.liftMax = Math.max(a.liftMax, d.lift);
        a.fix += d.fix; a.fixMax = Math.max(a.fixMax, d.fix);
        a.turn += d.turn; a.turnMax = Math.max(a.turnMax, d.turn);
        // a jerk: a big turn in one frame while the arm's own speed (the camera's) is small
        if (d.turn > 25 && (d.speed ?? this.speedNow[side]) < 3) {
            a.jerks++;
            this.onJerk?.(side, { turn: Math.round(d.turn), lift: Math.round(d.lift), fix: +d.fix.toFixed(2) }); // (SkeletonRecorder keeps those seconds)
            this.event(`${SIDE[side]} рука: рывок ${Math.round(d.turn)}° за кадр при спокойной руке (подъём ${Math.round(d.lift)}°, фикс поворота ${f(d.fix)})`);
        }
        this._maybeFlush();
    }

    event(text) {
        if (!this.enabled) return;
        if (++this._eventsThisSec > 12) return; // (a storm of events: the summary tells the rest)
        this._line(`${clock(new Date())} ! ${text}`);
    }

    _maybeFlush() {
        const t = this.now();
        if (t - this.since >= this.period) this.flush(t);
    }

    /** The summary of the last period (one line per arm) — written only when the camera gave something. */
    flush(t = this.now()) {
        const secs = Math.max(0.001, (t - this.since) / 1000);
        if (this.results > 0 || this.frames > 0) {
            const head = `${clock(new Date())} | камера ${f(this.results / secs, 0)}/с, кадры ${f(this.frames / secs, 0)}/с`;
            const parts = [head];
            for (const side of ['left', 'right']) {
                const js = ['elbow', 'wrist'].map((name) => {
                    const a = this.j[side][name];
                    if (!a.n) return `${JOINT[name]} нет данных`;
                    const where = Object.entries(a.where).sort((x, y) => y[1] - x[1]).map(([w]) => WHERE[w]).join('/');
                    let s = `${JOINT[name]} вид ${f(a.vis / a.n)} (мин ${f(a.visMin)}) доверие ${f(a.trust / a.n)}`;
                    if (a.held) s += ` удерж ${pct(a.held, a.n)}`;
                    if (a.out) s += ` за кадром ${pct(a.out, a.n)}${where ? ` (${where})` : ''}`;
                    if (a.clamped) s += ` длина обрезана ${a.clamped}`;
                    s += ` скорость ${f(a.speed / a.n, 1)}/${f(a.speedMax, 1)} ш/с скачок ${f(a.jumpMax)} ш`;
                    return s;
                });
                const r = this.r[side];
                const rs = r.n
                    ? `герой: подъём ${Math.round(r.lift / r.n)}° (макс ${Math.round(r.liftMax)}°) фикс поворота ${f(r.fix / r.n)} поворот ${f(r.turn / r.n, 1)}°/кадр (макс ${f(r.turnMax, 1)}°)${r.jerks ? ` рывков ${r.jerks}` : ''}`
                    : 'герой: нет кадров';
                parts.push(`${SIDE[side]}: ${js.join('; ')}; ${rs}`);
            }
            this._line(parts.join(' | '));
        }
        this._reset(t);
    }

    _line(line) {
        this.lines.push(line);
        if (!this.send || typeof fetch === 'undefined') return;
        if (!this._started) {
            this._started = true;
            this._queue.push(`=== Журнал рук ${new Date().toLocaleString('ru-RU')} ===`);
        }
        this._queue.push(line);
        if (!this._sendTimer) {
            this._sendTimer = setTimeout(() => {
                this._sendTimer = 0;
                const lines = this._queue.splice(0);
                fetch('/api/armlog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines }) }).catch(() => {});
            }, 2000);
        }
    }

    text() {
        return this.lines.join('\n');
    }
}

/** The game's one diary (the player's own arms). */
export const armLog = new ArmLog();
if (typeof globalThis !== 'undefined') globalThis.__znsArmLog = armLog;
