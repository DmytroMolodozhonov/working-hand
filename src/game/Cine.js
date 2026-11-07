/**
 * Cine.js — cut-scenes (the author 07.11: «начало сюжета — кат-сцены, это самое главное»): the camera flies by itself along shots,
 * black bars top and bottom, the HUD hidden, a line of words at the bottom (who says it — in gold), a title card, fades through black.
 *   game.cine.play(shots, { onEnd }) — shots: [{ dur, from: {pos, look}, to: {pos, look}, ease, sub, who, title, fadeIn, fadeOut, start }]
 *   pos / look: [x, y, z] or a function () → [x, y, z] (a moving thing: the coach). `start()` is called when the shot begins.
 * The camera is set after the game's own (Game._updateCamera → cine.apply). The hero is not moved here — the scene that plays the
 * shots keeps him where it wants. skip() ends it at once (the last shot's `start`s are still called, so the scene is never half-done).
 */
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _l = new THREE.Vector3(), _l2 = new THREE.Vector3();
const ease = (k, e) => (e === 'linear' ? k : e === 'in' ? k * k : e === 'out' ? 1 - (1 - k) * (1 - k) : k * k * (3 - 2 * k));
const val = (p, out) => { const q = typeof p === 'function' ? p() : p; return q ? out.set(q[0], q[1], q[2]) : null; };

const CSS = `
#cine{position:fixed;inset:0;pointer-events:none;z-index:60;opacity:0;transition:opacity .6s}
#cine.on{opacity:1}
#cine .bar{position:absolute;left:0;right:0;height:11vh;background:#000;transition:transform .9s cubic-bezier(.2,.8,.2,1)}
#cine .bar.t{top:0;transform:translateY(-100%)} #cine .bar.b{bottom:0;transform:translateY(100%)}
#cine.on .bar{transform:none}
#cine .sub{position:absolute;left:8vw;right:8vw;bottom:13.5vh;text-align:center;font:500 clamp(16px,2.3vw,28px)/1.35 Georgia,'Times New Roman',serif;color:#f4ecd8;
  text-shadow:0 2px 6px #000,0 0 18px rgba(0,0,0,.8);opacity:0;transition:opacity .5s}
#cine .sub.on{opacity:1} #cine .sub b{color:#e8c46a;font-weight:600;margin-right:.4em}
#cine .title{position:absolute;left:0;right:0;top:38%;text-align:center;font:600 clamp(34px,6vw,84px)/1.1 Georgia,serif;letter-spacing:.12em;color:#f1dfae;
  text-shadow:0 0 28px rgba(255,200,110,.55),0 3px 10px #000;opacity:0;transition:opacity 1.6s}
#cine .title small{display:block;margin-top:.5em;font-size:.32em;letter-spacing:.3em;color:#cdbb92}
#cine .title.on{opacity:1}
#cine .fade{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .9s}
#cine .fade.on{opacity:1}
#cine .skip{position:absolute;right:2.2vw;bottom:3.4vh;font:13px sans-serif;color:#9a9283;letter-spacing:.05em}
body.cine-on #hud, body.cine-on #mana-num, body.cine-on #minimap-container, body.cine-on #voice-debug, body.cine-on .hotbar{visibility:hidden!important}
`;

export class Cine {
    constructor(game) {
        this.game = game;
        this.shots = null; this.i = 0; this.t = 0; this.onEnd = null;
        this.el = null;
    }
    get active() { return !!this.shots; }

    _dom() {
        if (this.el || typeof document === 'undefined') return this.el;
        if (!document.getElementById('cine-css')) { const st = document.createElement('style'); st.id = 'cine-css'; st.textContent = CSS; document.head.appendChild(st); }
        const el = document.createElement('div');
        el.id = 'cine';
        el.innerHTML = '<div class="bar t"></div><div class="bar b"></div><div class="title"></div><div class="sub"></div><div class="fade"></div><div class="skip">Enter — пропустить</div>';
        document.body.appendChild(el);
        this.el = el;
        this._key = (e) => { if (this.active && (e.key === 'Enter' || e.key === 'Escape')) this.skip(); };
        window.addEventListener('keydown', this._key);
        return el;
    }

    play(shots, { onEnd = null } = {}) {
        if (!shots?.length) { onEnd?.(); return; }
        this.shots = shots; this.i = -1; this.t = 0; this.onEnd = onEnd;
        const el = this._dom();
        if (el) { el.classList.add('on'); document.body.classList.add('cine-on'); }
        this._next();
    }

    _next() {
        this.i++; this.t = 0;
        const S = this.shots?.[this.i];
        if (!S) return this._end();
        const el = this.el;
        if (el) {
            const sub = el.querySelector('.sub'), title = el.querySelector('.title'), fade = el.querySelector('.fade');
            if (S.sub) { sub.innerHTML = (S.who ? `<b>${S.who}:</b>` : '') + S.sub; sub.classList.add('on'); } else sub.classList.remove('on');
            if (S.title) { title.innerHTML = S.title; title.classList.add('on'); } else title.classList.remove('on');
            fade.classList.toggle('on', !!S.black); // (a shot in black: between scenes)
            if (S.fadeIn) { fade.classList.add('on'); setTimeout(() => fade.classList.remove('on'), 60); }
        }
        try { S.start?.(); } catch (e) { console.warn('cine shot', e); }
    }

    /** The game's frame (the game's own camera already set): the shot's camera over it. */
    apply(camera, dt) {
        const S = this.shots?.[this.i];
        if (!S) return;
        this.t += dt;
        const k = ease(Math.min(1, this.t / (S.dur || 1)), S.ease);
        const a = val(S.from?.pos || S.pos, _a), b = val(S.to?.pos || S.from?.pos || S.pos, _b);
        const la = val(S.from?.look || S.look, _l), lb = val(S.to?.look || S.from?.look || S.look, _l2);
        if (a && b) camera.position.copy(a).lerp(b, k);
        if (la && lb) camera.lookAt(la.lerp(lb, k));
        if (S.fadeOut && this.el && this.t > (S.dur || 1) - 0.9) this.el.querySelector('.fade').classList.add('on');
        if (this.t >= (S.dur || 1)) this._next();
    }

    skip() {
        if (!this.shots) return;
        for (let j = this.i + 1; j < this.shots.length; j++) { try { this.shots[j].start?.(); } catch { /* */ } }
        this._end();
    }

    _end() {
        const done = this.onEnd;
        this.shots = null; this.onEnd = null;
        if (this.el) {
            this.el.classList.remove('on');
            for (const c of ['.sub', '.title', '.fade']) this.el.querySelector(c).classList.remove('on');
            document.body.classList.remove('cine-on');
        }
        done?.();
    }

    dispose() {
        this.shots = null;
        if (this._key) window.removeEventListener('keydown', this._key);
        this.el?.remove(); this.el = null;
        if (typeof document !== 'undefined') document.body.classList.remove('cine-on');
    }
}
