/**
 * TitanBar.js — the titan's health bar at the top of the screen (the author 08.11: «полосочка написанная: насколько у титана здоровья»).
 * Shown while a titan is awake and in a fight with someone near (the nearest one), hidden when it is dead, asleep or far. The name, a bar with two ticks
 * (the three stages: a new move at each — TitanRules.titanStage) and «now / max» written on it. Redrawn only when a number changes (no work per frame).
 */
export class TitanBar {
    constructor() {
        this.el = null;
        this._key = '';
        this._on = false;
    }

    _make() {
        if (typeof document === 'undefined') return false;
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);width:min(560px,86vw);z-index:60;pointer-events:none;display:none;font:600 14px/1.2 system-ui,sans-serif;color:#f4efe6;text-shadow:0 1px 3px #000;text-align:center';
        el.innerHTML = '<div class="tb-name" style="letter-spacing:.04em;margin-bottom:4px"></div>'
            + '<div style="position:relative;height:20px;border-radius:4px;background:rgba(10,8,8,.72);border:1px solid rgba(255,235,200,.55);box-shadow:0 0 10px rgba(0,0,0,.6);overflow:hidden">'
            + '<div class="tb-fill" style="position:absolute;left:0;top:0;bottom:0;width:100%;background:linear-gradient(#ff5a4a,#a3141c 60%,#6e0b12)"></div>'
            + '<div style="position:absolute;left:33.33%;top:0;bottom:0;width:1px;background:rgba(255,235,200,.55)"></div>'
            + '<div style="position:absolute;left:66.66%;top:0;bottom:0;width:1px;background:rgba(255,235,200,.55)"></div>'
            + '<div class="tb-num" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px"></div></div>';
        document.body.appendChild(el);
        this.el = el;
        this.nameEl = el.querySelector('.tb-name');
        this.fillEl = el.querySelector('.tb-fill');
        this.numEl = el.querySelector('.tb-num');
        return true;
    }

    /** `info`: { name, hp, max } of the titan to show, or null to hide. */
    show(info) {
        if (!info) { if (this._on && this.el) { this.el.style.display = 'none'; this._on = false; this._key = ''; } return; }
        if (!this.el && !this._make()) return;
        const hp = Math.max(0, Math.ceil(info.hp)), key = `${info.name}|${hp}|${info.max}`;
        if (!this._on) { this.el.style.display = 'block'; this._on = true; }
        if (key === this._key) return;
        this._key = key;
        this.nameEl.textContent = info.name;
        this.fillEl.style.width = `${Math.max(0, Math.min(100, (hp / info.max) * 100))}%`;
        this.numEl.textContent = `${hp} / ${info.max}`;
    }

    dispose() { this.el?.remove(); this.el = null; this._on = false; }
}
