/**
 * TransformPain.js — the pain of a body changing (CLAUDE.md «Превращения игрока — не мгновенные, магические и через боль», the author
 * 05.11): what every change of the hero shares — the HP it costs, the red at the edges of the eyes in waves, the picture swimming.
 * Used by the mermaid's tail (Mermaid.js), the dragon's form (DragonForm.js), the monster's (MonsterTransform.js); a new change uses it too.
 */

/** −n HP of the hero's own (never killing outright by a change: it stops at 1). The Creative's immortal: no harm, the flash only. */
export function changeHurt(g, n, why = 'change') {
    if (!g || g.isDeadLocal) return;
    g.hud?.damageFlash?.();
    const c = g.combat;
    if (c?.dead) return;
    if (c?.enabled) { c.hp = Math.max(1, (c.hp ?? 0) - n); c._hudKey = ''; g.playerHP = c.hp; return; }
    if (g.config?.mode !== 'creative' && Number.isFinite(g.playerHP)) { g.playerHP = Math.max(1, g.playerHP - n); g.hud?.update?.(g.playerHP, g.maxHP, g.killCount, g.punchCount); }
}

/** The pain's red at the edges of the eyes: k 0…1; < 0 — gone. One overlay for every change. */
export function painRed(k, color = '150,0,10') {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('change-pain');
    if (!el) {
        if (k < 0) return;
        el = document.createElement('div');
        el.id = 'change-pain';
        el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;opacity:0;transition:opacity 0.12s;';
        document.body.appendChild(el);
    }
    if (el._col !== color) { el._col = color; el.style.background = `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(${color},0.35) 75%, rgba(${color},0.78) 100%)`; }
    el.style.opacity = k < 0 ? '0' : String(Math.max(0, Math.min(1, k)));
}

/** The picture swims (Knockdown's dizziness), `s` 0…1 strong — kept up while the change goes on. */
export function changeDizzy(g, s) {
    const K = g?.knock;
    if (!K) return;
    if (!(K.dizzyLeft > 1.5)) K.dizzyLeft = K.dizzyDur = 2.5;
    K.dizzyS = s;
}

/** The pain's waves at time t of a change of length T: rising, throbbing, easing off at its end. */
export const painWave = (t, T) => Math.min(1, t / 1.5) * (0.55 + 0.45 * Math.sin(t * 3.4) ** 2) * Math.max(0, Math.min(1, (T - t) / 0.8));
