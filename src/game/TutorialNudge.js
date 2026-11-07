/**
 * TutorialNudge.js — a player who pressed «Пропустить обучение» and then struggles is reminded that the tutorial is always there
 * (the author 07.11). Watched only in the first 5 minutes of play; the reminder comes at most twice in all:
 *   1) the first time something plainly does not work — a quiet line («Что-то не получается? …»);
 *   2) 5 minutes later — once more, in other words, bright (gold), with a sound of its own;
 * then never again, whatever the player did (localStorage: survives restarts — the second one may come in the next game).
 *
 * «Something does not work» — a few kinds of the player's dealings with the world, each a plain count (pure: `struggling`):
 *   - the camera hardly sees him (less than half the time);
 *   - he speaks, but no spell comes out (4+ phrases heard, no spell cast);
 *   - 2 minutes and the wand never in a hand;
 *   - 3 minutes and he has hardly moved (< 8 m).
 * Not in the tutorial itself, not in tests; a player who finished the tutorial (or never skipped it) is never watched.
 */

export const NUDGE = {
    WATCH_S: 300, // s of play in which the struggling is looked for
    FIRST_AFTER_S: 75, // s: not at the very start — let him try first
    SECOND_AFTER_S: 300, // s after the first: the bright one
    HEARD_NO_SPELL: 4, // phrases heard with no spell at all
    WAND_S: 120, // s with the wand never taken
    MOVE_S: 180, MOVE_M: 8, // s and m: hardly moved
    SEEN_PART: 0.5, // the camera saw him less than this part of the time
    KEY: 'zns-tutorial-nudge', // {n: reminders shown, t: s of play since the first, watched: s watched}
};

/** What does not work (pure — the tests): a reason in words or null. s: {t, seenT, heard, casts, wandEver, moved}. */
export function struggling(s) {
    if (s.t < NUDGE.FIRST_AFTER_S) return null;
    if (s.t > 20 && s.seenT < s.t * NUDGE.SEEN_PART) return 'camera';
    if (s.heard >= NUDGE.HEARD_NO_SPELL && s.casts === 0) return 'spells';
    if (s.t >= NUDGE.WAND_S && !s.wandEver) return 'wand';
    if (s.t >= NUDGE.MOVE_S && s.moved < NUDGE.MOVE_M) return 'walk';
    return null;
}

const LINES = {
    camera: 'Камера плохо вас видит.',
    spells: 'Заклинания пока не получаются?',
    wand: 'Не получается взять палочку?',
    walk: 'Не получается ходить?',
};

const load = () => { try { return JSON.parse(localStorage.getItem(NUDGE.KEY) || 'null') || { n: 0, t: 0, watched: 0 }; } catch { return { n: 0, t: 0, watched: 0 }; } };
const save = (st) => { try { localStorage.setItem(NUDGE.KEY, JSON.stringify(st)); } catch { /* private mode */ } };

export class TutorialNudge {
    constructor(game) {
        this.game = game;
        let skipped = false, done = false;
        try { skipped = !!localStorage.getItem('zns-tutorial-skipped'); done = !!localStorage.getItem('zns-tutorial-done'); } catch { /* none */ }
        this.st = load();
        this.on = skipped && !done && this.st.n < 2;
        this.s = { t: 0, seenT: 0, heard: 0, casts: 0, wandEver: false, moved: 0 };
        this._last = null;
        this._saveT = 0;
    }

    /** A phrase was heard (final). */
    heard() { if (this.on) this.s.heard++; }
    /** A spell came out. */
    onCast() { if (this.on) this.s.casts++; }

    update(dt) {
        if (!this.on || !(dt > 0)) return;
        dt = Math.min(dt, 0.25);
        const g = this.game, st = this.st;
        if (g.paused || g.combat?.dead) return;
        if (st.n === 0) {
            // the first: looked for only in the first minutes of play
            const s = this.s;
            s.t += dt;
            st.watched = (st.watched || 0) + dt;
            const r = g.poseService?.lastResults;
            if (r?.poseLandmarks?.length || g.currentPose) s.seenT += dt;
            if (!s.wandEver && g.items?.heldOf?.('wand')) s.wandEver = true;
            const p = g.character?.group?.position;
            if (p) { if (this._last) s.moved += Math.min(2, Math.hypot(p.x - this._last.x, p.z - this._last.z)); this._last = { x: p.x, z: p.z }; }
            const why = struggling(s);
            if (why) { st.n = 1; st.t = 0; save(st); this._show(1, why); return; }
            if (st.watched >= NUDGE.WATCH_S) { this.on = false; st.n = 2; save(st); return; } // (he got on well: never bothered)
            this._saveT -= dt; if (this._saveT <= 0) { this._saveT = 5; save(st); }
            return;
        }
        // the second: 5 minutes of play after the first
        st.t = (st.t || 0) + dt;
        if (st.t >= NUDGE.SECOND_AFTER_S) { st.n = 2; save(st); this.on = false; this._show(2); return; }
        this._saveT -= dt; if (this._saveT <= 0) { this._saveT = 5; save(st); }
    }

    _show(n, why = null) {
        if (typeof document === 'undefined') return;
        document.getElementById('tut-nudge')?.remove();
        if (!document.getElementById('tut-nudge-style')) {
            const st = document.createElement('style');
            st.id = 'tut-nudge-style';
            st.textContent = `
#tut-nudge{position:fixed;left:50%;top:max(200px,24vh);transform:translateX(-50%);z-index:70;max-width:min(760px,90vw);padding:14px 22px;border-radius:14px;text-align:center;font:600 21px/1.4 system-ui,sans-serif;color:#fff;pointer-events:none;opacity:0;transition:opacity .5s}
#tut-nudge.on{opacity:1}
#tut-nudge.n1{background:rgba(12,10,26,.82);border:1px solid rgba(255,255,255,.25);text-shadow:0 1px 2px #000}
#tut-nudge.n2{background:linear-gradient(135deg,#ffcf3a,#ff7a1a 55%,#ff3d7f);color:#1a0b22;font-weight:800;font-size:24px;border:2px solid #fff6c8;box-shadow:0 0 0 4px rgba(255,207,58,.35),0 10px 40px rgba(255,90,40,.55);animation:tutNudge 0.9s ease-in-out infinite alternate}
@keyframes tutNudge{from{transform:translateX(-50%) scale(1)}to{transform:translateX(-50%) scale(1.035)}}`;
            document.head.appendChild(st);
        }
        const el = document.createElement('div');
        el.id = 'tut-nudge';
        el.className = 'n' + n;
        el.textContent = n === 1
            ? `${LINES[why] || 'Что-то не получается?'} Обучение всегда можно пройти: «Одиночная игра» → «Обучение».`
            : '🎓 Ещё раз напомним: обучение за несколько минут покажет, как колдовать, брать вещи и ходить. «Одиночная игра» → «Обучение».';
        document.body.appendChild(el);
        requestAnimationFrame(() => el.classList.add('on'));
        setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 600); }, n === 1 ? 9000 : 12000);
        if (n === 2) this._chime(); else this.game.sound?.playMagic?.(null, 0.5);
    }

    /** The bright reminder's own sound: a rising bell arpeggio (a few oscillators — nothing to synthesize ahead). */
    _chime() {
        try {
            const ctx = this.game.sound?.audioListener?.context || new (window.AudioContext || window.webkitAudioContext)(); // (the game's own sound: its volume, its device)
            const t0 = ctx.currentTime + 0.02;
            [659.3, 830.6, 987.8, 1318.5, 1661.2].forEach((f, i) => {
                for (const [mul, vol] of [[1, 0.16], [2.01, 0.05], [3.02, 0.025]]) {
                    const o = ctx.createOscillator(), gn = ctx.createGain(), t = t0 + i * 0.11;
                    o.type = 'sine'; o.frequency.value = f * mul;
                    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + 0.012); gn.gain.exponentialRampToValueAtTime(0.0008, t + 1.1);
                    o.connect(gn); gn.connect(ctx.destination); o.start(t); o.stop(t + 1.15);
                }
            });
        } catch { /* no sound: the words are enough */ }
    }
}
