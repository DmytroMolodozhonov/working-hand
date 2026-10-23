/**
 * MonsterCircle.js — рисуют «Пентаграмму страшного монстра» концом палочки по земле, потом встают в неё
 * (рисунок и как его узнают — PentagramMonster.js, превращение — MonsterTransform.js). `game.monsterCircle`.
 *
 * Физически, как палкой на песке (главный принцип: руки делают — предмет следует): конец палочки, которую держит
 * рука, касается земли (≤ 0,35 м над её верхом) — по земле остаётся тёмная выжженная черта; поднял конец — черта
 * кончилась. Черты одного рисунка — те, что рядом (≤ 7 м от первой точки) и не старше 60 с. Каждую законченную черту
 * рисунок проверяется (по кусочку за кадр — `recognizeSteps`, ~0,5 мс): узнана пасть в круге и пентаграмма выучена —
 * черты наливаются багровым светом (видно всем по сети, `mpen`), подсказка «встаньте в круг». Не выучена —
 * не засчитывается (подсказка: сжечь свиток). Встал ногами в круг на 0,8 с — 200 маны и превращение; пентаграмма
 * выгорает. Не встал за 3 минуты — гаснет.
 *
 * Дёшево: все черты — одна форма (полоски-квады на земле, буфер на MAX_SEG отрезков, перерисовка только при новом
 * отрезке), две отрисовки (ожог + свечение, свечение — только когда горит), материалы — на загрузке (prewarm).
 */

import * as THREE from 'three';
import { MONSTER_PENTAGRAM, recognizeSteps } from './PentagramMonster.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
export const CIRCLE = {
    TOUCH: 0.35,     // м: конец палочки над землёй — касается
    STEP: 0.12,      // м: новая точка черты
    WIDTH: 0.13,     // м: ширина черты
    NEAR: 7,         // м: черты одного рисунка — от первой точки
    STROKE_GAP: 0.5, // с: конец поднят дольше — черта кончилась
    FORGET: 60,      // с: черты старше — стираются (рисунок не сложился)
    ARMED: 180,      // с: узнанная пентаграмма горит, ждёт
    STAND: 0.8,      // с: стоять в круге
    MAX_SEG: 900,
};

let _mats = null;
function mats() {
    if (_mats) return _mats;
    _mats = {
        burn: new THREE.MeshBasicMaterial({ color: 0x24100c, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
        glow: new THREE.MeshBasicMaterial({ color: MONSTER_PENTAGRAM.glow[0], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    };
    for (const m of Object.values(_mats)) m.userData.keep = true;
    return _mats;
}

/** Черты на земле (свои или другого игрока): одна форма из полосок. */
class GroundMark {
    constructor(scene) {
        const n = CIRCLE.MAX_SEG;
        this.pos = new Float32Array(n * 4 * 3);
        const idx = new Uint16Array(n * 6);
        for (let i = 0; i < n; i++) { const a = i * 4; idx.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], i * 6); }
        this.geo = new THREE.BufferGeometry();
        this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
        this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
        this.geo.setDrawRange(0, 0);
        const M = mats();
        this.burn = new THREE.Mesh(this.geo, M.burn);
        this.glow = new THREE.Mesh(this.geo, M.glow.clone()); // (своя прозрачность: у каждого рисунка свой огонь)
        this.glow.material.userData.keep = false;
        for (const m of [this.burn, this.glow]) { m.frustumCulled = false; m.renderOrder = 2; m.name = 'monster-pentagram'; scene.add(m); }
        this.glow.visible = false;
        this.n = 0;
        this.scene = scene;
    }

    /** Отрезок a → b на высоте y (верх земли + чуть-чуть). */
    seg(ax, ay, az, bx, by, bz) {
        if (this.n >= CIRCLE.MAX_SEG) return;
        const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, w = CIRCLE.WIDTH / 2;
        const nx = (-dz / l) * w, nz = (dx / l) * w, o = this.n * 12, P = this.pos;
        P[o] = ax + nx; P[o + 1] = ay; P[o + 2] = az + nz;
        P[o + 3] = ax - nx; P[o + 4] = ay; P[o + 5] = az - nz;
        P[o + 6] = bx + nx; P[o + 7] = by; P[o + 8] = bz + nz;
        P[o + 9] = bx - nx; P[o + 10] = by; P[o + 11] = bz - nz;
        this.n++;
        this.geo.attributes.position.needsUpdate = true;
        this.geo.setDrawRange(0, this.n * 6);
        this.geo.computeBoundingSphere();
    }

    clear() { this.n = 0; this.geo.setDrawRange(0, 0); this.glow.visible = false; }

    /** Свечение 0…1 (дрожит, как угли). */
    setGlow(k, t) {
        this.glow.visible = k > 0.01;
        this.glow.material.opacity = k * (0.65 + 0.25 * Math.sin(t * 7.3) * Math.sin(t * 3.1));
        this.burn.material.color.setHex(k > 0.01 ? 0x3a0608 : 0x24100c);
    }

    dispose() {
        for (const m of [this.burn, this.glow]) this.scene.remove(m);
        this.glow.material.dispose();
        this.geo.dispose();
    }
}

export class MonsterCircle {
    constructor(game) {
        this.game = game;
        this.mark = null;
        this.strokes = []; // [[x, z, y]…] — черты этого рисунка
        this.cur = null;   // черта, которая рисуется сейчас
        this._lift = 0;
        this.started = 0;
        this.armed = null; // {x, z, y, r, until} — узнана и горит
        this._job = null;  // распознавание по кусочку
        this._stand = 0;
        this._told = -Infinity;
        this.remote = new Map(); // id → {mark, until}
    }

    _markOf() { return this.mark || (this.mark = new GroundMark(this.game.scene)); }

    /** Где конец палочки в руке (null — палочки нет). */
    _tip(out) {
        const g = this.game, h = g.items?.heldOf?.('wand');
        if (!h?.model || g.monster?.active) return null;
        h.model.updateMatrixWorld(true);
        return out.set(0, h.model.userData?.tipY || 0.65, 0).applyMatrix4(h.model.matrixWorld);
    }

    update(dt) {
        const g = this.game, now = performance.now() / 1000;
        this._remote(now);
        if (this._job) this._step();
        if (this.armed) { this._armed(dt, now); return; }
        if (this.strokes.length && now - this.started > CIRCLE.FORGET) this.reset();
        const tip = this._tip(_v);
        const T = g.terrain?.data;
        if (!tip || !T?.floorAt || g.combat?.dead || g.flight?.busy) { this._endStroke(); return; }
        const ground = T.floorAt(tip.x, tip.z, tip.y + 0.5);
        const touch = Number.isFinite(ground) && tip.y - ground <= CIRCLE.TOUCH && tip.y - ground > -0.6;
        if (!touch) { this._lift += dt; if (this._lift > CIRCLE.STROKE_GAP) this._endStroke(); return; }
        this._lift = 0;
        // (далеко от первой точки — это новый рисунок)
        const f = this.strokes[0]?.[0] || this.cur?.[0];
        if (f && Math.hypot(tip.x - f[0], tip.z - f[1]) > CIRCLE.NEAR) this.reset();
        if (!this.cur) { this.cur = [[tip.x, tip.z, ground]]; if (!this.strokes.length) this.started = now; return; }
        const last = this.cur[this.cur.length - 1];
        if (Math.hypot(tip.x - last[0], tip.z - last[1]) < CIRCLE.STEP) return;
        this.cur.push([tip.x, tip.z, ground]);
        this._markOf().seg(last[0], last[2] + 0.04, last[1], tip.x, ground + 0.04, tip.z);
        // (искорка в месте касания — тёмный пепел из-под конца палочки)
        if (Math.random() < 0.3) g.fx?.spark?.(_w.set(tip.x, ground + 0.08, tip.z), 0x5a1a12, 0.07, _v.set((Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6), 0.5);
    }

    _endStroke() {
        if (!this.cur) return;
        if (this.cur.length >= 3) this.strokes.push(this.cur);
        this.cur = null;
        if (this.strokes.length) this._job = recognizeSteps(this.strokes.map((s) => s.map((p) => [p[0], p[1]])));
    }

    /** Распознавание — по ~2 мс за кадр. */
    _step() {
        const t0 = performance.now();
        let r;
        do { r = this._job.next(); } while (!r.done && performance.now() - t0 < 2);
        if (!r.done) return;
        this._job = null;
        const res = r.value;
        if (!res || res.id !== MONSTER_PENTAGRAM.id) return;
        const g = this.game;
        if (!g.knowsSpell?.(MONSTER_PENTAGRAM.key)) {
            if (performance.now() - this._told > 8000) { this._told = performance.now(); g.hud?.setVoice?.('🜏 Рисунок похож на пентаграмму монстра, но вы её не знаете — найдите её свиток и сожгите «Инферно»', true); }
            return;
        }
        const ys = this.strokes.flat().map((p) => p[2]);
        this.armed = { x: res.centre.x, z: res.centre.z, y: ys.reduce((a, b) => a + b, 0) / ys.length, r: res.r, until: performance.now() / 1000 + CIRCLE.ARMED, t: 0 };
        g.hud?.setVoice?.('🜏 <span style="color:#ff5a4a">Пентаграмма страшного монстра горит — встаньте в круг</span>', true);
        g.sound?.playSpellFx?.('fxMonsterRoar', _v.set(this.armed.x, this.armed.y, this.armed.z), 0.35, 0.6);
        g.sync?.monsterPentagram?.({ on: 1, y: Math.round(this.armed.y * 100) / 100, l: this.strokes.map((s) => s.flatMap((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100])) });
    }

    _armed(dt, now) {
        const g = this.game, A = this.armed, ch = g.character;
        A.t += dt;
        this.mark?.setGlow(Math.min(1, A.t / 0.8), now);
        // угли и дымок над чертами (немного: из пула искр)
        if (Math.random() < dt * 14 && this.strokes.length) {
            const s = this.strokes[(Math.random() * this.strokes.length) | 0], p = s[(Math.random() * s.length) | 0];
            g.fx?.spark?.(_w.set(p[0], p[2] + 0.1, p[1]), Math.random() < 0.6 ? 0xff3020 : 0x1a0404, 0.09, _v.set((Math.random() - 0.5) * 0.4, 0.9 + Math.random(), (Math.random() - 0.5) * 0.4), 0.9);
        }
        if (now > A.until) { this.reset(true); return; }
        // ногами в круге, на земле
        const p = ch.group.position, feet = p.y - 2.0;
        const inside = Math.hypot(p.x - A.x, p.z - A.z) < A.r * 0.85 && Math.abs(feet - A.y) < 1.2 && ch.onGround && !g.monster?.active;
        this._stand = inside ? this._stand + dt : 0;
        if (this._stand < CIRCLE.STAND) return;
        this._stand = 0;
        if (g.monster?.begin()) {
            // пентаграмма выгорает: вспышка по чертам
            for (const s of this.strokes) for (let i = 0; i < s.length; i += 3) g.fx?.spark?.(_w.set(s[i][0], s[i][2] + 0.1, s[i][1]), 0xff2a1a, 0.16, _v.set(0, 3 + Math.random() * 3, 0), 1.1);
            this.reset(true);
        } else A.until = Math.min(A.until, now + 20); // (не хватило маны: ещё немного погорит)
    }

    /** Стереть рисунок (broadcast — сказать другим, что погас). */
    reset(broadcast = false) {
        const was = !!this.armed;
        this.strokes = []; this.cur = null; this.armed = null; this._job = null; this._stand = 0;
        this.mark?.clear();
        if (broadcast && was) this.game.sync?.monsterPentagram?.({ on: 0 });
    }

    // ------------------------------------------------------------------ чужие пентаграммы (сеть)

    onNet(m) {
        const id = String(m.by);
        let R = this.remote.get(id);
        if (!m.on) { if (R) { R.mark.dispose(); this.remote.delete(id); } return; }
        if (!R) { R = { mark: new GroundMark(this.game.scene), until: 0 }; this.remote.set(id, R); }
        R.mark.clear();
        const y = (+m.y || 0) + 0.04;
        for (const s of Array.isArray(m.l) ? m.l.slice(0, 40) : []) for (let i = 2; i + 1 < s.length; i += 2) R.mark.seg(+s[i - 2], y, +s[i - 1], +s[i], y, +s[i + 1]);
        R.until = performance.now() / 1000 + CIRCLE.ARMED;
    }

    _remote(now) {
        for (const [id, R] of this.remote) {
            if (now > R.until || !this.game.remotes?.has(id)) { R.mark.dispose(); this.remote.delete(id); continue; }
            R.mark.setGlow(1, now);
        }
    }

    /** (Game.prewarm) Шейдеры черт — на загрузке. */
    static samples() {
        const M = mats(), g = new THREE.PlaneGeometry(1, 1);
        return [new THREE.Mesh(g, M.burn), new THREE.Mesh(g, M.glow)];
    }

    dispose() {
        this.mark?.dispose(); this.mark = null;
        for (const R of this.remote.values()) R.mark.dispose();
        this.remote.clear();
    }
}
