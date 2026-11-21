/** The lone house's defender: out through the door, fighting inside an intact ward, repairing after quiet. */
import { FX } from '../fx/WizardFx.js';
import { PVP } from './Combat.js';

export class WizardHome {
    constructor(wizards) { this.wizards = wizards; this.life = wizards.life; this.game = wizards.game; }

    ward(v) {
        if (v.cs?.def?.type !== 'magehut') return null;
        const w = this.game.wards?.list.get(v.cs.wardId || 'site:' + v.cs.def.id);
        return w && w.hp > 0 ? w : null;
    }

    allowsPersonalShield(v, threatened = false) {
        return v.cs?.def?.type !== 'magehut' || (threatened && !this.ward(v));
    }

    lowerPersonalShield(v) {
        if (!(v.fx & (FX.SHIELD | FX.DOME)) || !this.ward(v)) return;
        v.fx &= ~(FX.SHIELD | FX.DOME);
        v.shieldT = 0; v.domeT = 0;
    }

    alarm(v, at, by = null) {
        if (v.dead || v.servantOf != null || v.cs?.def?.type !== 'magehut') return false;
        if (v.sleep) this.life.night?.wake?.(v, 'alarm');
        this.lowerPersonalShield(v);
        const old = v.homeGuard, h = v.cs.def.houses[0];
        const c = h.c || this.ward(v)?.c;
        const indoors = !c || Math.hypot(v.x - c.x, v.z - c.z) < h.r;
        v.homeGuard = { ...old, at: { x: at.x, z: at.z }, by: by ?? old?.by ?? null, quiet: 0, exit: old?.exit ?? indoors };
        v.hunt = null; v.investigate = null; v.shelter = null; v.later = null;
        v.fleeT = 0; v.fear = null; v.seated = false; v.job = 'wander'; v.post = null; v.practice = null;
        if (!old) v.path = null;
        if (!old) this.life.alog?.decision(v, 'нападение на дом — выходит через дверь, защищается внутри чар дома');
        return true;
    }

    /** HouseWards calls this even when an incoming explosion is stopped outside the house. */
    attacked(w, by, at = w.c) {
        if (!w.id.startsWith('site:')) return;
        const now = Date.now();
        if (w.npcAlarmBy === by && now < (w.npcAlarmAt || 0) + 250) return;
        w.npcAlarmAt = now; w.npcAlarmBy = by;
        const cs = this.life.castles.get(w.id.slice(5));
        if (!cs || cs.def.type !== 'magehut') return;
        for (const v of cs.active.values()) if (v.wizard && !v.dead) {
            // (the master of the house feels his own ward being broken — wherever the blow came from, within 160 m: he knows who it is and where; the author 21.11:
            //  «я сломал защиту его дома — он никак не отреагировал, пошёл спать»)
            const fp = this.life._playerPos(by), felt = !!fp && Math.hypot(fp.x - v.x, fp.z - v.z) < 160;
            const known = fp && (felt || this.life._knows(v, by, at, 'blast'));
            this.alarm(v, known ? fp : at, known ? by : null);
            if (known) { v.foe = by; cs.hostile.set(by, Date.now() + 120000); }
        }
    }

    /**
     * (host, every 0.5 s) A stranger INSIDE the house (the author 21.11: «если я вхожу в дверь, они должны просыпаться и начинать активничать — я вторгся в
     * их дом»): the master of the house wakes at once (asleep or not), stands to defend (alarm) and goes for the intruder — unless the intruder is
     * a friend of his (RelationRules: friendship / love ≥ 20). Once per entry: while the intruder stays he is a foe already.
     */
    intrusion(dt) {
        this._intT = (this._intT || 0) - dt;
        if (this._intT > 0) return;
        this._intT = 0.5;
        const L = this.life, players = L._players();
        if (!players.length) return;
        const now = Date.now();
        for (const cs of L.castles.values()) {
            if (!cs.awake || cs.def.type !== 'magehut') continue;
            const h = cs.def.houses?.[0], c = h?.c;
            if (!h || !c) continue;
            for (const v of cs.active.values()) {
                if (!v.wizard || v.dead || v.servantOf != null || v.foe) continue;
                for (const pl of players) {
                    if (Math.hypot(pl.p.x - c.x, pl.p.z - c.z) > h.r - 0.5 || Math.abs(pl.p.y - (h.door?.y ?? c.y)) > 7) continue;
                    const e = L.rel?.eff?.(v);
                    if (e && (e.fr >= 20 || e.lv >= 20)) continue; // (a friend may come in)
                    if (v.sleep) { if (v.sleep.phase === 'lie') L.night?.wake?.(v, 'alarm', pl.id); else L.night?._drop?.(v); }
                    this.alarm(v, pl.p, pl.id);
                    v.foe = pl.id; cs.hostile.set(pl.id, now + 120000);
                    L.alog?.decision(v, 'чужой вошёл в дом — просыпается и идёт на него');
                    break;
                }
            }
        }
    }

    /** A legal combat position, with room for the whole body inside the sphere. */
    spot(v, p) {
        const w = this.ward(v);
        if (!w || !p) return p;
        const h = v.cs.def.houses[0], y = h.door.y, dy = y + 2 - w.c.y;
        const r = Math.sqrt(Math.max(0, (w.r - 1.5) ** 2 - dy ** 2));
        const dx = p.x - w.c.x, dz = p.z - w.c.z, d = Math.hypot(dx, dz);
        if (d < h.r + 1) return { ...h.door, run: p.run };
        return { ...p, x: w.c.x + dx * Math.min(1, r / d), z: w.c.z + dz * Math.min(1, r / d), y, node: undefined };
    }

    /** A route detour must respect the ward too; undo an escaping step instead of teleporting through a wall. */
    keep(v, before) {
        const w = this.ward(v);
        if (!w) return;
        const distance = p => Math.hypot(p.x - w.c.x, p.y + 2 - w.c.y, p.z - w.c.z);
        if (distance(before) < w.r - 1 && distance(v) >= w.r - 1) {
            v.x = before.x; v.y = before.y; v.z = before.z;
            v.path = null; v.unstickT = 0; v.speed = 0;
        }
    }

    step(v, dt) {
        if (v.cs?.def?.type !== 'magehut' || !v.W) return false;
        if (!v.homeGuard && v.foe && this.ward(v)) this.alarm(v, this.life._playerPos(v.foe) || v, v.foe);
        const H = v.homeGuard;
        if (!H) return false;
        const L = this.life, w = this.ward(v), h = v.cs.def.houses[0];
        H.quiet += dt;
        if (H.exit) {
            const p = this.spot(v, h.door);
            // Hamlets have no castle walls, so _goSpot's castle-only path condition misses their interiors.
            // Explicitly follow the house's door route, including its stairs and furniture, first.
            if (!H.exitPathDone && v.cs.graph?.nodes.length && h.doorNode != null) {
                if (!v.path) L._goTo(v, h.doorNode);
                H.exitPathDone = L._followPath(v, dt, 5.6);
            } else H.exitPathDone = true;
            if (!H.exitPathDone || !L._goSpot(v, p.x, p.z, 5.6, dt, 0.8, h.door.y)) {
                v.mode = v.speed > 0 ? 'run' : 'idle';
                // Personal protection still costs mana while he runs out of the building.
                const drain = ((v.fx & FX.SHIELD) ? PVP.SHIELD_DRAIN : 0) + ((v.fx & FX.DOME) ? PVP.DOME_DRAIN : 0);
                v.mana = Math.max(0, v.mana - drain * dt);
                v.shieldT = (v.shieldT || 0) - dt; v.domeT = (v.domeT || 0) - dt;
                if (v.shieldT <= 0 || !v.mana) v.fx &= ~FX.SHIELD;
                if (v.domeT <= 0 || !v.mana) v.fx &= ~FX.DOME;
                L._ground(v);
                return true;
            }
            H.exit = false;
        }
        if (!w) { v.homeGuard = null; return false; } // Broken ward: the ordinary hunt / chase is free again.
        if (v.lostWand) return false;
        const by = v.foe || H.by, fp = by && L._playerPos(by);
        if (fp && Math.hypot(fp.x - v.x, fp.z - v.z) < 65 && L._sees(v, fp)) {
            H.quiet = 0;
            v.foe = by; v.cs.hostile.set(by, Date.now() + 120000);
            return false; // WizardFight casts normally, but its positions are confined by spot().
        }
        // The attacker is not in sight (a bomb from afar, behind a hill): the wizard does not sit indoors — the author 19.11: «не выходил из дома… он выходит, но не за
        // защиту, и начинает битву под защитой дома». He goes to the edge of the intact sphere on the side the blow came from, faces it and waits there.
        if (H.at && H.quiet < 25 && !v.lostWand) {
            const goal = this.spot(v, { x: H.at.x, z: H.at.z, run: true });
            if (goal && Math.hypot(goal.x - v.x, goal.z - v.z) > 1.5) {
                v.foe = null; v.hunt = null; v.investigate = null;
                if (!L._goSpot(v, goal.x, goal.z, 5.6, dt, 0.8, goal.y ?? h.door.y)) { v.mode = v.speed > 0 ? 'run' : 'idle'; L._ground(v); return true; }
            } else this.wizards.fight?._turnTo?.(v, { x: H.at.x, y: v.y, z: H.at.z }, dt);
        }
        v.foe = null; v.hunt = null; v.investigate = null; v.path = null; v.speed = 0; v.mode = 'idle';
        if (H.quiet > 6 && w.hp < 100 && !v.noWand) {
            const pay = Math.min(dt * 2, v.mana, 100 - w.hp);
            v.mana -= pay; w.hp += pay;
            H.sendT = (H.sendT || 0) + dt;
            if (H.sendT > 1) { H.sendT = 0; this.game.wards._changed(); }
        }
        if (H.quiet > 20 && w.hp >= 100) v.homeGuard = null;
        L._ground(v);
        return true;
    }
}
