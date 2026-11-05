/**
 * WalkRecorder.js — «Ходьба» (F8): a recording to tune walking back on the player's own camera (the author 05.11: «нажму кнопку и голосом
 * скажу „иду вперёд“, похожу, потом скажу „иду назад“ — и ты по логам поймёшь»). While it records: 10 times a second one line of what the
 * camera saw of the body (the back's tilt from the 3-D body, the shoulders' depth and width, the nose, the hips seen, stepping on the
 * spot, the legs), what the game decided (forward / back, the lean over the upright) — and the player's own word (the label): said by
 * voice «иду вперёд», «иду назад», «стою» (heard words: `heard(text)`), the label stays until the next one. Written to zns-walk.log
 * (server.py /api/walklog; Настройки → Журнал → «Ходьба (запись F8)»), sent in batches each second; at most MAX_S s.
 */
export const WALK_REC = { EVERY: 0.1, MAX_S: 600, BATCH: 1, SETTLE: 1.5 }; // (SETTLE s after a label: the body is still changing — «полсекунды я всё равно стою прямо»: those lines are marked «переход»)

/** The label in the player's words, or null: «иду вперёд» / «вперёд», «иду назад» / «назад», «стою» / «стоп ходьба». */
export function walkLabel(text) {
    const t = String(text || '').toLowerCase().replace(/ё/g, 'е');
    if (/назад/.test(t)) return 'НАЗАД';
    if (/вперед|впер[её]т/.test(t)) return 'ВПЕРЁД';
    if (/(^|[^а-я])сто(ю|им|ять)([^а-я]|$)/.test(t)) return 'СТОЮ'; // (no \b: it does not know Cyrillic)
    return null;
}

export class WalkRecorder {
    constructor(game) {
        this.game = game;
        this.on = false;
        this.label = '—';
        this.buf = [];
        this.t = 0; this._tick = 0; this._sendT = 0;
    }

    toggle() {
        this.on = !this.on;
        const g = this.game;
        if (this.on) {
            this.t = 0; this.label = '—';
            this.buf.push(`=== ходьба: запись ${new Date().toLocaleString('ru-RU')} | «ходьба назад» ${g.config?.walkBack ? 'вкл' : 'ВЫКЛ'} | скажите «иду вперёд», «иду назад», «стою» | камера: ${g.poseService?.native ? 'программа' : 'браузер'} (${g.poseService?.stats?.mode || '—'})`);
            g.hud?.setVoice?.('🔴 Запись ходьбы (F8 — стоп). Герой стоит на месте. Скажите «иду вперёд» и пошагайте на месте, потом «иду назад» и пошагайте', true);
        } else {
            this.buf.push(`=== ходьба: конец записи (${this.t.toFixed(0)} с)`);
            this._flush();
            g.hud?.setVoice?.('⏹️ Запись ходьбы сохранена: Настройки → Журнал → «Ходьба (запись F8)» (файл zns-walk.log)', true);
        }
        return this.on;
    }

    /** Words heard (main.js): a label when they say where they walk. */
    heard(text) {
        if (!this.on) return;
        const L = walkLabel(text);
        // (every phrase heard goes in too — the author: «надо было записывать ещё просто мои слова»: «подхожу к камере» and the like)
        if (!L && String(text || '').trim()) this.buf.push(`${this.t.toFixed(1)}с сказано: «${String(text).slice(0, 80)}»`);
        if (L && L !== this.label) { this.label = L; this.labelAt = this.t; this.buf.push(`${this.t.toFixed(1)}с метка: ${L} («${String(text).slice(0, 60)}»)`); this.game.hud?.setVoice?.(`🔴 Метка: ${L}`, true); }
    }

    /** Every frame (Game, after the walking-back decision): `pose` the frame's pose, `back` the decision (0 / 1). */
    frame(dt, pose, back) {
        if (!this.on) return;
        this.t += dt;
        if (this.t > WALK_REC.MAX_S) { this.toggle(); return; }
        if ((this._tick -= dt) <= 0 && pose) {
            this._tick = WALK_REC.EVERY;
            const g = this.game, ch = g.character, T = pose.torso || {}, L = g._lean || {};
            const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
            const legs = pose.legs ? Object.entries(pose.legs).map(([k, v]) => `${k}:${typeof v === 'object' ? JSON.stringify(v).slice(0, 40) : v}`).join(' ') : '—';
            this.buf.push([
                `${this.t.toFixed(1)}с`, `метка ${this.label}${this.label === '—' ? ' (ещё не сказали)' : this.t - (this.labelAt ?? -99) < WALK_REC.SETTLE ? ' (переход)' : ''}`, `игра пошла бы ${back && (pose.isRunning || g._weakBob > 0.55) ? 'НАЗАД' : pose.isRunning ? 'вперёд' : 'стоит'}${back && !pose.isRunning && !(g._weakBob > 0.55) ? ' (наклон назад есть, шагов нет)' : ''}`,
                `шаги ${pose.isRunning ? 'да' : 'нет'} ${f(pose.runIntensity)} кач ${f(pose.bob, 3)}${g._weakBob > 0.55 ? ' (слабые шаги)' : ''}`,
                `спина3D ${f(T.tilt, 1)}° бок ${f(T.tiltSide, 1)}°`, `наклон ${f(L.x, 1)}° сейчас ${f(L.k, 1)}° прямо ${f(L.base, 1)}° шаги ${L.scal >= 1.2 ? f(L.sbase, 1) + '°' : '—'} (${L.src || '—'})`,
                `плечиZ ${f(T.sz, 3)} бёдраZ ${f(T.hz, 3)} глубина ${f(T.back, 3)} ширина ${f(T.sw, 3)} нос ${f(T.noseRel, 2)} поворот ${f(T.twist, 2)} бёдра ${T.hips ? 'видны' : 'нет'}`,
                `ноги ${legs}`,
            ].join(' | '));
        }
        if ((this._sendT -= dt) <= 0) { this._sendT = WALK_REC.BATCH; this._flush(); }
    }

    _flush() {
        if (!this.buf.length || typeof fetch === 'undefined') return;
        const lines = this.buf.splice(0);
        fetch('/api/walklog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines }) }).catch(() => {});
    }
}
