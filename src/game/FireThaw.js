// FireThaw.js — «Fire Maxima» said by someone FROZEN (an «Айс» ball, the Ice Queen's staff…): the ice melts off, no wand needed (the author 19.11:
// «когда игрока кто-то замораживает, он может сказать заклинание Fire Maxima, и тогда он разморозится. Палочка не нужна. Исключающее заклинание»).
//
// An EXCEPTION to the rules that bind a frozen hero: no cast works while frozen, a wand is needed for «Fire Maxima», a spell must be known,
// a held spell blocks others. Here none of them applies — only the mana (the usual price of «Fire Maxima») and being really frozen do.
// Not here: the ice bubble of the water vortex (its own way out, WaterVortex.castFire — it blooms a flower round the hero), a hero who is
// not frozen (the usual beam — WaterVortex.castFire), a dead one. What it does: the ice goes (frozenLeft 0 — every computer sees the shell go
// through the combat state), cold sparks and a splash round the hero, a short line. Said again within a second (the phrase's interim and final
// versions): swallowed — it must not turn into the beam right after the thaw.
import * as THREE from 'three';

export const THAW = {
    DEBOUNCE: 1.4,   // s — the interim and the final version of one phrase are one cast
    COST_SPELL: 'FireMaxima', // the price — as «Fire Maxima» itself (SpellCosts)
    SPARKS: 28,
};

/** Is this phrase's spell the one that thaws me now? (pure: the state decides) */
export function thawApplies({ name, frozen, dead, encased, monster }) {
    return name === 'FireMaxima' && !!frozen && !dead && !encased && !monster;
}

const _p = new THREE.Vector3(), _v = new THREE.Vector3();

/**
 * @returns {undefined|null|string} undefined — not mine (go on as usual); null — handled, nothing cast; 'FireMaxima' — thawed.
 */
export function fireThaw(g, name, isFinal = true) {
    const c = g.combat;
    const now = performance.now() / 1000;
    if (name === 'FireMaxima' && now - (g._thawAt ?? -9) < THAW.DEBOUNCE) return null; // (the other version of the same phrase)
    if (!thawApplies({ name, frozen: c.frozen, dead: c.dead, encased: c.encased || !!g.vortex?.myTrap?.(), monster: g.monster?.active })) return undefined;
    // the mana (the only price): not enough — the same short note as everywhere, the ice stays
    const cost = c.costOf(THAW.COST_SPELL);
    if (c.manaOn && c.fatigue < cost) {
        const msg = `😮‍💨 Не хватает маны: нужно ${cost}, есть ${Math.floor(c.fatigue)}`;
        g.lastCastWhy = msg.slice(3);
        if (isFinal) { g.hud?.toast?.(msg); g.hud?.manaShort?.(); g.sound?.playNoMana?.(); }
        return null;
    }
    g._thawAt = now;
    c.pay(THAW.COST_SPELL);
    c.frozenLeft = 0; c.frozenBy = null; c.chill = 0;
    c._hudKey = '';
    g.noteCaster?.('FireMaxima', g.localId);
    g.hud?.setVoice?.('🔥 Fire Maxima! Лёд тает', true);
    g.hud?.setFrozenOverlay?.(0);
    g.hud?.setStatus?.('');
    // the ice runs off: cold glitter and drops round the hero, and the splash of water
    const fx = g.fx, ch = g.character;
    if (fx?.spark && ch?.group) {
        ch.group.getWorldPosition(_p);
        for (let i = 0; i < THAW.SPARKS; i++) {
            _v.set((Math.random() - 0.5) * 3.0, Math.random() * 2.2, (Math.random() - 0.5) * 3.0);
            const r = Math.random();
            fx.spark(_p.clone().add(_v), r < 0.5 ? 0xbfeaff : r < 0.8 ? 0xffffff : 0xffb43a, 0.14 + Math.random() * 0.12, new THREE.Vector3(_v.x * 0.4, 0.6 + Math.random() * 1.2, _v.z * 0.4), 0.6 + Math.random() * 0.5);
        }
    }
    g.sound?.playSplash?.();
    g.lastCastWhy = 'Fire Maxima: лёд растаял';
    return 'FireMaxima';
}
