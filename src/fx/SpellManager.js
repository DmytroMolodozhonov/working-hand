/**
 * SpellManager.js — voice spells.
 *
 * Same spells, words, damage and look as the original (Сапира, Тандервейв,
 * Инферно, Санд/Даст, Айс) plus the new «Бомбардо» — an explosive orb that
 * blows up blocks, trees, tables and zombies.
 *
 * Visuals use the pooled Effects (no per-spark meshes). Damage only happens
 * where `authoritative` is true (single player / multiplayer host); other
 * peers render the same spell for the eyes only.
 */

import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Bombardo blast radius; «Бомбардо Максима» is MAXIMA_POWER times stronger. */
export const BOMBARDO_RADIUS = 3.6;
export const MAXIMA_POWER = 3;
/** Crater radius for a given power: 3× the energy → ~1.7× wider, ~5× more ground removed. */
export function bombardoRadius(power = 1) {
    return BOMBARDO_RADIUS * Math.sqrt(power);
}

/** Recognise a spell name in a voice transcript. Exported for tests. */
export function matchSpell(text) {
    const s = (text || '').toLowerCase().trim();
    if (!s) return null;
    const has = (...words) => words.some((w) => s.includes(w));
    // New spell first: its words must never be mistaken for the short Sand/Ice tokens.
    if (has('бомбар', 'бомбор', 'бамбар', 'бонбар', 'помбар', 'бомбард', 'bombar', 'bombor', 'bambar', 'бомба', 'bomb')) {
        // «Бомбардо Максима»: the same word plus «максима»
        return has('макс', 'max', 'мэкс', 'мекс', 'maks', 'мах') ? 'BombardoMaxima' : 'Bombardo';
    }
    // Water bending (before Ice/Sands: their short tokens would catch these words)
    const water = has('вотер', 'ватер', 'уотер', 'water', 'вотр', 'водян', 'вода', 'воду', 'уатер', 'watter', 'woter');
    if (has('форминг', 'forming', 'формин') || (water && has('форм', 'form'))) return 'WaterForming';
    if (water && has('бол', 'бал', 'ball', 'bowl', 'bol', 'шар', 'буль', 'бул')) return 'Waterball';
    if (has('фрозен', 'фроузен', 'фрозэн', 'фризен', 'frozen', 'frosen', 'заморо')) return 'Frozen';
    if (has('максим', 'maxim', 'макс', 'max')) return 'Maxima';
    if (has('флайн', 'флаин', 'флайм', 'флай', 'флэй', 'флей', 'фляй', 'fly', 'flai', 'полёт', 'полет', 'взлёт', 'взлет')) return 'Flight';
    if (has('сап', 'sap', 'саб', 'sab', 'саф', 'saf', 'сат', 'sat', 'зап', 'zap')) return 'Sapira';
    if (has('танд', 'thun', 'молн', 'гром', 'удар')) return 'Thunderwave';
    if (has('инфер', 'infer', 'огон', 'фаер', 'fire')) return 'Inferno';
    if (has('санд', 'sand', 'сенд', 'send', 'санс', 'sans', 'песо', 'peso', 'цент', 'cent', 'даст', 'dust', 'sun', 'son', 'sam', 'set', 'sed')) return 'Sands';
    if (has('айс', 'ice', 'аис', 'ais', 'лед', 'лёд', 'led', 'мороз', 'moroz', 'холод', 'cold', 'луч', 'beam', 'eyes', 'ace', 'is', 'snow', 'freeze', 'froze')) return 'Ice';
    return null;
}

export class SpellManager {
    /**
     * @param {THREE.Scene} scene
     * @param {Effects} fx
     * @param {object} hooks
     *   zombies(): Zombie[]
     *   authoritative(): boolean
     *   damage(z, amount, isWeapon, dir)
     *   explode(pos, radius, casterId, power)   (authoritative only)
     *   handPose(casterId, side) -> {origin, dir} | null   (live hand for ice beam)
     *   collision: CollisionWorld
     *   terrain(): Terrain|null
     */
    constructor(scene, fx, hooks) {
        this.scene = scene;
        this.fx = fx;
        this.hooks = hooks;
        this.spells = [];
        this.soundManager = null;

        // Re-usable projectile meshes (sand ball, bombardo orb)
        this.sandBalls = this._ballPool(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xd2b48c }), 6);
        this.orbs = this._ballPool(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb347 }), 6);
        for (const o of this.orbs) {
            const halo = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
            o.add(halo);
        }
    }

    _ballPool(geo, mat, n) {
        const arr = [];
        for (let i = 0; i < n; i++) {
            const m = new THREE.Mesh(geo, mat);
            m.visible = false;
            m.userData.free = true;
            this.scene.add(m);
            arr.push(m);
        }
        return arr;
    }

    _takeBall(pool) {
        const m = pool.find((b) => b.userData.free) || pool[0];
        m.userData.free = false;
        m.visible = true;
        return m;
    }

    _freeBall(m) {
        m.visible = false;
        m.scale.setScalar(1);
        m.userData.free = true;
    }

    setSoundManager(sm) {
        this.soundManager = sm;
    }

    _sound(fn) {
        if (!this.soundManager || !this.soundManager[fn]) return;
        try { this.soundManager[fn](); } catch (e) { console.warn('Sound error', e); }
    }

    get zombies() {
        return this.hooks.zombies ? this.hooks.zombies() : [];
    }

    get auth() {
        return this.hooks.authoritative ? this.hooks.authoritative() : true;
    }

    /**
     * @param {string} text  voice transcript or spell name
     * @param {THREE.Vector3} origin
     * @param {THREE.Vector3} direction (normalised)
     * @param {string} handSide
     * @param {string} [casterId]
     * @returns {string|null} spell name
     */
    castSpell(text, origin, direction, handSide, casterId = 'local') {
        const name = matchSpell(text);
        if (!name) return null;
        this.cast(name, origin, direction, handSide, casterId);
        return name;
    }

    cast(name, origin, direction, handSide, casterId = 'local') {
        const o = origin.clone();
        const d = direction.clone().normalize();
        switch (name) {
            case 'Sapira': this.castSapira(o, d); break;
            case 'Thunderwave': this.castThunderwave(o, d); break;
            case 'Inferno': this.castInferno(o, d); break;
            case 'Sands': this.castSands(o, d); break;
            case 'Ice': this.castIce(o, d, handSide, casterId); break;
            case 'Bombardo': this.castBombardo(o, d, casterId); break;
            case 'BombardoMaxima': this.castBombardo(o, d, casterId, MAXIMA_POWER); break;
            case 'Flight': return false; // handled by the game (it moves the caster)
            default: return false;
        }
        return true;
    }

    update(dt) {
        for (let i = this.spells.length - 1; i >= 0; i--) {
            const spell = this.spells[i];
            spell.life -= dt;
            if (spell.onUpdate && spell.life > 0) spell.onUpdate(spell, dt);
            if (spell.life <= 0) {
                if (spell.onEnd) spell.onEnd(spell);
                this.spells.splice(i, 1);
            }
        }
    }

    clear() {
        for (const s of this.spells) if (s.onEnd) s.onEnd(s);
        this.spells.length = 0;
    }

    _damage(z, amount, isWeapon, dir) {
        if (this.auth && this.hooks.damage) this.hooks.damage(z, amount, isWeapon, dir);
    }

    // -------------------------------------------------------------- Inferno
    castInferno(origin, direction) {
        this._sound('playInferno');
        const right = new THREE.Vector3().crossVectors(direction, UP).normalize();
        if (right.lengthSq() < 0.01) right.set(1, 0, 0);
        const localUp = new THREE.Vector3().crossVectors(right, direction).normalize();
        const colors = [0xff0000, 0xff4500, 0xff8800, 0xffffff, 0x880000];
        let acc = 0;
        this.spells.push({
            life: 4.0,
            onUpdate: (spell, dt) => {
                // Original: 15 sparks per frame at 60 FPS → 900/s, now frame-rate independent
                acc += dt * 900;
                const count = Math.min(40, Math.floor(acc));
                acc -= count;
                for (let i = 0; i < count; i++) {
                    const angle = spell.life * 10 + Math.random() * Math.PI * 2;
                    const radius = 0.12 + Math.random() * 0.12;
                    _a.copy(right).multiplyScalar(Math.cos(angle) * radius).addScaledVector(localUp, Math.sin(angle) * radius);
                    const speed = 24 + Math.random() * 8;
                    _b.copy(direction).multiplyScalar(speed).addScaledVector(_a.clone().normalize(), 0.4);
                    _c.copy(origin).add(_a);
                    this.fx.spark(_c, colors[(Math.random() * colors.length) | 0], 0.4 + Math.random() * 0.7, _b, 0.7 + Math.random() * 0.3);
                }
                for (const z of this.zombies) {
                    if (z.isDead) continue;
                    _a.subVectors(z.group.position, origin);
                    const dist = _a.length();
                    if (dist > 30) continue;
                    if (direction.angleTo(_a.normalize()) < 0.5 && z.damageCooldown <= 0) {
                        this._damage(z, 1, true, direction);
                        z.damageCooldown = 0.1;
                    }
                }
            },
        });
    }

    // --------------------------------------------------------- Thunderwave
    castThunderwave(origin, direction) {
        this._sound('playThunder');
        for (let i = 0; i < 20; i++) {
            _a.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5 + 3, (Math.random() - 0.5) * 5).add(origin);
            this.fx.spark(_a, 0x88ffff, 1.5, _b.copy(direction).multiplyScalar(5), 0.5);
        }
        const range = 40;
        for (let k = 0; k < 15; k++) {
            const boltDir = direction.clone().applyAxisAngle(UP, (Math.random() - 0.5) * 2.0).normalize();
            const curr = origin.clone();
            const segments = 8;
            const segLen = (range * (0.5 + Math.random() * 0.5)) / segments;
            for (let s = 0; s < segments; s++) {
                const next = curr.clone().addScaledVector(boltDir, segLen);
                next.x += (Math.random() - 0.5) * 2; next.y += (Math.random() - 0.5) * 2; next.z += (Math.random() - 0.5) * 2;
                this.fx.bolts.add(curr, next, 0.15 + k * 0.01);
                curr.copy(next);
            }
        }
        this.fx.lightFlash(origin, 0xaaddff, 3, 0.3, 50);
        for (const z of this.zombies) {
            if (z.isDead) continue;
            const to = _a.subVectors(z.group.position, origin);
            const dist = to.length();
            const dirTo = _b.copy(to).normalize();
            if ((dist < 4.0 && direction.dot(dirTo) > -0.2) || (dist < range && direction.angleTo(dirTo) < 1.2)) {
                if (this.auth) {
                    z.damageCooldown = 0;
                    this._damage(z, 5, true, dirTo);
                    z.group.position.addScaledVector(dirTo, 8);
                }
            }
        }
    }

    // --------------------------------------------------------------- Sands
    castSands(origin, direction) {
        this._sound('playWhoosh');
        const ball = this._takeBall(this.sandBalls);
        ball.position.copy(origin);
        const velocity = direction.clone().multiplyScalar(25.0);
        this.spells.push({
            life: 3.0,
            onUpdate: (spell, dt) => {
                ball.position.addScaledVector(velocity, dt);
                ball.rotation.x += dt * 5;
                ball.rotation.y += dt * 5;
                if (Math.random() > 0.5) {
                    this.fx.spark(ball.position, 0xd2b48c, 0.2, _b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), 0.5);
                }
                for (const z of this.zombies) {
                    if (z.isDead) continue;
                    _a.copy(z.group.position); _a.y += 1.2;
                    if (ball.position.distanceTo(_a) < 1.5) {
                        if (this.auth && this.hooks.sand) this.hooks.sand(z);
                        for (let k = 0; k < 20; k++) {
                            this.fx.spark(ball.position, 0xd2b48c, 0.4, _b.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10), 0.8);
                        }
                        spell.life = 0;
                        return;
                    }
                }
                if (ball.position.distanceTo(origin) > 20) spell.life = 0;
            },
            onEnd: () => this._freeBall(ball),
        });
    }

    // ----------------------------------------------------------------- Ice
    castIce(origin, direction, handSide, casterId) {
        let target = null, minDist = Infinity;
        for (const z of this.zombies) {
            if (z.isDead || z.isFrozen) continue;
            _a.copy(z.group.position); _a.y += 1.2;
            _a.sub(origin);
            const dist = _a.length();
            if (dist > 20) continue;
            if (direction.angleTo(_a.normalize()) < 0.4 && dist < minDist) { minDist = dist; target = z; }
        }
        if (!target) {
            this.fx.straightBeam(origin, _a.copy(origin).addScaledVector(direction, 20), 0.4, 0x88ffff, 0.5, 0.5);
            return;
        }
        this._sound('playIce');
        const beam = this.fx.acquireIceBeam();
        const initialDir = direction.clone();
        const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), dir = new THREE.Vector3();
        this.spells.push({
            life: 5.0,
            onUpdate: (spell, dt) => {
                if (target.isDead) { spell.life = 0; return; }
                p2.copy(target.group.position); p2.y += 1.2;
                const live = this.hooks.handPose ? this.hooks.handPose(casterId, handSide) : null;
                if (live) { p0.copy(live.origin); dir.copy(live.dir); } else { p0.copy(origin); dir.copy(initialDir); }
                // Beam breaks if the hand turns away more than ~25° from where it was cast
                if (dir.angleTo(initialDir) > 0.45) { spell.life = 0; return; }
                const dist = p0.distanceTo(p2);
                p1.copy(p0).addScaledVector(dir, dist * 0.5);
                if (beam) beam.setCurve(p0, p1, p2);
                if (this.auth && this.hooks.chill) this.hooks.chill(target, (1.0 / 5.0) * dt);
                if (Math.random() > 0.5) {
                    this.fx.spark(p2, 0xaaddff, 0.4, _b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5), 0.5);
                }
            },
            onEnd: () => this.fx.releaseIceBeam(beam),
        });
    }

    // -------------------------------------------------------------- Sapira
    castSapira(origin, direction) {
        this._sound('playSapira');
        const len = 100;
        const end = _a.copy(origin).addScaledVector(direction, len);
        this.fx.straightBeam(origin, end, 0.2, 0x000000, 1.0, 1.5, (s) => { s.mesh.material.opacity = 1; });
        this.fx.straightBeam(origin, end, 0.6, 0x9b59b6, 0.5, 1.5, (s) => {
            const scale = 1 + Math.sin(s.life * 10) * 0.5;
            s.mesh.scale.x = 0.6 * scale;
            s.mesh.scale.z = 0.6 * scale;
        }, THREE.AdditiveBlending);
        for (const z of this.zombies) {
            if (z.isDead) continue;
            _b.copy(z.group.position); _b.y += 1.2;
            _c.subVectors(_b, origin);
            const proj = _c.dot(direction);
            if (proj < 0 || proj > len) continue;
            _c.copy(origin).addScaledVector(direction, proj);
            if (_c.distanceTo(_b) < 1.5) this._damage(z, 10, true, direction);
        }
    }

    // ------------------------------------------------------------ Bombardo
    castBombardo(origin, direction, casterId, power = 1) {
        const maxima = power > 1;
        this._sound('playBombardoCast');
        const orb = this._takeBall(this.orbs);
        const size = maxima ? 2.3 : 1;
        orb.scale.setScalar(size);
        orb.position.copy(origin).addScaledVector(direction, 0.8 * size);
        const vel = direction.clone().multiplyScalar(maxima ? 27 : 32);
        const gravity = maxima ? 3.5 : 6;
        const radius = bombardoRadius(power);
        const hitR2 = 1.3 * size * size;
        const prev = new THREE.Vector3();
        const collision = this.hooks.collision;
        if (maxima) this.fx.castBurst(origin, direction);
        const handOrigin = origin.clone();
        let age = 0;
        let exploded = false;
        const explodeAt = (p) => {
            if (exploded) return;
            exploded = true;
            if (this.auth && this.hooks.explode) this.hooks.explode(p.clone(), radius, casterId, power);
            else this.fx.lightFlash(p, 0xffaa55, 2 * size, 0.15, 20 * size); // client: real blast arrives from the host
        };
        this.spells.push({
            life: maxima ? 3.2 : 2.6,
            onUpdate: (spell, dt) => {
                prev.copy(orb.position);
                age += dt;
                vel.y -= gravity * dt;
                orb.position.addScaledVector(vel, dt);
                orb.rotation.y += dt * 8;
                // Trail
                const trail = maxima ? 8 : 3;
                for (let k = 0; k < trail; k++) {
                    const j = maxima ? 4 : 2;
                    this.fx.glow.spawn(orb.position.x, orb.position.y, orb.position.z,
                        (Math.random() - 0.5) * j, (Math.random() - 0.5) * j, (Math.random() - 0.5) * j,
                        k === 0 ? 0xffd27a : (maxima && k % 3 === 1 ? 0xff2a00 : 0xff6a00), (0.35 + Math.random() * 0.3) * (maxima ? 2 : 1), maxima ? 0.45 : 0.3, { shrink: 2.0 });
                }
                // Maxima: magic keeps pouring out of the hand for a moment
                if (maxima && age < 0.45) {
                    for (let k = 0; k < 5; k++) {
                        const sp = 14 + Math.random() * 16;
                        this.fx.glow.spawn(handOrigin.x, handOrigin.y, handOrigin.z,
                            direction.x * sp + (Math.random() - 0.5) * 4, direction.y * sp + (Math.random() - 0.5) * 4, direction.z * sp + (Math.random() - 0.5) * 4,
                            Math.random() < 0.4 ? 0xffffff : 0xffa030, 0.3 + Math.random() * 0.4, 0.25 + Math.random() * 0.2, { shrink: 2.5 });
                    }
                }
                // Terrain (voxel DDA between last and current position)
                const terrain = this.hooks.terrain ? this.hooks.terrain() : null;
                const step = _a.subVectors(orb.position, prev);
                const stepLen = step.length();
                if (terrain && stepLen > 0) {
                    const hit = terrain.raycast(prev, step.clone().divideScalar(stepLen), stepLen);
                    if (hit) { explodeAt(_b.set(hit.x, hit.y, hit.z)); spell.life = 0; return; }
                }
                // Walls / tables / trees / floor
                if (collision && collision.pointBlocked(orb.position.x, orb.position.y, orb.position.z)) {
                    explodeAt(prev); spell.life = 0; return;
                }
                // Zombies
                for (const z of this.zombies) {
                    if (z.isDead) continue;
                    const zp = z.group.position;
                    const dx = orb.position.x - zp.x, dz = orb.position.z - zp.z;
                    if (dx * dx + dz * dz < hitR2 && orb.position.y > zp.y - 1 - size && orb.position.y < zp.y + 3 + size) {
                        explodeAt(orb.position); spell.life = 0; return;
                    }
                }
            },
            onEnd: (spell) => {
                if (!exploded) explodeAt(orb.position); // fizzles out with a bang at max range
                this._freeBall(orb);
            },
        });
    }
}
