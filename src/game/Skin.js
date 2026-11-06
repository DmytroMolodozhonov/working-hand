/**
 * Skin.js — «Зелье крепкой кожи» (recipe 'skin': кожа канарика + шерсть + осколки стекла; the author 06.11: «после того, как ты выпьешь, тебя больше нельзя проткнуть мечом или топором — всё, что связано
 * с лезвием, не магическим; только магическим можно — или заклинанием разреза («Sectura»). Вообще никакого урона. Но этот урон может влиять на металлическую броню — ведь она не знает, что кожа защищена.
 * Один раз пьётся, эффект навсегда»).
 *
 * Drunk: `g.bonus.skin = 1` (saved with the world, taken by a death with the rest of the growth, brought back by «Give Me My Power» — Legacy.js); the potion works ONCE.
 * What it turns away (all decided on MY computer, the victim's — so a guest's skin works exactly as the host's: «хост — такой же игрок»):
 *   - a non-magic blade's blow (a player's sword / axe / knife: Combat.meleeHit with a cut; a knight's sword and the crowd's forks: kind 'knight'; an arrow: kind 'arrow') — no damage, no knockback, no cut;
 *   - a limb cut by a non-magic blade (Dismember.receiveCut) and a non-magic blade stuck into me (Bleeding.noteImpale: pulled out at once);
 *   - the armour still takes the blow's wear (Armor.absorb): the steel does not know the skin is proof.
 * What it does NOT turn away: a MAGIC weapon (Weapons.markMagic), spells — «Sectura» above all (its kind is 'Slash'), fire, a fall, fists, claws, teeth, a blast: only the edge of plain steel.
 * «А если»: no health bar (Creative's default) — nothing to turn away; a frozen hero — the shatter is not a blade; the potion drunk twice — refused; death — the skin is gone with the rest.
 */
export const SKIN = {
    BLADE_KINDS: new Set(['knight', 'arrow']), // Combat.damage kinds that are plain steel's edge or point (a player's blade is told by its cut: meleeHit)
    SAY_GAP: 3000, // ms between the words «the blade slid off»
};

export class Skin {
    constructor(game) { this.game = game; this._sayAt = -1e9; }

    on() { return !!this.game.bonus?.skin; }

    cantDrink() { return this.game.bonus?.skin ? '🛡️ Вы уже пили такое зелье — кожа крепче не станет' : null; }

    drink() {
        const g = this.game;
        const B = g.bonus || (g.bonus = { hp: 0, fatigue: 0 });
        B.skin = 1;
        g.perf?.note?.('🛡️ Зелье крепкой кожи выпито: простое лезвие больше не берёт');
    }

    /** Does the skin turn this blow away? `kind` — a Combat.damage kind; `magic` — a magic weapon's. */
    shrugs(kind, magic = false) { return this.on() && !magic && SKIN.BLADE_KINDS.has(kind); }

    /** A blade slid off: the sparks and the words (not too often). The steel I wear takes the wear it would have. */
    slid(amount = 0, kind = 'melee') {
        const g = this.game;
        if (amount > 0) g.armor?.absorb?.(amount, kind); // (the plate does not know: it is struck all the same)
        const now = performance.now();
        const c = g.character?.group?.position;
        if (c) for (let i = 0; i < 6; i++) g.fx?.spark?.({ x: c.x, y: c.y + 0.4, z: c.z }, 0xdde6ee, 0.06, { x: (Math.random() - 0.5) * 4, y: Math.random() * 3, z: (Math.random() - 0.5) * 4 }, 0.35);
        if (now - this._sayAt > SKIN.SAY_GAP) { this._sayAt = now; g.hud?.setVoice?.('🛡️ Лезвие скользнуло по коже — ни царапины', true); }
        g.sound?.playHit?.();
    }
}
