/**
 * Combat.js — the «Свободный мир» rules: players fight each other with spells.
 *
 *   Health      10 HP (red bar at the top). Every spell hurts players too.
 *               At 0 HP you are out: back to the menu.
 *   Fatigue     30 points (white bar at the bottom), +1 per second. Every
 *               spell costs fatigue; without enough the spell fails.
 *   Protection  arm stretched out + «Protection»: a blue shield in front of
 *               the hand for 3 s. Spells cast straight at you bounce off it;
 *               a Bombardo blast next to you still hurts, but half as much.
 *   Protection Maxima  arms out in a T + «Protection Maxima»: a dome around
 *               the whole body for 5 s (blast damage −75 %). Shields work and are
 *               visible in every mode; HP/fatigue rules only in the free world.
 *   Freezing    the ice beam freezes players too (5 s in the beam, keep
 *               running and it breaks). A frozen player can't move or cast
 *               for 20 s — and ANY hit shatters them, whatever their HP.
 *
 * Every computer decides about its OWN player (it knows exactly where it
 * stands, where its shield points, whether it is frozen): spells are
 * replayed on every machine anyway, so a hit costs no extra network traffic.
 * Melee hits on other players are sent to them ('phit').
 */

import * as THREE from 'three';

export const PVP = {
    MAX_HP: 10,
    MAX_FATIGUE: 30,
    FATIGUE_REGEN: 1, // per second
    SHIELD_TIME: 3,
    DOME_TIME: 5,
    FREEZE_TIME: 20,
    CHILL_TIME: 5, // s in the ice beam to freeze
    INFERNO_TICK: 0.6, // s between Inferno damage ticks
};

/** Fatigue cost of each spell (stronger = more tiring). */
export const SPELL_COST = {
    Protection: 5,
    ProtectionMaxima: 20,
    Bombardo: 15,
    BombardoMaxima: 25,
    Thunderwave: 15,
    Sapira: 20,
    Inferno: 10,
    Ice: 10,
    Sands: 8,
    Flight: 10,
    Waterball: 5,
    Maxima: 4,
    WaterForming: 5,
    Frozen: 5,
    Levitation: 6,
    Stupefy: 12,
    AvadaKedavra: 25,
};

/** Damage to players (HP is 10: most spells take 2–4). */
export const PLAYER_DAMAGE = {
    Inferno: 1, // per tick while in the flames
    Thunderwave: 3,
    Sapira: 4,
    Sands: 3,
    IceBall: 3,
    Punch: 1,
    BombardoMax: 3, // at the centre of a Bombardo; × power for Bombardo Maxima
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

// Shared shield / ice-shell visuals (local and remote players)
let SHARED = null;
function shared() {
    if (SHARED) return SHARED;
    const shieldMat = new THREE.MeshBasicMaterial({ color: 0x3fa9ff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const domeMat = new THREE.MeshBasicMaterial({ color: 0x3fa9ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const gridMat = new THREE.LineBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    const iceMat = new THREE.MeshPhongMaterial({ color: 0xbfe9ff, emissive: 0x1d4a66, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.55, flatShading: true, depthWrite: false });
    SHARED = {
        disc: new THREE.CircleGeometry(1.0, 40),
        ring: new THREE.TorusGeometry(1.0, 0.04, 6, 48),
        hex: new THREE.EdgesGeometry(new THREE.CircleGeometry(0.8, 6)),
        dome: new THREE.SphereGeometry(1, 32, 20),
        domeGrid: new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1, 1)),
        shell: new THREE.IcosahedronGeometry(1, 1),
        shieldMat, ringMat, domeMat, gridMat, iceMat,
    };
    return SHARED;
}

/** Shield + ice shell meshes for one player (local or remote). */
export class CombatVisuals {
    constructor(scene) {
        const S = shared();
        this.scene = scene;
        this.hand = new THREE.Group();
        const disc = new THREE.Mesh(S.disc, S.shieldMat);
        const ring = new THREE.Mesh(S.ring, S.ringMat);
        const hex = new THREE.LineSegments(S.hex, S.gridMat);
        this.hand.add(disc, ring, hex);
        this.handRing = ring;
        this.handHex = hex;
        this.dome = new THREE.Group();
        this.dome.add(new THREE.Mesh(S.dome, S.domeMat));
        this.domeGrid = new THREE.LineSegments(S.domeGrid, S.gridMat);
        this.domeGrid.scale.setScalar(1.01);
        this.dome.add(this.domeGrid);
        this.shell = new THREE.Mesh(S.shell, S.iceMat);
        for (const o of [this.hand, this.dome, this.shell]) {
            o.visible = false;
            o.renderOrder = 4;
            scene.add(o);
        }
        this._t = 0;
    }

    /**
     * @param {number} dt
     * @param {object} st {shield: 0|1|2, shieldLeft, frozen:boolean}
     * @param {object} body {center:Vector3, hand:Vector3, dir:Vector3}
     */
    update(dt, st, body) {
        this._t += dt;
        const fade = (left, total) => Math.min(1, left / 0.35, (total - left) / 0.25 + 0.2);
        const showHand = st.shield === 1 && st.shieldLeft > 0;
        this.hand.visible = showHand;
        if (showHand) {
            const k = Math.max(0.05, fade(st.shieldLeft, PVP.SHIELD_TIME));
            this.hand.position.copy(body.hand).addScaledVector(body.dir, 0.45);
            this.hand.lookAt(_v1.copy(this.hand.position).add(body.dir));
            this.hand.scale.setScalar(1.15 * k);
            this.handRing.rotation.z = this._t * 2;
            this.handHex.rotation.z = -this._t * 1.3;
        }
        const showDome = st.shield === 2 && st.shieldLeft > 0;
        this.dome.visible = showDome;
        if (showDome) {
            const k = Math.max(0.05, fade(st.shieldLeft, PVP.DOME_TIME));
            this.dome.position.copy(body.center);
            this.dome.scale.setScalar(2.6 * k * (1 + 0.03 * Math.sin(this._t * 6)));
            this.domeGrid.rotation.set(this._t * 0.4, this._t * 0.6, 0);
        }
        this.shell.visible = !!st.frozen;
        if (st.frozen) {
            this.shell.position.copy(body.center);
            this.shell.scale.set(1.3, 2.3, 1.3);
        }
    }

    dispose() {
        for (const o of [this.hand, this.dome, this.shell]) this.scene.remove(o);
    }
}

export class Combat {
    /** @param {Game} game */
    constructor(game) {
        this.game = game;
        this.enabled = game.config.mode === 'freeworld';
        this.hp = PVP.MAX_HP;
        this.fatigue = PVP.MAX_FATIGUE;
        this.shield = null; // {type: 1 hand | 2 dome, side, left}
        this.frozenLeft = 0;
        this.frozenBy = null;
        this.chill = 0;
        this.chillTimer = 0;
        this.dead = false;
        this.infernoCooldown = 0;
        // Shields work (and are visible) in every mode; damage rules only in the free world
        this.visuals = game.scene ? new CombatVisuals(game.scene) : null;
        this.targets = new Map(); // remote id -> melee target (for weapons/fists)
        this._hudKey = '';
    }

    get frozen() {
        return this.frozenLeft > 0;
    }

    /** Stunned by «Остолбеней»: can't move or cast (no ice, hits are normal). */
    get stunned() {
        return this.stunLeft > 0;
    }

    /** Frozen or stunned: the body can't move. */
    get immobile() {
        return this.frozen || this.stunned || this.dead;
    }

    stun(seconds, byId) {
        this.stunLeft = Math.max(this.stunLeft || 0, seconds);
        this.stunBy = byId;
        if (this.game.flight?.busy) this.game.flight.land('stunned');
        if (this.game.water?.active) this.game.water.drop();
        if (this.game.levitation?.active) this.game.levitation.release(false);
    }

    // ================================================================ fatigue
    /** Can I cast this now? null = yes, otherwise a hint for the player. */
    check(name) {
        if (this.dead) return '💀';
        if (this.frozen) return `🧊 Вы заморожены — разморозка через ${Math.ceil(this.frozenLeft)} с`;
        if (this.stunned) return `💫 Вы оглушены — ещё ${Math.ceil(this.stunLeft)} с`;
        if (!this.enabled) return null;
        const cost = SPELL_COST[name] ?? 5;
        if (this.fatigue < cost) return `😮‍💨 Нет сил: нужно ${cost} усталости, есть ${Math.floor(this.fatigue)}`;
        return null;
    }

    /** Pay the fatigue of a spell that was cast. */
    pay(name) {
        if (this.enabled) this.fatigue = Math.max(0, this.fatigue - (SPELL_COST[name] ?? 5));
    }

    spend(name) {
        const hint = this.check(name);
        if (!hint) this.pay(name);
        return hint;
    }

    // ============================================================ protection
    /**
     * «Protection» (arm stretched out) / «Protection Maxima» (T-pose).
     * @returns {string|null} hint when the gesture is wrong
     */
    castProtection(maxima) {
        const ch = this.game.character;
        if (maxima) {
            if (!ch.isTPose()) return '🛡️ Для «Protection Maxima» разведите руки <b>в стороны, как буква T</b>';
            const hint = this.spend('ProtectionMaxima');
            if (hint) return hint;
            this.shield = { type: 2, side: 'right', left: PVP.DOME_TIME };
        } else {
            // The stretched-out hand; if none is fully stretched, the one reaching furthest
            let side = ch.isArmExtended('right') ? 'right' : ch.isArmExtended('left') ? 'left' : null;
            if (!side) {
                const reach = (sd) => ch.getHandWorldPosition(sd, _v1).distanceTo(ch.group.position);
                side = reach('right') >= reach('left') ? 'right' : 'left';
            }
            const hint = this.spend('Protection');
            if (hint) return hint;
            this.shield = { type: 1, side, left: PVP.SHIELD_TIME };
        }
        if (this.game.sound) this.game.sound.playIce?.();
        return null;
    }

    /** Does my shield stop something coming from `from`? 1 = fully, 0 = no. */
    shieldFactor(from) {
        const s = this.shield;
        if (!s || s.left <= 0) return 0;
        if (s.type === 2) return 1;
        const ch = this.game.character;
        const hand = ch.getHandWorldPosition(s.side, _v1);
        const dir = ch.getHandDirection(s.side, _v2);
        const toAttacker = _v3.subVectors(from, hand).normalize();
        return dir.dot(toAttacker) > 0.25 ? 1 : 0;
    }

    _blocked(from) {
        const c = this.center(_v1);
        const fx = this.game.fx;
        const at = this.shield.type === 2 ? c.addScaledVector(_v2.subVectors(from, c).normalize(), 2.4) : this.game.character.getHandWorldPosition(this.shield.side, _v1);
        for (let i = 0; i < 25; i++) fx.spark(at, i % 2 ? 0x9fd8ff : 0xffffff, 0.15, _v3.set((Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8), 0.4);
        fx.lightFlash(at, 0x6fc3ff, 2, 0.2, 15);
        this.game.hud.setVoice('🛡️ Щит отразил заклинание!', true);
        if (this.game.sound) this.game.sound.playFrozenHit?.();
    }

    // ============================================================== incoming
    /** Body centre of my player. */
    center(out = new THREE.Vector3()) {
        return out.copy(this.game.character.group.position).add(_v3.set(0, 0.6, 0));
    }

    /**
     * A spell hits me. kind: Inferno | Thunderwave | Sapira | Sands | IceBall
     * @returns {boolean} false when the shield stopped it
     */
    hitBySpell(kind, from, byId, push = null) {
        if (!this.enabled || this.dead) return false;
        if (this.shieldFactor(from) >= 1) { this._blocked(from); return false; }
        if (kind === 'Inferno') {
            if (this.infernoCooldown > 0) return true;
            this.infernoCooldown = PVP.INFERNO_TICK;
        }
        if (push) this.game.knockback.add(push);
        this.damage(PLAYER_DAMAGE[kind] ?? 2, byId, kind);
        return true;
    }

    /**
     * The ice beam is on me.
     * @returns {boolean} false when blocked (the beam breaks)
     */
    chillBy(amount, from, byId) {
        if (!this.enabled || this.dead) return false;
        if (this.shieldFactor(from) >= 1) { this._blocked(from); return false; }
        if (this.frozen) return true;
        this.chill = Math.min(1, this.chill + amount);
        this.chillTimer = 0.4;
        if (this.chill >= 1) this.freeze(byId);
        return true;
    }

    freeze(byId) {
        this.chill = 0;
        this.frozenLeft = PVP.FREEZE_TIME;
        this.frozenBy = byId;
        this.shield = null;
        if (this.game.flight?.busy) this.game.flight.land('frozen');
        if (this.game.water?.active) this.game.water.drop();
        if (this.game.sound) this.game.sound.playIce?.();
    }

    /** Bombardo next to me: damage by distance, the shield takes part of it. */
    explosion(pos, radius, power, byId) {
        if (!this.enabled || this.dead) return;
        if (byId && byId === this.game.localId) return; // your own blast doesn't hurt you
        const reach = radius + 3;
        const d = this.center(_v1).distanceTo(pos);
        if (d > reach) return;
        let dmg = PLAYER_DAMAGE.BombardoMax * power * (1 - d / reach);
        const s = this.shield;
        if (s && s.left > 0) {
            if (s.type === 2) dmg *= 0.25;
            else if (this.shieldFactor(pos) >= 1) dmg *= 0.5;
        }
        dmg = Math.round(dmg);
        if (dmg > 0) this.damage(dmg, byId, 'Bombardo');
    }

    /** Someone hit me with a fist or a weapon. A frozen player shatters. */
    meleeHit(dmg, byId) {
        if (!this.enabled || this.dead) return;
        if (this.frozen) { this.die(byId, 'shatter'); return; }
        this.damage(dmg, byId, 'melee');
    }

    damage(amount, byId, kind) {
        if (this.dead) return;
        // Any hit on a frozen player shatters them, whatever their HP
        if (this.frozen && kind !== 'Inferno') { this.die(byId, 'shatter'); return; }
        this.hp = Math.max(0, this.hp - amount);
        this.game.hud.damageFlash();
        if (this.game.sound) this.game.sound.playHit();
        if (this.hp <= 0) this.die(byId, kind);
    }

    die(byId, how) {
        if (this.dead) return;
        this.dead = true;
        this.hp = 0;
        const name = byId ? this.game.playerName(byId) : null;
        const text = how === 'avada'
            ? `💚 Авада Кедавра. ${name ? `Вас победил ${name}` : 'Вы погибли'}`
            : how === 'shatter'
            ? `🧊💥 ${name ? `${name} разбил вас` : 'Вас разбили'}, пока вы были заморожены`
            : `💀 ${name ? `Вас победил ${name}` : 'Вы погибли'}`;
        if (how === 'shatter') {
            const c = this.center(_v1);
            for (let i = 0; i < 60; i++) this.game.fx.spark(c, 0xd6f3ff, 0.25, _v2.set((Math.random() - 0.5) * 12, Math.random() * 8, (Math.random() - 0.5) * 12), 1.0);
        }
        this.game.onLocalDeath(text, byId);
    }

    // ================================================================ update
    update(dt) {
        if (this.stunLeft > 0) {
            this.stunLeft = Math.max(0, this.stunLeft - dt);
            this.game.hud.setStatus(this.stunLeft > 0 ? `💫 Остолбеней! Вы не можете двигаться ещё <b>${Math.ceil(this.stunLeft)}</b> с` : '');
        }
        if (!this.enabled) {
            // Other modes: only the shield (no HP / fatigue rules)
            if (this.shield) { this.shield.left -= dt; if (this.shield.left <= 0) this.shield = null; }
            this._updateVisuals(dt);
            return;
        }
        if (!this.dead) this.fatigue = Math.min(PVP.MAX_FATIGUE, this.fatigue + PVP.FATIGUE_REGEN * dt);
        if (this.shield) { this.shield.left -= dt; if (this.shield.left <= 0) this.shield = null; }
        if (this.frozenLeft > 0) {
            this.frozenLeft = Math.max(0, this.frozenLeft - dt);
            if (this.frozenLeft === 0) this.game.hud.setVoice('🧊 Вы разморозились', true);
        }
        this.chillTimer -= dt;
        if (this.chillTimer <= 0 && this.chill > 0) this.chill = Math.max(0, this.chill - dt * 0.3);
        this.infernoCooldown -= dt;
        for (const t of this.targets.values()) t.damageCooldown -= dt;

        this._updateVisuals(dt);
        this._hud();
    }

    /** My own shield / ice shell. */
    _updateVisuals(dt) {
        if (!this.visuals) return;
        const ch = this.game.character;
        const side = this.shield?.side || 'right';
        this.visuals.update(dt, this.state(), {
            center: this.center(_v1).clone(),
            hand: ch.getHandWorldPosition(side, new THREE.Vector3()),
            dir: ch.getHandDirection(side, new THREE.Vector3()),
        });
    }

    _hud() {
        const hud = this.game.hud;
        const key = `${this.hp}|${Math.floor(this.fatigue)}|${Math.ceil(this.frozenLeft)}|${Math.round(this.chill * 10)}|${Math.ceil(this.stunLeft || 0)}`;
        if (key === this._hudKey) return;
        this._hudKey = key;
        hud.update(this.hp, PVP.MAX_HP, this.game.killCount, this.game.punchCount);
        hud.setFatigue(this.fatigue, PVP.MAX_FATIGUE);
        if (this.stunned) return; // the stun message is shown by update()
        hud.setStatus(this.frozen
            ? `🧊 Вас заморозили! Разморозка через <b>${Math.ceil(this.frozenLeft)}</b> с. Любой удар сейчас смертелен`
            : this.chill > 0.05 ? `❄️ Вас замораживают: ${Math.round(this.chill * 100)}% — убегайте из луча!` : '');
        hud.setFrozenOverlay(this.frozen ? 1 : this.chill);
    }

    /** Sent to other players with the pose (shield and ice shell are visible to all). */
    state() {
        return {
            shield: this.shield ? this.shield.type : 0,
            side: this.shield ? this.shield.side : 'right',
            shieldLeft: this.shield ? this.shield.left : 0,
            frozen: this.frozen,
        };
    }

    serialize() {
        if (!this.enabled && !this.shield) return null;
        const s = this.shield;
        return [s ? s.type : 0, s && s.side === 'left' ? 1 : 0, s ? Math.round(s.left * 10) / 10 : 0, Math.ceil(this.frozenLeft)];
    }

    // ============================================================ melee out
    /** Fake "zombie" objects for remote players so weapons can hit them. */
    meleeTargets() {
        if (!this.enabled) return [];
        const out = [];
        for (const [id, r] of this.game.remotes) {
            if (r.dead) continue;
            let t = this.targets.get(id);
            if (!t) {
                t = { isPlayer: true, id, isDead: false, damageCooldown: 0, group: r.character.group };
                this.targets.set(id, t);
            }
            t.group = r.character.group;
            out.push(t);
        }
        return out;
    }

    /** My fist or weapon hit another player. */
    hitRemote(target, dmg) {
        if (target.damageCooldown > 0) return;
        target.damageCooldown = 0.45;
        if (this.game.sync) this.game.sync.playerHit(target.id, dmg);
        const p = _v1.copy(target.group.position).add(_v2.set(0, 1.2, 0));
        for (let i = 0; i < 8; i++) this.game.fx.spark(p, 0xff3030, 0.15, _v2.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.4);
        if (this.game.sound) this.game.sound.playHit();
    }

    /** Fists against other players (no weapon in hand). */
    updatePunches(isPunching) {
        if (!this.enabled || !isPunching || this.game.weapons.hasWeapon() || this.frozen || this.dead) return;
        const me = this.game.character.group.position;
        for (const t of this.meleeTargets()) {
            const p = t.group.position;
            if (Math.hypot(p.x - me.x, p.z - me.z) < 2.6 && Math.abs(p.y - me.y) < 2) this.hitRemote(t, PLAYER_DAMAGE.Punch);
        }
    }

    dispose() {
        this.visuals?.dispose();
    }
}
