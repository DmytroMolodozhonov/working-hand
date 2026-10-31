/**
 * HandsLog.js — the journal «Руки»: where the hands and the fingers may go wrong (the author: «логи на кисти рук и сами
 * руки, чтобы отслеживать, где могут быть проблемы»). Into «Общие логи» (tag «Руки»), never per frame:
 *
 *  - every ~1 s each hand is looked at; a line is written only when something changed (up / down, the gesture,
 *    seen / lost, what is held, the camera lagging, many frames lost), at most one per hand per second;
 *  - at once, on an event: the hand vanished («было видно N мс → пропала») and came back («пропадала на N кадров»),
 *    a hand stuck (the picture does not change though it is seen);
 *  - other players (the net): packets a second, age of the last one, the longest gap (a jerk), once in a few seconds,
 *    only on a change.
 *
 * Pure parts (gestureOf, HandMeter, remoteLine) are tested (tests/unit/all-logs.test.js); the game side only reads.
 */

import { allLog } from '../core/AllLog.js';

export const HANDS = {
    SAMPLE_MS: 100, // the hand is looked at this often
    LINE_MS: 1000, // a hand's line at most this often
    LOST_MS: 400, // not seen this long = lost (as Character.isHandTracked)
    MISS_BAD: 0.12, // this share of the pictures without the hand in a second: worth a line
    LAG_BAD: 250, // ms: the camera's last picture is older than this
    STUCK_MS: 1500, // the hand seen but the picture does not change this long
    STUCK_EPS: 0.0004, // (the wrist moved less than this in the picture)
    REMOTE_MS: 4000, // the other players' line at most this often
    RAISED_UP: -0.3, // sin of the arm's elevation: above this the arm is raised
    CAM_MS: 5000, // the camera's line («камера: …») at most this often, only on a change
    SHAKE_CM: 2.5, JUMP_CM: 6, WALL_FLIPS: 3, // an arm held still trembling more than this (tools/armstab.mjs: ~1 cm with a noisy camera)
};

/**
 * The camera's line: poses a second, the delay from the picture to the game and where it went, how far ahead the hands are
 * shown, and — if poses come rarely or late — why (the author's log: «камера шлёт раз в 63–100 мс при 41–55 FPS игры»).
 * st: {poses, camFps, age, stages: [waited, networks, rest] (ms), gameFps, lead (ms), engine} → {text, bad, key} | null.
 */
export function cameraLine(st) {
    if (!st || !(st.poses > 0)) return null;
    const [wait = 0, net = 0, rest = 0] = st.stages || [];
    const age = st.age ?? null;
    const deliver = age != null && st.stages ? Math.max(0, age - wait - net - rest) : null;
    const why = [];
    if (st.camFps && st.camFps < 24) why.push(`камера сама даёт только ${Math.round(st.camFps)} кадр./с (мало света — камера держит кадр дольше; или так настроена)`);
    if (net > 45) why.push(`нейросети считают кадр ${Math.round(net)} мс (видеокарту/процессор делят нейросеть жителей, голос, озвучка)`);
    if (wait > 30) why.push(`кадр ждал ${Math.round(wait)} мс, пока нейросети закончат прошлый`);
    if (st.gameFps && st.gameFps < 40 && st.camFps && st.poses < st.camFps * 0.8) why.push(`игра медленная (${st.gameFps} FPS) — камера подстраивается под неё`);
    if (deliver != null && deliver > 40) why.push(`доставка в игру ${Math.round(deliver)} мс`);
    const gap = Math.round(1000 / st.poses);
    const text = `камера: ${st.poses} поз/с (раз в ${gap} мс${st.camFps ? `, камера даёт ${Math.round(st.camFps)}/с` : ''}), `
        + `от снимка до игры ${age != null ? Math.round(age) + ' мс' : '—'}`
        + (st.stages ? ` (ждал ${Math.round(wait)}, нейросети ${Math.round(net)}, прочее ${Math.round(rest)}${deliver != null ? `, доставка ${Math.round(deliver)}` : ''})` : '')
        + (st.lead != null ? `, руки показаны вперёд на ${Math.round(st.lead)} мс` : '')
        + (st.engine ? `, кисти ${st.engine}` : '')
        + (why.length ? `; почему редко/поздно: ${why.join('; ')}` : '');
    const bad = why.length > 0 || st.poses < 20;
    // (a new line only when something worth saying changed: the rate by 5, the delay by 25 ms, the reasons)
    const key = `${Math.round(st.poses / 5)}|${age != null ? Math.round(age / 25) : '-'}|${why.length}`;
    return { text, bad, key };
}

const SIDE = { right: 'правая', left: 'левая' };
const f1 = (x) => (Number.isFinite(x) ? (Math.round(x * 10) / 10).toString() : '—');
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const deg = (rad) => `${Math.round(rad * 57.2958)}°`;

/**
 * The hand's shape by its fingers' closing (0 open … 1 closed): fist / open / pointing / pinch (a pen, the wand's grip) / half.
 * @param {{thumb?: number, index: number, middle: number, ring: number, pinky?: number}} f
 */
export function gestureOf(f) {
    if (!f) return 'неизвестно';
    const { index = 0, middle = 0, ring = 0 } = f, pinky = f.pinky ?? ring;
    const rest = (middle + ring + pinky) / 3;
    if (index >= 0.7 && rest >= 0.7) return 'кулак';
    if (index <= 0.25 && middle <= 0.25 && ring <= 0.25 && pinky <= 0.3) return 'открыта';
    if (index <= 0.3 && rest >= 0.6) return 'указывает';
    if (index > 0.3 && index < 0.8 && rest >= 0.6) return 'щепоть';
    return 'полусогнута';
}

/** The fingers' closing as one short text: «б0.8 у1 с1 б1 м1» (thumb, index, middle, ring, little). */
export function fingersText(f) {
    if (!f) return '—';
    return `бол ${f1(f.thumb)}, указ ${f1(f.index)}, сред ${f1(f.middle)}, безым ${f1(f.ring)}, миз ${f1(f.pinky)}`;
}

/**
 * What the camera sent about one hand, counted over a second: pictures, pictures without the hand, the longest
 * run of them, how long the hand has been seen / lost, how long the picture did not change.
 */
export class HandMeter {
    constructor() { this.reset(); }

    reset() {
        this.frames = 0; this.missing = 0; this.run = 0; this.longest = 0;
        this.seenSince = 0; this.lostSince = 0; this.lastShown = 0;
        this.stillSince = 0; this.lastPos = null;
    }

    /** One picture: was the hand in it, and where its wrist was (x, y). → {back: frames it was lost for} when it came back. */
    frame(now, hand, wrist) {
        this.frames++;
        let back = 0;
        if (hand) {
            if (this.run) { back = this.run; this.run = 0; }
            this.lastShown = now;
            if (!this.seenSince) this.seenSince = now;
            this.lostSince = 0;
        } else {
            this.missing++;
            this.run++;
            if (this.run > this.longest) this.longest = this.run;
            if (!this.lostSince) this.lostSince = now;
        }
        // stuck: the wrist is exactly where it was, picture after picture, while the hand is "seen"
        if (hand && wrist && this.lastPos) {
            const d = Math.abs(wrist.x - this.lastPos.x) + Math.abs(wrist.y - this.lastPos.y);
            if (d > HANDS.STUCK_EPS) this.stillSince = 0;
            else if (!this.stillSince) this.stillSince = now;
        } else this.stillSince = 0;
        this.lastPos = wrist ? { x: wrist.x, y: wrist.y } : null;
        return { back };
    }

    /** The second's numbers; the window starts again. */
    take() {
        const o = { frames: this.frames, missing: this.missing, share: this.frames ? this.missing / this.frames : 0, longest: this.longest };
        this.frames = 0; this.missing = 0; this.longest = this.run; // (a run still going on carries over)
        return o;
    }

    stuckFor(now) { return this.stillSince ? now - this.stillSince : 0; }
}

/** The other player's hands as the net gives them (pure): one line, or null when nothing to say. */
export function remoteLine(name, st) {
    if (!st || !st.n) return null;
    const bad = st.age > 800 || st.maxGap > 600 || st.rate < 6;
    return `${name}: пакетов ${f1(st.rate)}/с, последний ${Math.round(st.age)} мс назад, самый долгий промежуток ${Math.round(st.maxGap)} мс${st.maxGap > 600 ? ' (рывок!)' : ''}, кисти в пакете: левая ${st.lh ? 'есть' : 'нет'}, правая ${st.rh ? 'есть' : 'нет'}${bad ? ' — связь с этим игроком плохая' : ''}`;
}

/**
 * The arm's trembling, as drawn (pure, fixed memory): the hand in the body's space each game frame; its fast part (off a
 * 0.3 s mean) RMS over a second, the biggest jump in one frame, how often it turns back in and out of a wall it is held at.
 * The author: «рука… начинает дрожать, у неё истерика» — a line in «Руки» when it trembles, to send.
 */
export class ArmShake {
    constructor() { this.reset(); }
    reset() { this.mx = this.my = this.mz = 0; this.px = this.py = this.pz = 0; this.on = false; this.s2 = 0; this.n = 0; this.jump = 0; this.wallN = 0; this.flips = 0; this.dir = 0; this.acc = 0; this.t = 0; }
    /** One frame: the hand (body space, m), dt (s), how far it is held off a wall now (m). */
    step(x, y, z, dt, held) {
        if (!this.on) { this.mx = this.px = x; this.my = this.py = y; this.mz = this.pz = z; this.on = true; return; }
        const k = 1 - Math.exp(-Math.max(0, dt) / 0.3);
        const ox = this.mx, oy = this.my, oz = this.mz;
        this.mx += (x - this.mx) * k; this.my += (y - this.my) * k; this.mz += (z - this.mz) * k;
        // (only while the arm is held about still — the mean moving slower than 0.5 m/s: a swing is not a trembling)
        const ms = dt > 0 ? Math.sqrt((this.mx - ox) ** 2 + (this.my - oy) ** 2 + (this.mz - oz) ** 2) / dt : 0;
        const jx = x - this.px, jy = y - this.py, jz = z - this.pz;
        this.px = x; this.py = y; this.pz = z;
        this.t += dt;
        if (ms > 0.5) return;
        const dx = x - this.mx, dy = y - this.my, dz = z - this.mz;
        this.s2 += dx * dx + dy * dy + dz * dz; this.n++;
        this.jump = Math.max(this.jump, Math.sqrt(jx * jx + jy * jy + jz * jz));
        if (held > 0.005) {
            // (back and forth: the frame-to-frame move along its biggest axis turning, past 3 mm)
            this.wallN++;
            const a = Math.abs(jx) > Math.abs(jy) ? (Math.abs(jx) > Math.abs(jz) ? jx : jz) : (Math.abs(jy) > Math.abs(jz) ? jy : jz);
            this.acc += a;
            if (Math.abs(this.acc) > 0.003) { const sg = Math.sign(this.acc); if (this.dir && sg !== this.dir) this.flips++; this.dir = sg; this.acc = 0; }
        }
    }
    /** The last second (or so): { cm, jumpCm, wall (share of frames held), flips (a second) }; starts the next. */
    take() {
        const r = { n: this.n, cm: this.n ? Math.sqrt(this.s2 / this.n) * 100 : 0, jumpCm: this.jump * 100, wall: this.n ? this.wallN / this.n : 0, flips: this.t > 0 ? this.flips / this.t : 0, s: this.t };
        this.s2 = 0; this.n = 0; this.jump = 0; this.wallN = 0; this.flips = 0; this.t = 0;
        return r;
    }
}

/** Is that second's arm trembling worth a line? (cm of a still arm's noise is ~1; a twitch, «hysterics» at a wall). */
export function shakeLine(r, fps) {
    if (!(r.s > 0.5) || r.n < 20) return null; // (held still for at least a third of a second)
    const bad = r.cm > HANDS.SHAKE_CM || r.jumpCm > HANDS.JUMP_CM || r.flips > HANDS.WALL_FLIPS;
    if (!bad) return null;
    return `рука: дрожь ${f1(r.cm)} см, рывок за кадр ${f1(r.jumpCm)} см, частота поз ${fps}/с, касание стены ${r.wall > 0.05 ? `${Math.round(r.wall * 100)}% времени, туда-сюда ${f1(r.flips)}/с` : 'нет'}`;
}

export class HandsLog {
    constructor(game) {
        this.game = game;
        this.meter = { left: new HandMeter(), right: new HandMeter() };
        this.sig = { left: '', right: '' };
        this.lastLine = { left: -1e9, right: -1e9 };
        this.lastLost = { left: -1e9, right: -1e9 };
        this._acc = 0;
        this._lineAcc = 0;
        this._poseTimes = []; // (the last second of pictures' arrival: pictures a second)
        this._lastPose = 0;
        this._remoteAt = 0;
        this._remoteSig = new Map();
        this._arm = { left: {}, right: {} };
        this.shake = { left: new ArmShake(), right: new ArmShake() };
        this._shakeAt = 0;
    }

    /** A camera picture came (Game.setPose): cheap counters only. */
    noteFrame(pose) {
        const now = performance.now();
        this._lastPose = now;
        const t = this._poseTimes;
        t.push(now);
        while (t.length && now - t[0] > 1000) t.shift();
        for (const side of ['left', 'right']) {
            const wrist = pose?.[side + 'Wrist'];
            const hand = pose?.[side + 'HandLandmarks'];
            const r = this.meter[side].frame(now, !!hand, wrist);
            if (r.back > 2) this._event(side, now, `кисть вернулась: пропадала на ${r.back} ${r.back < 5 ? 'кадра' : 'кадров'} подряд (${Math.round(r.back * 1000 / Math.max(8, t.length))} мс)`);
        }
    }

    /** Every game frame; looks at the hands 10 times a second. */
    update(dt) {
        this._shakeStep(dt);
        this._acc += dt * 1000;
        if (this._acc < HANDS.SAMPLE_MS) return;
        this._acc = 0;
        const g = this.game, ch = g.character;
        if (!ch?.armState) return;
        const now = performance.now();
        this._lineAcc += HANDS.SAMPLE_MS;
        for (const side of ['right', 'left']) this._side(side, ch, g, now);
        if (this._lineAcc >= HANDS.LINE_MS) this._lineAcc = 0;
        this._remotes(now);
        this._camera(now);
    }

    _camera(now) {
        if (now - (this._camAt || 0) < HANDS.CAM_MS) return;
        this._camAt = now;
        const g = this.game, ps = g.poseService?.stats, sm = g.poseSmoother;
        if (!ps || !this._poseTimes.length || now - this._lastPose > 2000) return;
        const line = cameraLine({ poses: this._poseTimes.length, camFps: ps.camFps, age: ps.handAge, stages: ps.stages, gameFps: g.fpsNow, lead: sm ? sm.lead * 1000 : null, engine: ps.handsEngine === 'v5' ? `V5${ps.v5Engine === 'gpu' ? ' (видеокарта)' : ps.v5Engine === 'cpu' ? ' (процессор)' : ''}` : ps.handsEngine });
        if (!line || line.key === this._camKey) return;
        this._camKey = line.key;
        allLog('Руки', line.text, line.bad ? 'warn' : 'info');
    }

    /** The arms' trembling, every frame (cheap: the hand into the body's space); a line a second at most, when it trembles. */
    _shakeStep(dt) {
        const g = this.game, ch = g.character;
        if (!ch?.getHandWorldPosition || !ch.group) return;
        ch.group.updateMatrixWorld?.();
        const inv = this._inv || (this._inv = ch.group.matrixWorld.clone());
        inv.copy(ch.group.matrixWorld).invert();
        const v = this._v || (this._v = ch.group.position.clone());
        for (const side of ['left', 'right']) {
            ch.getHandWorldPosition(side, v).applyMatrix4(inv);
            this.shake[side].step(v.x, v.y, v.z, dt, g.handBlocks?.pushed?.[side] || 0);
        }
        const now = performance.now();
        if (now - this._shakeAt < 1000) return;
        this._shakeAt = now;
        for (const side of ['right', 'left']) {
            const line = ch.isHandTracked?.(side) === false ? null : shakeLine(this.shake[side].take(), this._poseTimes.length);
            if (line) allLog('Руки', `${SIDE[side]}: ${line}`, 'warn');
        }
    }

    _event(side, now, text) {
        if (now - this.lastLost[side] < 500) return; // (a flicker: one line, not a dozen)
        this.lastLost[side] = now;
        allLog('Руки', `${SIDE[side]}: ${text}`, 'warn');
    }

    _side(side, ch, g, now) {
        const m = this.meter[side];
        const tracked = !!ch.isHandTracked?.(side);
        // the hand just vanished: said at once (was seen for N ms)
        if (!tracked && m.seenSince && m.lastShown && now - m.lastShown > HANDS.LOST_MS) {
            this._event(side, now, `кисть пропала: была видна ${Math.round(m.lastShown - m.seenSince)} мс, теперь нет${g.items?.held?.[side] ? ` (в руке: ${g.items.held[side].item.kind})` : ''}`);
            m.seenSince = 0;
        }
        if (this._lineAcc < HANDS.LINE_MS) return;
        const hand = ch.getActiveHands?.()[side];
        const fingers = (hand?.targetState || hand?.currentState)?.fingers || null;
        const arm = ch.armState(side, this._arm[side]);
        const held = g.items?.held?.[side]?.item;
        const heldText = held ? `${held.kind}#${held.uid}` : (g.weapons?.hands?.[side]?.held ? 'оружие' : 'пусто');
        const gesture = tracked ? (held?.kind === 'wand' ? 'палочка' : gestureOf(fingers)) : 'не видна';
        const raised = arm.up > HANDS.RAISED_UP;
        const stat = m.take();
        const age = this._lastPose ? now - this._lastPose : null;
        const lag = age != null && age > HANDS.LAG_BAD;
        const bad = stat.share > HANDS.MISS_BAD && stat.frames > 4;
        const stuck = tracked && m.stuckFor(now) > HANDS.STUCK_MS;
        const sig = `${raised}|${gesture}|${tracked}|${heldText}|${lag}|${bad}|${stuck}`;
        if (sig === this.sig[side]) return;
        this.sig[side] = sig;
        const ps = g.poseService?.stats;
        const fps = this._poseTimes.length;
        const lines = [
            raised ? 'поднята' : 'опущена',
            `жест: ${gesture}${tracked && fingers ? ` (пальцы ${fingersText(fingers)})` : ''}`,
            tracked ? `видна, пропавших кадров ${Math.round(stat.share * 100)}% за секунду (самая долгая пропажа ${stat.longest} кадр.)` : 'не видна камере',
            `рука вытянута ${f2(arm.reach)}, вперёд ${deg(Math.acos(Math.max(-1, Math.min(1, arm.forward))))}, наклон ${deg(Math.asin(Math.max(-1, Math.min(1, arm.up))))}, ладонь вверх ${f2(arm.palmUp)}`,
            `скорость ${f1(arm.speed)} м/с`,
            `в руке: ${heldText}`,
            `камера: ${fps} поз/с${age != null ? `, последняя ${Math.round(age)} мс назад` : ''}${ps?.latency ? `, задержка ${ps.latency} мс` : ''}${lag ? ' — ЗАДЕРЖКА' : ''}`,
        ];
        if (stuck) lines.push(`ЗАЛИПЛА: картинка не меняется ${f1(m.stuckFor(now) / 1000)} с, хотя кисть «видна»`);
        allLog('Руки', `${SIDE[side]}: ${lines.join('; ')}`, stuck || lag || bad ? 'warn' : 'info');
    }

    _remotes(now) {
        if (now - this._remoteAt < HANDS.REMOTE_MS) return;
        this._remoteAt = now;
        for (const [id, r] of this.game.remotes || []) {
            const st = r.netStats?.(now);
            const line = remoteLine(r.name || id, st);
            if (!line) continue;
            const key = `${st.maxGap > 600}|${st.age > 800}|${st.rate < 6}|${st.lh}|${st.rh}`;
            if (this._remoteSig.get(id) === key) continue;
            this._remoteSig.set(id, key);
            allLog('Руки', `сеть, ${line}`, st.maxGap > 600 || st.age > 800 ? 'warn' : 'info');
        }
        if (this._remoteSig.size > 32) this._remoteSig.clear();
    }
}
