/**
 * DuelEndUi.js — конец дуэли в режиме «Перед дуэлью» (ArenaDuels.startDuelMode): крупная надпись «Вы победили!» и через
 * несколько секунд окно «Хотите повторить дуэль?» — выбрать соперника, начать заново или выйти в меню.
 * Тексты — для игрока, на «вы».
 */
import { DUEL_FOES } from '../game/SpawnSpots.js';

/** Через сколько секунд после победы появляется окно. */
export const AGAIN_AFTER = 10;
/** …и после поражения (раньше: надпись видно и надо успеть прочесть, но ждать долго не нужно). */
export const AGAIN_AFTER_LOSS = 5;

const CSS = `
@keyframes duel-win-in { 0% { opacity:0; transform:translate(-50%,-50%) scale(.3) rotate(-6deg); letter-spacing:.4em }
  55% { opacity:1; transform:translate(-50%,-50%) scale(1.18) rotate(1deg); letter-spacing:.06em }
  100% { opacity:1; transform:translate(-50%,-50%) scale(1) rotate(0); letter-spacing:.04em } }
@keyframes duel-win-glow { 0%,100% { text-shadow:0 0 18px rgba(255,200,70,.95),0 0 46px rgba(255,150,30,.7),0 5px 12px rgba(0,0,0,.75) }
  50% { text-shadow:0 0 30px rgba(255,236,150,1),0 0 80px rgba(255,170,40,.95),0 5px 12px rgba(0,0,0,.75) } }
.duel-win { position:fixed; left:50%; top:34%; z-index:62; pointer-events:none; white-space:nowrap;
  font:900 clamp(48px,9vw,120px)/1 Georgia,serif; color:#fff1b8; animation:duel-win-in .9s cubic-bezier(.2,1.3,.4,1) both, duel-win-glow 1.6s ease-in-out .9s infinite; }
.duel-win.lose { color:#d9d2ee; animation:duel-win-in .9s cubic-bezier(.2,1.3,.4,1) both; text-shadow:0 0 22px rgba(150,130,230,.9),0 5px 12px rgba(0,0,0,.8); }
.duel-win small { display:block; margin-top:14px; font:600 clamp(16px,2.2vw,26px)/1.2 Georgia,serif; color:#ffe2a0; text-align:center; letter-spacing:0; }
.duel-again { position:fixed; inset:0; z-index:70; display:flex; align-items:center; justify-content:center; background:rgba(8,6,20,.55); }
.duel-again > div { min-width:min(420px,90vw); padding:26px 30px; border-radius:14px; background:linear-gradient(#2b2150,#1a1433); border:2px solid #d9b45a;
  box-shadow:0 0 40px rgba(255,200,80,.35); color:#f6ecd0; font:16px/1.4 Georgia,serif; text-align:center; }
.duel-again h3 { margin:0 0 14px; font:800 24px Georgia,serif; color:#ffe9a8; }
.duel-again label { display:block; margin:10px 0 6px; }
.duel-again select { width:100%; padding:8px; font:16px Georgia,serif; border-radius:8px; }
.duel-again button { margin:14px 6px 0; padding:10px 18px; font:700 16px Georgia,serif; border-radius:8px; border:0; cursor:pointer; }
.duel-again .go { background:#e0b345; color:#2a1d05; } .duel-again .out { background:#5b5478; color:#fff; }
`;

export class DuelEndUi {
    constructor() { this.banner = null; this.box = null; this.style = null; }

    _css() {
        if (this.style) return;
        this.style = document.createElement('style');
        this.style.textContent = CSS;
        document.head.appendChild(this.style);
    }

    /** Большая надпись «Вы победили!» с анимацией (до `hide`). */
    showWin(sub = '', lost = false) {
        this._css();
        this.hide();
        const el = this.banner = document.createElement('div');
        el.className = lost ? 'duel-win lose' : 'duel-win';
        el.textContent = lost ? 'Вы проиграли' : 'Вы победили!';
        if (sub) { const s = document.createElement('small'); s.textContent = sub; el.appendChild(s); }
        document.body.appendChild(el);
    }

    /**
     * Окно «Хотите повторить дуэль?»: список соперников, «Начать дуэль заново», «Выйти в меню».
     * @param {{foe:string, onStart:(foe:string)=>void, onExit:()=>void}} o
     */
    showAgain({ foe, onStart, onExit, lost = false }) {
        this._css();
        this.hideBox();
        if (document.pointerLockElement) document.exitPointerLock?.(); // (the mouse is free for the buttons)
        const w = this.box = document.createElement('div');
        w.className = 'duel-again';
        w.innerHTML = `<div><h3>${lost ? 'Хотите сразиться ещё раз?' : 'Хотите повторить дуэль?'}</h3>
            <label for="duel-again-foe">Кто выйдет против вас:</label>
            <select id="duel-again-foe">${DUEL_FOES.map((f) => `<option value="${f.id}"${f.id === foe ? ' selected' : ''}>${f.label}</option>`).join('')}</select>
            <button class="go" type="button">Начать дуэль заново</button><button class="out" type="button">Выйти в меню</button></div>`;
        const sel = w.querySelector('select');
        w.querySelector('.go').onclick = () => { const v = sel.value; this.hide(); onStart?.(v); };
        w.querySelector('.out').onclick = () => { this.hide(); onExit?.(); };
        document.body.appendChild(w);
    }

    hideBox() { this.box?.remove(); this.box = null; }
    hide() { this.banner?.remove(); this.banner = null; this.hideBox(); }
}
