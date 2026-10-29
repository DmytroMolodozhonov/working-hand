/**
 * Vitality.js — the game part of «Пентаграмма чудовищной живучести» (`Pentagranium Sanguinis`; rules and numbers: VitalityRules.js).
 *
 * The pentagram is made by the word (Pentagranium.cast: 250 mana, black magic). Then the body of a humanoid killed by BLACK magic (not bones) lies in its
 * circle (laid by the hand, thrown, lowered by Levitation) and the hero stands in the circle alone: the rite begins by itself.
 *
 * The rite (RITUAL_S = 7 s, the author's «кровь»): 0–1.4 s the hero rises over the ground and hangs there; the body melts into blood — red mist and drops
 * are torn from it and wound into a vortex round the circle's axis, faster and faster, the lines of the pentagram pulse; 1.2–4.6 s threads of blood
 * and streams of drops flow from the vortex into the hero; at 4.6 s a flash — the blood is taken in: the hero's MAXIMUM health grows by the victim's maximum
 * (`bonus.hp`: saved, taken by death into the body, brought back by «Give Me My Power» — Legacy.js) and +10 to the dark level; then the hero is lowered gently.
 * Leaving the circle / dying / being lifted before 4.6 s breaks the rite: the body is whole, the mana is gone (paid at the word).
 * Everything is the shared spark pool, the shared flash light and the pooled beams; the few meshes (column, rune rings, flash) are built once and shared.
 * Online: this computer leads (the hero stands here); the others see it ('pgm' k 'vit') and remove the body at the same moment.
 */
import * as THREE from 'three';
import { VITAL, bodyOk, gainOf, grownMax, standersOk, VITAL_HINT } from './VitalityRules.js';
import { addDark } from './DarkMagic.js';
import { PENT } from './PentagramRules.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

const R = PENT.R;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const BLOOD = [0x8a0a12, 0xc41226, 0x5a0008, 0xff2a3a, 0x3a0004, 0xa00c1c];

let _shared = null;
/** The look of the rite, built once: a blood column, two rune rings, a flash disc (additive, shared). */
function shared() {
    if (_shared) return _shared;
    const ring = document.createElement('canvas'); ring.width = ring.height = 256;
    const g = ring.getContext('2d'), h = 128;
    g.lineCap = 'round';
    const grad = g.createRadialGradient(h, h, 30, h, h, 126);
    grad.addColorStop(0, 'rgba(160,10,30,0.0)'); grad.addColorStop(0.7, 'rgba(190,16,40,0.28)'); grad.addColorStop(1, 'rgba(70,0,10,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#ff3a4a'; g.lineWidth = 3; g.beginPath(); g.arc(h, h, 118, 0, 6.2832); g.stroke();
    g.strokeStyle = '#a00c1c'; g.lineWidth = 2; g.beginPath(); g.arc(h, h, 100, 0, 6.2832); g.stroke();
    let s = 71; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    g.strokeStyle = '#ffb0b0'; g.lineWidth = 2;
    for (let i = 0; i < 28; i++) { // (the band of drops and veins: a fixed seed, the same on every computer)
        const a = (i / 28) * 6.2832; g.beginPath(); g.moveTo(h + Math.cos(a) * 102, h + Math.sin(a) * 102);
        for (let n = 0; n < 3; n++) { const rr = 102 + rnd() * 14, aa = a + (rnd() - 0.5) * 0.16; g.lineTo(h + Math.cos(aa) * rr, h + Math.sin(aa) * rr); }
        g.stroke();
    }
    const rune = new THREE.CanvasTexture(ring); rune.anisotropy = 4;
    const col = document.createElement('canvas'); col.width = 32; col.height = 128;
    const c = col.getContext('2d'), cg = c.createLinearGradient(0, 128, 0, 0);
    cg.addColorStop(0, 'rgba(255,40,60,0.95)'); cg.addColorStop(0.45, 'rgba(160,12,30,0.5)'); cg.addColorStop(1, 'rgba(60,0,10,0)');
    c.fillStyle = cg; c.fillRect(0, 0, 32, 128);
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 6; i++) { c.fillStyle = `rgba(0,0,0,${0.2 + (i % 3) * 0.15})`; c.fillRect(i * 6 + (i % 2) * 2, 0, 2 + (i % 2), 128); }
    const column = new THREE.CanvasTexture(col); column.wrapS = THREE.RepeatWrapping;
    const add = (map, color = 0xffffff, opacity = 1) => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true); cyl.translate(0, 0.5, 0);
    for (const x of [plane, cyl]) x.userData.shared = x.userData.keep = true;
    _shared = { rune, column, plane, cyl, add };
    return _shared;
}

export class Vitality {
    constructor(game) {
        this.game = game;
        this.run = null;
        this._scanT = 0;
        this._noted = new Map();
    }

    /** For Game.prewarm: the look of the rite (column, rings, flash). */
    sampleModels() {
        const S = shared();
        return [new THREE.Mesh(S.plane, S.add(S.rune, 0xffffff, 0.4)), new THREE.Mesh(S.cyl, S.add(S.column, 0xffffff, 0.4))];
    }

    _hint(key, text, every = 8000) {
        const now = performance.now();
        if (now - (this._noted.get(key) || -1e9) < every) return;
        this._noted.set(key, now);
        if (this._noted.size > 40) for (const [k, t] of this._noted) if (now - t > 60000) this._noted.delete(k);
        this.game.hud?.setVoice?.(`🩸 ${text}`, true);
    }

    _busy() {
        const g = this.game, ch = g.character;
        return !!(g.flight?.busy || g.swim?.underwater || ch?.swimY != null || g.animals?.riding || g.levitation?.lifted || g.imperius?.active || g.monster?.active || !ch?.onGround);
    }

    // ------------------------------------------------------------ what stands and lies in the circle
    _heroIn(m) {
        const me = this.game.character.group.position;
        return Math.hypot(me.x - m.x, me.z - m.z) <= m.r * VITAL.STAND_K && Math.abs(me.y - PLAYER_GROUND_OFFSET - m.y) < 3;
    }
    _bodyIn(m, b) { return Math.hypot(b.x - m.x, b.z - m.z) <= m.r * VITAL.BODY_K && Math.abs(b.y - m.y) < 3; }

    /** Players other than me standing in the circle (the rite is for one hero). */
    _others(m) {
        let n = 0;
        for (const r of this.game.remotes?.values?.() || []) {
            const p = r.position || r.group?.position;
            if (p && !r.dead && Math.hypot(p.x - m.x, p.z - m.z) <= m.r && Math.abs(p.y - PLAYER_GROUND_OFFSET - m.y) < 3.5) n++;
        }
        return n;
    }

    update(dt) {
        if (this.run) this._step(dt);
        const g = this.game, P = g.pentagranium;
        if (!P?.marks.size || this.run || !g.character) return;
        this._scanT -= dt;
        if (this._scanT > 0) return;
        this._scanT = 0.35;
        if (g.combat?.dead || g.isDeadLocal) return;
        for (const m of P.marks.values()) {
            if (m.pent !== 'vitality' || m.fade < 0.9 || m.anim) continue;
            const bodies = [];
            for (const b of g.death?.bodies.values() || []) {
                if (b.lev || g.death.falling?.has(b.id) || (b.netAt && performance.now() - b.netAt < 800)) continue;
                if (this._bodyIn(m, b)) bodies.push(b);
            }
            const heroIn = this._heroIn(m);
            if (!heroIn) { if (bodies.length) this._hint('s' + m.id, VITAL_HINT.noStand, 12000); continue; }
            if (!bodies.length) { this._hint('b' + m.id, VITAL_HINT.noBody, 15000); continue; }
            const body = bodies.find((b) => bodyOk(b).ok);
            if (!body) { this._hint('w' + m.id + bodies[0].id, bodyOk(bodies[0]).why, 9000); continue; }
            if (!standersOk(1 + this._others(m))) { this._hint('t' + m.id, VITAL_HINT.two, 8000); continue; }
            if (this._busy()) { this._hint('y' + m.id, VITAL_HINT.busy, 9000); continue; }
            this._start(m, body, false);
            return;
        }
    }

    // ------------------------------------------------------------ the rite
    _start(m, body, remote) {
        const g = this.game, S = shared(), ch = g.character;
        body.vit = 1; // (not `rit`: that is saved with the body — leaving the game mid-rite must not spoil it for good)
        const grp = new THREE.Group();
        grp.position.set(m.x, m.y, m.z);
        const col = new THREE.Mesh(S.cyl, S.add(S.column, 0xffffff, 0));
        const ring1 = new THREE.Mesh(S.plane, S.add(S.rune, 0xff4a5a, 0)), ring2 = new THREE.Mesh(S.plane, S.add(S.rune, 0xa00c1c, 0));
        const flash = new THREE.Mesh(S.plane, S.add(S.rune, 0xffffff, 0));
        col.scale.set(R * 0.4, 1, R * 0.4); ring1.scale.setScalar(R * 1.1); ring2.scale.setScalar(R * 0.75);
        grp.add(col, ring1, ring2, flash);
        for (const o of [col, ring1, ring2, flash]) { o.renderOrder = 8; o.frustumCulled = false; }
        g.scene.add(grp);
        const me = ch.group.position;
        // who hangs in the air: me (or, on another computer, the one who stands there — drawn from his pose)
        const hero = remote ? remote.pos : null;
        this.run = {
            m, body, remote: !!remote, t: 0, grp, col, ring1, ring2, flash, ang: 0, absorbed: false,
            gain: gainOf(body), hold: remote ? null : { x: me.x, z: me.z, y0: me.y },
            from: new THREE.Vector3(body.x, body.y, body.z), scale0: body.model?.scale?.x || 1, y0: body.model?.position?.y ?? body.y, heroPos: hero,
        };
        m.unityHell = 0.3;
        g.sound?.playSpellFxAt?.('thRite', _v.set(m.x, m.y, m.z), 1, 0.9, 22);
        g.castleLife?.alarm?.({ x: m.x, y: m.y, z: m.z }, 'dark', remote ? null : g.localId, 10); // (a black rite over a body: the people take fright, whoever saw it)
        g.perf?.note?.('🩸 Чудовищная живучесть: обряд');
        if (!remote) g.sync?.pentagram?.({ k: 'vit', op: 'start', id: m.id, body: body.id, who: g.localId });
    }

    _heroPos(r) {
        if (!r.remote) return this.game.character.group.position;
        const rp = this.game.remotes?.get(r.who);
        return rp?.position || rp?.group?.position || r.heroPos || null;
    }

    _blood(c, n, size = 0.3, spread = 0.9) {
        const fx = this.game.fx;
        if (!fx) return;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * 6.283, rad = Math.random() * spread;
            _v.set(c.x + Math.cos(a) * rad, c.y, c.z + Math.sin(a) * rad);
            fx.spark(_v, BLOOD[(Math.random() * BLOOD.length) | 0], size * (0.5 + Math.random()), _w.set((Math.random() - 0.5) * 1.2, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 1.2), 0.8 + Math.random() * 0.9);
        }
    }

    _abort(why) {
        const r = this.run, g = this.game;
        if (!r) return;
        if (r.body) { r.body.vit = 0; if (r.body.model) { r.body.model.scale.setScalar(r.scale0); r.body.model.position.set(r.from.x, r.y0, r.from.z); } }
        if (!r.remote) { this._lower(r); g.hud?.setVoice?.(`🩸 ${why}`, true); g.sync?.pentagram?.({ k: 'vit', op: 'abort', id: r.m.id, body: r.body?.id }); }
        this._end(r);
    }

    _lower(r) {
        const g = this.game, ch = g.character;
        if (!r.hold) return;
        ch.verticalVelocity = 0;
        if (g.impact) g.impact.gentleUntil = performance.now() + 3000; // (set down: no falling over)
    }

    _step(dt) {
        const r = this.run, g = this.game, m = r.m, fx = g.fx, ch = g.character;
        r.t += dt;
        const T = VITAL.RITUAL_S, t = r.t;
        const hero = this._heroPos(r);
        // the rite breaks while the blood is not yet taken in (my computer: I left, died, was lifted; the mark was put out)
        if (!r.remote && !r.absorbed) {
            const out = Math.hypot(ch.group.position.x - m.x, ch.group.position.z - m.z) > m.r * 1.05;
            if (g.combat?.dead || g.isDeadLocal) { this._abort('Обряд оборвался: вы погибли'); return; }
            if (out) { this._abort(VITAL_HINT.left); return; }
            if (g.levitation?.lifted || g.flight?.busy || g.monster?.active) { this._abort(VITAL_HINT.busy); return; }
        }
        if (!g.pentagranium?.marks.has(m.id) && !r.absorbed) { this._abort('Пентаграмма погасла — обряд оборвался'); return; }
        if (!r.goneBody && (!r.body || (!r.remote && !g.death?.bodies.has(r.body.id)))) { this._abort('Тело исчезло — обряд оборвался'); return; }
        const grow = ease(clamp01(t / 0.9)) * (t > T - 0.8 ? 1 - ease((t - (T - 0.8)) / 0.8) : 1);
        const spinK = clamp01((t - 0.4) / 3.8);
        m.unityHell = Math.min(1, 0.3 + grow * 0.45 + 0.25 * Math.sin(t * (4 + 9 * spinK)) * spinK);
        // 1) the hero rises and hangs (I hold my own body: no walking out of the circle; the others see my pose)
        if (r.hold) {
            const up = ease(clamp01(t / 1.4)) * (t > T - 1.2 ? 1 - ease((t - (T - 1.2)) / 1.2) : 1);
            const p = ch.group.position;
            p.x = r.hold.x; p.z = r.hold.z; p.y = r.hold.y0 + VITAL.LIFT_Y * up + Math.sin(t * 2.3) * 0.08 * up;
            ch.verticalVelocity = 0; ch.onGround = false; g.knockback?.set(0, 0, 0);
        }
        // 2) the body melts: it sinks and shrinks, the blood is torn from it (0 … 3 s)
        const u = clamp01(t / 3.2), b = r.body;
        if (b?.model && !r.goneBody) {
            const o = b.model, k = 1 - ease(u);
            o.scale.set(Math.max(0.02, r.scale0 * (0.2 + 0.8 * k)), Math.max(0.02, r.scale0 * (0.05 + 0.95 * k)), Math.max(0.02, r.scale0 * (0.2 + 0.8 * k)));
            o.position.set(r.from.x + (m.x - r.from.x) * ease(u) * 0.6, r.y0 + u * 0.2, r.from.z + (m.z - r.from.z) * ease(u) * 0.6);
            o.rotation.y += dt * (1 + 7 * u);
        }
        const at = _a.set(m.x, m.y + 0.3, m.z);
        if (u < 1 && fx && (r._f = (r._f || 0) - dt) <= 0) { r._f = 0.02; this._blood({ x: r.from.x, y: r.from.y + 0.3, z: r.from.z }, 3, 0.36, 1.1); }
        if (u >= 1 && !r.goneBody) { r.goneBody = true; this._melted(r); }
        // 3) the vortex of blood winds round the axis and flows into the hero (0.4 … 4.6 s)
        if (t < VITAL.ABSORB_T && fx) {
            r.ang += dt * (1.4 + 11 * spinK * spinK);
            if ((r._sp = (r._sp || 0) - dt) <= 0) {
                r._sp = 0.012;
                for (let i = 0; i < 3; i++) {
                    const a = r.ang + i * 2.094 + Math.random() * 0.3, rad = (R * 0.9 - R * 0.6 * spinK) * (0.4 + 0.6 * Math.random());
                    const hy = m.y + 0.3 + (VITAL.LIFT_Y + 1.4) * Math.random() * ease(clamp01(t / 1.4));
                    _v.set(m.x + Math.cos(a) * rad, hy, m.z + Math.sin(a) * rad);
                    const tw = 2 + 7 * spinK; // (tangential: the drops wind round the axis)
                    _w.set(-Math.sin(a) * tw, 0.8 + Math.random() * 2.2, Math.cos(a) * tw);
                    fx.spark(_v, BLOOD[(Math.random() * BLOOD.length) | 0], 0.14 + Math.random() * 0.14, _w, 0.7 + Math.random() * 0.6);
                }
            }
            // the streams of blood into the hero: drops fly from the vortex to the chest, and thin red threads join them
            if (hero && t > 1.2 && (r._in = (r._in || 0) - dt) <= 0) {
                r._in = 0.03 - 0.018 * spinK;
                const chest = _b.set(hero.x, hero.y - 0.6 + (r.hold ? 0 : 0), hero.z);
                const a = Math.random() * 6.283, rad = R * (0.3 + 0.6 * Math.random());
                _v.set(m.x + Math.cos(a) * rad, m.y + 0.4 + Math.random() * 1.2, m.z + Math.sin(a) * rad);
                _w.copy(chest).sub(_v).multiplyScalar(1.3).add(_a.set(-Math.sin(a) * 2, 1, Math.cos(a) * 2));
                fx.spark(_v, BLOOD[(Math.random() * BLOOD.length) | 0], 0.2 + 0.1 * Math.random(), _w, 0.75);
                if (Math.random() < 0.45) fx.straightBeam?.(_v, chest, 0.04 + 0.04 * spinK, Math.random() < 0.5 ? 0xd01030 : 0x8a0a12, 0.55, 0.14, null, THREE.AdditiveBlending);
            }
            // red mist rising round the ring
            if ((r._ms = (r._ms || 0) - dt) <= 0) {
                r._ms = 0.03;
                const a2 = Math.random() * 6.283, rad2 = R * (0.3 + 0.7 * Math.random());
                _v.set(m.x + Math.cos(a2) * rad2, m.y + 0.1, m.z + Math.sin(a2) * rad2);
                fx.spark(_v, BLOOD[(Math.random() * 3) | 0], 0.3 + 0.2 * spinK, _w.set(-Math.sin(a2) * 1.4, 1.5 + Math.random() * 3 * (0.5 + spinK), Math.cos(a2) * 1.4), 1.1);
            }
        }
        // the light: a blood column, two rune rings turning against each other
        r.col.material.opacity = 0.5 * grow; r.col.scale.y = (VITAL.LIFT_Y + 4) * clamp01(t / 0.7); r.col.rotation.y += dt * (0.8 + 3 * spinK);
        r.ring1.position.y = 0.3 + VITAL.LIFT_Y * 0.4 * clamp01(t / 1.4); r.ring2.position.y = 0.3 + VITAL.LIFT_Y * 0.9 * clamp01(t / 1.4);
        r.ring1.rotation.y += dt * (1.2 + 5 * spinK); r.ring2.rotation.y -= dt * (1.8 + 7 * spinK);
        r.ring1.material.opacity = 0.75 * grow; r.ring2.material.opacity = 0.6 * grow;
        if (fx && (r._lf = (r._lf || 0) - dt) <= 0) { r._lf = 0.1; fx.lightFlash?.(_v.set(m.x, m.y + 1.8, m.z), Math.random() < 0.5 ? 0xb0102a : 0x7a0814, (1.4 + 2.2 * spinK) * grow, 0.2, R * 4 + 8); }
        const me = ch.group.position, dist = Math.hypot(me.x - m.x, me.z - m.z);
        if (fx && dist < 45) fx.shake = Math.max(fx.shake || 0, (0.04 + 0.25 * spinK * spinK) * Math.max(0, 1 - dist / 45) * grow);
        if (t > 1.5 && t - dt <= 1.5) g.sound?.playMagic?.(r.grp.position, 0.7);
        // 4) the flash: the blood is taken in
        if (!r.absorbed && t >= VITAL.ABSORB_T) this._absorb();
        if (r.absorbed) {
            const f = (t - VITAL.ABSORB_T) / 1.4;
            r.flash.material.opacity = Math.max(0, 1 - f * 1.4) * 0.95; r.flash.scale.setScalar(R * (2 + 3 * f)); r.flash.position.y = 0.1;
        }
        if (t >= T) this._finish();
    }

    /** The body is melted: only blood is left of it, and a puff of it as the model goes. */
    _melted(r) {
        const g = this.game, m = r.m;
        this._blood({ x: m.x, y: m.y + 0.3, z: m.z }, 30, 0.5, 1.3);
        if (r.body && g.death?.bodies.has(r.body.id)) g.death.removeBody(r.body.id, false);
    }

    /** The blood is taken in: the maximum health grows (the hero's computer only), +10 black, a flash and a heartbeat of light. */
    _absorb() {
        const r = this.run, g = this.game, m = r.m, fx = g.fx;
        r.absorbed = true;
        const hero = this._heroPos(r) || _w.set(m.x, m.y + 2, m.z);
        if (fx) {
            _a.set(hero.x, hero.y - 0.4, hero.z);
            for (let i = 0; i < 120; i++) {
                const a = Math.random() * 6.283, up = (Math.random() - 0.3) * 6, sp = 2.5 + Math.random() * 7;
                fx.spark(_a, i % 3 === 0 ? 0xffffff : BLOOD[(Math.random() * BLOOD.length) | 0], 0.14 + Math.random() * 0.14, _w.set(Math.cos(a) * sp, up, Math.sin(a) * sp), 0.9 + Math.random() * 0.8);
            }
            fx.lightFlash?.(_a, 0xff2a3a, 7, 0.7, R * 6 + 14);
        }
        g.sound?.playMagic?.(r.grp.position, 1);
        g.sound?.playSpellFxAt?.('fxPentagram', _v.set(m.x, m.y, m.z), 1, 0.7, 22);
        if (r.remote) return;
        const total = this.apply(r.gain);
        g.hud?.setVoice?.(VITAL_HINT.done(r.gain, total), true);
    }

    /** `gain` HP of maximum health to the hero (the «cells of health»: bonus.hp — saved, Legacy), +10 black. @returns {number} the new maximum */
    apply(gain) {
        const g = this.game;
        const B = g.bonus || (g.bonus = { hp: 0, fatigue: 0 });
        const was = g.combat?.enabled ? (g.combat.maxHp || g.maxHP) : g.maxHP;
        const n = Math.max(0, grownMax(was, gain) - was);
        B.hp = (B.hp || 0) + n;
        if (g.combat?.enabled) { g.combat.addMaxHp(n); g.maxHP = g.combat.maxHp; g.playerHP = g.combat.hp; }
        else { g.maxHP += n; g.playerHP += n; g.hud?.update?.(g.playerHP, g.maxHP, g.killCount, g.punchCount); }
        addDark(g.dark || g, VITAL.DARK, 'ritual');
        g.perf?.note?.(`🩸 Чудовищная живучесть: максимум здоровья +${n}`);
        return g.maxHP;
    }

    _finish() {
        const r = this.run;
        if (!r) return;
        this._lower(r);
        r.m.life = Math.min(r.m.life, 8); // (the pentagram burns on a little and goes out)
        this._end(r);
    }

    _end(r) {
        const g = this.game;
        this.run = null;
        g.scene.remove(r.grp);
        for (const o of [r.col, r.ring1, r.ring2, r.flash]) o.material.dispose();
        r.m.unityHell = 0;
    }

    // ------------------------------------------------------------ network
    /** Another computer's rite ('pgm' k 'vit'): shown here; the body goes at the same moment. */
    onNet(by, msg) {
        const g = this.game;
        const mark = g.pentagranium?.marks.get(msg.id);
        if (msg.op === 'abort') { if (this.run?.remote && this.run.m.id === msg.id) this._abort(''); return; }
        if (msg.op !== 'start' || this.run || !mark || mark.pent !== 'vitality') return;
        const body = g.death?.bodies.get(msg.body) || null;
        if (!body || body.vit) return;
        this._start(mark, body, { pos: null });
        this.run.who = by;
    }
}
