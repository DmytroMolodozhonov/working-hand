/** The lone house's defender: out through the door, fighting inside an intact ward, repairing after quiet. */
import { FX } from '../fx/WizardFx.js';
import { PVP } from './Combat.js';

export class WizardHome {
    constructor(wizards) { this.wizards = wizards; this.life = wizards.life; this.game = wizards.game; }

    ward(v) { return v.cs?.def?.type === 'magehut' ? this.game.wards?.list.get(v.cs.wardId || 'site:' + v.cs.def.id) : null; }

    alarm(v, at, by = null) {
        if (v.dead || v.servantOf != null || v.cs?.def?.type !== 'magehut') return false;
        if (v.sleep) this.life.night?.wake?.(v, 'alarm');
        const old = v.homeGuard;
        v.homeGuard = { ...old, at: { x: at.x, z: at.z }, by: by ?? old?.by ?? null, quiet: 0, exit: old?.exit ?? true };
        v.hunt = null; v.investigate = null; v.shelter = null; v.later = null;
        v.fleeT = 0; v.fear = null; v.seated = false; v.job = 'wander'; v.post = null; v.practice = null;
        if (!old) v.path = null;
        if (!old) this.life.alog?.decision(v, 'нападение на дом — выходит через дверь, защищается внутри чар дома');
        return true;
    }

    /** HouseWards calls this even when an incoming explosion is stopped outside the house. */
    attacked(w, by) {
        if (!w.id.startsWith('site:')) return;
        const now = Date.now();
        if (w.npcAlarmBy === by && now < (w.npcAlarmAt || 0) + 250) return;
        w.npcAlarmAt = now; w.npcAlarmBy = by;
        const cs = this.life.castles.get(w.id.slice(5));
        if (!cs || cs.def.type !== 'magehut') return;
        for (const v of cs.active.values()) if (v.wizard && !v.dead) {
            const fp = this.life._playerPos(by), known = fp && this.life._knows(v, by, w.c, 'blast');
            this.alarm(v, fp || w.c, known ? by : null);
            if (known) { v.foe = by; cs.hostile.set(by, Date.now() + 120000); }
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
        if (!v.homeGuard && v.foe) this.alarm(v, this.life._playerPos(v.foe) || v, v.foe);
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
        v.foe = null; v.hunt = null; v.investigate = null; v.path = null; v.speed = 0; v.mode = 'idle';
        const drain = ((v.fx & FX.SHIELD) ? PVP.SHIELD_DRAIN : 0) + ((v.fx & FX.DOME) ? PVP.DOME_DRAIN : 0);
        v.mana = Math.max(0, v.mana - drain * dt);
        v.shieldT = (v.shieldT || 0) - dt; v.domeT = (v.domeT || 0) - dt;
        if (v.shieldT <= 0 || !v.mana) v.fx &= ~FX.SHIELD;
        if (v.domeT <= 0 || !v.mana) v.fx &= ~FX.DOME;
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
