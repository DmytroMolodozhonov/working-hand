/**
 * ImperiusControl.js — «Империус» / «Империус Максима» on MY computer: the cast, the mind's passage into the creature
 * and back, the body left standing with white eyes, driving the creature, the camera in its eyes, the link fading
 * with the distance, the end. The rules (who may be taken, the costs, the link): Imperius.js; how each kind of
 * creature is driven: ImperiusBodies.js.
 *
 *  - Cast: the creature the hand (the wand) points at — or the eyes look at — within CAST_R, in sight. The host decides
 *    (it is the creatures' master): taken → the spell is held (Concentration.HELD.Imperius), its own mind stops.
 *  - The passage (PASS_T): a white light leaves the hero's eyes and runs along an arc to the creature's head; the
 *    camera flies along it (no jump of the view) and settles in the creature's eyes. Back the same way.
 *  - In the creature: the hero's own ways move it — walking in place walks it (running runs, if it can), the body's
 *    turn turns it, the head looks round, a jump makes it jump (if it can), a swing of a hand forward is its own
 *    blow (a zombie's arms, a knight's sword, a cow's butt). Nothing of the hero's: no spells but «стоп», no things.
 *  - The hero's body stands where it was, the arms down, the eyes burning white (every computer sees them). A blow
 *    on it jerks the mind back (a short stun, the blow real); its death is the hero's death.
 *  - Ends: «стоп», the mana, too far (the screen black first), the creature dead, the body hurt / dead / stunned.
 *  - Net: the host owns the creatures. My computer asks it (`imp` take), then drives the creature itself and tells
 *    the host where it is 10 times a second (as a rider's computer tells where the dragon is — DragonRide); the host
 *    draws it there and sends it on as its own. Its blows: the host lands them (Servants.damage).
 */

import * as THREE from 'three';
import { IMPERIUS, imperiusOf, canTake, imperiusBlock, blockSay, upkeep, linkAt, kindOf, NET_SPELL } from './Imperius.js';
import { BODIES, eyeOffset } from './ImperiusBodies.js';
import { castingHand } from './WandAim.js';
import { CurvedBeam } from '../fx/Particles.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _look = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const r2 = (v) => Math.round(v * 100) / 100;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** A hand pushed forward this fast (m/s against the body) is the creature's blow. */
export const STRIKE_V = 4.2;
/** The light's colours: the white of the eyes, its cool edge. */
const WHITE = 0xffffff, EDGE = 0xcfe6ff;

/** A point of the quadratic bezier p0-p1-p2 at t. */
function bez(p0, p1, p2, t, out) {
    const it = 1 - t;
    return out.set(it * it * p0.x + 2 * it * t * p1.x + t * t * p2.x, it * it * p0.y + 2 * it * t * p1.y + t * t * p2.y, it * it * p0.z + 2 * it * t * p1.z + t * t * p2.z);
}

export class ImperiusControl {
    constructor(game) {
        this.game = game;
        this.name = null; // 'Imperius' | 'ImperiusMaxima' while held
        this.sys = null; // the creature's adapter key (ImperiusBodies.BODIES)
        this.id = null;
        this.kind = null; // IMPERIUS_TARGETS key
        this.phase = ''; // in | on | out
        this.t = 0;
        this._pending = null; // asked the host
        this._lastCast = 0;
        this._sendT = 0;
        this._said = new Map();
        this.I = { yaw: 0, walk: 0, run: false, jump: false, strike: false };
        this.dark = 0; // the screen's darkness (the link fading)
        this.hosted = new Map(); // (host) 'sys:id' → {sys, id, by, n: the last place the guest sent}
        this._beams = null;
        this._overlay = null;
    }

    get active() { return !!this.name; }
    get maxima() { return this.name === 'ImperiusMaxima'; }
    /** The hero's body is left (no walking, no jumping of its own). */
    get busy() { return !!this.name; }
    get me() { return this.game.localId; }
    get creature() { return this.sys ? BODIES[this.sys]?.find(this.game, this.id) || null : null; }
    /** The view is in the creature's eyes (or on the way there / back). */
    get viewing() { return !!this.name && !!this.phase; }

    _say(t, key = t, gap = 2500) {
        const now = performance.now();
        if (now - (this._said.get(key) || -1e9) < gap) return;
        this._said.set(key, now);
        this.game.hud?.setVoice?.(t, true);
    }

    // ============================================================ the cast
    /** «Империус» / «Империус Максима» said. → the name (cast now) or null. */
    cast(name, isFinal) {
        const g = this.game, now = Date.now();
        if (this.name) { if (isFinal) this._say('🌀 Вы уже в чужом теле. «Стоп» — вернуться в своё', 'held'); return null; }
        if (this._pending || now - this._lastCast < 1500) return null;
        const c = g.combat;
        const why = imperiusBlock(name, { enabled: !!c?.enabled, max: c?.maxFatigue || 30, mana: c?.fatigue ?? 0 });
        if (why) {
            if (isFinal) { this._say(blockSay(name, why), 'block:' + why); if (why === 'mana') { g.hud?.manaShort?.(); g.sound?.playNoMana?.(); } }
            g.lastCastWhy = why === 'max' ? `мало ячеек маны (нужно ${imperiusOf(name).NEED_MAX})` : 'не хватает маны';
            return null;
        }
        const t = this._aimed(name === 'ImperiusMaxima');
        if (!t) {
            if (isFinal) this._say(`🌀 Наведите руку (или посмотрите) на существо не дальше ${IMPERIUS.CAST_R} м и скажите «${name === 'ImperiusMaxima' ? 'Империус Максима' : 'Империус'}»`, 'noaim');
            g.lastCastWhy = 'нет существа на прицеле';
            return null;
        }
        const ok = canTake(t.kind, name === 'ImperiusMaxima', t.ctx);
        if (!ok.ok) { if (isFinal) this._say(ok.say, 'cant:' + t.kind); g.lastCastWhy = ok.say.replace(/^\S+\s/, ''); return null; }
        const tired = c?.check?.(name);
        if (tired) { g.hud?.setVoice?.(tired, true); return null; }
        this._lastCast = now;
        if (g.authority) {
            const r = this.claim(t.sys, t.id, this.me, name);
            this.onTaken(t.sys, t.id, name, r);
            return r.ok ? name : null;
        }
        this._pending = { sys: t.sys, id: t.id, name, at: now };
        g.sync?.imperius?.({ e: 'take', k: t.sys, id: t.id, mx: NET_SPELL[name] });
        return null; // (the host will say — onTaken)
    }

    /** The creature aimed at: the hand's (the wand's) line, else the eyes'. → {sys, id, kind, c, ctx} | null */
    _aimed(maxima) {
        const g = this.game, col = g.collision;
        const hand = castingHand(g);
        const head = g.character.head.getWorldPosition(_v3);
        const lines = [];
        if (hand) lines.push({ o: hand.origin.clone(), d: hand.dir.clone().normalize() });
        lines.push({ o: head.clone(), d: _look.set(0, 0, -1).applyQuaternion(g.camera.quaternion).clone() });
        let best = null;
        for (const sys of Object.keys(BODIES)) {
            const B = BODIES[sys];
            B.list(g, (c, x, y, z, up) => {
                if (c.imp) return; // (another mind is in it already)
                const kind = kindOf(sys, c);
                if (!kind) return;
                for (const L of lines) {
                    _a.set(x, y + up * 0.6, z).sub(L.o);
                    const d = _a.length();
                    if (d > IMPERIUS.CAST_R || d < 0.3) continue;
                    const ang = L.d.angleTo(_a.divideScalar(d));
                    if (ang > IMPERIUS.AIM_ANG && !(d < 6 && ang < 0.8)) continue;
                    const score = ang * 3 + d * 0.03;
                    if (best && score >= best.score) continue;
                    if (col?.lineOfSight && !col.lineOfSight(L.o.x, L.o.y, L.o.z, x, y + up * 0.6, z, 0.5)) continue; // (behind a wall: not seen, not taken)
                    best = { sys, id: c.id, kind, c, score, ctx: {} };
                }
            });
        }
        return best;
    }

    // ============================================================ the host's word
    /**
     * (authority) Let `by` take the creature: free, alive, allowed. → {ok, say}. The creature's own mind stops; a
     * servant of «Брейнрот» forgets its master for good.
     */
    claim(sys, id, by, name) {
        const g = this.game, B = BODIES[sys];
        const c = B?.find(g, id);
        if (!c || B.dead(c)) return { ok: false, say: '🌀 Существа уже нет' };
        if (c.imp && c.imp.by !== by) return { ok: false, say: '🌀 В нём уже чужой разум' };
        const kind = kindOf(sys, c);
        const ok = canTake(kind, name === 'ImperiusMaxima');
        if (!ok.ok) return ok;
        if (g.servants?.masterOf?.(sys, c) != null) g.servants._free?.(sys, c);
        c.imp = { by, mine: by === this.me, sys, name };
        this.hosted.set(sys + ':' + id, { sys, id, by, n: null });
        return { ok: true };
    }

    /** (authority) Back to its own mind. */
    unclaim(sys, id) {
        const g = this.game, B = BODIES[sys];
        this.hosted.delete(sys + ':' + id);
        const c = B?.find(g, id);
        if (!c) return;
        c.imp = null;
        B.release(g, c);
        const h = B.head(c);
        if (h) h.visible = true;
    }

    /** The host's verdict on my cast. */
    onTaken(sys, id, name, r) {
        const g = this.game;
        this._pending = null;
        if (!r?.ok) { if (r?.say) g.hud?.setVoice?.(r.say, true); return; }
        const B = BODIES[sys], c = B?.find(g, id);
        if (!c) return;
        if (!g.authority) c.imp = { by: this.me, mine: true, sys, name };
        g.combat?.pay?.(name);
        g.mana?.success?.(name);
        this.name = name; this.sys = sys; this.id = id; this.kind = kindOf(sys, c);
        this.phase = 'in'; this.t = 0;
        const ch = g.character;
        this._body = { x: ch.group.position.x, y: ch.group.position.y, z: ch.group.position.z, yaw: ch.group.rotation.y };
        this._heroYaw = ch.group.rotation.y;
        this._yaw0 = B.face(c);
        this.I.yaw = this._yaw0;
        this._hp = this._hpNow();
        this._jumpSeen = g.currentPose?.jump?.jumps ?? null;
        this._strikeT = 0;
        this._eye = eyeOffset(B.head(c));
        this._fpvWas = ch._fpv;
        ch.setFirstPerson?.(false); // (my own head seen now: it is out there, its eyes white)
        ch.setImperiusEyes?.(true);
        this._from = g.camera.position.clone();
        this._fromQ = g.camera.quaternion.clone();
        this._darkSaid = false;
        // the spell seen and heard: the light from my eyes (SpellManager draws the cast; the sound by SpellMusic)
        const origin = ch.head.getWorldPosition(_v).clone();
        const to = B.pos(c, _v2).add(_v3.set(0, B.size(c) * 0.8, 0)).sub(origin).clone();
        g.spells?.cast?.(name, origin, to, null, this.me);
        g.sync?.spell?.(name, origin, to, null);
        g.noteCaster?.(name, this.me);
        if (!g.authority && g.sound?.spellHasCastSound?.(name)) { g.sound.spellCast(name, origin); g.sync?.castSound?.(name, origin); } // (a guest: the host said yes later — its sound now)
        const ru = this.maxima ? 'Империус Максима' : 'Империус';
        g.hud?.setVoice?.(`🌀 «${ru}» — вы в теле: ${kindRu(this.kind)}. Шагайте на месте — оно идёт, поворот тела — поворот, взмах руки вперёд — его удар. «Стоп» — вернуться`, true);
        g.perf?.note?.(`империус: в ${this.kind} (${sys}:${id})`);
    }

    // ============================================================ every frame: my body, my input
    /** Before the hero's legs move (Game._updatePlayer): what the body asks for goes to the creature; its legs stop. */
    input(dt) {
        if (!this.name) return;
        const g = this.game, ch = g.character, pose = g.currentPose;
        const I = this.I;
        I.yaw = this._yaw0 + (ch.group.rotation.y - this._heroYaw);
        I.walk = ch.isRunning ? Math.max(0.2, ch.runIntensity || 0) : 0;
        I.run = (ch.runIntensity || 0) > 0.45;
        const J = pose?.jump;
        I.jump = false;
        if (J && J.jumps !== this._jumpSeen) { if (this._jumpSeen != null) I.jump = true; this._jumpSeen = J.jumps; }
        // a hand swung forward (not the arms pumping a run): the creature's blow
        this._strikeT = Math.max(0, this._strikeT - dt);
        I.strike = false;
        if (this.phase === 'on' && this._strikeT <= 0 && !ch.armPump?.pumping) {
            for (const s of ['right', 'left']) {
                const v = ch.handRelVelocity?.[s];
                if (v && -v.z > STRIKE_V && -v.z > Math.abs(v.x)) { I.strike = true; this._strikeT = 0.6; break; }
            }
        }
        ch.setRunning?.(false);
    }

    /** After the hero's own frame: the body where it was, as it was — the arms down, «asleep standing» (it may fall, as a body does). */
    afterPlayer() {
        if (!this.name) return;
        const ch = this.game.character, b = this._body, p = ch.group.position;
        p.x = b.x; p.z = b.z;
        b.y = p.y;
        ch.group.rotation.y = b.yaw;
        ch.setIdlePose?.();
        ch.updateHeadRotation?.(0, -0.08); // (the head still, a little bowed: nobody inside)
    }

    _hpNow() {
        const c = this.game.combat;
        return c?.enabled ? c.hp : this.game.playerHP ?? 0;
    }

    /** Every frame (Game.update, after the creatures moved). */
    update(dt) {
        const g = this.game;
        if (this._pending && Date.now() - this._pending.at > 4000) { this._pending = null; }
        if (g.authority) this._hostStep();
        this._fade(dt);
        if (!this.name) { this._beamsOff(); return; }
        // on the way back: only the passage (the creature is its own already — or gone: the mind is home at once)
        if (this.phase === 'out') {
            if (!this.creature) { this._end(); return; }
            this.t += dt / IMPERIUS.PASS_T;
            this._beamsDraw();
            if (this.t >= 1) this._end();
            return;
        }
        const B = BODIES[this.sys], c = this.creature;
        if (!c || B.dead(c)) { this.stop('dead'); return; }
        if (!c.imp && g.authority) { this.stop('lost'); return; }
        // the mana: held
        const cb = g.combat;
        if (cb?.enabled) {
            if (!cb.drain(upkeep(this.name, dt), dt)) { this.stop('mana'); return; }
        }
        // the body struck, knocked down, stunned: the mind is jerked back
        const hp = this._hpNow();
        if (hp < this._hp - 0.01 || g.knock?.down || cb?.stunned || cb?.frozen) { this._hp = hp; this.stop('hurt'); return; }
        this._hp = hp;
        // the link: dark from half the range, torn at it
        const d = B.pos(c, _v).distanceTo(_v2.set(this._body.x, this._body.y - 1.95, this._body.z));
        const L = linkAt(this.name, d);
        this.dark = L.dark;
        if (L.dark > IMPERIUS.FADE_SAY && !this._darkSaid) { this._darkSaid = true; this._say('🌫️ Связь слабеет — существо слишком далеко от вашего тела', 'dark', 8000); }
        if (L.dark < 0.1) this._darkSaid = false;
        if (L.torn) { this.stop('far'); return; }
        // the passage in
        if (this.phase === 'in') {
            this.t += dt / IMPERIUS.PASS_T;
            this._beamsDraw();
            if (this.t >= 1) { this.phase = 'on'; this._beamsOff(); this._arrive(c); }
        }
        this._sparkEyes(dt);
        // the creature's place to the host (I am a guest)
        if (!g.authority) {
            this._sendT -= dt;
            if (this._sendT <= 0) {
                this._sendT = 0.1;
                const n = B.net(c);
                g.sync?.imperius?.({ e: 'pos', k: this.sys, id: this.id, p: [r2(n[0]), r2(n[1]), r2(n[2])], ry: r2(n[3]), w: r2(n[4]), atk: n[5] });
            }
        }
    }

    /**
     * A system meets a creature with a mind in it (`c.imp`): instead of its own mind, this. → true (handled).
     * Mine: driven by my body. Another computer's (I am the host): drawn where that mind put it.
     */
    step(sys, c, dt) {
        const g = this.game, B = BODIES[sys];
        if (!B || !c.imp) return false;
        if (c.imp.mine) {
            if (this.sys !== sys || this.id !== c.id || !this.name) { if (g.authority) this.unclaim(sys, c.id); else c.imp = null; return false; }
            const I = this.phase === 'on' ? this.I : STILL;
            B.drive(g, c, { ...I, yaw: this.phase === 'on' ? I.yaw : B.face(c) }, dt);
            const hit = B.struck(g, c);
            if (hit) this._blow(sys, c, hit);
            const h = B.head(c);
            if (h) h.visible = !(this.phase === 'on' && g.cameraMode === 'fpv'); // (my eyes are in it: its head not in my view)
            return true;
        }
        const H = this.hosted.get(sys + ':' + c.id);
        if (H?.n) B.follow(g, c, H.n, dt);
        return true;
    }

    /** (a person's blow lands at its own moment — CastleLife asks) */
    landed(sys, c) {
        if (!c.imp?.mine) return;
        const hit = BODIES[sys]?.struck(this.game, c);
        if (hit) this._blow(sys, c, hit);
    }

    /** The creature's blow: whoever is in front of it, in its reach, takes it (the host lands it). */
    _blow(sys, c, hit) {
        const g = this.game, B = BODIES[sys];
        const p = B.pos(c, _a), yaw = B.face(c);
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        let best = null;
        const consider = (k, id, x, y, z) => {
            if (k === sys && id === c.id) return;
            const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
            if (d > hit.reach || Math.abs(y - p.y) > 3) return;
            if (d > 0.4 && (dx * fx + dz * fz) / d < 0.5) return; // (in front of it: «лицом к цели»)
            if (!best || d < best.d) best = { k, id, d, x, z };
        };
        for (const z of g.zombies || []) if (!z.isDead && !z.isDying) consider('z', z.id, z.group.position.x, z.group.position.y - (z.gOff || 0), z.group.position.z);
        for (const a of g.animals?.list || []) if (!a.dead) consider('a', a.id, a.group.position.x, a.group.position.y - 0.5, a.group.position.z);
        for (const v of g.castleLife?.byId?.values?.() || []) if (!v.dead) consider('v', v.id, v.x, v.y, v.z);
        if (!g.isDeadLocal) consider('p', g.localId, g.character.group.position.x, g.character.group.position.y - 1.95, g.character.group.position.z); // (my own body too: hurt, the mind comes back)
        for (const [id, r] of g.remotes || []) if (!r.dead && r.position) consider('p', id, r.position.x, r.position.y - 1.95, r.position.z);
        if (!best) return;
        const dir = [r2(best.x - p.x), r2(best.z - p.z)];
        if (g.authority) this.land(best.k, best.id, hit.dmg, dir, this.me, { x: p.x, z: p.z });
        else g.sync?.imperius?.({ e: 'hit', k: sys, id: c.id, tk: best.k, tid: best.id, dmg: hit.dmg, d: dir });
    }

    /** (authority) A blow of a creature with a mind in it lands — as a servant's (whose it is: only who saw the cast knows — Blame.js). */
    land(tk, tid, dmg, dir, by, src) {
        const g = this.game;
        const d = new THREE.Vector3(dir[0] || 0, 0, dir[1] || 1);
        if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
        d.normalize();
        g.servants?.damage?.({ k: tk, id: tid }, Math.max(1, Math.min(10, dmg | 0)), d, by, 'servant', src);
    }

    // ============================================================ the camera
    /** Game._updateCamera: the view from the creature's eyes (FPV) or behind it; on the way — along the light. */
    camera(cam, dt) {
        if (!this.viewing) return;
        const c = this.creature;
        if (!c) return;
        const g = this.game, B = BODIES[this.sys];
        const eye = this._eyeOf(c, _p2);
        // where the creature's eyes look: its face, and my head's turn round it
        const hb = g._headBase || { yaw: 0, pitch: 0 };
        _e.set(Math.max(-1.2, Math.min(1.2, hb.pitch || 0)), B.face(c) + (hb.yaw || 0) * 0.8, 0, 'YXZ');
        _q.setFromEuler(_e);
        const fpv = g.cameraMode === 'fpv';
        if (!fpv) {
            // behind it, as the hero's own camera is behind the hero (its size: a cow's camera lower, a dragon's far back)
            const s = B.size(c);
            _v.set(0, s * 0.55 + 1.2, s * 0.9 + 3.5).applyAxisAngle(_v3.set(0, 1, 0), B.face(c)).add(B.pos(c, _v2));
            eye.copy(_v);
            _v2.y += s * 0.75;
            _look.copy(_v2);
            cam.position.copy(eye);
            cam.lookAt(_look);
            _q.copy(cam.quaternion);
        }
        if (this.phase === 'in' || this.phase === 'out') {
            const k = ease(this.phase === 'in' ? this.t : 1 - this.t);
            const from = this._heroEye(_v3);
            if (this.phase === 'out') this._from.copy(from); // (back: to where my eyes are)
            const p0 = this.phase === 'in' ? this._from : from;
            const mid = _v.addVectors(p0, eye).multiplyScalar(0.5);
            mid.y += Math.max(1.5, p0.distanceTo(eye) * 0.22);
            bez(p0, mid, eye, k, cam.position);
            const q0 = this.phase === 'in' ? this._fromQ : (g.character.getHeadQuaternion ? g.character.getHeadQuaternion(this._backQ || (this._backQ = new THREE.Quaternion())) : this._fromQ);
            cam.quaternion.copy(q0).slerp(_q, k);
        } else {
            cam.position.copy(eye);
            cam.quaternion.copy(_q);
        }
    }

    _eyeOf(c, out) {
        const B = BODIES[this.sys], h = B.head(c);
        if (h && this._eye) { h.updateWorldMatrix(true, false); return out.copy(this._eye).applyMatrix4(h.matrixWorld); }
        return B.pos(c, out).add(_v.set(0, B.size(c) * 0.9, 0));
    }

    _heroEye(out) {
        const ch = this.game.character;
        return ch.getHeadPosition ? ch.getHeadPosition(out) : ch.head.getWorldPosition(out);
    }

    // ============================================================ the end
    /** The spell lets go (`why`: stop | mana | far | dead | hurt | lost | focus | space). → true if it was held. */
    stop(why = 'stop') {
        if (!this.name) return false;
        const g = this.game;
        if (this.phase === 'out') return true;
        const note = {
            mana: '🌀 Мана кончилась — сознание вернулось в ваше тело',
            far: '🌀 Связь разорвалась — существо ушло слишком далеко. Вы снова в своём теле',
            dead: '🌀 Существо погибло — сознание вернулось в ваше тело',
            hurt: '🌀 Ваше тело ударили — сознание рывком вернулось',
            lost: '🌀 Связь с существом потеряна',
        }[why];
        if (note) this._say(note, 'end:' + why, 1500);
        this._release();
        if (why === 'hurt') g.combat?.stun?.(IMPERIUS.HURT_STUN, null, 'imperius');
        // (a moment of weakness: the head swims a little — Knockdown's dizziness, short)
        if (why === 'far' && g.knock && !(g.knock.dizzyLeft > IMPERIUS.WEAK_T)) { g.knock.dizzyLeft = g.knock.dizzyDur = IMPERIUS.WEAK_T * 1.6; g.knock.dizzyS = 0.4; }
        // dead hero, a dead creature's eyes gone: the mind is home at once; else it flies back along the light
        if (why === 'dead' && (g.isDeadLocal || g.combat?.dead)) { this._end(); return true; }
        this.phase = 'out'; this.t = 0;
        return true;
    }

    /** The creature free again (its own mind back — the host's). */
    _release() {
        const g = this.game;
        const c = this.creature;
        const B = BODIES[this.sys];
        if (c) {
            const h = B?.head(c);
            if (h) h.visible = true;
            B?.release?.(g, c);
            if (!g.authority) c.imp = null;
        }
        if (g.authority) this.unclaim(this.sys, this.id);
        else g.sync?.imperius?.({ e: 'end', k: this.sys, id: this.id });
        this._released = true;
    }

    _end() {
        const g = this.game, ch = g.character;
        if (!this._released) this._release();
        this._released = false;
        this.name = null; this.sys = null; this.id = null; this.kind = null; this.phase = ''; this.t = 0;
        this.dark = 0;
        this._beamsOff();
        ch.setImperiusEyes?.(false);
        ch.setFirstPerson?.(g.cameraMode === 'fpv' ? true : !!this._fpvWas);
        g.perf?.note?.('империус: снова в своём теле');
    }

    // ============================================================ the host's book of minds
    _hostStep() {
        const g = this.game;
        for (const [key, H] of this.hosted) {
            const c = BODIES[H.sys]?.find(g, H.id);
            const gone = H.by !== this.me && !g.remotes?.has(H.by);
            if (!c || BODIES[H.sys].dead(c) || gone) { this.unclaim(H.sys, H.id); this.hosted.delete(key); if (c && gone) c.imp = null; }
        }
    }

    /** The network: {e: take | took | pos | hit | end, …}. */
    onNet(m, isHost) {
        const g = this.game;
        const from = m.from || m.by;
        if (isHost) {
            if (m.e === 'take') {
                const name = m.mx ? 'ImperiusMaxima' : 'Imperius';
                if (name === 'ImperiusMaxima' && g._godsBanned?.(name)) { g.sync?.imperius?.({ e: 'took', to: from, k: m.k, id: m.id, ok: 0, say: '⚡ Боги наложили запрет на использование божественных заклинаний на Земле' }); return; }
                const r = this.claim(m.k, m.id, from, name);
                g.sync?.imperius?.({ e: 'took', to: from, k: m.k, id: m.id, ok: r.ok ? 1 : 0, say: r.say || '', mx: m.mx });
                return;
            }
            const H = this.hosted.get(m.k + ':' + m.id);
            if (!H || H.by !== from) return;
            if (m.e === 'pos' && Array.isArray(m.p)) H.n = { x: +m.p[0] || 0, y: +m.p[1] || 0, z: +m.p[2] || 0, ry: +m.ry || 0, w: Math.max(0, Math.min(1, +m.w || 0)), atk: !!m.atk };
            else if (m.e === 'hit') {
                const c = BODIES[m.k]?.find(g, m.id);
                if (c) { const p = BODIES[m.k].pos(c, _a); this.land(m.tk, m.tid, m.dmg, Array.isArray(m.d) ? m.d : [0, 1], from, { x: p.x, z: p.z }); }
            } else if (m.e === 'end') this.unclaim(m.k, m.id);
            return;
        }
        if (m.e === 'took' && m.to === this.me && this._pending && this._pending.sys === m.k && this._pending.id === m.id) {
            this.onTaken(m.k, m.id, this._pending.name, { ok: !!m.ok, say: m.say });
        }
    }

    /** For my 'p' packet: the eyes of my body burn white. */
    netFlag() { return this.name ? 1 : undefined; }

    // ============================================================ the look
    /** The light from my eyes to the creature (on the way) — two shared beams, made once, and the glow's sparks. */
    _beamsDraw() {
        const g = this.game, c = this.creature;
        if (!c) return;
        if (!this._beams) {
            this._beams = [new CurvedBeam(g.scene, { segments: 16, radial: 6, radius: 0.32, color: EDGE, opacity: 0.35 }), new CurvedBeam(g.scene, { segments: 16, radial: 5, radius: 0.09, color: WHITE, opacity: 0.95 })];
        }
        const a = this._heroEye(_p0), b = this._eyeOf(c, _p2);
        const p0 = this.phase === 'in' ? a : b, p2 = this.phase === 'in' ? b : a;
        const mid = _p1.addVectors(p0, p2).multiplyScalar(0.5);
        mid.y += Math.max(1.5, p0.distanceTo(p2) * 0.22);
        // the light runs from one to the other: its head at k, its tail following
        const k = ease(this.t), head = Math.min(1, k * 1.25), tail = Math.max(0, k * 1.25 - 0.45);
        bez(p0, mid, p2, tail, _a); bez(p0, mid, p2, head, _c);
        bez(p0, mid, p2, (tail + head) / 2, _b);
        // (the sub-arc's control point: so the piece lies on the same arc)
        _b.multiplyScalar(2).sub(_v.addVectors(_a, _c).multiplyScalar(0.5));
        for (const beam of this._beams) beam.setCurve(_a, _b, _c);
        // its glow and the white sparks it sheds
        const fx = g.fx;
        if (fx?.glow) for (let i = 0; i < 3; i++) { const s = tail + (head - tail) * Math.random(); bez(p0, mid, p2, s, _v); fx.glow.spawn(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.2) * 0.6, (Math.random() - 0.5) * 0.6, i ? EDGE : WHITE, 0.16 + Math.random() * 0.14, 0.5); }
        if (fx?.spark && Math.random() < 0.6) fx.spark(_c, WHITE, 0.09, _v.set((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2), 0.45);
    }

    _beamsOff() { if (this._beams) for (const b of this._beams) b.hide(); }

    /** The white of my body's eyes: a faint glow drifting off them (the eyes themselves: Character.setImperiusEyes). */
    _sparkEyes(dt) {
        const g = this.game;
        if (!g.fx?.glow || Math.random() > dt * 6) return;
        const ch = g.character;
        for (const s of [-1, 1]) {
            _v.set(0.26 * s, 0.08, -0.66);
            ch.head.localToWorld(_v);
            g.fx.glow.spawn(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 0.15, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.15, WHITE, 0.07, 0.6);
        }
    }

    /** In its eyes: a soft white flash on the screen (the eyes opened). */
    _arrive(c) {
        const g = this.game;
        this._flash = 1;
        const B = BODIES[this.sys];
        const h = B.head(c);
        if (h && g.cameraMode === 'fpv') h.visible = false;
        if (g.fx?.glow) { const e = this._eyeOf(c, _v); for (let i = 0; i < 14; i++) g.fx.glow.spawn(e.x, e.y, e.z, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, i % 2 ? WHITE : EDGE, 0.12, 0.5); }
    }

    /** The screen: dark as the link fades; a white flash as the eyes change. One overlay, made once. */
    _fade(dt) {
        if (typeof document === 'undefined') return;
        this._flash = Math.max(0, (this._flash || 0) - dt * 2.2);
        const passing = this.name && (this.phase === 'in' || this.phase === 'out') ? Math.sin(Math.PI * Math.min(1, this.t)) * 0.35 : 0;
        const dark = this.name ? this.dark : 0, white = Math.max(this._flash, passing);
        if (!this._overlay) {
            if (dark < 0.002 && white < 0.002) return;
            const el = this._overlay = document.createElement('div');
            el.id = 'imperius-veil';
            el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;transition:none;';
            document.body.appendChild(el);
        }
        const key = `${dark.toFixed(3)}|${white.toFixed(3)}`;
        if (key === this._veilKey) return;
        this._veilKey = key;
        const el = this._overlay;
        if (dark < 0.002 && white < 0.002) { el.style.display = 'none'; return; }
        el.style.display = 'block';
        // the dark closes in from the edges first, then the middle; the white is a soft glow from the middle
        const edge = Math.min(1, dark * 1.4), mid = Math.max(0, dark * 1.3 - 0.3);
        el.style.background = white > dark
            ? `radial-gradient(ellipse at center, rgba(255,255,255,${(white * 0.85).toFixed(3)}) 0%, rgba(220,235,255,${(white * 0.45).toFixed(3)}) 55%, rgba(200,220,255,${(white * 0.15).toFixed(3)}) 100%)`
            : `radial-gradient(ellipse at center, rgba(0,0,0,${mid.toFixed(3)}) 0%, rgba(0,0,0,${Math.min(1, (mid + edge) / 2).toFixed(3)}) 45%, rgba(0,0,0,${edge.toFixed(3)}) 85%)`;
    }
}

const STILL = { yaw: 0, walk: 0, run: false, jump: false, strike: false };

/** The creature's name for the line «вы в теле: …». */
export function kindRu(kind) {
    const RU = { zombie: 'зомби', villager: 'житель', knight: 'рыцарь', wizard: 'волшебник', cow: 'корова', sheep: 'баран', horse: 'конь', pig: 'свинья', sailor: 'моряк', king: 'король', towerHead: 'глава башни' };
    return RU[kind] || kind;
}
