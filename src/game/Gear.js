/**
 * Gear.js — shields, the bow, Thor's hammer and the weather.
 *
 * Shield (in a hand, held in front): spells and blows from the front stop
 * on it. A plain shield breaks under a strong spell (it still stops that
 * one); a magic shield has its own strength (20–50, comes back by itself)
 * and breaks only when it is nearly spent and a strong spell hits.
 *
 * Bow (in one hand): reach over the shoulder behind your back with the
 * other hand — an arrow appears in it (from the quiver); bring it to the
 * bow, pull the hand back (the further, the stronger), then let go — a quick
 * move of the hand forward. The arrow flies along the bow.
 *
 * Thor's hammer: only in a thunderstorm. Raise it above the head — lightning
 * strikes it; then aim it at a creature for up to 5 s (like «Lightning
 * Strike», but it never hurts you). 7 strength. A success can be repeated
 * up to 3 times per storm; a miss loses the charge until the next storm.
 *
 * Weather: every 5 minutes there is a 17% chance of a thunderstorm (2–3
 * minutes of rain and dark clouds). The host decides; everybody sees it.
 */

import * as THREE from 'three';
import { arrowModel, disposeModel } from './ItemTypes.js';
import { SPELL_COST } from './Combat.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const STRONG = 15; // spells costing this much break a plain shield

export class Gear {
    constructor(game) {
        this.game = game;
        this.arrows = []; // flying / stuck arrows
        this.nock = null; // {side, model, state: 'hand'|'nocked', draw}
        this.shieldPower = new Map(); // shield uid -> current strength (magic ones)
        this._weatherT = 0;
        this.hammer = { uses: 0, failed: false, storm: 0 };
    }

    // ================================================================ shields
    _heldShield() {
        return this.game.items?.heldOf('shield') || null;
    }

    /** Does my held shield face `from`? (spells / blows from the front) */
    shieldFaces(from) {
        const s = this._heldShield();
        if (!s) return false;
        const ch = this.game.character;
        const c = ch.group.position;
        const fwd = _v.set(-Math.sin(ch.group.rotation.y), 0, -Math.cos(ch.group.rotation.y));
        const to = _v2.subVectors(from, c).setY(0).normalize();
        return fwd.dot(to) > 0.3;
    }

    /** A spell (or a blow) stopped on the shield: it wears it (and may break it). */
    shieldTook(kind) {
        const s = this._heldShield();
        if (!s) return;
        const g = this.game;
        const cost = SPELL_COST[kind] ?? (kind === 'melee' ? 2 : 8);
        const it = s.item;
        let broken = false;
        if (it.magic) {
            const left = this.shieldPower.get(it.uid) ?? it.max;
            if (left < 5 && cost >= STRONG) broken = true;
            this.shieldPower.set(it.uid, Math.max(0, left - cost));
        } else if (cost >= STRONG) broken = true;
        const p = s.model.position;
        for (let i = 0; i < 18; i++) g.fx.spark(p, it.magic ? 0x9fd8ff : 0xffe0a0, 0.1, _v.set((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6), 0.5);
        if (broken) {
            g.items.releaseHand(s.side);
            for (let i = 0; i < 30; i++) g.fx.spark(p, 0x8b5a2b, 0.18, _v.set((Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8), 0.9);
            g.hud.setVoice('💥 Щит разбит!', true);
        } else g.hud.setVoice(it.magic ? `🛡️ Щит выдержал (сила ${Math.round(this.shieldPower.get(it.uid))})` : '🛡️ Щит выдержал', true);
    }

    // =================================================================== bow
    /** Creative: the quiver never runs out. */
    _endless() { return this.game.config.mode === 'creative'; }

    _updateBow(dt) {
        const g = this.game;
        const ch = g.character;
        const bow = g.items.heldOf('bow');
        if (!bow) { this._dropNock(); return; }
        const other = bow.side === 'right' ? 'left' : 'right';
        const held = g.items.held[bow.side];
        if (g.items.held[other] || g.weapons.hands[other].held) { this._dropNock(); if (held) held.aim = null; return; }
        const it = bow.item;
        ch.group.updateMatrixWorld(true);
        _inv.copy(ch.group.matrixWorld).invert();
        const hand = ch.getHandWorldPosition(other, new THREE.Vector3());
        const local = hand.clone().applyMatrix4(_inv);
        const bowPos = bow.model.position;
        const has = this._endless() || it.arrows > 0;
        // 1) an arrow: from the quiver (the hand over the shoulder) or simply by
        //    bringing the other hand to the bow — it is on the string at once
        if (!this.nock) {
            if (held) held.aim = null;
            const quiver = local.y > 0.9 && local.z > 0.1;
            const atBow = hand.distanceTo(bowPos) < 1.0;
            if (quiver || atBow) {
                if (!has) { if (!this._noArrowsSaid) { this._noArrowsSaid = true; g.hud.setVoice('🏹 Стрел больше нет — найдите стрелы', true); } return; }
                this._noArrowsSaid = false;
                const model = arrowModel();
                g.scene.add(model);
                this.nock = { side: other, model, state: atBow ? 'nocked' : 'hand', draw: 0, peak: 0, open: 0, t: 0 };
                g.hud.setVoice(atBow ? '🏹 Стрела на тетиве — отведите руку назад и отпустите' : '🏹 Стрела в руке — поднесите её к луку', true);
            }
            this._bowString(bow, 0);
            return;
        }
        const n = this.nock;
        n.t += dt;
        if (n.state === 'hand') {
            n.model.position.copy(hand);
            n.model.quaternion.setFromUnitVectors(_v.set(0, 1, 0), _v2.subVectors(bowPos, hand).normalize());
            if (hand.distanceTo(bowPos) < 1.0) { n.state = 'nocked'; n.t = 0; g.hud.setVoice('🏹 Натяните тетиву — отведите руку назад, потом отпустите', true); }
            return;
        }
        // 2) drawn: the further the hand from the bow, the stronger (an arm's length — full)
        const dist = hand.distanceTo(bowPos);
        n.draw = Math.max(0, Math.min(1, (dist - 0.6) / 1.3));
        n.peak = Math.max(n.peak * 0.985, n.draw);
        const dir = _v3.subVectors(bowPos, hand).normalize();
        // the bow turns to where the arrow goes; the arrow lies on it, its nock at the string
        if (held) held.aim = dir.clone();
        n.model.position.copy(bowPos).addScaledVector(dir, 1.0 - Math.min(dist, 2.2) * 0.5 + 0.2);
        n.model.quaternion.setFromUnitVectors(_v.set(0, 1, 0), dir);
        this._bowString(bow, n.draw);
        // 3) let go: the fingers open, or the hand jumps forward, or the draw collapses fast
        const curl = ch.getGripCurl ? ch.getGripCurl(other) : 1;
        if (curl > 0.55) n.closed = true; // (the fingers held the string)
        n.open = n.closed && curl < 0.3 ? n.open + dt : 0;
        const v = ch.handVelocity[other];
        if (n.peak > 0.25 && n.t > 0.25 && (n.open > 0.1 || v.dot(dir) > 4 || n.draw < n.peak - 0.4)) {
            this._shoot(bow, n.peak, dir.clone());
            if (held) held.aim = null;
            return;
        }
    }

    _bowString(bow, draw) {
        const s = bow.model.userData.string;
        if (s) s.position.x = (Math.cos(0.9) * 0.6 * 0.35 - 0.6 * 0.35) - draw * 0.35;
    }

    _dropNock() {
        if (!this.nock) return;
        this.game.scene.remove(this.nock.model);
        disposeModel(this.nock.model);
        this.nock = null;
    }

    _shoot(bow, draw, dir) {
        const g = this.game;
        const it = bow.item;
        // from the bow, a little in front of it
        const from = bow.model.position.clone().addScaledVector(dir, 0.8);
        this._dropNock();
        if (!this._endless()) it.arrows = Math.max(0, (it.arrows || 0) - 1);
        const speed = 22 + draw * 58;
        const dmg = (2 + draw * 7) * (it.magic ? 1 + (it.bonus || 0) / 100 : 1);
        this.fire(from, dir.multiplyScalar(speed), dmg, g.localId);
        if (g.sync) g.sync.arrow?.(from, dir, dmg);
        g.sound?.playWhoosh?.();
        g.hud.setVoice(`🏹 Выстрел! (сила ${Math.round(draw * 100)}%${this._endless() ? '' : `, стрел: ${it.arrows}`})`, true);
    }

    /** An arrow flies (on every machine; the host hurts zombies, everybody hurts only himself). */
    fire(from, vel, dmg, by) {
        const model = arrowModel();
        model.position.copy(from);
        this.game.scene.add(model);
        this.arrows.push({ model, vel: vel.clone(), dmg, by, life: 30, stuck: false, hit: new Set() });
    }

    _updateArrows(dt) {
        const g = this.game;
        for (let i = this.arrows.length - 1; i >= 0; i--) {
            const a = this.arrows[i];
            a.life -= dt;
            if (a.life <= 0) { g.scene.remove(a.model); disposeModel(a.model); this.arrows.splice(i, 1); continue; }
            if (a.stuck) continue;
            const p = a.model.position;
            a.vel.y -= 9.8 * dt;
            const steps = Math.max(1, Math.ceil(a.vel.length() * dt / 0.4));
            for (let s = 0; s < steps && !a.stuck; s++) {
                p.addScaledVector(a.vel, dt / steps);
                // creatures
                if (g.authority) {
                    for (const z of g.zombies) {
                        if (z.isDead || a.hit.has(z)) continue;
                        if (_v.copy(z.group.position).add(_v2.set(0, 0.6, 0)).distanceTo(p) < 0.9) {
                            a.hit.add(z);
                            g.damageZombie(z, a.dmg, true, a.vel.clone().normalize(), a.by);
                            this._stick(a, z.group);
                        }
                    }
                }
                if (g.authority) for (const sp of g.spiders?.targets() || []) {
                    if (a.hit.has(sp) || _v.copy(sp.model.position).add(_v2.set(0, 2.5, 0)).distanceTo(p) > 2.8) continue;
                    a.hit.add(sp);
                    g.spiders.hit(sp, a.dmg, 'arrow');
                    this._stick(a, sp.model);
                }
                if (g.authority) for (const bd of g.books?.birds?.values() || []) {
                    if (bd.state === 'fall' || a.hit.has(bd) || bd.model.position.distanceTo(p) > 1.2) continue;
                    a.hit.add(bd);
                    g.books.hitBird(bd, 2);
                }
                for (const an of g.animals?.targets() || []) {
                    if (a.hit.has(an)) continue;
                    if (_v.copy(an.group.position).add(_v2.set(0, 0.9, 0)).distanceTo(p) < 1.0) { a.hit.add(an); if (a.by === g.localId) g.animals.hit(an, a.dmg, a.vel.clone(), a.by); this._stick(a, an.group); }
                }
                if (a.by !== g.localId && !g.combat.dead && g.combat.center(_v).distanceTo(p) < 1.0 && !a.hit.has('me')) {
                    a.hit.add('me');
                    const from = _v2.copy(p).addScaledVector(a.vel, -0.1);
                    if (this.shieldFaces(from)) { this.shieldTook('melee'); a.stuck = true; continue; }
                    if (g.combat.enabled) g.combat.damage(Math.round(a.dmg), a.by, 'arrow');
                    else g.damageLocalPlayer(Math.round(a.dmg));
                    this._stick(a, g.character.group);
                }
                // the ground / walls
                if (g.collision.pointBlocked(p.x, p.y, p.z)) { a.stuck = true; a.life = Math.min(a.life, 12); }
            }
            if (!a.stuck) a.model.quaternion.setFromUnitVectors(_v.set(0, 1, 0), _v2.copy(a.vel).normalize());
        }
    }

    _stick(a, group) {
        a.stuck = true;
        a.life = Math.min(a.life, 8);
        group.attach(a.model);
    }

    // ================================================================ hammer
    _updateHammer(dt) {
        const g = this.game;
        const hm = g.items.heldOf('hammer');
        const storm = g.storm?.k > 0.5;
        if (!storm) { if (this.hammer.storm) this.hammer = { uses: 0, failed: false, storm: 0 }; return; }
        this.hammer.storm = 1;
        if (!hm || g.lightning || this.hammer.failed || this.hammer.uses >= 3) return;
        const ch = g.character;
        const head = ch.head.getWorldPosition(_v);
        if (hm.model.position.y < head.y + 0.3) return; // raise it above the head
        const tired = g.combat.check('Hammer');
        if (tired) { g.hud.setVoice(tired, true); return; }
        g.combat.pay('Hammer');
        // lightning strikes the hammer: aim it within 5 s
        g.spells.cast('LightningHold', ch.group.position, _v2.set(0, 1, 0), hm.side, g.localId);
        if (g.sync) g.sync.spell('LightningHold', ch.group.position, _v2.set(0, 1, 0), hm.side);
        g.fx.lightFlash(hm.model.position, 0xdde8ff, 6, 0.3, 40);
        g.lightning = { phase: 'hold', t: 0, aimT: 0, aim: null, side: hm.side, hammer: true };
        g.hud.setVoice('⚡🔨 Молния в молоте! Наведите его на цель (5 секунд)', true);
    }

    /** (from Game) the hammer's lightning hit / missed. */
    hammerResult(ok) {
        if (ok) this.hammer.uses++;
        else this.hammer.failed = true;
        const g = this.game;
        if (!ok) g.hud.setVoice('🔨 Молния ушла в землю — молот зарядится только в следующую грозу', true);
        else if (this.hammer.uses < 3) g.hud.setVoice(`🔨 Ещё ${3 - this.hammer.uses} раз(а) в эту грозу`, true);
    }

    // =============================================================== weather
    _updateWeather(dt) {
        const g = this.game;
        if (!g.authority || g.config.map || g.config.mode === 'test' || !g.dayCycle) return;
        this._weatherT += dt;
        if (this._weatherT < 300) return;
        this._weatherT = 0;
        if (Math.random() >= 0.17) return;
        const seconds = 120 + Math.random() * 60;
        this.startWeather(seconds);
        if (g.sync) g.sync.weather?.(seconds);
    }

    startWeather(seconds) {
        const g = this.game;
        g.storm?.start(null, seconds);
        g.hud.notify?.('⛈️ Начинается гроза');
    }

    // ================================================================= frame
    update(dt) {
        const g = this.game;
        // magic shields recover their strength
        for (const [uid, v] of this.shieldPower) {
            const s = this._heldShield();
            const max = s && s.item.uid === uid ? s.item.max : 50;
            this.shieldPower.set(uid, Math.min(max, v + dt));
        }
        const s = this._heldShield();
        if (s?.model.userData.halo) s.model.userData.halo.material.opacity = 0.3 + 0.5 * ((this.shieldPower.get(s.item.uid) ?? s.item.max) / s.item.max);
        if (g.currentPose && !g.combat.dead) {
            this._updateBow(dt);
            this._updateHammer(dt);
        }
        this._updateArrows(dt);
        this._updateWeather(dt);
    }

    dispose() {
        this._dropNock();
        for (const a of this.arrows) { a.model.parent?.remove(a.model); disposeModel(a.model); }
        this.arrows.length = 0;
    }
}
