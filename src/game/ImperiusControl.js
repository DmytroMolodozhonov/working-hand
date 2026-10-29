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
import { IMPERIUS, imperiusOf, castReach, passTime, canTake, imperiusBlock, blockSay, upkeep, linkAt, kindOf, NET_SPELL } from './Imperius.js';
import { BODIES, eyeOffset } from './ImperiusBodies.js';
import { animalWings } from './ImperiusFlyers.js'; // (also adds the Maxima's creatures to BODIES: the dragon, the owl, the phoenix, the book-bird)
import './ImperiusWalkers.js'; // (… the spider, the living trees, the Ice Castle's creatures, the sailors)
import { IMPERIUS_MAXIMA } from './Imperius.js';
import { FlapReader, armsOf } from './ImperiusFlight.js';
import { HowlReader } from './DragonHowl.js';
import { ImperiusGuards } from './ImperiusGuards.js';
import { flies } from './Imperius.js';
import { castingHand } from './WandAim.js';
import { CurvedBeam } from '../fx/Particles.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _look = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const r2 = (v) => Math.round(v * 100) / 100;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * Another PLAYER («Империус Максима» only): their own computer moves their hero — this one sends it what to do (the walk,
 * the turn, a jump), as a mind would; my eyes are in their head (the network's place of it).
 */
BODIES.pl = {
    sys: 'pl',
    list(g, fn) { for (const [id, r] of g.remotes || []) if (!r.dead && r.position && !g.invis?.hidden?.(id)) fn(r, r.position.x, r.position.y - 1.95, r.position.z, 3.6); },
    find(g, id) {
        if (id === g.localId) return g.isDeadLocal ? null : (g._impSelf || (g._impSelf = { id, local: true, get position() { return g.character.group.position; }, character: g.character, dead: false }));
        return g.remotes?.get(id) || null;
    },
    dead(r) { return !!r.dead || (r.local && !!r.character?.game?.isDeadLocal); },
    pos(r, out) { return out.set(r.position.x, r.position.y - 1.95, r.position.z); },
    face(r) { return r.character?.group?.rotation?.y || 0; },
    head(r) { return r.character?.head || null; },
    size() { return 3.6; },
    drive() {}, follow() {}, release() {}, net() { return [0, 0, 0, 0, 0, 0]; },
    struck(g, r, I) { return I?.strikeNow ? { reach: 3, dmg: 1 } : null; }, // (a fist of theirs)
};

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
        this.I = { yaw: 0, walk: 0, run: false, jump: false, strike: false, strikeNow: false, stroke: 0, arms: '', maxima: false, fly: null, look: new THREE.Vector3(0, 0, -1), fire: null, wings: animalWings, say: (t, key) => this._say(t, key || t, 4000) };
        this.flaps = new FlapReader(); // (the arms' strokes: flying a winged creature in the Maxima — ImperiusFlight.js)
        this.howl = new HowlReader(); // (the dragon's fire: the long «У» — DragonHowl.js)
        this._armsDownT = 0;
        this.guards = new ImperiusGuards(game); // (a castle's guard and a taken creature walking about it — ImperiusGuards.js)
        this.dark = 0; // the screen's darkness (the link fading)
        this.hosted = new Map(); // (host) 'sys:id' → {sys, id, by, n: the last place the guest sent}
        this._beams = null;
        this._overlay = null;
    }

    get active() { return !!this.name; }
    /** Where the creature I am in stands (null: none) — «Nihilis Atra» sends the mind home if it is hit (Nihilis.js). */
    bodyPosition(out) { const c = this.creature; return c && BODIES[this.sys] ? BODIES[this.sys].pos(c, out) : null; }
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
        this._reach = castReach(name);
        const t = this._aimed(name === 'ImperiusMaxima');
        if (!t && this._hidden && !this._far) {
            if (isFinal) this._say(`🌀 ${cap1(kindRu(this._hidden.kind))} за препятствием — заклинанию нужно его видеть`, 'hidden');
            g.lastCastWhy = 'цель за препятствием';
            return null;
        }
        if (!t && this._far) {
            if (isFinal) this._say(`🌀 ${cap1(kindRu(this._far.kind))} слишком далеко: ${Math.round(this._far.d)} м — подойдите не дальше чем на ${this._reach} м`, 'far');
            g.lastCastWhy = `цель слишком далеко (${Math.round(this._far.d)} м)`;
            return null;
        }
        if (!t) {
            if (isFinal) this._say(`🌀 Наведите руку (или посмотрите) на существо не дальше ${castReach(name)} м и скажите «${name === 'ImperiusMaxima' ? 'Империус Максима' : 'Империус'}»`, 'noaim');
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
        // the eyes: the head's own look (the camera behind the hero looks at the hero, not ahead), and the camera's in first person
        lines.push({ o: head.clone(), d: _look.set(0, 0, -1).applyQuaternion(g.character.getHeadQuaternion ? g.character.getHeadQuaternion(_q) : g.camera.quaternion).clone() });
        if (g.cameraMode === 'fpv') lines.push({ o: head.clone(), d: _look.set(0, 0, -1).applyQuaternion(g.camera.quaternion).clone() });
        // the body's facing, level: close by, «in front of me» is enough (the tracked hand / head wander)
        const by = g.character.group.rotation.y;
        lines.push({ o: head.clone(), d: new THREE.Vector3(-Math.sin(by), -0.25, -Math.cos(by)).normalize(), loose: true });
        let best = null;
        this._far = null; // (in the line but too far: told with its distance — never silence)
        this._hidden = null; // (in the line but behind a wall: told so)
        for (const sys of Object.keys(BODIES)) {
            const B = BODIES[sys];
            B.list(g, (c, x, y, z, up) => {
                if (c.imp) return; // (another mind is in it already)
                const kind = kindOf(sys, c);
                if (!kind) return;
                const cap = B.body ? B.body(c, this._cap || (this._cap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 })) : null;
                for (const L of lines) {
                    // the point of its body nearest to the line (a great body — the dragon — by its whole length, its surface)
                    let r = 0;
                    if (cap) { closestOnSeg(L.o, L.d, cap.a, cap.b, _p1); r = cap.r; } else _p1.set(x, y + up * 0.6, z);
                    _a.copy(_p1).sub(L.o);
                    const dc = _a.length();
                    const d = Math.max(0.3, dc - r);
                    if (dc < 0.3) continue;
                    const ang = Math.max(0, L.d.angleTo(_a.divideScalar(dc)) - Math.atan2(r, dc));
                    if (L.loose ? !(d < 14 && ang < 0.9) : ang > IMPERIUS.AIM_ANG && !(d < 10 && ang < 1.0)) continue; // (close by: roughly in front is enough)
                    const reach = this._reach || IMPERIUS.CAST_R;
                    if (d > reach) { if (ang < IMPERIUS.AIM_ANG && d < reach * 4 && (!this._far || d < this._far.d)) this._far = { d, kind }; continue; }
                    const score = ang * 3 + d * 0.03;
                    if (best && score >= best.score) continue;
                    // (behind a wall: not seen, not taken — the line to its surface)
                    if (col?.lineOfSight && !this._seen(col, L.o, _p1, _a, r, dc, cap)) { if (!this._hidden || d < this._hidden.d) this._hidden = { d, kind }; continue; }
                    best = { sys, id: c.id, kind, c, score, ctx: {} };
                }
            });
        }
        return best;
    }

    /** Is any of it seen from `o` (the point nearest the line, short of its surface; a great body — also its ends and middle)? */
    _seen(col, o, near, dir, r, dc, cap) {
        const see = (p) => col.lineOfSight(o.x, o.y, o.z, p.x, p.y, p.z, Math.max(0.5, Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z) / 240)); // (far: fewer looks along the line)
        if (see(_p2.copy(near).addScaledVector(dir, -Math.min(r, dc - 0.3)))) return true;
        if (!cap) return false;
        for (const k of [0, 0.5, 1]) { _p2.lerpVectors(cap.a, cap.b, k); _p2.y += cap.r * 0.8; if (see(_p2)) return true; } // (its back seen over a bump)
        return false;
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
        // (a player behind «Protection Maxima» or the gods' shield: the foreign mind meets it)
        const shield = sys === 'pl' && (c.local ? !!(g.combat?.shield && (g.combat.shield.type === 2 || g.combat.shield.gods)) : !!(c.combat?.shield === 2 || c.combat?.gods));
        const ok = canTake(kind, name === 'ImperiusMaxima', { shield });
        if (!ok.ok) return ok;
        if (sys === 'pl' && c.imp) return { ok: false, say: '🌀 Этим игроком уже управляют' };
        if (sys === 'D' && c.tame) return { ok: false, say: '🐉 Дракона держит «Брейнрот Максима» — сначала его отпустят' };
        if (g.servants?.masterOf?.(sys, c) != null) g.servants._free?.(sys, c);
        c.imp = { by, mine: by === this.me, sys, name };
        this.hosted.set(sys + ':' + id, { sys, id, by, n: null });
        if (sys === 'pl') this._tellPuppet(id, { e: 'grab', to: id, ctl: by, who: this._nameOf(by) }); // (their computer gives their body over)
        return { ok: true };
    }

    /** (authority) Back to its own mind. */
    unclaim(sys, id) {
        const g = this.game, B = BODIES[sys];
        this.hosted.delete(sys + ':' + id);
        const c = B?.find(g, id);
        if (sys === 'pl') this._tellPuppet(id, { e: 'released', to: id });
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
        this._passT = passTime(B.pos(c, _v).distanceTo(g.character.group.position));
        const ch = g.character;
        this._body = { x: ch.group.position.x, y: ch.group.position.y, z: ch.group.position.z, yaw: ch.group.rotation.y };
        this._heroYaw = ch.group.rotation.y;
        this._yaw0 = B.face(c);
        this.I.yaw = this._yaw0;
        this.I.fly = null; this.I.maxima = name === 'ImperiusMaxima'; this.I.fire = null;
        this.flaps.reset();
        this._flier = flies(this.kind, this.I.maxima);
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
        const how = this.sys === 'pl' ? 'Шагайте на месте — он идёт, поворот тела — поворот. Он смотрит своими глазами, но тело слушается вас'
            : this.kind === 'dragon' ? 'Бегите на месте — он бежит; разбежавшись, машите обеими руками сверху вниз — взлетит. Долгое «У-у-у» — огонь (громче — больше)'
            : this._flier ? 'Машите обеими руками сверху вниз — летит (чаще и сильнее — выше и быстрее), руки в стороны — парит, руки вниз — снижается'
            : 'Шагайте на месте — оно идёт, поворот тела — поворот, взмах руки вперёд — его удар';
        g.hud?.setVoice?.(`🌀 «${ru}» — вы в теле: ${kindRu(this.kind)}. ${how}. «Стоп» — вернуться`, true);
        g.perf?.note?.(`империус: в ${this.kind} (${sys}:${id})`);
    }

    // ============================================================ every frame: my body, my input
    /** Before the hero's legs move (Game._updatePlayer): what the body asks for goes to the creature; its legs stop. */
    input(dt) {
        this.puppetStep(); // (my body walked by another's mind: «Империус Максима» on me)
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
        // the Maxima's wings: the arms' strokes, the arms down / spread (a moment of arms down between strokes is no dive)
        I.stroke = 0; I.arms = '';
        I.pitch = g.smoothHead?.pitch || 0; // (the head bowed — down, as in «Flight»: ImperiusFlight.headPath)
        if (this._flier && this.phase === 'on') {
            I.stroke = this.flaps.update(dt, ch.handLost?.('left') ? null : ch.handRelVelocity?.left, ch.handLost?.('right') ? null : ch.handRelVelocity?.right);
            const arms = armsOf(ch);
            this._armsDownT = arms === 'down' && !this.flaps.on ? this._armsDownT + dt : 0;
            I.arms = arms === 'down' ? (this._armsDownT > 0.8 ? 'down' : '') : arms;
            if (I.stroke) I.strike = false; // (a stroke of the wings is no blow)
        }
        I.strikeNow = I.strike;
        g.camera && I.look.set(0, 0, -1).applyQuaternion(g.camera.quaternion);
        // the dragon's fire: the long «У»
        I.fire = this.kind === 'dragon' && this.phase === 'on' ? this.howl.update(dt) : null;
        if (I.fire?.start) this._say(`🔥 Огонь! (громче «У» — больше пламя; снова — через ${7} с)`, 'fire', 6000);
        ch.setRunning?.(false);
    }

    /** What the voice program heard of a phrase (its letters) and the microphone's level — for the dragon's «У». */
    voiceLetters(written) { if (this.name) this.howl.letters(written); }
    voiceLevel(db) { this.howl.level(db); }
    /** A whole phrase heard: «у-у-у» in a dragon is its fire (the browser's recognizer — no letters there). → true: it was. */
    heardPhrase(text) {
        if (this.kind !== 'dragon' || this.phase !== 'on') return false;
        return this.howl.phrase(text) || /^[\sуюu\-.!…]+$/i.test(String(text || ''));
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
        if (g.authority) { this._hostStep(); this.guards.update(dt); }
        this._fade(dt);
        if (!this.name) { this._beamsOff(); return; }
        // on the way back: only the passage (the creature is its own already — or gone: the mind is home at once)
        if (this.phase === 'out') {
            if (!this.creature) { this._end(); return; }
            this.t += dt / (this._passT || IMPERIUS.PASS_T);
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
            this.t += dt / (this._passT || IMPERIUS.PASS_T);
            this._beamsDraw();
            if (this.t >= 1) { this.phase = 'on'; this._beamsOff(); this._arrive(c); }
        }
        this._sparkEyes(dt);
        if (this.sys === 'pl') { this._sendCtl(dt); this.step('pl', c, dt); return; } // (another player: their computer moves them)
        // the creature's place to the host (I am a guest)
        if (!g.authority) {
            this._sendT -= dt;
            if (this._sendT <= 0) {
                this._sendT = 0.1;
                const n = B.net(c);
                g.sync?.imperius?.({ e: 'pos', k: this.sys, id: this.id, p: [r2(n[0]), r2(n[1]), r2(n[2])], ry: r2(n[3]), w: r2(n[4]), atk: n[5], air: n[6] ? 1 : 0, fire: n[7] ? n[7].map(r2) : undefined });
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
            // (on the way in / out it stands as it is: no walk, no strokes — its flight's state kept)
            let I = this.I;
            if (this.phase !== 'on') { I = Object.assign(this._still || (this._still = {}), STILL, { yaw: B.face(c), fly: this.I.fly, maxima: this.I.maxima, wings: this.I.wings, say: this.I.say }); }
            B.drive(g, c, I, dt);
            if (I !== this.I) this.I.fly = I.fly;
            const hit = B.struck(g, c, this.I);
            this.I.strikeNow = false;
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
            if (id === c.id && (k === sys || (k === 's' && sys === 'sp') || (k === 'sl' && sys === 's') || (k === 'p' && sys === 'pl'))) return; // (not itself)
            const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
            if (d > hit.reach || Math.abs(y - p.y) > 3) return;
            if (d > 0.4 && (dx * fx + dz * fz) / d < 0.5) return; // (in front of it: «лицом к цели»)
            if (!best || d < best.d) best = { k, id, d, x, z };
        };
        for (const z of g.zombies || []) if (!z.isDead && !z.isDying) consider('z', z.id, z.group.position.x, z.group.position.y - (z.gOff || 0), z.group.position.z);
        for (const a of g.animals?.list || []) if (!a.dead) consider('a', a.id, a.group.position.x, a.group.position.y - 0.5, a.group.position.z);
        for (const v of g.castleLife?.byId?.values?.() || []) if (!v.dead) consider('v', v.id, v.x, v.y, v.z);
        for (const d of g.dragons?.list || []) if (!d.dead) consider('D', d.id, d.model.position.x, d.model.position.y, d.model.position.z);
        for (const sp of g.spiders?.list || []) if (!sp.dead) consider('s', sp.id, sp.model.position.x, sp.model.position.y, sp.model.position.z); // (the spider: a servant's key)
        for (const t of g.livingTrees?.list || []) if (!t.isDead) consider('t', t.id, t.model.position.x, t.model.position.y, t.model.position.z);
        for (const ic of g.iceCastle?.list || []) if (!ic.dead) consider('I', ic.id, ic.model.position.x, ic.model.position.y, ic.model.position.z);
        for (const sv of g.ships?.crew?.byId?.values?.() || []) if (!sv.dead) consider('sl', sv.id, sv.x, sv.y, sv.z);
        if (!g.isDeadLocal) consider('p', g.localId, g.character.group.position.x, g.character.group.position.y - 1.95, g.character.group.position.z); // (my own body too: hurt, the mind comes back)
        for (const [id, r] of g.remotes || []) if (!r.dead && r.position) consider('p', id, r.position.x, r.position.y - 1.95, r.position.z);
        if (!best) return;
        const dir = [r2(best.x - p.x), r2(best.z - p.z)];
        if (g.authority) this.land(best.k, best.id, hit.dmg, dir, this.me, { x: p.x, z: p.z }, c);
        else g.sync?.imperius?.({ e: 'hit', k: sys, id: c.id, tk: best.k, tid: best.id, dmg: hit.dmg, d: dir });
    }

    /** (authority) A blow of a creature with a mind in it lands — as a servant's (whose it is: only who saw the cast knows — Blame.js). */
    land(tk, tid, dmg, dir, by, src, attacker = null) {
        const g = this.game;
        if (attacker && (tk === 'v' || tk === 'p' || tk === 'sl')) attacker._impOffence = (attacker._impOffence || 0) + 1; // (it struck a person: a castle's guard sees a madman — ImperiusGuards)
        const d = new THREE.Vector3(dir[0] || 0, 0, dir[1] || 1);
        if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
        d.normalize();
        const n = Math.max(1, Math.min(20, dmg | 0)); // (a dragon's bite 14 at most — DRAGON.BITE)
        if (tk === 'sl') { const v = g.ships?.crew?.byId?.get(tid); if (v && !v.dead) g.ships.crew.hit(v, n, d, by, { via: 'servant' }); return; } // (a sailor)
        g.servants?.damage?.({ k: tk, id: tid }, n, d, by, 'servant', src);
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
        if (this.phase === 'out') { if (why === 'dead' && (g.isDeadLocal || g.combat?.dead)) this._end(); return true; } // (killed on the way back: home at once)
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
        { const c = this.creature; this._passT = passTime(c ? BODIES[this.sys].pos(c, _v).distanceTo(g.character.group.position) : 0); }
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
        this.I.fly = null; this.I.fire = null; this._flier = false;
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

    /** (host) a word for a controlled player — to their computer (or to mine, if it is me). */
    _tellPuppet(id, m) {
        if (id === this.me) this.onNet({ ...m, from: this.me }, false, true);
        else this.game.sync?.imperius?.(m);
    }

    _nameOf(id) { return id === this.me ? (this.game.net?.name || 'Игрок') : (this.game.remotes?.get(id)?.name || 'Игрок'); }

    /** The network: {e: take | took | pos | hit | end | grab | released | ctl | free, …}. */
    onNet(m, isHost, self = false) {
        const g = this.game;
        const from = m.from || m.by;
        // a controlled player: what their body is told, the grab and the release (sent to all; for one) — and the host passes them on
        if (m.e === 'grab' || m.e === 'released' || m.e === 'ctl' || m.e === 'free') {
            if (m.to === this.me) { this._puppetNet(m, from); return; }
            if (isHost && !self && from !== this.me) g.sync?.imperius?.({ ...m, by: undefined }); // (from a guest to another: through the host)
            return;
        }
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
            if (m.e === 'pos' && m.k === 'pl') return;
            if (m.e === 'pos' && Array.isArray(m.p)) H.n = { x: +m.p[0] || 0, y: +m.p[1] || 0, z: +m.p[2] || 0, ry: +m.ry || 0, w: Math.max(0, Math.min(1, +m.w || 0)), atk: !!m.atk, air: !!m.air, fire: Array.isArray(m.fire) && m.fire.length === 4 ? m.fire.map((x) => Math.max(-2, Math.min(2, +x || 0))) : null };
            else if (m.e === 'hit') {
                const c = BODIES[m.k]?.find(g, m.id);
                if (c) { const p = BODIES[m.k].pos(c, _a); this.land(m.tk, m.tid, m.dmg, Array.isArray(m.d) ? m.d : [0, 1], from, { x: p.x, z: p.z }, c); }
            } else if (m.e === 'end') this.unclaim(m.k, m.id);
            return;
        }
        if (m.e === 'took' && m.to === this.me && this._pending && this._pending.sys === m.k && this._pending.id === m.id) {
            this.onTaken(m.k, m.id, this._pending.name, { ok: !!m.ok, say: m.say });
        }
    }

    // ============================================================ a player controlled (the Maxima): their side
    /** The words for MY body when another's mind holds it: grab | ctl | released (from the host / the controller). */
    _puppetNet(m, from) {
        const g = this.game;
        if (m.e === 'grab') {
            this.puppet = { by: m.ctl ?? from, at: performance.now(), I: { yaw: g.character.group.rotation.y, w: 0, r: 0, j: 0 }, jumps: null, hp: this._hpNow() };
            this.stop('focus'); // (my own mind out somewhere: back first)
            g.focus?.lose?.('stun'); // (what I held falls: my hands are not mine)
            g.hud?.setVoice?.(`🌀 «Империус Максима»: вашим телом управляет ${m.who || 'другой игрок'}! Вы видите своими глазами, но тело не слушается. Сильный удар (больше ${IMPERIUS_MAXIMA.PLAYER_BREAK}) вырвет вас`, true);
            g.perf?.note?.('империус: моим телом управляет ' + (m.who || '?'));
        } else if (m.e === 'released') {
            if (this.puppet) g.hud?.setVoice?.('🌀 Вы снова владеете своим телом', true);
            this.puppet = null;
        } else if (m.e === 'free') {
            // (I am the controller: the player tore free / went quiet / died)
            if (this.sys === 'pl' && this.name) { this._say(m.why === 'blow' ? '🌀 Удар вырвал игрока из-под вашей власти' : '🌀 Связь с игроком потеряна', 'pfree', 1500); this.stop('lost'); }
        } else if (m.e === 'ctl' && this.puppet) {
            this.puppet.at = performance.now();
            const I = this.puppet.I;
            I.yaw = +m.y || 0; I.w = Math.max(0, Math.min(1, +m.w || 0)); I.r = m.r ? 1 : 0; I.j = m.j | 0;
        }
    }

    /** (Game._updatePlayer, before the legs move) my body walked by the other's mind. */
    puppetStep() {
        const P = this.puppet;
        if (!P) return;
        const g = this.game, ch = g.character;
        // the controller gone quiet, my body dead, a hard blow: I tear free
        const hp = this._hpNow();
        const torn = performance.now() - P.at > 2500 ? 'quiet' : g.isDeadLocal || g.combat?.dead ? 'dead' : P.hp - hp >= IMPERIUS_MAXIMA.PLAYER_BREAK ? 'blow' : null;
        P.hp = Math.max(hp, P.hp - 0.5 * (P.hp - hp)); // (a blow counts at once; little ones over time don't add up to one)
        if (torn) {
            this.puppet = null;
            g.sync?.imperius?.({ e: 'free', to: P.by, why: torn });
            if (torn === 'blow') g.hud?.setVoice?.('🌀 Удар вырвал вас из-под «Империуса» — тело снова ваше!', true);
            else if (torn === 'quiet') g.hud?.setVoice?.('🌀 Чужой разум отпустил вас', true);
            return;
        }
        const I = P.I;
        ch.setRunning?.(I.w > 0.02, I.w);
        ch.setBodyRotation?.(I.yaw);
        g.smoothBody = I.yaw; g.cameraBaseRotation = I.yaw;
        if (P.jumps == null) P.jumps = I.j;
        if (I.j !== P.jumps) { P.jumps = I.j; if (ch.onGround) ch.jump?.(0.8); }
    }

    /** (the controller) what the other player's body is told, 15 times a second. */
    _sendCtl(dt) {
        const g = this.game, I = this.I;
        this._ctlT = (this._ctlT || 0) - dt;
        if (I.jump) this._jumps = (this._jumps || 0) + 1;
        if (this._ctlT > 0) return;
        this._ctlT = 1 / 15;
        const m = { e: 'ctl', to: this.id, y: r2(I.yaw), w: r2(this.phase === 'on' ? I.walk : 0), r: I.run ? 1 : 0, j: this._jumps || 0 };
        if (g.authority) this._tellPuppet(this.id, m); else g.sync?.imperius?.(m);
    }

    /**
     * The body left standing was harmed — ANY harm (a blow, a bite, an arrow, a spell, fire, a fall, a blast, lightning, bleeding…:
     * every one goes through Combat.damage / Game.damageLocalPlayer; a shield that took it all — none). The author: the mind
     * comes back at once (a short stun). A deadly one is the body's ordinary death (Concentration → stop('dead')).
     */
    interruptByDamage(amount, kind = null) {
        if (!this.name || !(amount > 0) || this.phase === 'out') return false;
        this.game.perf?.note?.('империус: тело ранено (' + (kind || '?') + ') — сознание вернулось');
        return this.stop('hurt');
    }

    /** (CastleLife._scan) the creatures with a mind in them (mine; the host — the guests' too) as {id, p} «players». */
    eyes(out) {
        const g = this.game;
        const add = (sys, c) => { if (c && !BODIES[sys].dead(c)) out.push({ id: 'imp:' + sys + ':' + c.id, p: BODIES[sys].pos(c, new THREE.Vector3()) }); };
        if (this.name && this.sys !== 'pl') add(this.sys, this.creature);
        if (g.authority) for (const H of this.hosted.values()) if (H.sys !== 'pl') add(H.sys, BODIES[H.sys]?.find(g, H.id));
        return out;
    }

    /** Where my eyes are while the mind is out (the creature's feet) — the world streams round it (Game). null: in my body. */
    focusPos(out) {
        if (!this.name) return null;
        const c = this.creature;
        return c ? BODIES[this.sys].pos(c, out) : null;
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

const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** The point of the segment a–b nearest to the ray o + t·d (t ≥ 0). */
function closestOnSeg(o, d, a, b, out) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const wx = a.x - o.x, wy = a.y - o.y, wz = a.z - o.z;
    const A = ux * ux + uy * uy + uz * uz, B = ux * d.x + uy * d.y + uz * d.z, C = d.x * d.x + d.y * d.y + d.z * d.z;
    const D = ux * wx + uy * wy + uz * wz, E = d.x * wx + d.y * wy + d.z * wz;
    const den = A * C - B * B;
    let s = den > 1e-9 ? (B * E - C * D) / den : 0;
    s = Math.max(0, Math.min(1, s));
    return out.set(a.x + ux * s, a.y + uy * s, a.z + uz * s);
}

/** The creature's name for the line «вы в теле: …». */
export function kindRu(kind) {
    const RU = { zombie: 'зомби', villager: 'житель', knight: 'рыцарь', wizard: 'волшебник', cow: 'корова', sheep: 'баран', horse: 'конь', pig: 'свинья', sailor: 'моряк', king: 'король', towerHead: 'глава башни',
        dragon: 'дракон', owl: 'сова', phoenix: 'феникс', bookbird: 'книга-птица', pegasus: 'Пегас', runbook: 'бегущая книга', guardBeast: 'страж стада', spider: 'гигантская паучиха', tree: 'ожившее дерево', skeleton: 'скелет',
        snowman: 'снеговик', iceMonster: 'ледяной монстр', iceQueen: 'Ледяная Королева', blackbeard: 'капитан Чёрные Усы', pirateSkeleton: 'скелет-пират', player: 'игрок' };
    return RU[kind] || kind;
}
