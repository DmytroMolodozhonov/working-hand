/**
 * DragonRide.js — «Brain Rot Maxima» on MY computer: the held spell (0,5 mana a second), getting onto the
 * dragon, flying it, letting it go. The dragon's mind, anger and the host's word: Dragons.js; the rules
 * (when the spell takes, whom «Атак» may name): DragonTame.js.
 *
 *  - Cast (looking at a dragon): the host decides (Dragons.tame). Taken → the spell is held (the
 *    concentration rule: DragonTame in Concentration.HELD; the sound loop: SpellMusic.HELD_SOUND).
 *  - Get on: a real jump close to the dragon (the same JumpReader that gets onto a horse — Animals.tryMount).
 *    The rider sits on its back (seatOf: from the model's real size); hands and body stay free.
 *  - On the ground: walk in place — it walks, the body's turn is its turn; crouch — get down.
 *  - Take-off / flight: both arms up (as «Флайн»), then the SAME flight controller as the hero's (Flight.js):
 *    lean / look up and down to climb and dive, dive at the ground to land. A great body: slower, turns slower.
 *    It never goes through the ground, a hill, a tree, a house or a ship (Animals._floor: the highest thing
 *    under it, looked ahead — it climbs over instead); no flying inside its lair (a cave hall is no sky).
 *  - The rider does not command its fire: «Атак» (looking / pointing at a person) sends it only at one it is
 *    ALREADY angry at (Dragons.order); it burns only that one.
 *  - Let go (mana out, «стоп», far from it, space): on the ground the rider gets down; in the air the dragon glides
 *    down and lands with them, then they get down. The rider strikes the dragon / the spell is torn / the rider is
 *    stunned or dies: they are set down gently from the air (a bruise), the dragon is angry (or its own again).
 *  - Net: the rider's computer says where the dragon is (`drg` 'ride', 10 times a second); the host sends it on —
 *    the others see a dragon with a rider (the hero's body is at the saddle).
 */

import * as THREE from 'three';
import { FLIGHT, FlightController } from './Flight.js';
import { TAME, upkeep, seatOf } from './DragonTame.js';
import { DRAGON, flameReach } from './DragonKinds.js';
import { dragonDist, dragonCenter } from './Dragons.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _look = new THREE.Vector3();
const _seat = { x: 0, y: 0, z: 0 };
const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class DragonRide {
    constructor(game) {
        this.game = game;
        this.active = false; // the spell is held
        this.id = null; // its dragon
        this.riding = null; // the dragon I sit on (also while it glides down)
        this.phase = ''; // ground | fly | glide
        this.dropping = null; // {} — a rider set down gently from the air
        this.fc = new FlightController();
        this._jumpSeen = null;
        this._pending = null; // a cast / a mount waiting for the host's word
        this._lastCast = 0;
        this._sendT = 0;
        this._armsT = 0;
        this._crouchT = 0;
        this._said = new Map();
    }

    get me() { return this.game.localId; }
    get dragon() { return this.id ? this.game.dragons?.list.find((d) => d.id === this.id) || null : null; }
    /** The hero's own legs and gravity are off: seated, or coming down gently. */
    get busy() { return !!this.riding || !!this.dropping; }

    _say(t, key = t, gap = 2500) {
        const now = performance.now();
        if (now - (this._said.get(key) || -1e9) < gap) return;
        this._said.set(key, now);
        this.game.hud?.setVoice?.(t, true);
    }

    // ============================================================ the cast
    /** «Brain Rot Maxima» said. → 'BrainrotMaxima' (cast now) or null (not cast / the host will say). */
    cast(isFinal) {
        const g = this.game, now = Date.now();
        if (this.active) { if (isFinal) this._say('🐉 Вы уже держите дракона. «Стоп» — отпустить', 'held'); return null; }
        if (this._pending || now - this._lastCast < 1500) return null;
        const d = this._aimed();
        if (!d) {
            if (isFinal) this._say('🐉 «Брейнрот Максима» — для драконов. Посмотрите на дракона (не дальше ' + TAME.CAST_R + ' м) и скажите заклинание. Мелких существ подчиняет «Брейнрот»', 'noaim');
            return null;
        }
        const tired = g.combat.check('BrainrotMaxima');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        this._lastCast = now;
        if (g.authority) {
            const v = g.dragons.tame(d, this.me);
            this.onTamed(d, v, true);
            return v.ok ? 'BrainrotMaxima' : null;
        }
        this._pending = { what: 'tame', id: d.id, at: now };
        g.sync?.dragon?.({ e: 'tame', id: d.id });
        return null;
    }

    /** The dragon I look at (not farther than CAST_R from its body). */
    _aimed() {
        const g = this.game;
        const head = g.character.head.getWorldPosition(_v);
        _look.set(0, 0, -1).applyQuaternion(g.camera.quaternion);
        let best = null;
        for (const d of g.dragons?.targets() || []) {
            const surf = dragonDist(d, head);
            if (surf > TAME.CAST_R) continue;
            const to = dragonCenter(d, _v2).sub(head);
            const ang = _look.angleTo(to.normalize());
            if (ang > 0.6 && surf > 10) continue;
            if (!best || ang < best.ang) best = { d, ang };
        }
        return best ? best.d : null;
    }

    /** The host's verdict on my cast (`local`: I am the host — the rest of the cast is the game's own). */
    onTamed(d, v, local = false) {
        const g = this.game;
        this._pending = null;
        if (!v?.ok || !d) { g.hud.setVoice(v?.say || '🐉 Не получилось', true); return; }
        g.combat.pay('BrainrotMaxima');
        g.mana?.success('BrainrotMaxima');
        this.active = true;
        this.id = d.id;
        this._jumpSeen = g.currentPose?.jump?.jumps ?? null;
        const origin = g.character.head.getWorldPosition(_v).add(_v2.set(0, 1.3, 0)).clone();
        const vec = dragonCenter(d, _v2).sub(origin).clone();
        g.spells.cast('BrainrotMaxima', origin, vec, null, this.me);
        g.sync?.spell?.('BrainrotMaxima', origin, vec, null);
        if (!local && g.sound?.spellHasCastSound?.('BrainrotMaxima')) {
            const at = origin.clone();
            g.sound.spellCast('BrainrotMaxima', at);
            g.sync?.castSound?.('BrainrotMaxima', at);
        }
        g.hud.setVoice(v.calming ? '🐉 Дракон успокоился и больше не зол на вас. Подойдите и прыгните ему на спину — пока вы держите заклинание (−0,5 маны в секунду). «Стоп» — отпустить' : '🐉 Дракон спокоен. Подойдите и прыгните ему на спину — пока вы держите заклинание (−0,5 маны в секунду). «Стоп» — отпустить', true);
    }

    // ============================================================ frame
    update(dt, earth = true) {
        if (!this.active && !this.riding && !this.dropping && !this._pending) return;
        const g = this.game;
        if (this._pending && Date.now() - this._pending.at > 4000) this._pending = null;
        if (this.dropping) this._dropStep(dt);
        const d = this.dragon;
        if (!earth && (this.active || this.riding)) { this.stop('space'); return; }
        if (this.active) {
            if (!d || d.dead) { this.stop('dead'); return; }
            const c = g.combat;
            if (c.enabled) { // (free in Creative: no mana there)
                const u = upkeep(c.fatigue, dt);
                c.fatigue = u.mana;
                if (u.broke) { this.stop('mana'); return; }
            }
            if (!this.riding && dragonDist(d, g.character.group.position) > TAME.KEEP_R) { this.stop('far'); return; }
        }
        if (this.riding) {
            if (!d || d.dead) { this._drop('dead'); return; }
            this._ride(d, dt);
        } else if (this.active && d) this._mountWatch(d);
    }

    _mountWatch(d) {
        const g = this.game, J = g.currentPose?.jump;
        if (!J) return;
        const first = this._jumpSeen == null, fresh = J.jumps !== this._jumpSeen;
        this._jumpSeen = J.jumps;
        if (!fresh || first || this._pending) return;
        if (dragonDist(d, g.character.group.position) > 5.5 * (d.size / 1.25)) return; // (a jump too far from it is just a jump)
        if (g.combat.dead || g.isDeadLocal || g.flight.busy || g.animals?.riding) return;
        if (g.authority) this.onMounted(d, g.dragons.mount(d, this.me));
        else { this._pending = { what: 'mount', id: d.id, at: Date.now() }; g.sync?.dragon?.({ e: 'mount', id: d.id }); }
    }

    /** True while a jump close to the calmed dragon would be a climb onto it (Game._jumpStep: not a jump on the spot). */
    mountable() {
        if (!this.active || this.riding) return false;
        const d = this.dragon;
        return !!d && !d.dead && dragonDist(d, this.game.character.group.position) <= 5.5 * (d.size / 1.25);
    }

    onMounted(d, r) {
        this._pending = null;
        const g = this.game;
        if (g.monster?.active) return; // (the monster form: no riding — MonsterForm.MONSTER_BLOCKS)
        if (!r?.ok || !d) { g.hud.setVoice(r?.say || '🐉 Не получилось залезть', true); return; }
        this.riding = d;
        this.phase = 'ground';
        this.fc.reset();
        this._armsT = 0; this._crouchT = 0;
        d.vel.set(0, 0, 0);
        d.mode = 'ride';
        g.hud.setVoice('🐉 Вы на драконе! Шагайте на месте — он идёт. Обе руки вверх — взлетит (наклон тела и взгляд вверх-вниз — выше-ниже, нырок к земле — посадка). Присесть на земле — слезть', true);
    }

    // ============================================================ in the saddle
    _floor(x, z) {
        const g = this.game;
        if (g.animals?._floor) return g.animals._floor(x, z);
        return g.collision.groundAt ? g.collision.groundAt(x, z, 1e4) : g.collision.groundY(x, z);
    }

    _ride(d, dt) {
        const g = this.game, ch = g.character, col = g.collision, p = d.model.position, s = d.size, pose = g.currentPose;
        d.mode = 'ride';
        d.sleep = Math.max(0, d.sleep - dt * 1.2); // (it rises under the rider)
        if (this.phase === 'ground') this._ground(d, dt, ch, col, p, s, pose);
        else if (this.phase === 'fly') this._fly(d, dt, ch, col, p, s, pose);
        else this._glide(d, dt, ch, col, p, s);
        if (!this.riding) return;
        // the rider on its back (from its real size; the body sinks a little when it sleeps)
        seatOf(p.x, p.y - (d.sleep || 0) * 1.1 * s, p.z, d.model.rotation.y, s, _seat);
        ch.group.position.set(_seat.x, _seat.y, _seat.z);
        // every computer sees it where it is (the host sends it on)
        if (!g.authority) {
            this._sendT -= dt;
            if (this._sendT <= 0) {
                this._sendT = 0.1;
                g.sync?.dragon?.({ e: 'ride', id: d.id, p: [r2(p.x), r2(p.y), r2(p.z)], ry: r2(d.model.rotation.y), fly: r2(d.fly), walk: r2(d.rideWalk), vy: r2(d.vel.y) });
            }
        } else g.dragons._sendSoon = true;
    }

    _ground(d, dt, ch, col, p, s, pose) {
        const yaw = ch.group.rotation.y;
        d.model.rotation.y = yaw;
        const run = ch.isRunning;
        const speed = run ? DRAGON.WALK * TAME.WALK_K * d.react * (0.55 + 0.45 * (ch.runIntensity || 0)) : 0;
        if (speed > 0) {
            const nx = p.x - Math.sin(yaw) * speed * dt, nz = p.z - Math.cos(yaw) * speed * dt;
            const gy = col.groundAt ? col.groundAt(nx, nz, p.y + 2.5) : col.groundY(nx, nz);
            if (gy - p.y < 2.2) { p.x = nx; p.z = nz; } // (a cliff it cannot climb stops it)
        }
        const gy = col.groundAt ? col.groundAt(p.x, p.z, p.y + 2.5) : col.groundY(p.x, p.z);
        p.y += (gy - p.y) * Math.min(1, dt * 6);
        col.resolveCylinder(p, 2.2 * s, p.y + 0.3, 5 * s, 1.2);
        d.rideWalk = clamp(speed / (DRAGON.WALK * d.react), 0, 1);
        d.fly = Math.max(0, d.fly - dt * 1.5);
        d.vel.set(0, 0, 0);
        // arms up: spreads its wings (not inside its lair — a cave hall is no sky — nor under a roof)
        this._armsT = ch.areBothHandsUp() ? this._armsT + dt : 0;
        if (this._armsT > 0.6 && this.active) {
            if (inLair(this.game, p)) this._say('🐉 В логове тесно — крылья не раскрыть. Выйдите на открытое место', 'lair');
            else if (col.pointBlocked(p.x, p.y + 7 * s, p.z)) this._say('🐉 Над головой потолок — крылья не раскрыть', 'roof');
            else { this.fc.start(); this.phase = 'fly'; this._armsT = 0; return; }
        }
        // crouch: get down
        this._crouchT = ch.isCrouching ? this._crouchT + dt : 0;
        if (this._crouchT > 0.35) this._dismountGround();
    }

    _fly(d, dt, ch, col, p, s, pose) {
        const g = this.game;
        const out = this.fc.update(dt, { armsUp: ch.areBothHandsUp(), torso: pose ? pose.torso : null, headPitch: g.smoothHead?.pitch || 0 });
        if (this.fc.state === 'idle') { this.phase = 'ground'; d.fly = Math.max(0, d.fly - 0.01); return; }
        // turning: the body's turn (as on a horse) and the lean (as in the hero's flight, slower: a great body)
        if (out.yawRate) {
            const r = out.yawRate * TAME.TURN_K * dt;
            if (g.settings?.drifting) g.cameraBaseRotation += r; else g.smoothBody += r;
            ch.setBodyRotation(g.settings?.drifting ? g.cameraBaseRotation : g.smoothBody);
        }
        const yaw = ch.group.rotation.y;
        d.model.rotation.y = yaw;
        d.bank = clamp(out.yawRate * 0.25, -0.4, 0.4);
        d.fly = Math.min(1, d.fly + dt * 1.5);
        d.rideWalk = 0;
        const k = Math.min(1.5, (DRAGON.FLY * TAME.FLY_K * d.react) / FLIGHT.MAX_SPEED);
        const fwd = out.forward * k, up = out.up * k;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(fwd), Math.abs(up)) * dt / 1.0));
        for (let i = 0; i < steps; i++) {
            p.x += fx * fwd * dt / steps;
            p.z += fz * fwd * dt / steps;
            p.y = Math.min(FLIGHT.CEILING + 20, p.y + up * dt / steps);
            this._keepOver(d, p, fx, fz, s, fwd, dt / steps);
        }
        d.vel.set(fx * fwd, up, fz * fwd);
        // diving into the ground lands (the hero's own rule, FlightController.touchGround)
        const under = this._floor(p.x, p.z);
        if (this.fc.touchGround(p.y - under)) this._say('🐉 Посадка', 'land');
        if (p.y < under + 0.2) p.y = under + 0.2;
    }

    /** Never through the ground, a hill, a tree, a roof, a deck: the highest thing under its body and a way ahead — it climbs over. */
    _keepOver(d, p, fx, fz, s, fwd, dt) {
        const look = Math.max(10 * s, Math.abs(fwd) * 1.1);
        let top = this._floor(p.x, p.z);
        for (let i = 1; i <= 6; i++) {
            const k = look * i / 6;
            top = Math.max(top, this._floor(p.x + fx * k, p.z + fz * k));
        }
        top = Math.max(top, this._floor(p.x - fx * 4 * s, p.z - fz * 4 * s)); // (the tail)
        const want = top + 0.8;
        if (p.y < want) {
            p.y = Math.min(want, p.y + 16 * dt); // (a climb it can make)
            if (want - p.y > 2) this.fc.speed *= Math.max(0, 1 - 2.5 * dt); // (a wall too tall for the climb: it slows, never goes through)
        }
    }

    /** The spell ended in the air: it glides down with its rider and lands. */
    _glide(d, dt, ch, col, p, s) {
        const yaw = ch.group.rotation.y;
        d.model.rotation.y = yaw;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const fwd = 8;
        p.x += fx * fwd * dt; p.z += fz * fwd * dt;
        const under = this._floor(p.x, p.z);
        p.y = Math.max(under + 0.2, p.y - TAME.GLIDE_SPEED * dt);
        d.vel.set(fx * fwd, -TAME.GLIDE_SPEED, fz * fwd);
        d.fly = 1; d.rideWalk = 0;
        if (p.y - under < 0.6) {
            const gy = col.groundAt ? col.groundAt(p.x, p.z, p.y + 2.5) : col.groundY(p.x, p.z);
            if (under - gy > 3) { p.x -= fx * 4 * dt; p.z -= fz * 4 * dt; p.y = under + 0.2; return; } // (landing on a roof / a crown: it goes on to open ground — no stopping up there)
            this._dismountGround(true);
        }
    }

    /** Down from the saddle onto the ground beside it (the hero set on the ground, not dropped). `release`: the spell is let go too. */
    _dismountGround(release = false) {
        const g = this.game, ch = g.character, col = g.collision, d = this.riding;
        if (!d) return;
        const p = d.model.position, yaw = d.model.rotation.y;
        const off = 1.9 * d.size + 2.2;
        let placed = false;
        for (const side of [1, -1]) {
            const x = p.x + Math.cos(yaw) * off * side, z = p.z - Math.sin(yaw) * off * side;
            const y = (col.groundAt ? col.groundAt(x, z, p.y + 4) : col.groundY(x, z)) + PLAYER_GROUND_OFFSET;
            if (!col.pointBlocked(x, y, z) && Math.abs(y - PLAYER_GROUND_OFFSET - p.y) < 4) { ch.group.position.set(x, y, z); placed = true; break; }
        }
        if (!placed) ch.group.position.set(p.x + Math.cos(yaw) * off, p.y + 4 + PLAYER_GROUND_OFFSET, p.z - Math.sin(yaw) * off);
        this.riding = null;
        this.phase = '';
        this.fc.reset();
        d.fly = d.fly > 0.5 && p.y - this._floor(p.x, p.z) > 1.5 ? d.fly : 0;
        if (g.authority) g.dragons.dismounted(d, this.me); else g.sync?.dragon?.({ e: 'dismount', id: d.id });
        if (release || !this.active) this._releaseHost(d);
        g.knockback?.set?.(0, 0, 0);
    }

    _releaseHost(d) {
        const g = this.game;
        if (!d) return;
        if (g.authority) g.dragons.release(d, this.me); else g.sync?.dragon?.({ e: 'release', id: d.id });
    }

    // ============================================================ let go / torn
    /**
     * The spell lets go (`why`: stop | mana | far | dead | space | attacked | thrown). → true if anything was held.
     * Seated on the ground: down from the saddle. Seated in the air: the dragon glides down and lands, then down. Torn
     * (struck it / thrown / stunned): the rider is set down gently, the dragon is its own (or angry).
     */
    stop(why = 'stop') {
        if (!this.active && !this.riding) return false;
        const g = this.game, d = this.dragon;
        this.active = false;
        const note = { mana: '🐉 Мана кончилась — заклинание отпустило дракона', far: '🐉 Дракон далеко — заклинание отпустило его', dead: '🐉 Дракон погиб', space: '🐉 Здесь нет драконов — заклинание отпущено' }[why];
        if (note) this._say(note, 'end:' + why);
        if (this.riding) {
            if (why === 'attacked' || why === 'thrown' || why === 'dead') {
                this._releaseHost(d);
                this._drop(why);
            } else this._landThenFree(d);
            return true;
        }
        this._releaseHost(d);
        this.id = null;
        return true;
    }

    _landThenFree(d) {
        if (this.phase === 'fly' || (d && d.fly > 0.5 && d.model.position.y - this._floor(d.model.position.x, d.model.position.z) > 1.5)) {
            this.phase = 'glide';
            this._say('🐉 Дракон плавно снижается и садится — вы слезете на земле', 'glide', 6000);
        } else this._dismountGround(true);
    }

    /** The host says the spell is torn (I struck it; it died): — the dragon is no longer mine. */
    onBroken(d, why) {
        if (!this.active && !this.riding) return;
        this.active = false;
        if (why === 'attacked') this._say('🐉 Вы напали на дракона — заклинание порвалось, и он снова зол на вас', 'torn', 4000);
        if (this.riding) this._drop(why || 'attacked');
        else this.id = null;
    }

    /** Down from the air gently (a slow fall, not the sky's): the dragon is already its own. */
    _drop(why) {
        const d = this.riding;
        this.riding = null;
        this.phase = '';
        this.fc.reset();
        if (d) { d.rideWalk = 0; d.fly = d.fly > 0.5 ? 1 : 0; }
        if (why === 'dead') this._say('🐉 Дракон погиб — вы плавно спускаетесь', 'dropdead', 4000);
        this.dropping = { why };
        this.id = null;
    }

    _dropStep(dt) {
        const g = this.game, ch = g.character, col = g.collision, p = ch.group.position;
        const gy = (col.groundAt ? col.groundAt(p.x, p.z, p.y) : col.groundY(p.x, p.z)) + PLAYER_GROUND_OFFSET;
        const ny = p.y - TAME.DROP_SPEED * dt;
        if (ny > gy + 0.05) { p.y = ny; return; }
        p.y = gy;
        const why = this.dropping.why;
        this.dropping = null;
        if (why !== 'dead' && g.combat?.enabled && !g.combat.dead) {
            g.combat.damage?.(TAME.HURT_DROP, null, 'fall');
            g.combat.stun?.(1.0, null, 'fall');
            ch.knockedDown = true;
        }
    }

    /** The host's word on my order «Атак». */
    onOrdered(r) {
        if (r?.say) this.game.hud.setVoice(r.say, true);
        else if (r?.ok) this.game.hud.setVoice('🐉 Дракон идёт на того, на кого уже зол. Поверните его к цели — он дохнёт, когда будет смотреть прямо на неё', true);
    }

    // ============================================================ «Атак»
    /**
     * «Атак» while the dragon is held: the one looked at (a person) — if the dragon is ALREADY angry at them, it goes for them.
     * → undefined: not for the dragon (the servants' «Атак» goes on), null: not done, 'Attack': sent.
     */
    attack(isFinal) {
        const g = this.game, d = this.dragon;
        if (!this.active || !d || d.dead) return undefined;
        const head = g.character.head.getWorldPosition(_v);
        _look.set(0, 0, -1).applyQuaternion(g.camera.quaternion);
        let best = null;
        for (const [id, r] of g.remotes || []) {
            if (!r || r.dead || !r.position) continue;
            const to = _v2.copy(r.position).sub(head);
            const dist = to.length();
            if (dist > 90) continue;
            const ang = _look.angleTo(to.normalize());
            if (ang > 0.45 && dist > 6) continue;
            if (!best || ang < best.ang) best = { id, ang };
        }
        if (!best) {
            if (isFinal) {
                const angry = g.dragons.angryAt(d, this.me);
                this._say(angry.length ? '✋ Посмотрите на того, на кого дракон зол, и скажите «Атак»' : '🐉 Дракон ни на кого не зол — а по приказу он ни на кого не нападает', 'noangry');
            }
            return null;
        }
        if (g.authority) {
            const r = g.dragons.order(d, this.me, best.id);
            if (isFinal || !r.ok) this.onOrdered(r);
            return r.ok ? 'Attack' : null;
        }
        g.sync?.dragon?.({ e: 'order', id: d.id, target: best.id });
        return 'Attack';
    }

    // ============================================================ the spells' view (tests, the codex)
    /** (tests) the reach of the dragon's fire a rider can send it with. */
    static reach(d) { return flameReach(d.flame); }
}

/** Is the point inside a dragon's lair (its hall: no flying)? */
function inLair(game, p) {
    return !!game.dragons?.lairAt?.(p, 3);
}
