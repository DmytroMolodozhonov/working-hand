/**
 * WandMagic.js — what a wand in the hand does.
 *
 *  - Spells are stronger (see ItemTypes: +15% always, +25% in the wand's
 *    direction, +40% for its favourite spell, + the wand's own power).
 *  - «Раскрой свои секреты» (Reveal your secrets): point the wand at a thing
 *    (or hold a thing in the other hand, or just look at the wand) — a
 *    glowing hologram tells what it is and its powers.
 *  - «Люмос»: a small steady light at the tip (costs a little strength over
 *    time). «Люмос Максима»: brighter — say it again for even more light.
 *    A sharp flick of the wand throws the light far ahead; it fades there.
 *    «Нокс» puts it out.
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
        this.light = null; // {level, point, mesh}
        this.thrown = []; // flying lights
        this.drawing = null; // {until, lines: [], last}
        this.holo = null; // {mesh, until, target}
        // The lights exist from the start (intensity 0): adding a light later
        // would make every material recompile — a freeze in the middle of play
        this.lights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xfff6d8, 0, 14, 2); game.scene.add(l); return l; });
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
        if (name === 'Reveal') { this.reveal(); return name; }
        return null;
    }

    // --------------------------------------------------------------- Lumos
    _lumos(max) {
        const g = this.game;
        if (!this.light) {
            const point = this.lights[0];
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            const halo = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff6c2, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
            mesh.add(halo);
            g.scene.add(mesh);
            this.light = { level: 0, point, mesh, halo };
        }
        this.light.level = max ? Math.min(5, Math.max(2, this.light.level + 1)) : Math.max(1, this.light.level);
        const L = this.light.level;
        this.light.point.intensity = 0.8 + L * 0.9;
        this.light.point.distance = 10 + L * 6;
        this.light.halo.scale.setScalar(1 + L * 0.4);
        g.hud.setVoice(max ? `💡 Люмос Максима — свет ×${L} (скажите ещё раз — ярче; «Нокс» — погасить)` : '💡 Люмос — на кончике палочки свет («Нокс» — погасить)', true);
    }

    _nox() {
        const l = this.light;
        if (!l) return;
        l.point.intensity = 0;
        this.game.scene.remove(l.mesh);
        l.mesh.geometry.dispose(); l.mesh.material.dispose(); l.halo.geometry.dispose(); l.halo.material.dispose();
        this.light = null;
        this.game.hud.setVoice('🌑 Нокс — свет погас', true);
    }

    _throwLight(dir) {
        const g = this.game;
        const l = this.light;
        const p = l.mesh.position.clone();
        const point = this.lights.slice(1).find((x) => !this.thrown.some((t) => t.point === x));
        if (!point) return;
        point.intensity = l.point.intensity * 1.5;
        point.distance = l.point.distance + 8;
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        point.position.copy(p); mesh.position.copy(p);
        g.scene.add(mesh);
        this.thrown.push({ point, mesh, vel: dir.clone().multiplyScalar(22), life: 5, max: 5 });
        g.hud.setVoice('💫 Свет брошен вперёд', true);
    }

    // ------------------------------------------------------------- Reveal
    /** «Раскрой свои секреты»: a hologram about what the wand points at. */
    reveal() {
        const g = this.game;
        const tip = this.tip(new THREE.Vector3(), _v2);
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
        // the thing in the other hand, else the wand itself
        if (!target) {
            const wSide = g.items.heldOf('wand').side;
            const other = g.items.held[wSide === 'right' ? 'left' : 'right'];
            const ow = g.weapons.hands[wSide === 'right' ? 'left' : 'right'].held;
            if (other) { target = other.item; at = other.model.position.clone(); }
            else if (ow) { target = { kind: 'weapon', type: ow.type, magic: ow.magic, bonus: ow.bonus }; at = ow.position.clone(); }
            else { target = this.wand; at = tip.clone(); }
        }
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
        // Lumos at the tip (a little strength over time); a flick throws it
        if (this.light) {
            const tip = this.tip(new THREE.Vector3(), _v2);
            this.light.mesh.position.copy(tip);
            this.light.point.position.copy(tip);
            if (g.combat.enabled) g.combat.fatigue = Math.max(0, g.combat.fatigue - dt * 0.08 * this.light.level);
            const side = g.items.heldOf('wand').side;
            const v = g.character.handVelocity[side];
            if (v.length() > 7 && performance.now() - (this._flickAt || 0) > 900) { this._flickAt = performance.now(); this._throwLight(v.clone().normalize()); }
        }
        for (let i = this.thrown.length - 1; i >= 0; i--) {
            const t = this.thrown[i];
            t.life -= dt;
            t.vel.multiplyScalar(Math.max(0, 1 - 1.2 * dt));
            t.mesh.position.addScaledVector(t.vel, dt);
            t.point.position.copy(t.mesh.position);
            const k = Math.max(0, t.life / t.max);
            t.point.intensity *= Math.pow(0.6, dt);
            t.mesh.scale.setScalar(0.4 + k * 0.6);
            if (t.life <= 0) { t.point.intensity = 0; g.scene.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose(); this.thrown.splice(i, 1); }
        }
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
        for (const t of this.thrown) this.game.scene.remove(t.mesh);
        for (const l of this.lights) this.game.scene.remove(l);
        if (this.drawing) for (const s of this.drawing.lines) this.game.scene.remove(s.mesh);
    }
}
