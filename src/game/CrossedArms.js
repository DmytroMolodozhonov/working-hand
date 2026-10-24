/**
 * CrossedArms.js — «Protection» жестом: руки скрещены перед грудью (просьба автора).
 *
 *   Не обязательно говорить: встаньте прямо и скрестите руки перед грудью, как будто защищаетесь (хоть «как у покойника
 *   в гробу» — кисти у плеч; примерно, не точно) — встанет обычный голубой щит «Protection» (цена та же: 5 маны и 0,5/с,
 *   пока держите). Разведёте руки — щит снимется сам. Голосовой «Protection» остаётся как был: его снимают «стоп» и рывок.
 *
 *   Меряем по точкам камеры (33 точки позы), а не по телу героя: тело сжимает кисти к середине, а камера честно видит,
 *   что запястья поменялись местами (левое правее правого — для человека). Чистая часть (тесты): `crossedPose`,
 *   `CrossedGesture` (удержание и гистерезис). Игровая часть — `CrossedShield`: зовёт обычное «Protection» тем же путём,
 *   что голос (`Game.castLocalSpell`) — цена, мана, подсказки, сеть те же.
 *
 *   Допуски (в долях ширины плеч W; «вход» строже «выхода» — гистерезис, чтобы не мигало):
 *     - запястья поменялись местами (насколько левое ушло за правое):  вход ≥ 0,30 W,  выход ≥ 0,05 W
 *     - каждое запястье в пределах плеч по бокам от середины:           вход ≤ 0,9 W,   выход ≤ 1,2 W
 *     - высота запястья от линии плеч (вниз +):                         вход −0,35…1,5 W, выход −0,6…2,0 W
 *       (выше — рука у лица/рта, ниже — карман, пояс, руки опущены)
 *     - точки видны не хуже 0,5
 *   Задержки: 0,35 с держать — щит; 0,2 с разведённых рук (или запястье вышло из зоны) — щит снят.
 */

export const CROSS = {
    HOLD: 0.35, // s the cross is held before the shield goes up
    RELEASE: 0.2, // s the cross is open before the shield goes down
    SWAP_IN: 0.30, SWAP_OUT: 0.05, // the wrists changed places (× shoulder width)
    SIDE_IN: 0.9, SIDE_OUT: 1.2, // each wrist within this of the body's middle (arms crossed, not stretched aside)
    HIGH_IN: -0.35, HIGH_OUT: -0.6, LOW_IN: 1.5, LOW_OUT: 2.0, // the wrist's drop below the shoulder line (× shoulder width)
    VIS: 0.5,
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

/** The hold / release timers round `crossedPose`: step() → 'on' (just confirmed), 'off' (just opened), or null. */
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

/** The game's part: watches the hero's arms, puts «Protection» up and takes it down. */
export class CrossedShield {
    constructor(game) {
        this.game = game;
        this.gesture = new CrossedGesture();
        this.refused = false; // (the spell did not come — no mana…: not asked again until the arms open)
        this.mine = false; // (the shield on now is the one this gesture put up)
    }

    /** What keeps the arms from being a shield gesture right now (reading, pocket, the bow, the body not mine…). */
    blocked() {
        const g = this.game, c = g.combat;
        return !!(g.paused || c.dead || g.isDeadLocal || c.frozen || c.stunned || g.monster?.active || g.imperius?.busy || g.imperius?.puppet
            || g.beds?.lying || g.spiders?.held || g.books?.readingSide || g.scrolls?.readingSide || g.gear?.nock
            || g.inventory?.pocketCycling?.('left') || g.inventory?.pocketCycling?.('right')
            || g.flight?.busy || g.levitation?.lifted);
    }

    update(dt) {
        const g = this.game, ch = g.character, c = g.combat;
        // (the shield I raised is gone by itself — mana, a blow, «стоп»: nothing of mine to take down)
        if (this.mine && !c.shield?.gesture) this.mine = false;
        const res = g.poseService?.lastResults;
        let crossed = false;
        if (!this.blocked()) {
            // (a picture late by a frame or two — a slow moment of the game — leaves the state as it was; a camera silent for 1 s is open arms)
            const fresh = res?.poseLandmarks && performance.now() - (res.at || 0) < 500;
            this.stale = fresh ? 0 : (this.stale || 0) + dt;
            if (!fresh && this.stale < 1) return;
            crossed = fresh && crossedPose(res.poseLandmarks, this.gesture.on || this.mine);
        }
        if (!crossed) this.refused = false;
        const ev = this.gesture.step(dt, crossed);
        if (ev === 'on') this._raise();
        else if (ev === 'off') this._lower();
    }

    _raise() {
        const g = this.game, c = g.combat;
        if (c.shield || this.refused) return; // (a shield is already up — voice, dome, gods: the gesture adds nothing)
        const name = g.castLocalSpell('protection', true);
        if (!name) { this.refused = true; return; }
        if (c.shield?.type === 1 && !c.shield.gods) { c.shield.gesture = true; this.mine = true; }
    }

    _lower() {
        const c = this.game.combat;
        if (this.mine && c.shield?.gesture) c.dropShield('🛡️ Руки разведены — щит снят');
        this.mine = false;
    }
}
