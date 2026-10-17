/**
 * BodyFound.js — somebody of a castle, a village or a wizards' tower was killed where nobody saw
 * it: no-one knows who did it. But the body lies there. Whoever of its people comes by and sees
 * it cries out; the place is on the alert for a while:
 *   - the ones who fight (knights, the king, the brave wizards) come to the body, look round and
 *     then search the place; any stranger they see about (a player who is not its king) is a
 *     suspect — they go for him;
 *   - the others run home / away from there, the sleepers are woken (a tower at night: everybody up).
 * Who did it is never known from the body alone: a stranger who keeps away is not attacked.
 *
 * The host runs it (with all the castle people). Bodies: src/game/Death.js (`k: 'v'`, `who` = the
 * person's id «site:idx»). «На кого»: only the bodies of a site's own people raise its alarm (a
 * zombie's, an animal's, a sailor's body — no); the suspects are players (other creatures are not
 * «strangers»: the knights deal with zombies their own way).
 */

const SEE_BODY = 16; // m: a body is seen this far (with a free line of sight)
const ALERT_MS = 150000; // how long the place stays on the alert
const SUSPECT_R = 22; // m: a stranger seen this close on the alert is a suspect
const HOSTILE_MS = 180000;

export const BODY_LINES = {
    found: ['Убит! Здесь убийца!', 'О нет… Его убили!', 'Тревога! Убийство!', 'Кто это сделал?!'],
    foundWiz: ['Убит! Палочки к бою — в академии чужак!', 'Наставник! Здесь тело!', 'Тревога! Кто-то убил нашего!', 'Обыскать башню! Убийца здесь!'],
    suspect: ['Вот он! Чужак!', 'Стой! Это ты его убил?!', 'Держи чужака!'],
    suspectWiz: ['Чужак в академии! Остолбеней его!', 'Это он! Палочки к бою!', 'Стой, чужак!'],
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class BodyFound {
    constructor(life) {
        this.life = life;
        this.game = life.game;
        this.seen = new Set(); // ids of the bodies already found
        this._t = 0;
    }

    /** (host) A few times a second: does anybody see a body of their own people? */
    update(dt) {
        this._t -= dt;
        if (this._t > 0) return;
        this._t = 0.7;
        const L = this.life, bodies = this.game.death?.bodies;
        if (!bodies?.size) return;
        for (const b of bodies.values()) {
            if (b.k !== 'v' || this.seen.has(b.id) || typeof b.who !== 'string') continue;
            const cid = b.who.slice(0, b.who.lastIndexOf(':'));
            const cs = L.castles.get(cid);
            if (!cs?.awake) continue;
            const at = { x: b.x, y: b.y, z: b.z };
            for (const w of cs.active.values()) {
                if (w.dead || w.sleep?.phase === 'lie' || w.servantOf != null || w.stunT > 0) continue;
                if (Math.abs(w.x - at.x) > SEE_BODY || Math.abs(w.z - at.z) > SEE_BODY || Math.abs(w.y - at.y) > 5) continue;
                if (Math.hypot(w.x - at.x, w.z - at.z) > SEE_BODY || !L._sees(w, at)) continue;
                this.seen.add(b.id);
                this._found(cs, w, at);
                break;
            }
        }
    }

    /** `w` found a body at `at`: the alarm. */
    _found(cs, w, at) {
        const L = this.life, now = Date.now();
        const wiz = cs.def.kind === 'tower' || cs.def.kind === 'wander';
        cs.alertUntil = now + ALERT_MS;
        cs.alertAt = at;
        L._say(w, pick(wiz ? BODY_LINES.foundWiz : BODY_LINES.found), 4);
        // a tower at night: everybody up (as the night watch does on trouble — NightLife._tower)
        if (cs.def.kind === 'tower' && this.game.isNight && !(cs.wizAlarmUntil > now)) {
            cs.wizAlarmUntil = now + 180000;
            for (const v of cs.active.values()) if (v.sleep) L.night?.wake?.(v, 'alarm');
            cs.wizNight = false;
            L.wizards._staff(cs);
        } else L.night?.noise?.(at, 30);
        let comers = 0;
        for (const v of cs.active.values()) {
            if (v.dead || v.foe || v.servantOf != null) continue;
            const d = Math.hypot(v.x - at.x, v.z - at.z);
            if (d > 90) continue;
            if (L._fights(v)) {
                // the nearest few come to look at it (a tower / a castle: along their paths)
                if (comers < 4 && cs.graph.nodes.length && !v.investigate) { v.investigate = { x: at.x, y: at.y, z: at.z, by: null, t: 40 }; v.path = null; v.lookT = 0; comers++; }
            } else if (d < 40) {
                v.fleeAt = { x: at.x, z: at.z }; v.fleeFrom = null; v.fleeT = 8; v.fleeing = false;
            }
        }
        // (a castle: a couple of knights come out to look too)
        if (cs.def.knights > 0 && comers < 2) L._sendGuards?.(cs, at, null, 2);
    }

    /**
     * (host, from CastleLife._think) A fighter with no foe while the place is on the alert: a
     * stranger seen close is a suspect — the place turns on him.
     */
    suspect(v) {
        const L = this.life, cs = v.cs, now = Date.now();
        if (!(cs?.alertUntil > now) || v.servantOf != null) return false;
        const owner = L.state(cs.def.id).owner;
        for (const pl of L._players()) {
            if (pl.id === owner) continue;
            const p = pl.p;
            if (Math.hypot(p.x - v.x, p.z - v.z) > SUSPECT_R || Math.abs(p.y - 1.95 - v.y) > 8 || !L._sees(v, p)) continue;
            const was = cs.hostile.get(pl.id) > now;
            cs.hostile.set(pl.id, now + HOSTILE_MS);
            v.foe = pl.id; v.investigate = null; v.path = null;
            const wiz = !!v.wizard;
            L._say(v, pick(wiz ? BODY_LINES.suspectWiz : BODY_LINES.suspect), 3);
            // the others near hear the cry
            for (const o of cs.active.values()) if (!o.dead && !o.foe && o !== v && L._fights(o) && Math.hypot(o.x - v.x, o.z - v.z) < 35) o.foe = pl.id;
            if (!was) console.info('[BodyFound] suspect:', pl.id, cs.def.name); // (no hint: the cry and the people coming say it)
            return true;
        }
        return false;
    }

    snapshot() { return [...this.seen]; }
    restore(list) { this.seen = new Set(list || []); }
}
