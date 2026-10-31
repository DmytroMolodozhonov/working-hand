/**
 * MonsterFearLife.js — игровая часть MonsterFear.js (правила и числа — там): как жители встречают героя в форме монстра.
 * `game.monsterFear`; хост ведёт жителей (CastleLife.update → step(v, dt) для каждого, до огня и боя).
 *
 * Что делает житель, заметив монстра (прямая видимость до MFEAR.SEE, не сквозь стены):
 *   1. «осознаёт» (маги — REACT_LAG по рангу, остальные 0,4…1,4 с);
 *   2. решает ОДИН раз (MonsterFear.decide; запоминается в v.mf; в журнале «решение:»);
 *   3. бежит (Castle.fear с паникой — тем же ходом, что от огня: Pilot/crowdStep) или бьёт (v.foe = монстр: дальше обычный бой
 *      рыцаря/мага с гигантом — CastleLife._fight) или — маг, знающий «Nihilis Atra», — подходит, поворачивается к монстру ЛИЦОМ,
 *      кричит заклинание и пускает конус света (Nihilis.fire — тот же, что у игрока, по сети 'nhl'): форма снимается досрочно, плавно
 *      (MonsterTransform.end — 4 с, человек жив).
 * Не включается: дуэль/арена (v.arena), космос и планеты (realm ≠ earth), слуги Брейнрота, подброшенные/оглушённые/спящие.
 */
import * as THREE from 'three';
import { MFEAR, decide, noticeDelay, dispelStep, classOf, isMaster } from './MonsterFear.js';
import { FACE, facesTarget, turnToward, yawTo } from './FaceTarget.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3();
const CAST_SAY = ['Нихилис Атра!', 'Nihilis Atra!'];

export class MonsterFearLife {
    constructor(game) {
        this.game = game;
        this.mons = []; // [{id, x, y, z, local}]
        this._t = 0;
    }

    /** (каждый кадр, хост) Обновить список монстров мира: мой герой и друзья в форме. */
    update(dt) {
        this._t -= dt;
        if (this._t > 0) return;
        this._t = 0.25;
        const g = this.game, L = g.castleLife;
        this.mons.length = 0;
        if (!L?.enabled || !L.auth) return;
        if (g.space && g.space.realm && g.space.realm !== 'earth') return; // (космос и планеты: правило не включается)
        const m = g.monster;
        if (m?.active && m.phase !== 'shrink' && !g.isDeadLocal) { const p = m.humanPos(); this.mons.push({ id: g.localId, x: p.x, y: p.y, z: p.z }); }
        if (g.remotes) for (const [id, r] of g.remotes) {
            if (!r?.monsterForm) continue;
            const p = L._playerPos?.(id);
            if (p) this.mons.push({ id, x: p.x, y: p.y ?? 0, z: p.z });
        }
    }

    /** (хост, на каждого жителя) → true: житель занят монстром в этом кадре. */
    step(v, dt) {
        const L = this.game.castleLife;
        if (!this.mons.length) {
            if (v.mf) this._clear(v);
            return false;
        }
        if (v.arena || v.servantOf != null || v.lev || v.stunT > 0 || v.sleep || v.dead || v.role === 'sailor') return false;
        let mf = v.mf;
        // посмотреть на монстров (не каждый кадр: прямая видимость дорога)
        v.mfT = (v.mfT || 0) - dt;
        if (v.mfT <= 0) {
            v.mfT = 0.4 + Math.random() * 0.2;
            let best = null, bd = MFEAR.SEE;
            for (const m of this.mons) {
                const d = Math.hypot(m.x - v.x, m.z - v.z);
                if (d < bd && L._sees(v, { x: m.x, y: m.y + 3.5, z: m.z })) { bd = d; best = m; }
            }
            if (best) {
                if (!mf) {
                    mf = v.mf = { t: noticeDelay(v), d: null, lastSeen: 0, foe: false };
                    L.alog?.decision?.(v, `увидел монстра (${bd.toFixed(0)} м): осознаю ${mf.t.toFixed(2)} с`);
                }
                mf.m = best; mf.lastSeen = 0;
            }
        }
        if (!mf) return false;
        mf.lastSeen += dt;
        if (mf.lastSeen > 8 || !mf.m) { // (потерял из виду надолго: успокоился; решение остаётся тем же — оно по id)
            this._clear(v);
            return false;
        }
        // монстр, за которым слежу, ещё есть?
        const m = this.mons.find((q) => q.id === mf.m.id);
        if (!m) { this._clear(v); return false; }
        mf.m = m;
        if (mf.t > 0) { mf.t -= dt; return false; }
        if (!mf.d) {
            const d = decide(v);
            // не боец (ученик, который не дерётся): храбрость без драки — просто бегство
            if (d.act === 'fight' && !d.dispel && !L._fights(v)) { d.act = 'flee'; d.why += ' — но он не боец, бежит'; }
            mf.d = d;
            L.alog?.decision?.(v, `решение о монстре: ${d.why}`);
        }
        const D = mf.d;
        const dist = Math.hypot(m.x - v.x, m.z - v.z);
        if (D.act === 'flee') {
            this._clearFoe(v, mf);
            mf.fearT = (mf.fearT || 0) - dt;
            if (mf.fearT <= 0) {
                mf.fearT = MFEAR.FEAR_REFRESH;
                v.seated = false;
                if (v.job === 'desk' || v.job === 'stall') v.job = 'wander';
                L.fear(v, m.x, m.z, 1, MFEAR.FEAR_REFRESH, { panic: true });
            }
            return false; // (дальше его ведёт _fireStep — бег прочь, обходя других)
        }
        // дерётся
        if (D.dispel && this._dispel(v, mf, m, dist, dt)) return true;
        if (dist < 60 && !v.foe) {
            v.foe = m.id; mf.foe = true;
            L._say?.(v, 'Бей чудовище!', 3);
            L.alog?.decision?.(v, 'иду на монстра (не сквозь стены: тот же бой, что с игроком)');
        }
        return false;
    }

    /** Маг, знающий «Nihilis Atra»: подойти, повернуться лицом, крикнуть, пустить конус. → true: занят. */
    _dispel(v, mf, m, dist, dt) {
        const g = this.game, L = g.castleLife;
        mf.cd = (mf.cd || 0) - dt;
        const facing = facesTarget(v.yaw, v.x, v.z, m.x, m.z, FACE.SPELL);
        const r = dispelStep({ mana: v.mana ?? 0, noWand: !!(v.noWand || v.lostWand), stunned: v.stunT > 0 || !!v.lev || !!v.vy, dist, facing, cd: mf.cd });
        if (r === 'no') return false; // (нет маны/палочки: дерётся обычными средствами)
        this._clearFoe(v, mf);
        v.seated = false;
        if (r === 'approach') {
            L._steer?.(v, m.x, m.z, 5.6, dt, MFEAR.CAST_RANGE - 6);
            v.mode = 'run';
            L._ground?.(v);
            return true;
        }
        v.speed = 0; v.mode = 'idle';
        v.yaw = turnToward(v.yaw, yawTo(v.x, v.z, m.x, m.z), FACE.WIZARD_TURN * dt); // («лицом к цели»: сначала поворот, потом заклинание)
        L._ground?.(v);
        if (r === 'wait') return true;
        // говорит и пускает свет
        if (v.group?.visible && v.model?.getWandTip) v.model.getWandTip(_o); else _o.set(v.x - Math.sin(v.yaw), v.y + 3.4, v.z - Math.cos(v.yaw));
        _d.set(m.x - _o.x, (m.y + 3.5) - _o.y, m.z - _o.z).normalize();
        mf.cd = MFEAR.CAST_COOL;
        v.mana = (v.mana ?? 0) - MFEAR.NIHILIS_COST;
        L._say?.(v, CAST_SAY[(Math.random() * CAST_SAY.length) | 0], 3);
        v.castT = 0.55;
        if (v.model) v.model.castNow = true;
        const o = _o.clone(), d = _d.clone();
        g.nihilis?.fire?.(o, d, v.id);
        g.sync?.nihilis?.(o, d);
        L.alog?.decision?.(v, `кричу «Nihilis Atra» в монстра (${dist.toFixed(0)} м, мана ${Math.round(v.mana)})`);
        return true;
    }

    _clearFoe(v, mf) {
        if (mf?.foe && v.foe === mf.m?.id) v.foe = null;
        if (mf) mf.foe = false;
    }

    _clear(v) {
        const mf = v.mf;
        if (mf?.foe && v.foe === mf.m?.id) v.foe = null;
        v.mf = null;
    }
}

export { classOf, isMaster };
