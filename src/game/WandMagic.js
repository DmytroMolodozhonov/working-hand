/**
 * WandMagic.js — what a wand in the hand does.
 *
 *  - Spells are stronger (see ItemTypes: +15% always, +25% in the wand's
 *    direction, +40% for its favourite spell, + the wand's own power).
 *  - «Раскрой свои секреты» (Reveal your secrets): point the wand at a thing
 *    (or hold a thing in the other hand, or just look at the wand) — a
 *    glowing hologram tells what it is and its powers.
 *  - «Люмос»: the wand's tip shines — a real light that lights up everything
 *    around (no glass ball: a glow at the tip), costs a little strength over
 *    time. «Люмос Максима»: brighter — say it again for even more light.
 *    A sharp flick of the wand throws the light: it flies until it meets a wall
 *    or the ground and stays there, lighting the place, then fades.
 *    «Нокс» puts it out. Everybody sees (and is lit by) everybody's Lumos.
 *  - «Латин Вратин» (drawing): the tip leaves glowing lines in the air while
 *    you move the wand; they fade in about 10 seconds.
 *
 * About holding a real pen as a wand: the camera recognises hands, not
 * objects — the wand follows the direction of your hand / index finger,
 * so a pen held in the hand works just the same.
 */

import * as THREE from 'three';
import { WAND_DIRS, baseSpell, describeItem } from './ItemTypes.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export const LUMOS = {
    THROW_SPEED: 18, // m/s
    THROW_RANGE: 40, // m: then it stops in the air and hangs there
    STAY: 20, // s it shines where it landed (the last 4 s fading)
};

let _glowTex = null;
/** A soft glow (a light seen by the eye: bright in the middle, fading out — not a ball). */
function glowTexture() {
    if (_glowTex) return _glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.12, 'rgba(255,252,235,0.95)');
    gr.addColorStop(0.35, 'rgba(255,240,190,0.38)');
    gr.addColorStop(0.7, 'rgba(255,225,150,0.08)');
    gr.addColorStop(1, 'rgba(255,220,140,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    _glowTex = new THREE.CanvasTexture(c);
    return _glowTex;
}

export function makeGlow(size) {
    const m = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff4d6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(m);
    s.scale.setScalar(size);
    s.renderOrder = 5;
    return s;
}

/** How big the tip's glow is for a Lumos level (1 Люмос … 5 Максима again and again). */
const glowSize = (level) => 0.22 + level * 0.1;
/** The light's strength and reach for a level. */
const lightOf = (level) => ({ intensity: 0.8 + level * 0.9, distance: 10 + level * 6 });

/** How much stronger a spell is with this wand (1 = no wand). */
export function wandPower(wand, spell) {
    if (!wand) return 1;
    let m = 1.15;
    const b = baseSpell(spell);
    if (wand.dir && (WAND_DIRS[wand.dir]?.spells.includes(spell) || WAND_DIRS[wand.dir]?.spells.includes(b))) m *= 1.25;
    if (wand.fav && (wand.fav === b || wand.fav === spell)) m *= 1.4;
    m *= 1 + (wand.power || 0) / 100;
    return m;
}

export class WandMagic {
    constructor(game) {
        this.game = game;
        this.light = null; // {level, glow}: my wand's tip shines
        this.thrown = []; // thrown lights (mine and others'): {glow, pos, vel, flown, stuck, life, level, mine}
        this.remote = new Map(); // playerId -> glow at their wand's tip
        this.drawing = null; // {until, lines: [], last}
        this.holo = null; // {mesh, until, target}
        // The lights exist from the start (intensity 0): adding a light later
        // would make every material recompile — a freeze in the middle of play
        // (two only: every light costs on every pixel, even switched off — the two
        // brightest / nearest Lumos lights of all players get them)
        this.lights = [new THREE.PointLight(0xfff6d8, 0, 14, 2), new THREE.PointLight(0xfff6d8, 0, 14, 2)];
        for (const l of this.lights) game.scene.add(l);
    }

    get wand() { return this.game.items?.wand || null; }

    /** The wand's tip in the world (and the direction it points). */
    tip(out = new THREE.Vector3(), dir = null) {
        const w = this.game.items?.heldOf('wand');
        if (!w) return null;
        const m = w.model;
        m.updateMatrixWorld(true);
        out.set(0, m.userData?.tipY || 0.65, 0).applyMatrix4(m.matrixWorld);
        if (dir) dir.set(0, 1, 0).applyQuaternion(m.getWorldQuaternion(_q)).normalize();
        return out;
    }

    power(spell) { return wandPower(this.wand, spell); }

    /** Voice: «Люмос», «Люмос Максима», «Нокс», «Латин Вратин», «Раскрой свои секреты». Returns a hint or the name. */
    cast(name, isFinal) {
        const g = this.game;
        if (name === 'Reveal') { this.reveal(); return name; } // (a wand, or a bare hand)
        if (!this.wand) { if (isFinal) g.hud.setVoice('🪄 Это заклинание работает только с волшебной палочкой в руке', true); return null; }
        if (name === 'Lumos' || name === 'LumosMaxima') {
            if (!isFinal && name === 'Lumos') return null; // (wait for «Максима»)
            const tired = g.combat.check(name);
            if (tired) { g.hud.setVoice(tired, true); return null; }
            g.combat.pay(name);
            this._lumos(name === 'LumosMaxima');
            return name;
        }
        if (name === 'Nox') { this._nox(); return name; }
        if (name === 'Draw') {
            this.drawing = { until: performance.now() + 12000, lines: [], last: null, color: new THREE.Color(this.wand.color ?? 0xffffff).lerp(new THREE.Color(0xffffff), 0.3) };
            g.hud.setVoice('✨ Рисуйте палочкой в воздухе (12 секунд)', true);
            return name;
        }
        return null;
    }

    // --------------------------------------------------------------- Lumos
    _lumos(max) {
        const g = this.game;
        if (!this.light) {
            const glow = makeGlow(glowSize(1));
            g.scene.add(glow);
            this.light = { level: 0, glow };
        }
        this.light.level = max ? Math.min(5, Math.max(2, this.light.level + 1)) : Math.max(1, this.light.level);
        const L = this.light.level;
        g.hud.setVoice(max ? `💡 Люмос Максима — свет ×${L} (скажите ещё раз — ярче; «Нокс» — погасить)` : '💡 Люмос — кончик палочки светится («Нокс» — погасить; резкий взмах палочкой — бросить свет)', true);
    }

    _nox() {
        const l = this.light;
        if (!l) return;
        this.game.scene.remove(l.glow);
        l.glow.material.dispose();
        this.light = null;
        this.game.hud.setVoice('🌑 Нокс — свет погас', true);
    }

    /** A flick of the wand: the light leaves the tip and flies (the others are told). */
    _throwLight(dir) {
        const g = this.game;
        const l = this.light;
        if (this.thrown.some((t) => t.mine)) return; // (one at a time; the tip shines again when it fades)
        const p = this.tip(new THREE.Vector3());
        if (!p) return;
        this.addThrown(p, dir.clone().multiplyScalar(LUMOS.THROW_SPEED), Math.max(2, l.level + 1), true);
        g.sync?.lumosThrow?.(p, dir, Math.max(2, l.level + 1));
        g.hud.setVoice('💫 Свет брошен — он останется там, куда долетит', true);
    }

    /** A thrown light (mine or another player's). */
    addThrown(pos, vel, level, mine = false) {
        const glow = makeGlow(glowSize(level) * 1.3);
        glow.position.copy(pos);
        this.game.scene.add(glow);
        this.thrown.push({ glow, pos: pos.clone(), vel: vel.clone(), flown: 0, stuck: false, life: LUMOS.STAY, level, mine });
    }

    /** It flies straight until a wall / the ground stops it, then stays and shines. */
    _flyThrown(t, dt) {
        const col = this.game.collision;
        if (!t.stuck) {
            const step = t.vel.length() * dt;
            const n = Math.max(1, Math.ceil(step / 0.25));
            for (let i = 0; i < n; i++) {
                _v.copy(t.pos).addScaledVector(t.vel, dt / n);
                if (col?.pointBlocked(_v.x, _v.y, _v.z)) { t.stuck = true; break; } // (stays just before the surface)
                t.pos.copy(_v);
                t.flown += step / n;
                if (t.flown > LUMOS.THROW_RANGE) { t.stuck = true; break; }
            }
        } else t.life -= dt;
        t.glow.position.copy(t.pos);
        const k = Math.min(1, t.life / 4); // (fading in the last seconds)
        t.glow.scale.setScalar(glowSize(t.level) * 1.3 * (0.4 + 0.6 * k) * (1 + Math.sin(this._flick * 1.7 + t.flown) * 0.05));
        t.glow.material.opacity = k;
        return t.life > 0;
    }

    /** Another player's Lumos (their pose message says how bright): a glow at their wand's tip. */
    _updateRemote() {
        const g = this.game;
        const seen = new Set();
        for (const [id, r] of g.remotes || []) {
            const level = r.target?.lm || 0;
            const wand = g.items?.remoteHeld.get(id);
            const model = wand?.right?.item.kind === 'wand' ? wand.right.model : wand?.left?.item.kind === 'wand' ? wand.left.model : null;
            if (!level || !model) continue;
            seen.add(id);
            let e = this.remote.get(id);
            if (!e) { e = { glow: makeGlow(glowSize(level)), level }; g.scene.add(e.glow); this.remote.set(id, e); }
            e.level = level;
            model.updateMatrixWorld(true);
            e.glow.position.set(0, model.userData?.tipY || 0.65, 0).applyMatrix4(model.matrixWorld);
            e.glow.scale.setScalar(glowSize(level) * (1 + Math.sin(this._flick * 2.3 + id.length) * 0.05));
        }
        for (const [id, e] of this.remote) if (!seen.has(id)) { g.scene.remove(e.glow); e.glow.material.dispose(); this.remote.delete(id); }
    }

    /** The two lights go to the two nearest shining things (my tip, thrown lights, others' tips). */
    _placeLights() {
        const cam = this.game.camera?.position;
        const src = [];
        if (this.light && !this.thrown.some((t) => t.mine)) src.push({ p: this.light.glow.position, level: this.light.level });
        for (const t of this.thrown) src.push({ p: t.pos, level: t.level * Math.min(1, t.life / 4) });
        for (const e of this.remote.values()) src.push({ p: e.glow.position, level: e.level });
        if (cam) src.sort((a, b) => a.p.distanceToSquared(cam) - b.p.distanceToSquared(cam));
        this.lights.forEach((light, i) => {
            const s = src[i];
            if (!s || s.level <= 0) { light.intensity = 0; return; }
            const lo = lightOf(s.level);
            light.position.copy(s.p);
            light.intensity = lo.intensity * (1 + Math.sin(this._flick * 3.1 + i) * 0.04);
            light.distance = lo.distance;
        });
    }

    // ------------------------------------------------------------- Reveal
    /** «Раскрой свои секреты»: a hologram about what the wand (or the bare hand) points at. */
    reveal() {
        const g = this.game;
        let tip = this.tip(new THREE.Vector3(), _v2);
        let side = this.wand ? g.items.heldOf('wand').side : null;
        if (!tip) {
            // no wand: the hand that points (the raised one, else the spell hand)
            const ch = g.character;
            side = ['right', 'left'].find((s) => ch.isArmRaised(s) && !g.items.held[s]) || g.magicHand || g.lastMagicHand || 'right';
            tip = ch.getHandWorldPosition(side, new THREE.Vector3());
            ch.getHandDirection(side, _v2);
        }
        const dir = _v2.clone();
        let target = null, at = null;
        // a thing lying / hovering where the wand points
        let best = 0.25;
        for (const L of g.items.loose.values()) {
            const to = _v.subVectors(L.model.position, tip);
            const d = to.length();
            if (d > 10) continue;
            const ang = dir.angleTo(to.normalize());
            if (ang < best) { best = ang; target = L.item; at = L.model.position.clone(); }
        }
        for (const w of g.weapons.weapons) {
            const to = _v.subVectors(w.position, tip);
            const d = to.length();
            if (d > 10) continue;
            const ang = dir.angleTo(to.normalize());
            if (ang < best) { best = ang; target = { kind: 'weapon', type: w.type, magic: w.magic, bonus: w.bonus }; at = w.position.clone(); }
        }
        // the thing in the other hand (or in this bare hand), else the wand itself
        if (!target) {
            for (const s of [side === 'right' ? 'left' : 'right', side]) {
                const it = g.items.held[s], w = g.weapons.hands[s].held;
                if (it && it.item.kind !== 'wand') { target = it.item; at = it.model.position.clone(); break; }
                if (w) { target = { kind: 'weapon', type: w.type, magic: w.magic, bonus: w.bonus }; at = w.position.clone(); break; }
            }
            if (!target && this.wand) { target = this.wand; at = tip.clone(); }
        }
        if (!target) { g.hud.setVoice('🔮 Укажите рукой на предмет (или возьмите его) и скажите «Раскрой свои секреты»', true); return; }
        this._showHologram(describeItem(target), at);
    }

    _showHologram(info, at) {
        const g = this.game;
        this._closeHolo();
        const c = document.createElement('canvas');
        c.width = 512; c.height = 300;
        const x = c.getContext('2d');
        const col = '#' + ((info.color ?? 0x9fd8ff) >>> 0).toString(16).padStart(6, '0');
        x.fillStyle = 'rgba(10, 40, 70, 0.55)';
        x.fillRect(0, 0, 512, 300);
        x.strokeStyle = '#7fe3ff'; x.lineWidth = 4; x.strokeRect(6, 6, 500, 288);
        x.strokeStyle = col; x.lineWidth = 2; x.strokeRect(14, 14, 484, 272);
        for (let y = 0; y < 300; y += 4) { x.fillStyle = 'rgba(127, 227, 255, 0.06)'; x.fillRect(0, y, 512, 1); }
        x.fillStyle = '#dff8ff'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center';
        x.fillText(info.title.replace(/<[^>]+>/g, ''), 256, 56);
        x.font = '21px sans-serif'; x.textAlign = 'left';
        let y = 100;
        for (const line of info.lines) {
            const parts = line.split(/(<b>.*?<\/b>)/);
            let px = 34;
            for (const part of parts) {
                const bold = part.startsWith('<b>');
                const txt = part.replace(/<\/?b>/g, '');
                x.font = (bold ? 'bold ' : '') + '21px sans-serif';
                x.fillStyle = bold ? '#ffe066' : '#cfefff';
                // wrap long lines
                for (const word of txt.split(/(\s+)/)) {
                    const w = x.measureText(word).width;
                    if (px + w > 478) { y += 28; px = 34; if (!word.trim()) continue; }
                    x.fillText(word, px, y);
                    px += w;
                }
            }
            y += 36;
        }
        const tex = new THREE.CanvasTexture(c);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        mesh.position.copy(at).add(_v.set(0, 1.1, 0));
        g.scene.add(mesh);
        this.holo = { mesh, until: performance.now() + 9000, t: 0, at: at.clone() };
        for (let i = 0; i < 20; i++) g.fx.spark(at, 0x7fe3ff, 0.06, _v2.set((Math.random() - 0.5), 1 + Math.random() * 1.5, (Math.random() - 0.5)), 0.8);
        g.hud.setVoice('🔮 Раскрой свои секреты…', true);
    }

    _closeHolo() {
        const h = this.holo;
        if (!h) return;
        this.game.scene.remove(h.mesh);
        h.mesh.material.map.dispose(); h.mesh.material.dispose(); h.mesh.geometry.dispose();
        this.holo = null;
    }

    // -------------------------------------------------------------- frame
    update(dt) {
        const g = this.game;
        const hasWand = !!this.wand;
        if (this.light && !hasWand) this._nox();
        this._flick = (this._flick || 0) + dt;
        // Lumos at the tip (a little strength over time); a flick throws it
        if (this.light) {
            const tip = this.tip(new THREE.Vector3(), _v2);
            const away = this.thrown.some((t) => t.mine); // (the light is flying: the tip only glimmers)
            this.light.glow.position.copy(tip);
            this.light.glow.scale.setScalar(glowSize(this.light.level) * (away ? 0.35 : 1) * (1 + Math.sin(this._flick * 2.3) * 0.05));
            if (g.combat.enabled) g.combat.fatigue = Math.max(0, g.combat.fatigue - dt * 0.08 * this.light.level);
            const side = g.items.heldOf('wand').side;
            const v = g.character.handVelocity[side];
            if (v.length() > 7 && performance.now() - (this._flickAt || 0) > 900) { this._flickAt = performance.now(); this._throwLight(v.clone().normalize()); }
        }
        for (let i = this.thrown.length - 1; i >= 0; i--) {
            const t = this.thrown[i];
            if (this._flyThrown(t, dt)) continue;
            g.scene.remove(t.glow); t.glow.material.dispose();
            this.thrown.splice(i, 1);
        }
        this._updateRemote();
        this._placeLights();
        // drawing in the air
        const d = this.drawing;
        if (d) {
            const now = performance.now();
            if (now < d.until && hasWand) {
                const tip = this.tip(new THREE.Vector3());
                if (!d.last || d.last.distanceTo(tip) > 0.04) {
                    if (d.last && d.last.distanceTo(tip) < 0.8) this._stroke(d, d.last, tip);
                    d.last = tip.clone();
                }
            }
            for (let i = d.lines.length - 1; i >= 0; i--) {
                const s = d.lines[i];
                const age = (now - s.born) / 1000;
                s.mesh.material.opacity = Math.max(0, 1 - age / 10);
                if (age > 10) { g.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); d.lines.splice(i, 1); }
            }
            if (now > d.until && !d.lines.length) this.drawing = null;
        }
        // hologram: faces the camera, fades in and out
        const h = this.holo;
        if (h) {
            h.t += dt;
            const left = (h.until - performance.now()) / 1000;
            h.mesh.material.opacity = Math.min(1, h.t * 3) * Math.min(1, Math.max(0, left));
            h.mesh.position.y = h.at.y + 1.1 + Math.sin(h.t * 2) * 0.05;
            h.mesh.quaternion.copy(g.camera.getWorldQuaternion(_q));
            if (left <= 0) this._closeHolo();
        }
    }

    _stroke(d, a, b) {
        const len = a.distanceTo(b);
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 5), new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(_v.set(0, 1, 0), _v2.subVectors(b, a).normalize());
        this.game.scene.add(mesh);
        d.lines.push({ mesh, born: performance.now() });
        if (d.lines.length > 600) { const s = d.lines.shift(); this.game.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
    }

    dispose() {
        this._nox?.();
        this._closeHolo();
        for (const t of this.thrown) this.game.scene.remove(t.glow);
        for (const e of this.remote.values()) this.game.scene.remove(e.glow);
        for (const l of this.lights) this.game.scene.remove(l);
        if (this.drawing) for (const s of this.drawing.lines) this.game.scene.remove(s.mesh);
    }
}
