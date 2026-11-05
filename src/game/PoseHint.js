/**
 * PoseHint.js — «я вас услышал, но сделайте сначала вот это»: ОДНО место, где написано,
 * какая поза нужна заклинанию и что сказать игроку, если её не хватает.
 *
 * Только слова: правила игры не меняет (кроме порога «руки вверх на всю длину» для полёта и молнии).
 *   POSE_NEEDS      заклинание → какая поза нужна (`up2` — обе руки вверх, `flying` — только в полёте)
 *   raiseMissing    чего не хватает рукам (по высоте кисти над плечом, в долях длины руки)
 *   poseHint(name, snap)  → { code, text } или null (поза в порядке / подсказка не нужна)
 *   PoseHinter      не чаще раза в 2,5 с одну и ту же подсказку
 */

/** Кисть выше плеча на эту долю длины руки — «руки подняты вверх» (1 — строго вертикально). Автор 05.11: «часто не срабатывает,
 *  руки недостаточно высоко — ослабить правило»: было 0,78 (почти в струнку), теперь 0,55 — руки уверенно над головой. */
export const FULL = 0.55;
/** Ниже этого — руки практически опущены. */
export const DOWN = 0.2;
/** Первую секунду взлёта руки должны оставаться поднятыми хотя бы так (мягче FULL: после слова руки чуть оседают — это не отмена).
 *  Автор 05.11: «Флайн плохо распознаётся… руки недоподнял» — раньше здесь требовались кисти выше лба (строже, чем при слове), и взлёт
 *  молча срывался уже после оплаты. */
export const CONFIRM_RAISE = 0.3;
/** Обе руки подняты хотя бы на CONFIRM_RAISE (для подтверждения взлёта). raise: {left, right, lost:{left,right}}. */
export function armsHeldUp(raise) {
    if (!raise || raise.lost?.left || raise.lost?.right) return false;
    return raise.left >= CONFIRM_RAISE && raise.right >= CONFIRM_RAISE;
}
export const TAKEOFF_LOST = '🙌 Взлёт сорвался: руки опустились слишком рано — держите обе руки поднятыми над головой ещё секунду после «Флайн». Мана возвращена';

/** Подсказка не чаще, мс. */
export const HINT_GAP = 2500;

export const POSE_NEEDS = {
    Flight: 'up2',
    LightningStrike: 'up2',
    FlyingMaxima: 'flying',
};

const WORD = { Flight: '«Флайн»', LightningStrike: '«Lightning Strike»' };

const TEXT = {
    unseen: '📷 Я вас услышал, но не вижу ваших рук — отойдите немного от камеры, чтобы были видны обе руки, и повторите',
    down: '🙌 Я вас услышал, но руки опущены — сначала поднимите обе руки вверх, на всю длину, потом скажите',
    low: '🙌 Я вас услышал, но руки подняты недостаточно высоко — поднимите обе руки полностью вверх, на всю длину',
    oneArm: '🙌 Я вас услышал, но поднята только одна рука — поднимите обе руки полностью вверх',
    oneLow: '🙌 Я вас услышал, но одна рука поднята не до конца — вытяните обе руки полностью вверх',
    notFlying: '🦸 Я вас услышал, но «Flying Maxima» — только в полёте: сначала взлетите («Флайн»), потом скажите её',
};

/**
 * Чего не хватает рукам: null (всё в порядке) или код.
 * snap: { seen:boolean, lost:{left,right}, raise:{left,right} }
 */
export function raiseMissing(snap) {
    if (!snap || !snap.seen) return 'unseen';
    const l = snap.lost?.left ? -1 : snap.raise?.left ?? -1;
    const r = snap.lost?.right ? -1 : snap.raise?.right ?? -1;
    if (l >= FULL && r >= FULL) return null;
    const hi = Math.max(l, r), lo = Math.min(l, r);
    if (hi < DOWN) return 'down';
    if (hi >= FULL) return lo < DOWN ? 'oneArm' : 'oneLow';
    return 'low';
}

/** Подсказка для распознанного заклинания: { code, text } или null. snap.flying — игрок уже в полёте. */
export function poseHint(name, snap) {
    const need = POSE_NEEDS[name];
    if (!need) return null;
    if (need === 'flying') return snap?.flying ? null : { code: 'notFlying', text: TEXT.notFlying };
    if (snap?.flying && name === 'Flight') return null; // (уже летите — подсказка не нужна)
    if (snap?.grace) return null;                       // (руки были подняты только что — слово могло прийти позже)
    const code = raiseMissing(snap);
    if (!code) return null;
    let text = TEXT[code];
    if (code === 'down' && WORD[name]) text = text.replace('потом скажите', `потом скажите ${WORD[name]}`);
    return { code, text };
}

export class PoseHinter {
    constructor(now = () => performance.now()) { this.now = now; this._at = new Map(); }
    /** Показать можно? (одна и та же подсказка не чаще HINT_GAP, любая — не чаще раза в HINT_GAP) */
    pass() {
        const t = this.now();
        if (this._last != null && t - this._last < HINT_GAP) return false;
        this._last = t;
        return true;
    }
}
