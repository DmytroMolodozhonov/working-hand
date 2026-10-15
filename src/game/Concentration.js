/**
 * Concentration.js — «правило концентрации» (the author's rule).
 *
 *   A spell that acts while it is held (the water in the hands, a thing lifted by «Левиоса», a tree kept
 *   alive, the fire held on the wand…) takes the caster's concentration. While it is held NO other spell
 *   works — however well its words are said, in every mode, Creative too: first «стоп» (or the spell ends
 *   by itself: mana, time), then a new one. The held spell's own words stay its part (the vortex's
 *   «Bubble» / «Frozen» / «Fire Maxima», the water ball's «Максима» / «Frozen», «Атака» for a lifted
 *   weapon or a living tree…).
 *   Free of the rule (no concentration, and they can be said while holding something): «Люмос»,
 *   «Люмос Максима», «Нокс», «стоп» / «Stand», «Protection» / «Protection Maxima» (the author's rule:
 *   the shield in one hand, the wand casts in the other — another spell from the shield's own wand
 *   knocks it down, Combat.castFrom), «Up» (getting up is the body's), «Паузин» and «Флайн» in the air
 *   (the flight's own words: flying is moving, not holding).
 *   Not held (they don't take concentration, but casting them is an ordinary spell): the flight,
 *   «Invisibility» (your spells are seen under it — so you cast under it), the air bubble under water,
 *   the shield and the dome, Lumos, drawing, charges, blasts and every other spell that is cast and gone.
 *
 *   The concentration breaks (everything held stops at once — the living tree is a tree again and falls,
 *   what «Левиоса» held falls, the water falls as water, the fire goes out…) when the caster dies, is
 *   stunned («Остолбеней»), frozen in ice, or knocked off the feet (the moment of the fall: lying, you may
 *   cast again). The hand shield drops too (a hand that can't hold); the dome is not in a hand: it stays
 *   (death ends it as well).
 *
 *   Network: each computer keeps its own player's rule (as it keeps the mana); what stops is sent as it
 *   always is (sync.stopSpells, the trees' end goes to the host) — everybody sees the same. The host also
 *   ends a dead player's living trees (LivingTrees). Wizards of the game: WizardFight.lostFocus.
 */

import { HintGate } from './Hints.js';

/** What holds concentration: key → its name on the screen and its own words. */
export const HELD = {
    WaterVortex: { ru: 'Вихрь', icon: '🌀', own: ['WaterVortex', 'AirBubble', 'AirBubbleMaxima', 'Attack', 'Frozen', 'Ice', 'FireMaxima'] },
    WaterStorm: { ru: 'Водяная буря', icon: '🌊', own: ['WaterVortexSuperMaxima'] },
    Waterball: { ru: 'Водяной шар', icon: '💧', own: ['Waterball', 'WaterForming', 'Maxima', 'Frozen', 'Ice'] },
    Levitation: { ru: 'Левиоса', icon: '🪶', own: ['Levitation', 'Attack'] },
    LevitationMaxima: { ru: 'Левиоса Максима', icon: '🪶', own: ['LevitationMaxima', 'Attack'] },
    Alive: { ru: 'Живое дерево', icon: '🌳', own: ['Alive', 'Attack'] },
    Hellfire: { ru: 'Адский огонь', icon: '🔥', own: ['Hellfire'] },
    Inferno: { ru: 'Инферно', icon: '🔥', own: ['Inferno'] },
    Drawdown: { ru: 'Drawdown', icon: '⬇️', own: ['Drawdown', 'DrawdownMaxima'] },
    House: { ru: 'Магия дома', icon: '🏠', own: ['CreateHouse', 'ImproveHouse'] },
    Ward: { ru: 'Защита дома', icon: '🛡️', own: ['WardGrow', 'Maxima', 'ProtectionHouse', 'ProtectionInvisible', 'ProtectionHouseGrant'] },
    Build: { ru: 'Стройка', icon: '🧱', own: [] },
    Accio: { ru: 'Акцио', icon: '🧲', own: ['Accio'] },
    Wave: { ru: 'Волна', icon: '🌊', own: ['WaveAttack', 'WaveAttackMaxima'] },
    Lightning: { ru: 'Молния', icon: '⚡', own: ['LightningStrike', 'Hammer'] },
    SailWind: { ru: 'Ветер в паруса', icon: '⛵', own: ['Wind', 'WindMaxima', 'Unfurl', 'UnfurlMaxima', 'Furl'] },
    Beam: { ru: 'Луч', icon: '❄️', own: [] },
};

/** Said while holding anything: no concentration in them (the author's exceptions). */
export const FREE = new Set(['Lumos', 'LumosMaxima', 'Nox', 'Stand', 'Stop', 'Protection', 'ProtectionMaxima', 'Up', 'Pause']);

/**
 * May `name` be cast while `held` (a HELD key, or null) is held? Pure (tests).
 * `ctx.hovering`: «Флайн» while hovering is the flight's own word (fly on); `ctx.isBuild`: a building spell.
 */
export function mayCast(held, name, ctx = {}) {
    if (!held || !name) return true;
    if (FREE.has(name)) return true;
    if (name === 'Flight' && ctx.hovering) return true;
    if (held === 'Build' && ctx.isBuild) return true; // (another «Create a …»: the next piece of the building)
    return (HELD[held]?.own || []).includes(name);
}

export class Concentration {
    constructor(game) {
        this.game = game;
        this._gate = new HintGate(2000);
        this._el = null;
        this._shown = '';
        this._wasDown = false;
    }

    /** What my concentration is on now (a HELD key), or null. */
    held() {
        const g = this.game;
        if (g.vortex?.state) return 'WaterVortex'; // (gathering; its stream once let go flies by itself)
        if (g.waterStorm?.busy) return 'WaterStorm';
        if (g.water?.active) return 'Waterball';
        if (g.levMax?.active) return 'LevitationMaxima';
        if (g.levitation?.active || g.doors?.carried) return 'Levitation';
        if (g.hellfire?.busy) return 'Hellfire';
        if (g.houseMagic?.magic && g.houseMagic.magic.by === g.localId) return 'House';
        if (g.wards?.setting) return 'Ward';
        if (g.builder?.build) return 'Build';
        if (g.accio?.active) return 'Accio';
        if (g.waves?.busy) return 'Wave';
        if (g.lightning) return 'Lightning';
        if (g.ships?.blowing) return 'SailWind';
        const sp = g.spells?.heldBy?.(g.localId);
        if (sp) return sp.kind === 'Inferno' ? 'Inferno' : /^Drawdown/.test(sp.kind || '') ? 'Drawdown' : 'Beam';
        if (g.livingTrees?.mine?.().length) return 'Alive';
        return null;
    }

    /**
     * Before a recognized spell is cast (Game._castLocalSpell): null — it may go on; else the
     * refusal (a short hint, only now that the player tries).
     */
    gate(name, isFinal = true, isBuild = false) {
        const held = this.held();
        if (mayCast(held, name, { hovering: !!this.game.flight?.hovering, isBuild })) return null;
        const ru = HELD[held]?.ru || held;
        if (isFinal && this._gate.pass(held + ':' + name)) this.game.hud?.setVoice?.(`🧘 Сначала «стоп» — вы держите «${ru}»`, true);
        return held;
    }

    /** Every frame: the concentration breaks (death, a stun, the ice, a fall); the small mark on the screen. */
    update() {
        const g = this.game;
        const c = g.combat;
        const down = !!g.knock?.down;
        const fell = down && !this._wasDown;
        this._wasDown = down;
        const why = (g.isDeadLocal || c?.dead) ? 'dead' : c?.stunned ? 'stun' : c?.frozen ? 'ice' : fell ? 'fall' : null;
        if (why) this.lose(why);
        this._mark(this.held());
    }

    /** The concentration is lost: everything I hold stops now. True if anything did. */
    lose(why = 'stun') {
        const g = this.game;
        const done = [];
        if (g.levitation?.active) { g.levitation.release(false); done.push('Левиоса'); }
        if (g.doors?.carried) { g.doors._putDown?.(); done.push('дверь'); }
        if (g.levMax?.stop?.()) done.push('Левиоса Максима');
        if (g.water?.active) { g.water.drop(); done.push('вода'); }
        if (g.vortex?.stop?.()) done.push('вихрь');
        if (g.hellfire?.busy && g.hellfire.stop('focus')) done.push('адский огонь');
        if (g.waterStorm?.busy && g.waterStorm.stop('focus')) done.push('водяная буря');
        if (g.waves?.stop?.()) done.push('волна');
        if (g.accio?.stop?.()) done.push('Акцио');
        if (g.lightning) { if (g.lightning.hammer) g.gear?.hammerResult?.(false); g.lightning = null; g.hud?.setTimer?.(null); done.push('молния'); }
        if (g.spells?.stopBy?.(g.localId)) done.push('огонь / луч');
        if (g.livingTrees?.stopMine?.('focus')) done.push('живое дерево');
        if (g.ships?.stopWind?.()) done.push('ветер в паруса');
        if (g.wards?.setting) { g.wards.fix?.(); done.push('защита дома'); }
        if (g.builder?.build) { g.builder.finish?.(); done.push('стройка'); }
        if (g.houseMagic?.breakMine?.()) done.push('магия дома');
        // the hand can't hold a shield now (the dome is not in a hand: it stays — but not after death)
        const sh = g.combat?.shield;
        if (sh && (sh.type === 1 || why === 'dead')) { g.combat._shatter?.('', false); done.push('щит'); }
        if (!done.length) return false;
        g.sync?.stopSpells?.();
        if (why !== 'dead') {
            const what = why === 'fall' ? 'Вас сбили с ног' : why === 'ice' ? 'Вы во льду' : 'Вас оглушили';
            g.hud?.setVoice?.(`🧘 ${what} — концентрация сорвалась: ${done.join(', ')}`, true);
        }
        g.perf?.note?.('концентрация сорвалась (' + why + '): ' + done.join(', '));
        return true;
    }

    /** The small mark: the concentration is on, and on what. */
    _mark(held) {
        const key = held || '';
        if (key === this._shown) return;
        this._shown = key;
        if (typeof document === 'undefined') return;
        let el = this._el;
        if (!held) { if (el) el.style.display = 'none'; return; }
        if (!el) {
            el = this._el = document.createElement('div');
            el.id = 'hud-focus';
            document.body.appendChild(el);
        }
        const h = HELD[held];
        el.textContent = `🧘 ${h?.icon || ''} ${h?.ru || held}`;
        el.title = 'Концентрация: другое заклинание — только после «стоп»';
        el.style.display = 'block';
    }
}
