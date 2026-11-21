/** Keyboard and mouse control of a single, real arena fighter. */
import * as THREE from 'three';
import { BODIES } from './ImperiusBodies.js';
import { BRAWL, masterOfTeam, TEAMS } from './BrawlRules.js';
import { SPELL_COST } from './SpellCosts.js';
import { NPC_COST } from './WizardAI.js';
import { PVP } from './Combat.js';
import { FX } from '../fx/WizardFx.js';
import { duelRange, emptyRange } from './DuelRange.js';
import { SHARDS } from './ElementalRules.js';
import { elementK } from './HeroElement.js';
import { tickSlow } from './Slow.js';

const CASTS = {
    wizard: [['Jolt', 'Джолт'], ['Stupefy', 'Оглушение'], ['Bombardo', 'Бомбарда'], ['Protection', 'Протекшн']],
    earth: [['Earthquake', 'Землетрясение'], ['EarthquakeMaxima', 'Землетрясение Максима'], ['EarthDust', 'Земляная завеса']],
    water: [['IceDuel', 'Заморозка'], ['IceShards', 'Ледяные осколки'], ['Protection', 'Водяной щит']],
    fire: [['Fireball', 'Огненный шар'], ['Bombardo', 'Бомбарда'], ['Inferno', 'Инферно'], ['BombardoMaxima', 'Бомбарда Максима']],
    air: [['Wind', 'Ветер'], ['WindMaxima', 'Ветер Максима'], ['WindImpulse', 'Импульс ветра'], ['WindImpulseMaxima', 'Импульс Максима']],
};
const BOLTS = new Set(['Jolt', 'Stupefy', 'IceDuel']);
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _box = new THREE.Box3();
const _p = new THREE.Vector3(), _hit = new THREE.Vector3(), _aim = new THREE.Vector3();
const _eye = new THREE.Vector3(), _back = new THREE.Vector3(), _origin = new THREE.Vector3();
const _shoulder = new THREE.Vector3(), _target = new THREE.Vector3();
const _face = new THREE.Euler(0, 0, 0, 'YXZ');

export class BrawlControl {
    constructor(brawl) {
        this.brawl = brawl;
        this.game = brawl.game;
        this.entry = null;
        this.body = null;
        this.input = { yaw: 0, walk: 0, run: false, jump: false, strike: false };
        this.seq = 0;
    }

    take(entry) {
        if (!entry) return false;
        if (this.entry === entry) return true;
        const body = this.game.servants?.find(entry.k, entry.id);
        if (!body || this.brawl.state === 'over' || this.brawl.roster.get(entry.k + ':' + entry.id) !== entry) return false;
        if (this.brawl.state === 'countdown' && this.entry?.team !== entry.team) return false;
        this.release(false);
        this.entry = entry;
        this.body = body;
        body.brawlManual = true;
        body.foe = null;
        body.prep = null;
        this.castIndex = 0;
        this.attackHeld = false;
        this.attackQueued = false;
        this.strikeCd = 0;
        const cam = this.game.spectator;
        if (cam) {
            cam.yaw = BODIES[entry.k].face(body);
            cam.pitch = -.16;
            cam.keys.clear();
        }
        this.brawl._changed();
        return true;
    }

    release(notify = true) {
        const entry = this.entry;
        if (!entry) return;
        const b = this.body;
        const cam = this.game.spectator;
        if (cam && this.game.camera) cam.pos.copy(this.game.camera.position);
        cam?.keys.clear();
        b.brawlManual = false;
        b.prep = null;
        if (!BODIES[entry.k].dead(b)) BODIES[entry.k].release(this.game, b);
        this.entry = null;
        this.body = null;
        this.attackHeld = false;
        this.attackQueued = false;
        if (notify) this.brawl._changed();
    }

    pressAttack() { this.attackHeld = true; this.attackQueued = true; }

    abilities() {
        if (!this.body?.wizard) return [];
        return CASTS[this.entry.def.elemental || 'wizard'];
    }

    select(i) {
        if (!this.abilities()[i] || this.castIndex === i) return;
        this.castIndex = i;
        this.brawl._changed();
    }

    cost(name) {
        if (name === 'Protection') return NPC_COST.Protection;
        const base = name === 'IceShards' ? SHARDS.COST : (SPELL_COST[name] ?? NPC_COST[name] ?? 10);
        return base * elementK(this.entry?.def.elemental, name);
    }

    stats() {
        const e = this.entry, b = this.body;
        if (!e) return null;
        const hp = e.k === 'z' ? b.health : b.hp;
        const maxHp = e.k === 'z' ? b.maxHealth || 5 : b.maxHp || b.baseHp || hp;
        return { hp, maxHp, mana: b.mana, maxMana: b.maxMana };
    }

    /** In spectator view a click prioritizes the nearest living body over the ground. */
    pick(clientX, clientY, rect, camera) {
        _ndc.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2);
        _ray.setFromCamera(_ndc, camera);
        return this._rayFighter();
    }

    _rayFighter(point = null) {
        let best = null, bestDist = Infinity;
        for (const e of this.brawl.roster.values()) {
            const b = this.game.servants.find(e.k, e.id);
            if (!b || e === this.entry || b.group?.visible === false) continue;
            const D = BODIES[e.k], p = D.pos(b, _p), h = D.size(b);
            const w = e.k === 'a' ? (e.type === 'horse' ? 1.35 : .9) : .62;
            _box.min.set(p.x - w, p.y + .1, p.z - w);
            _box.max.set(p.x + w, p.y + h + .18, p.z + w);
            if (!_ray.ray.intersectBox(_box, _hit)) continue;
            const d = _hit.distanceToSquared(_ray.ray.origin);
            if (d < bestDist) {
                best = e; bestDist = d;
                if (point) point.copy(_hit);
            }
        }
        return best;
    }

    step(kind, b, dt) {
        const e = this.entry;
        if (!e || e.k !== kind || b !== this.body || BODIES[kind].dead(b)) return false;
        const g = this.game, cam = g.spectator, keys = cam.keys;
        const fw = +keys.has('KeyW') - +keys.has('KeyS'), side = +keys.has('KeyD') - +keys.has('KeyA');
        const fight = this.brawl.state === 'fight';
        const blocked = b.lev || b.carriedBy || b.stunT > 0 || b.flinchT > 0 || (kind === 'z' && (b.isFrozen || b.isStunned)) || (kind !== 'a' && b.vy);
        const I = this.input;
        I.yaw = cam.yaw + (fw || side ? Math.atan2(-side, fw) : 0);
        I.walk = !blocked && (fw || side) ? 1 : 0;
        I.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
        I.jump = !blocked && keys.has('Space');
        const magic = b.wizard && (!b.noWand || !!e.def.elemental);
        const attack = this.attackHeld || this.attackQueued;
        this.attackQueued = false;
        I.strike = fight && !blocked && !magic && attack;
        this.strikeCd = Math.max(0, this.strikeCd - dt);
        if (kind === 'v' && (!blocked || b.lev || b.carriedBy)) {
            b.damageCooldown -= dt;
            b.sayT -= dt;
            tickSlow(b, dt);
        }
        if (b.wizard && (b.savior == null || !blocked)) this._manaFrame(b, dt);
        if (b.lev || b.carriedBy) return true;
        const D = BODIES[kind];
        const oldX = D.pos(b, _p).x;
        if (kind === 'v' && !blocked && !b.fly && keys.has('KeyE') && (e.def.elemental === 'air' || e.def.savior)) {
            const fare = this.cost('Flight');
            if (b.mana >= fare) { b.mana -= fare; b.fly = true; }
        }
        if (kind === 'v' && b.fly && !blocked) {
            this._fly(b, dt, keys);
        } else D.drive(g, b, I, dt);
        if (!fight && this.brawl.state !== 'over') this._stayOnSide(e, b, oldX);
        if (fight && !blocked && magic && attack && !this.strikeCd) this.cast(b, this.abilities()[this.castIndex][0]);
        if (b.castT > 0 && magic && !blocked) b.mode = 'cast';
        else if (!blocked && b.fx & FX.SHIELD && !(b.speed > 0)) b.mode = 'shield';
        if (kind !== 'v') this.landed(kind, b);
        return true;
    }

    _manaFrame(b, dt) {
        const regen = b.savior != null ? 0 : (b.W?.regen ?? 1);
        b.castT = Math.max(0, (b.castT || 0) - dt);
        b.shieldT = Math.max(0, (b.shieldT || 0) - dt);
        b.domeT = Math.max(0, (b.domeT || 0) - dt);
        if (!b.shieldT) b.fx &= ~FX.SHIELD;
        if (!b.domeT) b.fx &= ~FX.DOME;
        const drain = (b.fx & FX.SHIELD ? PVP.SHIELD_DRAIN : 0) + (b.fx & FX.DOME ? PVP.DOME_DRAIN : 0);
        b.mana = Math.max(0, Math.min(b.maxMana, b.mana + (regen - drain) * dt));
        if (!b.mana) b.fx &= ~(FX.SHIELD | FX.DOME);
    }

    _fly(b, dt, keys) {
        const I = this.input;
        b.yaw = I.yaw;
        b.speed = I.walk * (I.run ? 10 : 6);
        const x = b.x - Math.sin(I.yaw) * b.speed * dt, z = b.z - Math.cos(I.yaw) * b.speed * dt;
        const cx = this.game.collision, floor = this.brawl.groundAt(b.x, b.z);
        const dy = +keys.has('KeyE') - +keys.has('KeyC');
        const y = Math.max(floor, Math.min(floor + 14, b.y + dy * 5 * dt));
        if (!cx?.lineOfSight || cx.lineOfSight(b.x, b.y + 1.8, b.z, x, y + 1.8, z, .4)) {
            b.x = x; b.y = y; b.z = z;
        }
        b.mana = Math.max(0, b.mana - 3 * dt);
        if (b.mana <= 0 || (dy < 0 && b.y <= floor + .12)) {
            b.fly = false;
            if (b.y > floor + .15) b.vy = -.1;
        }
        b.mode = b.element === 'air' ? 'airFlight' : 'soar';
    }

    _stayOnSide(e, b, oldX) {
        const p = e.k === 'v' ? b : b.group.position;
        const sign = e.team === 'A' ? -1 : 1;
        // Account for the creature's body, keeping it on its side of the centre glass.
        if (p.x * sign < 1.35) p.x = (oldX * sign < 1.35 ? 1.35 * sign : oldX);
    }

    landed(k, b) {
        const e = this.entry;
        if (!e || e.k !== k || this.body !== b || this.brawl.state !== 'fight') return;
        const D = BODIES[k], hit = D.struck(this.game, b);
        if (!hit) return;
        if (k === 'v') b.model.strikeNow = false;
        const p = D.pos(b, _eye), yaw = D.face(b);
        let target = null, dist = hit.reach;
        for (const f of this.brawl.roster.values()) {
            if (f.team === e.team) continue;
            const other = this.game.servants.find(f.k, f.id);
            if (!other) continue;
            const at = BODIES[f.k].pos(other, _p);
            const dx = at.x - p.x, dz = at.z - p.z, d = Math.hypot(dx, dz);
            if (d > dist || Math.abs(at.y - p.y) > 3 || (d > .4 && -Math.sin(yaw) * dx - Math.cos(yaw) * dz < d * .5)) continue;
            if (this.game.collision?.lineOfSight?.(p.x, p.y + 1, p.z, at.x, at.y + 1, at.z, .35) === false) continue;
            target = f; dist = d; _aim.set(dx, 0, dz).normalize();
        }
        if (target) this.game.servants.damage(target, hit.dmg, _aim, masterOfTeam(e.team), 'servant', p);
    }

    cast(b, name) {
        if (this.body !== b || this.brawl.state !== 'fight') return false;
        const g = this.game, cost = this.cost(name);
        this.strikeCd = .28;
        if (name === 'Protection' && b.fx & FX.SHIELD) {
            this.attackHeld = false;
            b.fx &= ~FX.SHIELD; b.shieldT = 0; return true;
        }
        if (b.mana < cost) { g.brawlPanel?._say('Не хватает маны'); return false; }
        if (name === 'Protection') {
            this.attackHeld = false;
            b.fx |= FX.SHIELD; b.shieldT = 4;
        } else {
            const cam = g.spectator, yaw = cam.yaw, pitch = cam.pitch;
            const flat = Math.cos(pitch);
            _aim.set(-Math.sin(yaw) * flat, Math.sin(pitch), -Math.cos(yaw) * flat);
            _origin.set(b.x, b.y + 2.7, b.z);
            if (g.camera) {
                // The camera is over the shoulder. Aim from the caster at the point under the reticle.
                _ray.ray.origin.copy(g.camera.position);
                _ray.ray.direction.copy(_aim);
                _ray.ray.at(28, _target);
                this._rayFighter(_target);
                _aim.subVectors(_target, _origin).normalize();
            }
            if (name.startsWith('Earthquake') || name === 'EarthDust') {
                _origin.y = this.brawl.groundAt(b.x, b.z);
                _aim.y = 0; _aim.normalize();
            } else if (!name.startsWith('WindImpulse')) {
                if (g.collision?.lineOfSight?.(b.x, b.y + 2.7, b.z, b.x + _aim.x, b.y + 2.7 + _aim.y, b.z + _aim.z, .2) === false) return false;
                _origin.addScaledVector(_aim, .75);
            }
            b.yaw = yaw;
            if (BOLTS.has(name)) {
                g.duel._addBolt({ id: b.id + ':manual:' + ++this.seq, by: b.id, spell: name, side: 'right', tk: 'n', tid: null,
                    rng: emptyRange(duelRange(b.mana), true), o: _origin.clone(), d: _aim.clone(), npc: true });
            } else if (name === 'IceShards') {
                const speed = SHARDS.SPEED;
                const shots = [];
                for (let i = -1; i <= 1; i++) shots.push({
                    p: _origin.toArray(),
                    v: [(_aim.x + Math.cos(yaw) * i * .055) * speed, _aim.y * speed, (_aim.z - Math.sin(yaw) * i * .055) * speed],
                    d: (i + 1) * .065,
                });
                g.elementalMages.shards.volley(b.id, shots);
            } else g.spells.cast(name, _origin.clone(), _aim.clone(), 'right', b.id);
            b.castT = .48;
            b.model.castNow = true;
            b.aimPitch = Math.asin(Math.max(-1, Math.min(1, _aim.y)));
            g.sound?.spellCast?.(name, _origin);
        }
        b.mana -= cost;
        g.brawlPanel?._say();
        this.strikeCd = name === 'Protection' ? .55 : .85;
        return true;
    }

    camera(camera) {
        const b = this.body, e = this.entry, cam = this.game.spectator;
        if (!e) return false;
        const D = BODIES[e.k];
        const p = D.pos(b, _eye);
        p.y += D.size(b) * .78;
        camera.quaternion.setFromEuler(_face.set(cam.pitch, cam.yaw, 0));
        _back.set(0, 0, 1).applyQuaternion(camera.quaternion).multiplyScalar(5.7);
        _shoulder.set(1.65, .3, 0).applyQuaternion(camera.quaternion);
        camera.position.copy(p).add(_back).add(_shoulder);
        const collision = this.game.collision;
        for (let i = 0; i < 5 && collision?.lineOfSight?.(p.x, p.y, p.z, camera.position.x, camera.position.y, camera.position.z, .35) === false; i++) {
            camera.position.lerp(p, .32);
        }
        return true;
    }

    teamColor() { return this.entry ? TEAMS[this.entry.team].css : ''; }
}
