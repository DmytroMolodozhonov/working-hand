/**
 * BrawlPanel.js — the panel of «Битва существ» (Brawl.js): the team, whom to put, start, clear; a click on the field puts a fighter.
 * Plain DOM over the game; made when the mode starts, removed when the game ends.
 */
import { TEAMS, TEAM_IDS, FIGHTERS, FIGHTER_GROUPS, BRAWL, placePoints } from '../game/BrawlRules.js';

const CSS = `
#brawl-panel{position:fixed;left:12px;top:12px;width:262px;max-height:calc(100vh - 24px);overflow:auto;z-index:60;background:rgba(14,12,28,.82);color:#e9e6ff;border:1px solid rgba(160,140,255,.35);border-radius:12px;padding:10px 12px;font:13px/1.35 system-ui,sans-serif;backdrop-filter:blur(4px);user-select:none}
#brawl-panel h3{margin:0 0 6px;font-size:15px}
#brawl-panel .bp-teams{display:flex;gap:6px;margin-bottom:8px}
#brawl-panel .bp-team{flex:1;border:2px solid transparent;border-radius:8px;padding:6px 4px;cursor:pointer;color:#fff;font-weight:600;text-align:center;opacity:.65}
#brawl-panel .bp-team.on{opacity:1;border-color:#fff}
#brawl-panel .bp-g{margin:6px 0 2px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#a99cff}
#brawl-panel .bp-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}
#brawl-panel .bp-f{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:5px 6px;cursor:pointer;color:inherit;text-align:left;font:inherit}
#brawl-panel .bp-f.on{background:rgba(140,110,255,.35);border-color:#b9a8ff}
#brawl-panel .bp-row{display:flex;gap:6px;margin-top:10px}
#brawl-panel .bp-btn{flex:1;border:0;border-radius:8px;padding:8px;cursor:pointer;font-weight:700;color:#fff;background:#5a3fd0}
#brawl-panel .bp-btn.alt{background:#3a3550}
#brawl-panel .bp-btn[disabled]{opacity:.4;cursor:default}
#brawl-panel .bp-cnt{margin-top:8px;font-weight:600}
#brawl-panel .bp-hint{margin-top:8px;font-size:11.5px;color:#b7b2d6}
body.brawl-on #hud,body.brawl-on #mana-num,body.brawl-on #fatigue-container,body.brawl-on #minimap-container,body.brawl-on #webcam-preview,body.brawl-on #hotbar,body.brawl-on #back-cells,body.brawl-on #coin-counter{display:none !important}
#brawl-banner{position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:61;padding:10px 26px;border-radius:14px;font:700 28px system-ui,sans-serif;color:#fff;background:rgba(14,12,28,.78);border:2px solid #fff;display:none}
`;

export class BrawlPanel {
    constructor(game) {
        this.game = game;
        this.team = 'A';
        this.pick = 'knight';
        if (!document.getElementById('brawl-css')) {
            const st = document.createElement('style');
            st.id = 'brawl-css';
            st.textContent = CSS;
            document.head.appendChild(st);
        }
        const root = (this.root = document.createElement('div'));
        root.id = 'brawl-panel';
        root.innerHTML = `<h3>⚔️ Битва существ</h3>
            <div class="bp-teams">${TEAM_IDS.map((t) => `<div class="bp-team" data-t="${t}" style="background:${TEAMS[t].css}">${TEAMS[t].label}</div>`).join('')}</div>
            ${FIGHTER_GROUPS.map((g) => `<div class="bp-g">${g}</div><div class="bp-grid">${FIGHTERS.filter((f) => f.group === g).map((f) => `<button class="bp-f" data-f="${f.id}">${f.icon} ${f.label}</button>`).join('')}</div>`).join('')}
            <div class="bp-cnt" id="bp-cnt"></div>
            <div class="bp-row"><button class="bp-btn" id="bp-start">⚔️ Начать бой</button><button class="bp-btn alt" id="bp-clear">🗑 Убрать всех</button></div>
            <div class="bp-row"><button class="bp-btn alt" id="bp-sweep" title="Убирает бойцов, трупы, вещи, огонь и чинит землю после взрывов">🧹 Очистить поле полностью</button></div>
            <div class="bp-hint">Выберите сторону и бойца, затем щёлкните по полю (Shift — сразу пятерых). Лететь: W A S D, Пробел и Ctrl; осмотреться — правая кнопка мыши; колесо — скорость.</div>`;
        document.body.appendChild(root);
        document.body.classList.add('brawl-on'); // (the hero's bars, slots, minimap and the camera window are of no use to a spectator)
        const banner = (this.banner = document.createElement('div'));
        banner.id = 'brawl-banner';
        document.body.appendChild(banner);
        root.addEventListener('mousedown', (e) => e.stopPropagation());
        root.querySelectorAll('.bp-team').forEach((el) => { el.onclick = () => { this.team = el.dataset.t; this._sync(); }; });
        root.querySelectorAll('.bp-f').forEach((el) => { el.onclick = () => { this.pick = el.dataset.f; this._sync(); }; });
        root.querySelector('#bp-start').onclick = () => { if (!game.brawl.start()) this._say(game.brawl.why); };
        root.querySelector('#bp-clear').onclick = () => game.brawl.clear();
        root.querySelector('#bp-sweep').onclick = () => { const r = game.brawl.sweep(); this._say(`Поле чистое (убрано: бойцов ${r.fighters}, тел ${r.bodies}, вещей ${r.items}, огней ${r.fires}, исправлено участков земли ${r.chunks})`); };
        this._down = null;
        this._onDown = (e) => { if (e.button === 0) this._down = { x: e.clientX, y: e.clientY, shift: e.shiftKey }; };
        this._onUp = (e) => {
            const d = this._down; this._down = null;
            if (e.button !== 0 || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return; // (a drag is not a click)
            this._place(e.clientX, e.clientY, d.shift || e.shiftKey);
        };
        const cv = game.renderer?.domElement;
        cv?.addEventListener('mousedown', this._onDown);
        cv?.addEventListener('mouseup', this._onUp);
        this._cv = cv;
        game.brawl.onChange = (s) => this._status(s);
        this._sync();
        this._status({ state: game.brawl.state, total: { A: 0, B: 0 }, alive: { A: 0, B: 0 } });
    }

    _say(t) { if (t) this.game.hud?.setVoice?.('⚔️ ' + t, true); }

    _place(cx, cy, group) {
        const g = this.game, p = g.spectator?.pick(cx, cy, g.camera);
        if (!p) return;
        if (g.brawl.state === 'over') g.brawl.clear();
        const pts = placePoints(p.x, p.z, group ? BRAWL.GROUP : 1);
        for (const q of pts) if (!g.brawl.spawn(this.pick, this.team, q.x, q.z)) { this._say(g.brawl.why); break; }
    }

    _sync() {
        this.root.querySelectorAll('.bp-team').forEach((el) => el.classList.toggle('on', el.dataset.t === this.team));
        this.root.querySelectorAll('.bp-f').forEach((el) => el.classList.toggle('on', el.dataset.f === this.pick));
    }

    _status(s) {
        const c = this.root.querySelector('#bp-cnt');
        const fight = s.state === 'fight' || s.state === 'over';
        c.innerHTML = TEAM_IDS.map((t) => `<span style="color:${TEAMS[t].css}">${TEAMS[t].label}: ${fight ? s.alive[t] + ' / ' + s.total[t] : s.total[t]}</span>`).join(' · ');
        this.root.querySelector('#bp-start').disabled = s.state === 'fight';
        const b = this.banner;
        if (s.state === 'over') {
            b.textContent = s.winner === 'draw' ? '🤝 Ничья' : `🏆 Победа: ${TEAMS[s.winner].label}`;
            b.style.borderColor = s.winner === 'draw' ? '#fff' : TEAMS[s.winner].css;
            b.style.display = 'block';
        } else b.style.display = 'none';
    }

    dispose() {
        this._cv?.removeEventListener('mousedown', this._onDown);
        this._cv?.removeEventListener('mouseup', this._onUp);
        document.body.classList.remove('brawl-on');
        this.root.remove();
        this.banner.remove();
    }
}
