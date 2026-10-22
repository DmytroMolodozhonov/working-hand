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
 *    Thrown like a thing (HandRelease.LumosThrow: a wind-up by the head or behind the
 *    shoulder, a fast swing forward): at the swing's end the light leaves the tip (the tip goes
 *    dark) and flies the way the hand went, as hard — slowly enough to watch it go: it
 *    slows down by itself, bounces softly off walls, the ground and the cave's
 *    ceiling, then hangs in the air where it stopped — and fades out about 15 s
 *    after the throw. «Нокс» or «стоп» puts out all of it (the tip
 *    and the thrown light). Everybody sees (and is lit by) everybody's Lumos.
 *  - «Lightning Writing» (drawing): the tip leaves glowing lines in the air while
 *    you move the wand; they fade in about 10 seconds.
 *
 * About holding a real pen as a wand: the camera recognises hands, not
 * objects — the wand follows the direction of your hand / index finger,
 * so a pen held in the hand works just the same.
 */

import * as THREE from 'three';
import { WAND_DIRS, baseSpell, describeItem } from './ItemTypes.js';
import { FIRE_SPELLS, DRAGON_WAND_FIRE } from './DragonKinds.js';
import { LumosThrow, poseBehind } from './HandRelease.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _v4 = new THREE.Vector3();

export const LUMOS = {
    LOSS_GRACE: 1.5, // s: the wand must stay gone this long before Lumos goes out (a tracking blink is not «put away»)
    THROW_SPEED: 10, // m/s at the start (it is seen flying: not a jump onto the wall)
    DRAG: 0.6, // per second: it slows down by itself and stops in the air (~15 m on open ground, in ~5 s)
    STOP: 0.5, // m/s: slower than this — it hangs where it is
    BOUNCE: 0.3, // how much of its speed INTO a wall a bounce keeps (along the wall it glides on)
    BOUNCES: 5, // then it stays where it is
    THROW_RANGE: 40, // m: then it stops in the air
    LIFE: 15, // s from the throw: then it is gone (time to see where it went — down a cave tunnel)
    FADE: 3, // s of fading out at the end
    AGAIN: 1500, // ms: the same word heard again (the speech's final result) is not a second cast
    STILL: 1200, // ms standing still before a throw counts (walking swings the arms: never a throw)
    OTHER_MS: 1500, // ms after another spell was cast (its gesture is no throw)
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

/** Lumos and a wand out of the hand: how long it has been gone (s) and whether the light must go out now. */
export function lumosGone(t, hasWand, dt) {
    if (hasWand) return { t: 0, out: false };
    t += dt;
    return t > LUMOS.LOSS_GRACE ? { t: 0, out: true } : { t, out: false };
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
    // the dragon's wand: every fire spell 60% stronger (DragonKinds.FIRE_SPELLS; its mana the same)
    if (wand.dragon && (FIRE_SPELLS.has(spell) || FIRE_SPELLS.has(b))) m *= DRAGON_WAND_FIRE;
    return m;
}

export class WandMagic {
    constructor(game) {
        this.game = game;
        this.light = null; // {level, glow}: my wand's tip shines
        this.thrown = []; // thrown lights (mine and others'): {glow, pos, vel, flown, stuck, life, level, mine}
        this.remote = new Map(); // playerId -> glow at their wand's tip
        this.drawing = null; // {until, lines: [], last}
        this.remoteDrawings = new Map(); // playerId -> {color, lines: [], last}: other players' drawings
        this._drawOut = null; // my drawing's new points, sent to the others a few times a second
        this.holo = null; // {mesh, until, target}
        // The lights exist from the start (intensity 0): adding a light later
        // would make every material recompile — a freeze in the middle of play
        // (two only: every light costs on every pixel, even switched off — the two
        // brightest / nearest Lumos lights of all players get them)
        this.lights = [new THREE.PointLight(0xfff6d8, 0, 14, 2), new THREE.PointLight(0xfff6d8, 0, 14, 2)];
        for (const l of this.lights) game.scene.add(l);
    }

    get wand() { return this.game.items?.wand || null; }

    /** Creative: the wand spells work with a bare hand too (at the fingertips). */
    _bare() {
        return !this.wand && this.game.config?.mode === 'creative';
    }

    /** The bare hand casting (creative, no wand): the one the spell was cast with. */
    _bareSide() {
        const g = this.game, ch = g.character;
        return this._bareHand || [g.dom || 'right', g.off || 'left'].find((s) => ch.isArmRaised?.(s) && !g.items?.held[s]) || g.magicHand || g.lastMagicHand || g.dom || 'right';
    }

    /** The wand's tip in the world (and the direction it points); creative without a wand: the fingertips. */
    tip(out = new THREE.Vector3(), dir = null) {
        const w = this.game.items?.heldOf('wand');
        if (!w) {
            if (!this._bare()) return null;
            const ch = this.game.character, side = this._bareSide();
            const d = ch.getHandDirection(side, dir || _v3);
            return ch.getHandWorldPosition(side, out).addScaledVector(d, 0.35);
        }
        const m = w.model;
        m.updateMatrixWorld(true);
        out.set(0, m.userData?.tipY || 0.65, 0).applyMatrix4(m.matrixWorld);
        if (dir) dir.set(0, 1, 0).applyQuaternion(m.getWorldQuaternion(_q)).normalize();
        return out;
    }

    power(spell) { return wandPower(this.wand, spell); }

    /** Voice: «Люмос», «Люмос Максима», «Нокс», «Lightning Writing», «Раскрой свои секреты». Returns a hint or the name. */
    cast(name, isFinal) {
        const g = this.game;
        if (name === 'Reveal') {
            // (the words heard early and then again as the final result: one hologram — the
            // running book has run off by the final words)
            if (performance.now() - (this._revealedAt || -1e9) < 3000) return null;
            if (!this.reveal()) return null; // (its hint stays on the screen)
            this._revealedAt = performance.now();
            return name;
        } // (a wand, or a bare hand)
        if (!this.wand && !this._bare()) { if (isFinal) g.hud.setVoice('🪄 Это заклинание работает только с волшебной палочкой в руке', true); return null; }
        if (!this.wand) this._bareHand = [g.dom || 'right', g.off || 'left'].find((s) => g.character.isArmRaised?.(s) && !g.items?.held[s]) || g.magicHand || g.lastMagicHand || g.dom || 'right';
        if (name === 'Lumos' || name === 'LumosMaxima') {
            // (lit at once — «Максима» said right after only makes it brighter; the same word
            // heard again as the speech's final result is not a second cast)
            const now = performance.now();
            if (name === 'Lumos' && this.light) return null;
            if (now - (this._said?.[name] || -1e9) < LUMOS.AGAIN) return null;
            (this._said || (this._said = {}))[name] = now;
            const tired = g.combat.check(name);
            if (tired) { g.hud.setVoice(tired, true); return null; }
            g.combat.pay(name);
            this._lumos(name === 'LumosMaxima');
            return name;
        }
        if (name === 'Nox') { this._nox(); return name; }
        if (name === 'Draw') {
            this.drawing = { until: performance.now() + 12000, lines: this.drawing?.lines || [], last: null, color: new THREE.Color(this.wand?.color ?? 0xffffff).lerp(new THREE.Color(0xffffff), 0.3) };
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

    /** «Нокс» / «стоп»: all my Lumos goes out — the tip and the thrown light. True if something did. */
    _nox(say = true) {
        const l = this.light;
        if (l) { this.game.scene.remove(l.glow); l.glow.material.dispose(); this.light = null; }
        const mine = this.thrown.filter((t) => t.mine);
        for (const t of mine) { this.game.scene.remove(t.glow); t.glow.material.dispose(); }
        if (mine.length) { this.thrown = this.thrown.filter((t) => !t.mine); this.game.sync?.lumosOut?.(); }
        if (!l && !mine.length) return false;
        if (say) this.game.hud.setVoice('🌑 Нокс — свет погас', true);
        return true;
    }

    /** Another player put out their thrown light. */
    outBy(by) {
        for (const t of this.thrown) if (t.by === by) t.age = LUMOS.LIFE;
    }

    /** A flick of the wand: the light leaves the tip and flies (the others are told). */
    _throwLight(dir, k = 1) {
        const g = this.game;
        const l = this.light;
        const p = this.tip(new THREE.Vector3());
        if (!l || !p) return;
        // (the tip in the rock — the hand at a cave wall: the light starts from the hand's side of it)
        const head = g.character?.group?.position;
        for (let i = 0; i < 6 && head && g.collision?.pointBlocked(p.x, p.y, p.z); i++) p.lerp(head, 0.3);
        this.addThrown(p, dir.clone().multiplyScalar(LUMOS.THROW_SPEED * k), Math.max(2, l.level + 1), true);
        g.sync?.lumosThrow?.(p, dir, Math.max(2, l.level + 1));
        // the light has left the wand: its tip is dark (say «Люмос» to light it again)
        g.scene.remove(l.glow); l.glow.material.dispose(); this.light = null;
        this._thrownAt = performance.now();
        g.hud.setVoice('💫 Свет брошен — летит и гаснет; «Люмос» — зажечь палочку снова', true);
    }

    /**
     * Where a thrown light goes: where the wand points at the swing's end (the hand aims with it; the camera
     * can't see how far forward the arm went), turned a little towards the swing's own sideways way; a wand
     * pointing down at the end: where the eyes look. A little up (one throws a bit above where one looks).
     */
    _throwDir(swing, out) {
        const ch = this.game.character;
        ch.group.getWorldQuaternion(_q);
        const aim = this.tip(_v3, out) ? out : out.set(0, 0, -1).applyQuaternion(_q);
        if (aim.y < -0.45) aim.set(0, 0, -1).applyQuaternion(ch.getHeadQuaternion ? ch.getHeadQuaternion(_q2) : _q);
        const side = _v4.set(swing.x, 0, 0).applyQuaternion(_q);
        return aim.addScaledVector(side, 0.35).setY(aim.y + 0.12).normalize();
    }

    /** A thrown light (mine or another player's). */
    addThrown(pos, vel, level, mine = false, by = null) {
        const glow = makeGlow(glowSize(level) * 1.3);
        glow.position.copy(pos);
        this.game.scene.add(glow);
        this.thrown.push({ glow, pos: pos.clone(), vel: vel.clone(), flown: 0, stuck: false, bounces: 0, age: 0, level, mine, by });
    }

    /**
     * It flies on where it was thrown, slowing down by itself; a wall, the ground or a ceiling it
     * meets bounces it softly away (it keeps lighting its way: in a cave it drifts on down the
     * tunnel); slow enough — or after a few bounces / its range — it hangs in the air. It fades
     * out LIFE s after the throw.
     */
    _flyThrown(t, dt) {
        const col = this.game.collision;
        t.age += dt;
        if (!t.stuck) {
            t.vel.multiplyScalar(Math.exp(-LUMOS.DRAG * dt));
            const speed = t.vel.length();
            const step = speed * dt;
            const n = Math.max(1, Math.ceil(step / 0.2));
            for (let i = 0; i < n && !t.stuck; i++) {
                _v.copy(t.pos).addScaledVector(t.vel, dt / n);
                if (col?.pointBlocked(_v.x, _v.y, _v.z)) {
                    // which way the surface faces: the axes whose move alone runs into it turn back
                    let hit = false;
                    for (const ax of ['x', 'y', 'z']) {
                        _v3.copy(t.pos);
                        _v3[ax] += t.vel[ax] * dt / n;
                        if (col.pointBlocked(_v3.x, _v3.y, _v3.z)) { t.vel[ax] *= -LUMOS.BOUNCE; hit = true; }
                    }
                    if (!hit) t.vel.multiplyScalar(-LUMOS.BOUNCE);
                    t.vel.multiplyScalar(0.85);
                    if (++t.bounces >= LUMOS.BOUNCES) t.stuck = true;
                    break; // (stays just before the surface this step)
                }
                t.pos.copy(_v);
                t.flown += step / n;
            }
            if (t.flown > LUMOS.THROW_RANGE || t.vel.length() < LUMOS.STOP) t.stuck = true;
        }
        t.glow.position.copy(t.pos);
        const k = this._fade(t); // (fading in the last seconds)
        t.glow.scale.setScalar(glowSize(t.level) * 1.3 * (0.4 + 0.6 * k) * (1 + Math.sin(this._flick * 1.7 + t.flown) * 0.05));
        t.glow.material.opacity = k;
        return t.age < LUMOS.LIFE;
    }

    _fade(t) { return Math.max(0, Math.min(1, (LUMOS.LIFE - t.age) / LUMOS.FADE)); }

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
        if (this.light) src.push({ p: this.light.glow.position, level: this.light.level });
        for (const t of this.thrown) src.push({ p: t.pos, level: t.level * this._fade(t) });
        for (const e of this.remote.values()) src.push({ p: e.glow.position, level: e.level });
        if (cam) src.sort((a, b) => a.p.distanceToSquared(cam) - b.p.distanceToSquared(cam));
        this.lights.forEach((light, i) => {
            const s = src[i];
            if (!s || s.level <= 0) { light.intensity = 0; return; }
            const lo = lightOf(s.level), cave = this.game.world?.cave || 0;
            light.position.copy(s.p);
            // (in a cave's dark the light is all there is: it reaches further along the rock)
            light.intensity = lo.intensity * (1 + 0.35 * cave) * (1 + Math.sin(this._flick * 3.1 + i) * 0.04);
            light.distance = lo.distance;
            light.decay = 2 - 0.75 * cave;
        });
    }

    // ------------------------------------------------------------- Reveal
    /** «Раскрой свои секреты»: a hologram about what the wand (or the bare hand) points at. */
    reveal() {
        const g = this.game;
        let tip = this.wand ? this.tip(new THREE.Vector3(), _v2) : null;
        let side = this.wand ? g.items.heldOf('wand').side : null;
        if (!tip) {
            // no wand: the hand that points (the raised one, else the spell hand)
            const ch = g.character;
            side = [g.dom || 'right', g.off || 'left'].find((s) => ch.isArmRaised(s) && !g.items.held[s]) || g.magicHand || g.lastMagicHand || g.dom || 'right';
            tip = ch.getHandWorldPosition(side, new THREE.Vector3());
            ch.getHandDirection(side, _v2);
        }
        const dir = _v2.clone();
        let target = null, at = null;
        // a thing lying / hovering where the wand points (the cone wider for a near thing — it is a big
        // target, and the camera's hand trembles: the author pointed at the things by him and got nothing)
        // — scored by the angle beyond what its distance allows
        let best = 0;
        const cone = (d) => 0.3 + Math.atan2(0.7, Math.max(0.5, d));
        const score = (ang, d) => cone(d) - ang;
        for (const L of g.items.loose.values()) {
            const to = _v.subVectors(L.model.position, tip);
            const d = to.length();
            if (d > 10) continue;
            const sc = score(dir.angleTo(to.normalize()), d);
            if (sc > best) { best = sc; target = L.item; at = L.model.position.clone(); }
        }
        for (const w of g.weapons.weapons) {
            const to = _v.subVectors(w.position, tip);
            const d = to.length();
            if (d > 10) continue;
            const sc = score(dir.angleTo(to.normalize()), d);
            if (sc > best) { best = sc; target = { kind: 'weapon', type: w.type, magic: w.magic, bonus: w.bonus }; at = w.position.clone(); }
        }
        // a running book (a creature and a book at once): its secret
        // (small and running: where the wand OR the arm points, a wide cone, up to 30 m — and it
        // wins over the things about: that is what the hand is after)
        let info = null;
        const arm = side ? g.character.getForearmDirection?.(side, new THREE.Vector3()) : null;
        let rbBest = Infinity;
        for (const { pos } of g.runner?.accioTargets?.() || []) {
            const to = _v.subVectors(pos, tip);
            const d = to.length();
            if (d > 30) continue;
            to.normalize();
            const ang = Math.min(dir.angleTo(to), arm ? arm.angleTo(to) : Infinity);
            if (ang < 0.45 + Math.atan2(1.5, d) && ang < rbBest) { rbBest = ang; best = Infinity; info = g.runner.secret(); target = { kind: 'book', runbook: true }; at = pos.clone(); }
        }
        // a book-bird's book lying on the ground or on a pedestal
        for (const bk of g.books?.books?.values() || []) {
            const to = _v.subVectors(bk.model.position, tip);
            const d = to.length();
            if (d > 10) continue;
            const sc = score(dir.angleTo(to.normalize()), d);
            if (sc > best) { best = sc; info = null; target = { kind: 'book', id: bk.id, spells: bk.spells, ...(bk.spells?.includes('Flight') ? { swift: true } : {}) }; at = bk.model.position.clone(); }
        }
        // the thing in the other hand (or in this bare hand), else the wand itself
        if (!target) {
            for (const s of [side === 'right' ? 'left' : 'right', side]) {
                const it = g.items.held[s], w = g.weapons.hands[s].held;
                if (it && it.item.kind !== 'wand') { target = it.item; at = it.model.position.clone(); break; }
                if (w) { target = { kind: 'weapon', type: w.type, magic: w.magic, bonus: w.bonus }; at = w.position.clone(); break; }
            }
            // (a running book about but the wand not on it: say so — not the wand's own secrets)
            const rb = (g.runner?.accioTargets?.() || []).filter((r) => dir.angleTo(_v.subVectors(r.pos, tip).normalize()) < 0.9);
            if (!target && rb.length) {
                const near = Math.min(...rb.map((r) => r.pos.distanceTo(tip)));
                g.hud.setVoice(near > 30 ? `🔮 Бегущая книга слишком далеко (${Math.round(near)} м) — подойдите ближе` : '🔮 Бегущая книга не там, куда показывает палочка (рука) — наведите прямо на неё и скажите ещё раз', true);
                return false;
            }
            if (!target && this.wand) { target = this.wand; at = tip.clone(); }
        }
        if (!target) { g.hud.setVoice('🔮 Укажите рукой на предмет (или возьмите его) и скажите «Раскрой свои секреты»', true); return false; }
        this._showHologram(info || describeItem(target), at);
        return true;
    }

    _showHologram(info, at) {
        const g = this.game;
        this._closeHolo();
        // Readable on any background (bright sky, a white wall, night): a dark, almost opaque plate
        // under the text, normal (not additive) blending, the letters outlined in black; the glow stays
        // on the frame and the letters' edges — the holographic look without washed-out text.
        const W = 1024, PAD = 56, MAXX = W - PAD, LH = 52, GAP = 18, TOP = 150;
        const c = document.createElement('canvas');
        const x = c.getContext('2d');
        const bodyFont = (bold) => (bold ? 'bold ' : '') + '40px sans-serif';
        // lay the words out first: the card is as tall as its text (long lists used to fall off the bottom)
        c.width = W; c.height = 64;
        const words = [];
        let y = 0;
        for (const line of info.lines) {
            let px = PAD;
            for (const part of line.split(/(<b>.*?<\/b>)/)) {
                const bold = part.startsWith('<b>');
                x.font = bodyFont(bold);
                for (const word of part.replace(/<\/?b>/g, '').split(/(\s+)/)) {
                    if (!word) continue;
                    const w = x.measureText(word).width;
                    if (px + w > MAXX && px > PAD) { y += LH; px = PAD; if (!word.trim()) continue; }
                    words.push({ word, bold, px, y });
                    px += w;
                }
            }
            y += LH + GAP;
        }
        const H = Math.max(300, Math.ceil(TOP + y - GAP + 30));
        c.height = H;
        // the item's colour, lifted so a dark one (a dragon wand's deep red) still shows on the dark plate
        const frame = new THREE.Color(info.color ?? 0x9fd8ff), hsl = {};
        frame.getHSL(hsl); frame.setHSL(hsl.h, hsl.s, Math.max(hsl.l, 0.62));
        const col = '#' + frame.getHexString();
        const round = (r, inset) => {
            x.beginPath();
            if (x.roundRect) x.roundRect(inset, inset, W - inset * 2, H - inset * 2, r);
            else x.rect(inset, inset, W - inset * 2, H - inset * 2);
        };
        // the plate: deep blue-black, nearly opaque, a little lighter at the top
        const bg = x.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, 'rgba(8, 34, 58, 0.93)'); bg.addColorStop(1, 'rgba(2, 10, 20, 0.93)');
        round(26, 6); x.fillStyle = bg; x.fill();
        for (let sy = 12; sy < H - 12; sy += 6) { x.fillStyle = 'rgba(127, 227, 255, 0.045)'; x.fillRect(12, sy, W - 24, 2); } // faint scan lines
        // glowing frames: the outer cyan, the inner in the item's colour
        x.save(); x.shadowColor = '#7fe3ff'; x.shadowBlur = 18;
        round(26, 6); x.strokeStyle = '#9ff0ff'; x.lineWidth = 7; x.stroke();
        x.restore();
        round(18, 20); x.strokeStyle = col; x.lineWidth = 4; x.stroke();
        // every letter: a black outline, then the bright fill with a soft coloured glow
        const text = (t, px, py, fill, glow) => {
            x.lineJoin = 'round'; x.lineWidth = 8; x.strokeStyle = 'rgba(0, 0, 0, 0.95)'; x.strokeText(t, px, py);
            x.save(); x.shadowColor = glow; x.shadowBlur = 10; x.fillStyle = fill; x.fillText(t, px, py); x.restore();
        };
        x.textAlign = 'center'; x.font = 'bold 58px sans-serif';
        let title = info.title.replace(/<[^>]+>/g, '');
        while (title.length > 4 && x.measureText(title).width > W - PAD * 2) title = title.slice(0, -2) + '…';
        text(title, W / 2, 96, '#ffffff', '#7fe3ff');
        x.fillStyle = col; x.fillRect(PAD, 118, W - PAD * 2, 4); // a bright rule under the title
        x.textAlign = 'left';
        for (const t of words) {
            x.font = bodyFont(t.bold);
            text(t.word, t.px, TOP + t.y, t.bold ? '#ffe14d' : '#eefaff', t.bold ? '#ffb000' : '#5fd0ff');
        }
        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = g.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
        const PW = 2.4, PH = PW * H / W;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity: 0, side: THREE.DoubleSide,
            depthWrite: false, depthTest: false, // (a wall, the hand or a tree never cut through the words)
            fog: false, toneMapped: false, // (night fog and tone mapping don't dim it)
        }));
        mesh.renderOrder = 1000;
        mesh.frustumCulled = false;
        mesh.name = 'reveal-hologram';
        const lift = 0.4 + PH / 2; // (its bottom edge where the old card's was, however tall it is)
        mesh.position.copy(at).add(_v.set(0, lift, 0));
        g.scene.add(mesh);
        this.holo = { mesh, until: performance.now() + 9000, t: 0, at: at.clone(), lift };
        g.ships?.pin(mesh, () => !!mesh.parent);
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
        const hasWand = !!this.wand || this._bare();
        // Lumos burns until «стоп»/«Нокс» (author). Only a wand really put away or dropped puts it out — and not at once:
        // a camera that loses the hand for a blink (tracking flicker) must not, so the wand must stay gone for LUMOS.LOSS_GRACE.
        // (No mana is spent on it, so running out of mana never puts it out.)
        const gone = lumosGone(this._noWand || 0, hasWand, dt);
        this._noWand = gone.t;
        if (this.light && gone.out) this._nox(false);
        this._flick = (this._flick || 0) + dt;
        // Lumos at the tip (a little strength over time); a real throw of the hand throws it
        if (this.light && hasWand) { // (a wand lost for a blink: the glow just stays where it was)
            const tip = this.tip(new THREE.Vector3(), _v2);
            this.light.glow.position.copy(tip);
            this.light.glow.scale.setScalar(glowSize(this.light.level) * (1 + Math.sin(this._flick * 2.3) * 0.05));
            if (g.combat.enabled) g.combat.fatigue = Math.max(0, g.combat.fatigue - dt * 0.08 * this.light.level);
            // thrown like a thing: a wind-up, a fast swing forward, the light leaves at its end (HandRelease.LumosThrow);
            // never walking or running (the arms swing), lying, swimming, nor with another spell's gesture
            const ch = g.character, now = performance.now();
            const side = g.items.heldOf('wand')?.side || this._bareSide();
            if (ch.isRunning || ch.stepping > 0 || ch.flying || ch.knockedDown || ch.swimming) this._movedAt = now;
            const det = this._lumosThr || (this._lumosThr = new LumosThrow());
            const other = g._castName && g._castName !== 'Lumos' && g._castName !== 'LumosMaxima' && now - (g._castAt || -1e9) < LUMOS.OTHER_MS;
            if (!side || !ch.armState || now - (this._movedAt || 0) < LUMOS.STILL || other) det.reset();
            else {
                const arm = ch.armState(side, this._arm || (this._arm = {}));
                const tracked = ch.isHandTracked ? ch.isHandTracked(side) : true;
                const thr = det.update({ now, hand: arm.hand, shoulder: arm.shoulder, vRel: arm.vRel, behind: poseBehind(g.currentPose, side), tracked });
                if (thr) this._throwLight(this._throwDir(thr.dir, _v2), Math.min(1.6, Math.max(0.7, thr.speed / 7)));
            }
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
                    const joined = d.last && d.last.distanceTo(tip) < 0.8;
                    if (joined) this._stroke(d, d.last, tip);
                    d.last = tip.clone();
                    // (the others see it too: the new points go out a few times a second; null: the line breaks)
                    const out = this._drawOut || (this._drawOut = { pts: [], at: now });
                    if (!joined) out.pts.push(null);
                    out.pts.push([+tip.x.toFixed(3), +tip.y.toFixed(3), +tip.z.toFixed(3)]);
                }
                if (this._drawOut && (now - this._drawOut.at > 120 || this._drawOut.pts.length >= 16)) this._sendDraw(d);
            }
            this._fadeLines(d, now);
            if (now > d.until && !d.lines.length) this.drawing = null;
        }
        // the others' drawings fade the same way
        for (const [id, e] of this.remoteDrawings) {
            this._fadeLines(e, performance.now());
            if (!e.lines.length && performance.now() - e.at > 2000) this.remoteDrawings.delete(id);
        }
        // hologram: faces the camera, fades in and out
        const h = this.holo;
        if (h) {
            h.t += dt;
            const left = (h.until - performance.now()) / 1000;
            h.mesh.material.opacity = Math.min(1, h.t * 3) * Math.min(1, Math.max(0, left));
            h.mesh.position.y = h.at.y + h.lift + Math.sin(h.t * 2) * 0.05;
            h.mesh.quaternion.copy(g.camera.getWorldQuaternion(_q));
            if (left <= 0) this._closeHolo();
        }
    }

    /** My drawing's new points to the others (the next batch goes on where this one ended). */
    _sendDraw(d) {
        const out = this._drawOut;
        this._drawOut = null;
        if (out?.pts.length) this.game.sync?.draw?.(d.color.getHex(), out.pts);
    }

    /** Another player's drawing in the air: the points they sent, joined into glowing lines (null: a break). */
    remoteDraw(by, color, pts) {
        if (!Array.isArray(pts) || pts.length > 64) return;
        let e = this.remoteDrawings.get(by);
        if (!e) { e = { color: new THREE.Color(), lines: [], last: null, at: 0 }; this.remoteDrawings.set(by, e); }
        e.color.setHex(Number(color) & 0xffffff);
        e.at = performance.now();
        for (const q of pts) {
            if (!Array.isArray(q) || q.length < 3 || !q.every(Number.isFinite)) { e.last = null; continue; }
            const p = new THREE.Vector3(q[0], q[1], q[2]);
            if (e.last && e.last.distanceTo(p) < 0.8) this._stroke(e, e.last, p);
            e.last = p;
        }
    }

    /** Lines fade out over 10 s and are gone. */
    _fadeLines(d, now) {
        for (let i = d.lines.length - 1; i >= 0; i--) {
            const s = d.lines[i];
            const age = (now - s.born) / 1000;
            s.mesh.material.opacity = Math.max(0, 1 - age / 10);
            if (age > 10) { this.game.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); d.lines.splice(i, 1); }
        }
    }

    _stroke(d, a, b) {
        const len = a.distanceTo(b);
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 5), new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
        mesh.position.copy(a).add(b).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(_v.set(0, 1, 0), _v2.subVectors(b, a).normalize());
        this.game.scene.add(mesh);
        this.game.ships?.pin(mesh, () => !!mesh.parent); // (drawn on a ship's deck: the lines sail with it)
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
        for (const e of this.remoteDrawings.values()) for (const s of e.lines) this.game.scene.remove(s.mesh);
    }
}
