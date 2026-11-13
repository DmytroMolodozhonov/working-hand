/** A witnessed blast is an immediate defensive threat, rather than an ordinary duel charge. */
import { NPC_COST } from './WizardAI.js';
import { sightRange } from './Blame.js';
import { FX } from '../fx/WizardFx.js';

export class WizardBlast {
    constructor(wizards) { this.wizards = wizards; }

    protect(v) {
        if (v.element || v.dead || v.noWand || v.stunT > 0 || v.lev || v.sleep) return false;
        if (v.fx & FX.DOME) { v.domeT = Math.max(v.domeT || 0, 4); return true; }
        if (v.W?.dome && (v.domeCd || 0) <= 0 && v.mana >= NPC_COST.ProtectionMaxima) {
            this.wizards.fight._dome(v);
            return !!(v.fx & FX.DOME);
        }
        if (!(v.fx & FX.SHIELD) && v.mana >= NPC_COST.Protection) { v.mana -= NPC_COST.Protection; v.fx |= FX.SHIELD; }
        if (v.fx & FX.SHIELD) v.shieldT = Math.max(v.shieldT || 0, 3);
        return false;
    }

    cast(by, name, origin, dir) {
        const W = this.wizards, L = W.life, g = W.game;
        if (!g.authority || !L._isPlayer(by) || g.arenaDuels?.peace?.()) return;
        const bp = L._playerPos(by);
        if (!bp) return;
        const witnesses = [];
        let attacking = false;
        for (const v of L.byId.values()) {
            if (!v.wizard || v.dead || v.noWand || v.sleep || v.stunT > 0 || v.servantOf != null || v.entry?.stranger) continue;
            if (Math.hypot(v.x - bp.x, v.z - bp.z) > sightRange(true, g.isNight) || !L._sees(v, bp)) continue;
            witnesses.push(v);
            const dx = v.x - origin.x, dy = v.y + 2 - origin.y, dz = v.z - origin.z;
            const along = dx * dir.x + dy * dir.y + dz * dir.z, radius = name === 'BombardoMaxima' ? 14 : 8;
            if (v.foe === by || (along > 0 && along < 75 && dx * dx + dy * dy + dz * dz - along * along < radius * radius)) attacking = true;
        }
        for (const v of witnesses) {
            this.protect(v);
            if (!attacking) continue; // A distant shot into empty terrain warrants caution, not an accusation of murder.
            const now = Date.now(), canDome = !!v.W?.dome;
            v.blastThreat = { by, reply: canDome ? 'Stupefy' : 'Bombardo', until: now + 15000 };
            v.foe = by; v.grudge = { id: by, until: now + 40000 };
            v.seated = false; v.practice = null; v.later = null; v.path = null; v.fleeT = 0;
            v.castCd = Math.min(v.castCd || 0, 0.3);
            if (!v.blastShout || now - v.blastShout > 5000) {
                v.blastShout = now;
                L._say(v, canDome ? 'Опасная магия! Защищайтесь! Оглушите его!' : 'Ах ты так! Бомбарда!', 3);
            }
        }
    }
}
