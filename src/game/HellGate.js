/**
 * HellGate.js — врата ада: «Пентаграмма ада» (`Pentagranium Infernum`) на Земле и метка возврата в аду (правила и тексты — HellRules.js, план — HellMap.js).
 *
 *  - Пентаграмма на Земле (обычная метка Pentagranium, pent 'infernum'): вне Творческого ждёт жертву (Offerings, `m.offer = 'infernum'`: одно тело любого
 *    убитого существа) → `opened(m)`: круг открыт INFERNUM.OPEN_S с (горит красным, луч вверх, искры затягивает вверх), все компьютеры по 'pgm' k 'hell'.
 *    В Творческом круг открыт сразу и всё время.
 *  - Переход (у КАЖДОГО компьютера — свой герой): постоял в открытом круге STEP_S с → затемнение/вспышка FADE_S с, звук → герой в аду у метки
 *    (HeroApply: висит над точкой, пока воркеры не принесут землю, потом ставится на твёрдое — standLayer). Где вошёл — запомнено (`from`, сохраняется).
 *  - Метка в аду (у каждого компьютера своя, не сохраняется — `world: 'hell'`): ждёт голову горгульи на круге (`offer = 'hellBack'`) → открыта →
 *    шаг в круг → на Земле у той пентаграммы, через которую вошёл (её нет — ближайшее сухое место: HeroApply.safeNear). Творческий — без головы.
 *  - Что может пойти не так: умер в круге / во время перехода — переход отменяется (возрождение на Земле — Game.respawn → onRespawn); Империус, дуэль,
 *    монстр, верхом — не пускает (подсказка один раз); пентаграмма погасла — круг закрыт; хост ушёл — у каждого всё своё; старое сохранение без `from` —
 *    назад к началу мира.
 */
import * as THREE from 'three';
import { HELL, inHell } from '../world/HellMap.js';
import { INFERNUM, HELL_TEXT, hellSpellBlock } from './HellRules.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const BACK_ID = 'hell:back';
const BEAM = [0xff2a10, 0xff6a1a, 0xffb040, 0x8a0a0a, 0x3a0404];

export class HellGate {
    constructor(game) {
        this.game = game;
        this.from = null; // {x, y, z}: the pentagram on the Earth I went in by (saved)
        this.been = false; // I have been in hell (the achievement is given once — Achievements)
        this.inside = null; // {id, t} — standing in an open circle
        this.trans = null; // {t, dir: 'down'|'up', to, done}
        this.lock = null; // id of the circle I arrived on: it does not carry me back until I step off it
        this._hinted = new Map();
        this._overlay = null;
    }

    get creative() { const m = this.game.config?.mode; return m === 'creative' || m === 'test'; }
    get P() { return this.game.pentagranium; }
    get plan() { return this.game.terrain?.data?.hell ? this.game.terrain.data.hellPlan : null; }
    /** Is my hero in hell now? */
    get inHell() { const p = this.game.character?.group?.position; return !!p && !!this.game.terrain?.data?.hell && inHell(p.x, p.z); }

    /** A spell that does not work here (water and cold — HellRules.hellSpellBlock), or null. */
    spellBlocked(name) { return this.inHell ? hellSpellBlock(name) : null; }

    _hint(key, text, every = 9000) {
        const now = performance.now();
        if (now - (this._hinted.get(key) || -1e9) < every) return;
        this._hinted.set(key, now);
        if (this._hinted.size > 30) this._hinted.clear();
        this.game.hud?.setVoice?.(text, true);
    }

    // ------------------------------------------------------------ the gates open
    /** (every computer) The rite on the circle `m` is done: the gates are open (`send` — mine: the others are told). */
    opened(m, send = false) {
        if (!m) return;
        m.gateOpen = this.creative ? Infinity : INFERNUM.OPEN_S;
        m.life = Math.max(m.life, INFERNUM.OPEN_S + 8);
        this.game.sound?.playSpellFxAt?.('fxHellOpen', _v.set(m.x, m.y, m.z), 1, 1, 30);
        this.game.fx?.lightFlash?.(_v.set(m.x, m.y + 2, m.z), 0xff3010, 5, 0.6, 40);
        if (send) this.game.sync?.pentagram?.({ k: 'hell', op: 'open', id: m.id });
        const me = this.game.character?.group?.position;
        if (me && Math.hypot(me.x - m.x, me.z - m.z) < 40) this.game.hud?.setVoice?.(m.id === BACK_ID ? HELL_TEXT.openBack : HELL_TEXT.open, true);
    }

    onNet(m) {
        if (m?.op === 'open') { const mk = this.P?.marks.get(m.id); if (mk && mk.pent === 'infernum') this.opened(mk, false); }
    }

    // ------------------------------------------------------------ per frame
    update(dt) {
        const g = this.game, P = this.P;
        if (!P) return;
        if (this.trans) { this._transStep(dt); return; }
        this._backMark(dt);
        const me = g.character?.group?.position;
        if (!me) return;
        let here = null;
        for (const m of P.marks.values()) {
            if (m.pent !== 'infernum') continue;
            if (this.creative && m.fade > 0.9 && !(m.gateOpen > 0)) { m.gateOpen = Infinity; if (m.mine && m.id !== BACK_ID) g.hud?.setVoice?.(HELL_TEXT.drawnCreative, true); }
            if (m.gateOpen > 0 && m.gateOpen !== Infinity) { m.gateOpen -= dt; if (m.gateOpen <= 0) { m.gateOpen = 0; if (m.mine) this._hint('closed' + m.id, HELL_TEXT.closed, 4000); } }
            m.unityHell = m.gateOpen > 0 ? 0.75 + 0.25 * Math.sin(P._t * 6) : 0; // (the lines burn bright while open — Pentagranium._markStep)
            if (m.gateOpen > 0) this._beam(m, dt);
            const d = Math.hypot(me.x - m.x, me.z - m.z), inCircle = d <= m.r * 0.85 && Math.abs(me.y - PLAYER_GROUND_OFFSET - m.y) < 3;
            if (inCircle) here = m;
        }
        if (this.lock && (!here || here.id !== this.lock)) this.lock = null;
        if (!here || here.id === this.lock) { this.inside = null; return; }
        if (!(here.gateOpen > 0)) {
            if (here.id === BACK_ID && !this.creative) this._hint('head', HELL_TEXT.needHead);
            this.inside = null;
            return;
        }
        const why = this._blocked();
        if (why) { this._hint('why' + why, why); this.inside = null; return; }
        if (!this.inside || this.inside.id !== here.id) { this.inside = { id: here.id, t: 0 }; this._hint('going', HELL_TEXT.going, 3000); }
        this.inside.t += dt;
        this._pull(here, this.inside.t / INFERNUM.STEP_S);
        if (this.inside.t >= INFERNUM.STEP_S) this._go(here);
    }

    /** Why the gates do not let me through now (or null). */
    _blocked() {
        const g = this.game;
        if (g.isDeadLocal || g.combat?.dead) return null;
        if (g.imperius?.active) return HELL_TEXT.imperius;
        if (g.monster?.active) return HELL_TEXT.monster;
        if (g._inDuel?.() || g.arenaDuels?.active) return HELL_TEXT.duel;
        if (g.animals?.riding || g.dragonRide?.riding) return HELL_TEXT.mount;
        if (!g.heroApply) return 'no';
        return null;
    }

    // ------------------------------------------------------------ the passage
    _go(m) {
        const g = this.game, plan = this.plan;
        if (!plan || g.isDeadLocal || g.combat?.dead) { this.inside = null; return; }
        const down = m.id !== BACK_ID;
        const me = g.character.group.position;
        let to;
        if (down) {
            this.from = { x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10, z: Math.round(m.z * 10) / 10 };
            const s = plan.spawn;
            to = { x: s.x, z: s.z, layer: s.y, up: 3, down: 3, yaw: Math.atan2(HELL.CX - s.x, HELL.CZ - s.z) + Math.PI };
        } else {
            const f = this.from || { x: 0, y: 0, z: 0 };
            // (beside the pentagram, not on it: the circle there may still be open — 5 m off, on dry land; HeroApply.safeNear looks round for it)
            to = { x: f.x + 5.5, z: f.z, yaw: 0 };
        }
        this.inside = null;
        this.trans = { t: 0, dir: down ? 'down' : 'up', to, done: false, from: { x: me.x, y: me.y, z: me.z }, m: { x: m.x, y: m.y, z: m.z } };
        g.sound?.playSpellFxAt?.(down ? 'fxHellDown' : 'fxHellUp', _v.set(m.x, m.y, m.z), 1, 1, 26);
        g.perf?.note?.(down ? '🔥 Ад: переход вниз' : '🔥 Ад: возврат на Землю');
    }

    _transStep(dt) {
        const g = this.game, T = this.trans, F = INFERNUM.FADE_S;
        T.t += dt;
        if (g.isDeadLocal || g.combat?.dead) { this.trans = null; this._fade(0); return; } // (died in the passage: nothing half done — the respawn is on the Earth)
        const half = F / 2;
        if (!T.done) {
            this._fade(Math.min(1, T.t / half));
            this._pull(T.m, 1);
            if (T.t >= half) {
                T.done = true;
                const ha = g.heroApply;
                ha.pending = { id: T.dir === 'down' ? 'hell' : 'earth', age: 0, far: true, hold: null, origin: _v.set(T.from.x, T.from.y, T.from.z).clone(), cells: null, t: T.to };
                ha._hover?.(T.to.x, T.to.z, (T.to.layer ?? 40) + 30);
                if (T.dir === 'down') { this.lock = BACK_ID; this.been = true; g.achievements?.gain?.('hellGate'); }
            }
            return;
        }
        // (hold the dark until the hero stands on the land of the other side, then let it go)
        if (g.heroApply?.pending) { this._fade(1); if (T.t > 70) { this.trans = null; this._fade(0); } return; }
        T.after = (T.after || 0) + dt;
        this._fade(Math.max(0, 1 - T.after / half));
        if (T.after === dt) this._arrived(T);
        if (T.after >= half) { this.trans = null; this._fade(0); }
    }

    _arrived(T) {
        const g = this.game, fx = g.fx, me = g.character.group.position;
        if (fx) for (let i = 0; i < 80; i++) { const a = (i / 80) * Math.PI * 2; fx.spark(_v.set(me.x + Math.cos(a) * 1.5, me.y - 1.8, me.z + Math.sin(a) * 1.5), BEAM[i % 4], 0.22, _d.set(Math.cos(a) * 2, 2 + Math.random() * 4, Math.sin(a) * 2), 1.4); }
        fx?.lightFlash?.(_v.set(me.x, me.y, me.z), 0xff4010, 5, 0.6, 30);
        if (T.dir === 'down') g.hud?.setVoice?.(this.creative ? HELL_TEXT.arrivedCreative : HELL_TEXT.arrived, true);
        else { g.hud?.setVoice?.(HELL_TEXT.back, true); this.lock = null; }
    }

    /** The screen goes dark-red and back (one DOM layer, made the first time). */
    _fade(k) {
        if (typeof document === 'undefined') return;
        let o = this._overlay;
        if (!o) {
            if (k <= 0) return;
            o = this._overlay = document.createElement('div');
            o.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;opacity:0;background:radial-gradient(circle at 50% 55%, #ff6a1a 0%, #7a0a04 30%, #1a0202 70%, #000 100%)';
            document.body.appendChild(o);
        }
        o.style.opacity = String(Math.max(0, Math.min(1, k)));
        o.style.display = k > 0 ? 'block' : 'none';
    }

    // ------------------------------------------------------------ the look: a beam up, sparks drawn up into it
    _beam(m, dt) {
        const fx = this.game.fx;
        if (!fx) return;
        const me = this.game.character?.group?.position;
        if (me && Math.hypot(me.x - m.x, me.z - m.z) > 160) return;
        m._bT = (m._bT || 0) - dt;
        if (m._bT > 0) return;
        m._bT = 0.05;
        for (let i = 0; i < 5; i++) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * m.r * 0.5;
            fx.spark(_v.set(m.x + Math.cos(a) * r, m.y + 0.2 + Math.random() * 3, m.z + Math.sin(a) * r), BEAM[i % BEAM.length], 0.18 + Math.random() * 0.2, _d.set(-Math.cos(a) * 0.6, 7 + Math.random() * 8, -Math.sin(a) * 0.6), 1.6);
        }
        const a = Math.random() * Math.PI * 2; // (the edge: sparks pulled in to the middle)
        fx.spark(_v.set(m.x + Math.cos(a) * m.r, m.y + 0.2, m.z + Math.sin(a) * m.r), 0xff3a12, 0.16, _d.set(-Math.cos(a) * 2.5, 1.5, -Math.sin(a) * 2.5), 1.2);
        if ((m._lT = (m._lT || 0) - 0.05) <= 0) { m._lT = 0.2; fx.lightFlash?.(_v.set(m.x, m.y + 3, m.z), 0xff3010, 2.5 + Math.random(), 0.25, m.r * 5 + 12); }
    }

    /** Standing in the open circle: sparks spiral up round the hero, faster as the passage nears (`k` 0…1). */
    _pull(m, k) {
        const fx = this.game.fx, me = this.game.character?.group?.position;
        if (!fx || !me) return;
        const n = 2 + Math.floor(k * 6);
        for (let i = 0; i < n; i++) {
            const a = performance.now() * 0.004 + i * 2.1, r = 1.2 + (1 - k) * 1.2;
            fx.spark(_v.set(me.x + Math.cos(a) * r, me.y - 1.8 + Math.random() * 0.5, me.z + Math.sin(a) * r), BEAM[i % 3], 0.16, _d.set(-Math.sin(a) * 2, 3 + 6 * k, Math.cos(a) * 2), 1.1);
        }
    }

    // ------------------------------------------------------------ the mark in hell
    /** My hero is in hell: the return mark is lit (made when its land is here); far from it / out of hell — put out. */
    _backMark(dt) {
        const P = this.P, plan = this.plan, g = this.game, data = g.terrain?.data;
        this._bmT = (this._bmT || 0) - dt;
        if (this._bmT > 0 || !plan || !data) return;
        this._bmT = 0.5;
        const me = g.character.group.position, R = plan.returnMark, has = P.marks.get(BACK_ID);
        const near = inHell(me.x, me.z) && Math.hypot(me.x - R.x, me.z - R.z) < 400;
        if (!near) { if (has) P._remove(BACK_ID, 'old'); return; }
        if (has || !data.landMade(R.x, R.z)) return;
        const m = P._place(BACK_ID, g.localId, 'infernum', R.x, data.topLayer(R.x, R.z) - 0.5, R.z, R.r, 0, false);
        if (!m) return;
        m.mine = true; m.perm = true; m.world = 'hell'; m.life = Infinity; m.t = 5;
        m.offer = this.creative ? null : 'hellBack';
    }

    // ------------------------------------------------------------ death, save
    /** After the respawn: never in hell (a bed made there does not count) — the start of the world. */
    onRespawn(p) {
        this.trans = null; this.inside = null; this.lock = null; this._fade(0);
        if (!p || !this.game.terrain?.data?.hell || !inHell(p.x, p.z)) return;
        const a = Math.random() * Math.PI * 2;
        p.set(Math.cos(a) * 8, this.game.collision?.groundY?.(Math.cos(a) * 8, Math.sin(a) * 8) + 2.5 || 20, Math.sin(a) * 8);
    }

    snapshot() { return this.from || this.been ? { from: this.from, been: this.been ? 1 : 0 } : null; }
    restore(s) {
        if (!s) return;
        const f = s.from;
        this.from = f && Number.isFinite(+f.x) && Number.isFinite(+f.z) ? { x: +f.x, y: +f.y || 0, z: +f.z } : null;
        this.been = !!s.been;
    }

    dispose() { this._overlay?.remove?.(); this._overlay = null; }
}
