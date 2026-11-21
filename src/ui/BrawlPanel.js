/**
 * BrawlPanel.js — the panel of «Битва существ» (Brawl.js): the team, whom to put, start, clear; a click on the field puts a fighter.
 * Plain DOM over the game; made when the mode starts, removed when the game ends.
 */
import { TEAMS, TEAM_IDS, FIGHTERS, FIGHTER_GROUPS, CUSTOM_FIGHTERS, MAX_CUSTOM_MANA, fighterDef, BRAWL, placePoints, teamAt } from '../game/BrawlRules.js';

const CSS = `
#brawl-panel{position:fixed;left:12px;top:12px;width:262px;max-height:calc(100vh - 24px);overflow:auto;z-index:60;background:rgba(14,12,28,.92);color:#e9e6ff;border:1px solid rgba(160,140,255,.35);border-radius:12px;padding:10px 12px;font:13px/1.35 system-ui,sans-serif;user-select:none;contain:layout paint;will-change:auto}
#brawl-panel h3{margin:0 0 6px;font-size:15px}
#brawl-panel .bp-teams{display:flex;gap:6px;margin-bottom:8px}
#brawl-panel .bp-team{flex:1;border:2px solid transparent;border-radius:8px;padding:6px 4px;cursor:default;font-size:12px;color:#fff;font-weight:600;text-align:center;opacity:.65}
#brawl-panel .bp-team.on{opacity:1;border-color:#fff}
#brawl-panel .bp-g{margin:6px 0 2px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#a99cff}
#brawl-panel .bp-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}
#brawl-panel .bp-f{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:5px 6px;cursor:pointer;color:inherit;text-align:left;font:inherit}
#brawl-panel .bp-f.on{background:rgba(140,110,255,.35);border-color:#b9a8ff}
#brawl-panel .bp-row{display:flex;gap:6px;margin-top:10px}
#brawl-panel .bp-btn{flex:1;border:0;border-radius:8px;padding:8px;cursor:pointer;font-weight:700;color:#fff;background:#5a3fd0}
#brawl-panel .bp-btn.alt{background:#3a3550}
#brawl-panel .bp-btn[disabled]{opacity:.4;cursor:default}
#brawl-panel [hidden],#brawl-aim[hidden]{display:none !important}
#brawl-panel .bp-custom{margin-top:8px;border:1px solid rgba(160,140,255,.24);border-radius:8px;padding:6px 8px}
#brawl-panel .bp-custom summary{cursor:pointer;font-weight:600}
#brawl-panel .bp-custom label{display:block;margin-top:7px}
#brawl-panel .bp-custom :is(input:not([type=checkbox]),select){box-sizing:border-box;width:100%;margin-top:2px;padding:5px;color:inherit;background:#211c39;border:1px solid #625780;border-radius:5px;font:inherit}
#brawl-panel .bp-setup.on{border-color:#b9a8ff;background:#5a3fd0}
#brawl-panel .bp-control{margin-top:7px}
#brawl-panel .bp-name{font-size:15px;font-weight:700}
#brawl-panel .bp-vitals{display:flex;gap:10px;margin:5px 0 8px;font-variant-numeric:tabular-nums}
#brawl-panel .bp-vitals span{display:block}
#brawl-panel .bp-abilities{display:grid;gap:3px}
#brawl-panel .bp-ability span{float:right;color:#c8b9ff}
#brawl-aim{pointer-events:none;position:fixed;z-index:55;top:50%;left:50%;transform:translate(-50%,-50%);color:white;font:21px/1 system-ui;text-shadow:0 0 4px black,0 1px 2px black}
#brawl-panel .bp-cnt{margin-top:8px;font-weight:600}
#brawl-panel .bp-notice{font-size:12px;color:#f1d0ad;margin-top:7px}
#brawl-panel .bp-hint{margin-top:8px;font-size:11.5px;color:#b7b2d6}
body.brawl-on #hud,body.brawl-on #mana-num,body.brawl-on #fatigue-container,body.brawl-on #minimap-container,body.brawl-on #webcam-preview,body.brawl-on #hotbar,body.brawl-on #back-cells,body.brawl-on #coin-counter{display:none !important}
#brawl-banner{position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:61;padding:10px 26px;border-radius:14px;font:700 28px system-ui,sans-serif;color:#fff;background:rgba(14,12,28,.78);border:2px solid #fff;display:none}
`;

export class BrawlPanel {
    constructor(game) {
        this.game = game;
        this.pick = 'knight';
        this.custom = false;
        if (!document.getElementById('brawl-css')) {
            const st = document.createElement('style');
            st.id = 'brawl-css';
            st.textContent = CSS;
            document.head.appendChild(st);
        }
        const root = (this.root = document.createElement('div'));
        root.id = 'brawl-panel';
        root.innerHTML = `<h3>⚔️ Битва существ</h3>
            <div id="bp-setup">
            <div class="bp-teams"><div class="bp-team on" style="background:${TEAMS.A.css}">◀ ${TEAMS.A.label}: слева</div><div class="bp-team on" style="background:${TEAMS.B.css}">справа: ${TEAMS.B.label} ▶</div></div>
            ${FIGHTER_GROUPS.map((g) => `<div class="bp-g">${g}</div><div class="bp-grid">${FIGHTERS.filter((f) => f.group === g).map((f) => `<button class="bp-f" data-f="${f.id}">${f.icon} ${f.label}</button>`).join('')}</div>`).join('')}
            <details class="bp-custom">
                <summary>Свой персонаж</summary>
                <label>Имя <input id="bp-custom-name" type="text" maxlength="32" placeholder="По желанию"></label>
                <label>Тип персонажа
                    <select id="bp-custom-kind">
                        ${CUSTOM_FIGHTERS.map(id => `<option value="${id}" ${id === 'wizard' ? 'selected' : ''}>${fighterDef(id).label}</option>`).join('')}
                    </select>
                </label>
                <label id="bp-mana-label">Ячейки маны <input id="bp-custom-mana" type="number" min="0" max="${MAX_CUSTOM_MANA}" value="100" step="1"></label>
                <label><input id="bp-custom-take" type="checkbox"> Играть за него сразу</label>
                <div class="bp-row"><button class="bp-btn alt bp-setup" id="bp-custom-place" aria-pressed="false">Разместить на поле</button></div>
            </details>
            <div class="bp-hint">Щелчок по бойцу даёт управление. Щелчок по свободному полю ставит бойца на выбранную половину. Shift ставит пятерых.</div>
            <div class="bp-hint">WASD — камера, пробел и C — высота, ПКМ — поворот, колесо — скорость.</div>
            </div>
            <div class="bp-control" id="bp-control" hidden>
                <div class="bp-name" id="bp-name"></div>
                <div class="bp-vitals"><span id="bp-health"></span><span id="bp-mana"></span></div>
                <div class="bp-abilities" id="bp-abilities"></div>
                <div class="bp-hint" id="bp-controls-hint"></div>
                <div class="bp-row"><button class="bp-btn alt" id="bp-release">К наблюдению (V)</button></div>
            </div>
            <div class="bp-cnt" id="bp-cnt"></div>
            <div class="bp-row"><button class="bp-btn" id="bp-start">⚔️ Начать бой</button><button class="bp-btn alt" id="bp-clear">🗑 Убрать всех</button></div>
            <div role="status" class="bp-notice" id="bp-notice" hidden></div>
            <div class="bp-row"><button class="bp-btn alt" id="bp-sweep" title="Убирает бойцов, трупы, вещи, огонь и чинит землю после взрывов">🧹 Очистить поле полностью</button></div>`;
        document.body.appendChild(root);
        document.body.classList.add('brawl-on'); // (the hero's bars, slots, minimap and the camera window are of no use to a spectator)
        const banner = (this.banner = document.createElement('div'));
        banner.id = 'brawl-banner';
        document.body.appendChild(banner);
        root.addEventListener('mousedown', (e) => e.stopPropagation());
        const get = (id) => root.querySelector('#bp-' + id);
        this.notice = get('notice');
        this.setup = get('setup');
        this.play = get('control');
        this.name = get('name');
        this.health = get('health');
        this.mana = get('mana');
        this.actions = get('abilities');
        this.controlsHint = get('controls-hint');
        this.customName = get('custom-name');
        this.customKind = get('custom-kind');
        this.customMana = get('custom-mana');
        this.customTake = get('custom-take');
        this.customBtn = get('custom-place');
        this.customKind.onchange = () => {
            const mana = fighterDef(this.customKind.value).mana;
            get('mana-label').hidden = mana == null;
            if (mana != null) this.customMana.value = mana;
        };
        this.customBtn.onclick = () => { this.custom = !this.custom; this._sync(); };
        get('release').onclick = () => game.brawl.control.release();
        root.querySelectorAll('.bp-f').forEach((el) => {
            el.onclick = () => { this.pick = el.dataset.f; this.custom = false; this._sync(); };
        });
        root.addEventListener('focusin', () => game.spectator?.keys.clear());
        const aim = this.aim = document.createElement('div');
        aim.id = 'brawl-aim'; aim.textContent = '＋'; aim.hidden = true;
        document.body.appendChild(aim);
        root.querySelector('#bp-start').onclick = () => { this._say(); if (!game.brawl.start()) this._say(game.brawl.why); };
        root.querySelector('#bp-clear').onclick = () => game.brawl.clear();
        root.querySelector('#bp-sweep').onclick = () => { const r = game.brawl.sweep(); this._say(`Поле чистое (убрано: бойцов ${r.fighters}, тел ${r.bodies}, вещей ${r.items}, оружия ${r.weapons}, огней ${r.fires}, исправлено участков земли ${r.chunks})`); };
        this._down = null;
        this._onDown = (e) => {
            if (e.button !== 0) return;
            if (game.brawl.control.entry) {
                if (game.brawl.state === 'fight') game.brawl.control.pressAttack();
                return;
            }
            this._down = { x: e.clientX, y: e.clientY, shift: e.shiftKey };
        };
        this._onUp = (e) => {
            const d = this._down; this._down = null;
            if (e.button !== 0 || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
            this._clickField(e.clientX, e.clientY, d.shift || e.shiftKey);
        };
        this._endAttack = (e) => { if (e.button === 0) game.brawl.control.attackHeld = false; };
        window.addEventListener('mouseup', this._endAttack);
        const cv = game.renderer?.domElement;
        cv?.addEventListener('mousedown', this._onDown);
        cv?.addEventListener('mouseup', this._onUp);
        this._cv = cv;
        game.brawl.onChange = (s) => this._status(s);
        this._sync();
        this._status({ state: game.brawl.state, total: { A: 0, B: 0 }, alive: { A: 0, B: 0 } });
    }

    _say(t = '') {
        this.notice.hidden = !t;
        if (this.notice.textContent !== t) this.notice.textContent = t;
    }

    _clickField(cx, cy, group) {
        const g = this.game, b = g.brawl;
        this._say();
        if (!this.custom && !group && b.state !== 'over') {
            const entry = b.control.pick(cx, cy, this._cv.getBoundingClientRect(), g.camera);
            if (entry && b.control.take(entry)) return;
        }
        this._place(cx, cy, group);
    }

    _place(cx, cy, group) {
        const g = this.game, p = g.spectator?.pick(cx, cy, g.camera);
        if (!p) return;
        if (g.brawl.state === 'over') g.brawl.clear();
        const team = teamAt(p.x);
        if (!team) { this._say('Это полоса между командами: ставьте бойцов слева (красные) или справа (синие)'); return; }
        if (this.custom) {
            if (fighterDef(this.customKind.value).mana != null && !this.customMana.checkValidity()) { this.customMana.reportValidity(); return; }
            const [q] = placePoints(p.x, p.z, 1, Math.random, team);
            const b = g.brawl;
            const entry = b.spawn(this.customKind.value, team, q.x, q.z, { name: this.customName.value, mana: this.customMana.value });
            if (!entry) { this._say(b.why); return; }
            this.custom = false;
            this._sync();
            if (this.customTake.checked) b.control.take(entry);
            return;
        }
        const pts = placePoints(p.x, p.z, group ? BRAWL.GROUP : 1, Math.random, team);
        for (const q of pts) if (!g.brawl.spawn(this.pick, team, q.x, q.z)) { this._say(g.brawl.why); break; }
    }

    _sync() {
        this.root.querySelectorAll('[data-f]').forEach((el) => el.classList.toggle('on', !this.custom && el.dataset.f === this.pick));
        this.customBtn.classList.toggle('on', this.custom);
        this.customBtn.setAttribute('aria-pressed', String(this.custom));
        this.customBtn.textContent = this.custom ? 'Выберите место на поле' : 'Разместить на поле';
    }

    _status(s) {
        // (no work for the same picture: the fight sends this a few times a second, and every write of the panel's html is a layout of the page over a moving 3D scene)
        const control = this.game.brawl.control, e = control.entry;
        const key = `${s.state}|${s.winner}|${s.countdown}|${s.total.A}/${s.total.B}|${s.alive.A}/${s.alive.B}|${e?.k}:${e?.id}|${control.castIndex}`;
        if (key === this._key) return;
        this._key = key;
        const c = this._cnt || (this._cnt = this.root.querySelector('#bp-cnt'));
        const fight = s.state === 'fight' || s.state === 'over';
        c.innerHTML = TEAM_IDS.map((t) => `<span style="color:${TEAMS[t].css}">${TEAMS[t].label}: ${fight ? s.alive[t] + ' / ' + s.total[t] : s.total[t]}</span>`).join(' · ');
        (this._startBtn || (this._startBtn = this.root.querySelector('#bp-start'))).disabled = s.state !== 'setup';
        this.setup.hidden = !!e;
        this.play.hidden = !e;
        this.aim.hidden = !e;
        if (e) {
            this.name.textContent = control.body.name || e.def.label;
            this.name.style.color = control.teamColor();
            const spells = control.abilities();
            this.actions.replaceChildren(...spells.map(([spell, label], i) => {
                const btn = document.createElement('button');
                btn.className = 'bp-f bp-ability' + (i === control.castIndex ? ' on' : '');
                btn.setAttribute('aria-pressed', String(i === control.castIndex));
                btn.textContent = `${i + 1}. ${label}`;
                const cost = document.createElement('span'); cost.textContent = control.cost(spell);
                btn.appendChild(cost);
                btn.onclick = () => control.select(i);
                return btn;
            }));
            this.controlsHint.textContent = 'WASD — движение, Shift — бег, ПКМ — поворот, ЛКМ — атака.'
                + (spells.length ? ' 1–4 — заклинания.' : e.k === 'a' ? ' Пробел — прыжок.' : '')
                + (e.def.elemental === 'air' || e.def.savior ? ' E / C — взлёт и снижение.' : '');
            this.updateStatus();
        }
        const b = this.banner;
        if (s.state === 'countdown') {
            b.textContent = `До боя · ${s.countdown}`;
            b.style.borderColor = '#a1ddf8';
            b.style.display = 'block';
        } else if (s.state === 'over') {
            b.textContent = s.winner === 'draw' ? '🤝 Ничья' : `🏆 Победа: ${TEAMS[s.winner].label}`;
            b.style.borderColor = s.winner === 'draw' ? '#fff' : TEAMS[s.winner].css;
            b.style.display = 'block';
        } else b.style.display = 'none';
    }

    updateStatus() {
        const s = this.game.brawl.control.stats();
        if (!s) return;
        const hp = `Здоровье ${Math.ceil(s.hp)} / ${Math.ceil(s.maxHp)}`;
        const mana = Number.isFinite(s.maxMana) ? `Мана ${Math.floor(s.mana)} / ${s.maxMana}` : '';
        if (this.health.textContent !== hp) this.health.textContent = hp;
        if (this.mana.textContent !== mana) this.mana.textContent = mana;
    }

    dispose() {
        this._cv?.removeEventListener('mousedown', this._onDown);
        this._cv?.removeEventListener('mouseup', this._onUp);
        document.body.classList.remove('brawl-on');
        this.root.remove();
        this.banner.remove();
        this.aim.remove();
        window.removeEventListener('mouseup', this._endAttack);
        this.game.brawl.onChange = null;
    }
}
