/**
 * Slash.js — «Sectura» («Сектура»), the cutting curse of black magic (the rules and the author's words: SlashRules.js).
 *
 *   word  → the wand ARMS (a crimson edge of sparks on its tip, 4 s; nothing is paid yet)
 *   swing → the wand hand's fast SIDEWAYS sweep lets go the slash: 50 mana, a message to all (`spell Sectura`, the pointing + the swing's roll in the direction's length)
 *   every computer: the picture of the blade flies out; the people it crosses are cut — where each is decided:
 *       me as the victim — my computer (a severed limb: Dismemberment._cutMe; a wound: Combat.damage + Bleeding.startFor)
 *       creatures — the host (Dismemberment.apply; the wound: the creature's own hit)
 *       other players — their own computer
 *
 * The blade is virtual: the edge (a segment along the swing's direction) sweeps forward along the pointing and Dismember's own bone test is run against it (sweepCut / judgeCut:
 * «the edge crosses the bone line, fast enough, the torso/skull did not stop it first, steel stops it») — so a level swing at the neck's height takes a head, one at the knees a leg.
 *
 * «А если»: no swing in 4 s → nothing is spent; not enough mana at the swing → «не хватает маны», the arming stays; two spells at once → concentration is not asked (an instant);
 * the hand lowered / a lost hand / dead / a swim or a ride → disarmed; the caster's own wand-side only; another player's slash on me with my «Protection» up / the gods' shield /
 * a robe's perk → turned away; frozen → a hit shatters (Combat.damage); the caster far/dead on arrival — the message carries the origin, nothing needs the caster alive;
 * creatures: a body behind a wall is not touched (the sheet stops at the first block and a house's dome); `by` is the caster (the castle sees who did it).
 */
import * as THREE from 'three';
import { castingHand } from './WandAim.js';
import { SLASH, SLASH_TARGETS, rollDamage, swingOf, swingFromRoll, packDir, unpackDir, sheetHit, bladeSweeps } from './SlashRules.js';
import { characterBody } from './CutBodies.js';

const _o = new THREE.Vector3(), _f = new THREE.Vector3(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3(), _v = new THREE.Vector3();
const _quat = new THREE.Quaternion(), _m = new THREE.Matrix4();
const BLOOD = 0xc0001c, EDGE = 0xff3050, CORE = 0xffe4e8;

// the blade's picture: one shared crescent geometry (a curved ribbon across the sheet, its tips trailing), one shared material
let _crescent = null, _mat = null;
function crescentGeo() {
    if (_crescent) return _crescent;
    const N = 28, pos = [], col = [], idx = [];
    for (let i = 0; i <= N; i++) {
        const u = i / N * 2 - 1; // −1…1 across the sheet
        const lag = 0.16 * u * u; // the tips lag behind the middle (a crescent)
        const thick = 0.10 * (1 - Math.abs(u) ** 1.6) + 0.004; // thick in the middle, a needle at the tips
        pos.push(u * SLASH.HALF_W, 0, -lag - thick, u * SLASH.HALF_W, 0, -lag + thick * 0.35);
        const k = 1 - Math.abs(u) ** 2.2;
        col.push(1, 0.2 + 0.7 * k, 0.28 + 0.65 * k, 1, 0.95, 0.96); // the back crimson, the edge white-hot
        if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.userData.shared = true;
    _crescent = g;
    return g;
}
function bladeMat() {
    return _mat || (_mat = Object.assign(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), { userData: { shared: true } }));
}

export class Slash {
    constructor(game) {
        this.game = game;
        this.armed = null; // {side, t (left), age}
        this.flights = []; // the pictures flying: {mesh, o, f, range, t}
        this.pool = [];
        this._tipT = 0;
        this._lastAt = -1e9;
    }

    /** A sample for the shader warm-up (Game.prewarm). */
    sampleMesh() { const m = new THREE.Mesh(crescentGeo(), bladeMat()); m.frustumCulled = false; return m; }

    // ============================================================ my side: the word, the swing
    /** The word (my computer): the wand arms. */
    cast(isFinal) {
        const g = this.game, ch = g.character;
        if (!isFinal) return null;
        const now = performance.now();
        if (now - this._lastAt < 700) return null;
        const hint = (t) => { g.hud.setVoice(t, true); return null; };
        const aim = castingHand(g);
        if (!aim || !ch.isArmRaised(aim.side)) return hint('🩸 Поднимите палочку и скажите «Sectura» — потом взмахните ею в сторону, рассекая воздух');
        if (g.dismember?.handLost?.(ch, aim.side)) return hint('🩸 Этой руки нет — колдовать ею нельзя');
        const tired = g.combat.check('Sectura');
        if (tired) { g.hud.setVoice(tired, true); return null; }
        this.armed = { side: aim.side, t: SLASH.ARM_WINDOW, age: 0 };
        g.hud.setVoice('🩸 Палочка заточена — взмахните ею в сторону: рассеките воздух (мана — при взмахе)', true);
        return 'Sectura'; // (Game.castLocalSpell plays its «shing» from the card SPELL_SOUND)
    }

    disarm(why = null) {
        if (!this.armed) return;
        this.armed = null;
        if (why) this.game.hud.setVoice(why, true);
    }

    /** Every frame: the arming's sparks, the swing's watch, the flying pictures. */
    update(dt) {
        const g = this.game, ch = g.character;
        this._fly(dt);
        const a = this.armed;
        if (!a) return;
        a.age += dt; a.t -= dt;
        if (g.isDeadLocal || g.combat?.dead || ch.swimming || ch.swimY != null) { this.armed = null; return; }
        if (a.t <= 0) { this.disarm('🩸 Взмаха не было — палочка остыла (мана не потрачена)'); return; }
        const aim = castingHand(g);
        if (!aim || aim.side !== a.side || !ch.isArmRaised(a.side)) { this.disarm('🩸 Рука опущена — палочка остыла (мана не потрачена)'); return; }
        // the crimson edge on the wand's tip
        this._tipT -= dt;
        if (this._tipT <= 0) {
            this._tipT = 0.05;
            for (let i = 0; i < 2; i++) g.fx.spark(_p.copy(aim.origin).addScaledVector(aim.dir, 0.2 + Math.random() * 0.9), i ? CORE : EDGE, 0.06, _v.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.3) * 1.2, (Math.random() - 0.5) * 1.2), 0.35);
        }
        if (a.age < SLASH.GRACE) return;
        const vel = ch.handVelocity?.[a.side];
        if (!vel) return;
        const sw = swingOf(aim.dir.clone().normalize(), vel);
        if (!sw) {
            if (vel.length() >= SLASH.SWING_SPEED && !a.toldThrust) { a.toldThrust = true; g.hud.setVoice('🩸 Это укол, а не взмах — махните палочкой в сторону', true); }
            return;
        }
        // the swing: pay, let go
        const tired = g.combat.check('Sectura');
        if (tired) { if (!a.toldMana) { a.toldMana = true; g.hud.setVoice(tired, true); } return; }
        g.combat.pay('Sectura');
        this._lastAt = performance.now();
        this.armed = null;
        const f = aim.dir.clone().normalize();
        const d = packDir(f, sw.roll01, new THREE.Vector3());
        g.spells.cast('Sectura', aim.origin, d, a.side, g.localId);
        g.sync?.spell('Sectura', aim.origin, d, a.side);
    }

    // ============================================================ every computer: the blade
    /** The spell arrives (mine at once, others' by the net): `d` — the pointing with the roll in its length. */
    fire(o, d, casterId, side) {
        const g = this.game;
        const mine = casterId === g.localId || casterId === 'local';
        const by = mine ? g.localId : casterId;
        const { f, roll01 } = unpackDir(d, new THREE.Vector3());
        const s = swingFromRoll(f, roll01, new THREE.Vector3());
        let range = SLASH.RANGE;
        range = g.wards?.clipRay?.(o, f, range) ?? range; // (a house's sphere stops it from outside)
        const wall = g.terrain?.data?.raycast?.(o, f, range);
        if (wall) range = Math.max(0.5, wall.dist - 0.3); // (the first block: the blade ends)
        this._launch(o, f, s, range, mine);
        // who is crossed (nearest first)
        const duel = g.duel;
        if (!duel) return;
        const bodies = duel._bodies(mine ? duel.me : by, 14, true);
        const hits = [];
        for (const b of bodies) {
            let tf = -1;
            for (let k = 0; k <= 4 && tf < 0; k++) { _p.lerpVectors(b.a, b.b, k / 4); tf = sheetHit(o, f, s, range, _p, b.r); }
            if (tf >= 0) hits.push({ kind: b.kind, id: b.id, tf, r: b.r, at: _q.lerpVectors(b.a, b.b, 0.5).clone() });
        }
        hits.sort((x, y) => x.tf - y.tf);
        const sweeps = bladeSweeps(o, f, s, range);
        const caster = o.clone();
        let n = 0;
        for (const h of hits) {
            if (++n > 8) break;
            const T = SLASH_TARGETS[h.kind];
            if (!T || T.does === 'none') { if (T && mine) this._none(h.kind, T); continue; }
            g.fx.blood?.(h.at, 8);
            if (h.kind === 'p') { if (h.id === g.localId) this._hitMe(by, caster, f, sweeps, h); continue; } // (a player: his own computer)
            if (!(g.authority || !g.sync)) continue; // (a creature: the host decides)
            this._hitCreature(h, T, by, sweeps, mine);
        }
    }

    /** «Does not act» — told to the caster once per kind. */
    _none(kind, T) {
        const g = this.game;
        this._told = this._told || new Set();
        if (this._told.has(kind)) return;
        this._told.add(kind);
        g.hud?.setVoice?.('🩸 Режущее заклятие не берёт: ' + T.why.replace(/^[^:]*: ?/, ''), true);
    }

    /** The virtual blade's sweeps against one body → a cut result or null. `who`: a Dismemberment body. */
    _cutOf(who, t, sweeps, h) {
        const dm = this.game.dismember;
        if (!dm || !who?.body) return null;
        let best = null;
        for (const sw of sweeps) {
            if (sw.t1 < h.tf - h.r - 1.2) continue; // (the pieces that pass the body)
            if (sw.t0 > h.tf + h.r + 1.2) break;
            _f.set(sw.e1a[0] - sw.e0a[0], sw.e1a[1] - sw.e0a[1], sw.e1a[2] - sw.e0a[2]).normalize();
            _quat.setFromUnitVectors(_v.set(1, 0, 0), _f); // (the edge's «facing» = its way of flight: the model's +X)
            const ctx = { w: { quaternion: _quat, magic: true, bonus: 0 }, E: { cutSpeed: 6.5, sides: 2 }, e0a: sw.e0a, e0b: sw.e0b, e1a: sw.e1a, e1b: sw.e1b, dt: sw.dt, prevTip: 1e3, tipSpeed: 1e3 };
            const res = dm.tryCutWho(who, t, ctx);
            if (res && res.kind === 'cut' && res.sever) return res;
            if (res && (res.kind === 'armour' || res.kind === 'blocked') && !best) best = res;
        }
        return best;
    }

    // ------------------------------------------------------------ me
    _hitMe(by, caster, f, sweeps, h) {
        const g = this.game, c = g.combat, ch = g.character;
        if (!c?.enabled || c.dead || g.isDeadLocal) return;
        if (c.godsKeepsOff?.('Sectura')) { c._godsFx?.(null); return; } // (the gods' shield: nothing but the gods' own)
        if (c.shieldFactor?.(caster) >= 1 && c._blocked?.(caster, 'Sectura')) return; // (my «Protection» turned it away)
        if (g.armor?.guard?.('Sectura')) return; // (a robe's perk)
        const body = characterBody(ch);
        const who = { k: 'p', id: g.localId, t: null, body, r: { look: ch.look, character: ch } };
        const res = c.frozen ? null : this._cutOf(who, null, sweeps, h);
        if (res && res.kind === 'cut' && res.sever) {
            g.dismember?.apply?.(who, res.sever, by, true);
            g.hud.flashColor?.('rgba(190, 0, 28, 0.55)');
            return;
        }
        const dmg = rollDamage();
        g.hud.flashColor?.('rgba(190, 0, 28, 0.4)');
        c.damage(dmg, by, 'Slash');
        if (!c.dead) g.bleeding?.startFor?.(SLASH.BLEED_RATE, SLASH.BLEED_TIME, res?.kind === 'armour' ? '🩸 Лезвие скользнуло по латам, но задело — идёт кровь («Rescue» остановит)' : `🩸 Вас рассекло: −${dmg} HP, идёт кровь («Rescue» остановит)`);
    }

    // ------------------------------------------------------------ creatures (the host)
    _creatureOf(kind, id) {
        const g = this.game;
        if (kind === 'z') return g.zombieById?.get(id) || null;
        if (kind === 's') return g.spiders?.byId?.(id) || null;
        if (kind === 'D') return g.dragons?.byId?.(id) || null;
        if (kind === 'I') return g.iceCastle?.byId?.(id) || null;
        return g.duel?._creature(kind, id) || null;
    }

    _hitCreature(h, T, by, sweeps, mine) {
        const g = this.game;
        const t = this._creatureOf(h.kind, h.id);
        if (!t || t.dead || t.isDead) return;
        const dmg = rollDamage();
        const startle = () => { if (h.kind === 'v') g.castleLife?.startle?.(t, by, h.at, { hit: true }); else if (h.kind === 'c') g.ships?.crew?.startle?.(t, by, h.at, { hit: true }); };
        if (T.does === 'cut') {
            const dm = g.dismember;
            const who = dm?.which(t);
            if (who?.body) {
                // (a skeleton of the black ship: bones — a blade passes between them; Sailors.pirateBoneDamage decides below as for any harm)
                const res = this._cutOf(who, t, sweeps, h);
                if (res && res.kind === 'cut' && res.sever) { dm.apply(who, res.sever, by, true); startle(); return; }
                this._wound(h, t, dmg, by, who, res);
                startle();
                return;
            }
        }
        this._wound(h, t, dmg, by, null, null);
    }

    /** A deep cut (no bone crossed, or steel on the way): the creature's own damage + a bleeding wound. */
    _wound(h, t, dmg, by, who, res) {
        const g = this.game;
        switch (h.kind) {
            case 'z': g.damageZombie?.(t, dmg, true, null, by); return;
            case 'v': g.castleLife?.hit(t, dmg, null, by, { spell: true }); break;
            case 'c': g.ships?.crew?.hit(t, dmg, null, by, { spell: true }); break;
            case 'a': g.animals?.hit(t, dmg, null, by); break;
            case 's': g.spiders?.hit?.(t, dmg, 'Slash', by); break;
            case 't': g.livingTrees?.hit(t, dmg, 'Slash', by); return; // (wood: no blood)
            case 'b': g.books?.hitBird?.(t, 99); return;
            case 'D': g.dragons?.hit(t, dmg, 'Slash', by); return;
            case 'f': g.phoenixes?.hit(t, dmg, 'Slash', by); return;
            case 'N': g.canaries?.hit(t, dmg, 'Slash', by); return;
            case 'T': g.tarons?.hit(t, dmg, 'Slash', by); return;
            case 'C': g.customCreatures?.hit(t, dmg, 'Slash', by); return;
            case 'o': g.owls?.hit(t, dmg, 'Slash', by); return;
            case 'S': g.spencers?.hit?.(t, dmg, 'Slash', by); return;
            case 'I': g.iceCastle?.hit(t, dmg, 'Slash', by); return;
            case 'P': g.plants?.hit(t, dmg, 'Slash', by); return;
            default: return;
        }
        // (a flesh wound: it bleeds for a while, a boss does not)
        if (who && !t.dead && !t.isDead) g.dismember?._bleed(who, SLASH.BLEED_RATE, by, SLASH.BLEED_TIME);
    }

    // ============================================================ the picture
    _launch(o, f, s, range, mine) {
        const g = this.game;
        const m = this.pool.pop() || new THREE.Mesh(crescentGeo(), bladeMat());
        m.frustumCulled = false;
        m.renderOrder = 6;
        // the mesh's axes: x = the swing (the sheet's width), z = the flight (its thickness is along z; the sheet lies in x-z, so the sheet's normal is y = z × x)
        _m.makeBasis(s, _v.crossVectors(f, s).normalize(), f);
        m.quaternion.setFromRotationMatrix(_m);
        m.position.copy(o);
        m.visible = true;
        m.userData.mat = null;
        this.game.scene.add(m);
        this.flights.push({ mesh: m, o: o.clone(), f: f.clone(), s: s.clone(), range, t: 0 });
        // the sparks along the sheet's edge as the wand lets it go
        for (let i = 0; i < 26; i++) {
            const u = (i / 25) * 2 - 1;
            g.fx.spark(_p.copy(o).addScaledVector(s, u * SLASH.HALF_W).addScaledVector(f, 0.6), i % 3 ? EDGE : CORE, 0.09, _v.copy(f).multiplyScalar(5 + Math.random() * 4).addScaledVector(s, (Math.random() - 0.5) * 2), 0.5);
        }
        if (mine) { g.sound?.spellCast?.('SecturaSwing', o); g.sync?.castSound?.('SecturaSwing', o); g.mana?.success?.('Sectura'); }
    }

    _fly(dt) {
        for (let i = this.flights.length - 1; i >= 0; i--) {
            const F = this.flights[i];
            F.t += dt;
            const k = Math.min(1, F.t / SLASH.FLY_TIME), e = 1 - (1 - k) * (1 - k);
            F.mesh.position.copy(F.o).addScaledVector(F.f, F.range * e);
            const fade = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
            const sc = 0.55 + 0.45 * Math.min(1, F.t / 0.08);
            F.mesh.scale.set(sc, 1, 1 + 2 * (1 - e));
            F.mesh.material = this._fadeMat(fade);
            if (k >= 1) { this.game.scene.remove(F.mesh); F.mesh.visible = false; this.pool.push(F.mesh); this.flights.splice(i, 1); }
        }
    }

    /** One shared material per fade step (a few: no per-frame materials). */
    _fadeMat(fade) {
        const q = Math.max(0, Math.min(10, Math.round(fade * 10)));
        this._mats = this._mats || [];
        let m = this._mats[q];
        if (!m) { m = this._mats[q] = bladeMat().clone(); m.opacity = q / 10; m.userData.shared = true; }
        return m;
    }

    dispose() { for (const F of this.flights) this.game.scene.remove(F.mesh); this.flights.length = 0; }
}
