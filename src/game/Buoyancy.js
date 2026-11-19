/**
 * Buoyancy.js — how a thing behaves in water, from what it is made of (the author 19.11: «лебедь умер в воде — должен плавать как вещь, в зависимости
 * от массы… вода реагирует, как будто что-то упало, с волнами, брызгами; не заготовленная анимация»).
 *
 * Pure (no THREE): a thing has a DENSITY (kg/m³; water 1000). It is pushed up by the weight of the water it displaces:
 *   submerged share s = how much of its height is under the surface (0…1);  net acceleration  a = g·(1000/ρ·s − 1) − drag
 * so ρ < 1000 floats and settles where s = ρ/1000 (a light apple rides high, a soaked log low), ρ > 1000 sinks — slowly for ρ = 1100, like a stone for 7800 — and
 * bobs back when pushed (the same law, damped). A fall into water is an energy E = ½·m·v²: it makes drops, rings and a wave that pushes floating things away.
 */
export const WATER = { RHO: 1000, G: 14, DRAG_LIN: 2.4, DRAG_QUAD: 0.9, SINK_MAX: 9 };

/** Densities by kind (kg/m³). Anything not listed: floats if the ThrowModel says `float`, else a medium-heavy thing. */
export const DENSITY = {
    wand: 650, scroll: 600, book: 700, apple: 800, redApple: 800, goldenApple: 1900, baksadi_pear: 850, azure_berry: 900, flask: 500, potion: 1020,
    sword: 7800, axe: 7600, hammer: 7800, coins: 8200, shield: 1300, crystal: 2600, dragonEgg: 2200, arrows: 700, bow: 650, fishingRod: 600, backpack: 450,
    wool: 300, feather: 120, swanWings: 150, fish: 1050,
};

export function densityOf(kind, phys = null) {
    if (DENSITY[kind] != null) return DENSITY[kind];
    return phys?.float ? 600 : 1500;
}

/** Share of a body of `size` (m, its height) centred at y that is under the surface. */
export const submerged = (y, size, surface) => Math.max(0, Math.min(1, (surface - (y - size / 2)) / Math.max(1e-3, size)));

/**
 * One step of the vertical motion of a thing of density `rho` and height `size` centred at `y` with vertical speed `vy`.
 * Returns the new vy (the caller moves it). Out of the water (s = 0) it is just gravity — the caller's own physics does that; use only when s > 0.
 */
export function buoyStep(vy, y, size, surface, rho, dt) {
    const s = submerged(y, size, surface);
    if (s <= 0) return vy - WATER.G * dt;
    let a = WATER.G * ((WATER.RHO / Math.max(50, rho)) * s - 1);
    // (water drags a moving thing: linear when slow, quadratic when fast — a stone does not fall through it at once)
    a -= vy * (WATER.DRAG_LIN * (0.4 + s)) + Math.sign(vy) * vy * vy * WATER.DRAG_QUAD * s;
    let nv = vy + a * dt;
    return Math.max(-WATER.SINK_MAX, Math.min(WATER.SINK_MAX, nv));
}

/** Where a floater of density rho settles: the centre's height relative to the surface (m) for a body of `size`. */
export const restOffset = (rho, size) => size * (0.5 - Math.min(1, rho / WATER.RHO));

/** What a fall into water makes. mass kg, speed m/s, size m (the width it hits with). */
export function splashSpec(mass, speed, size = 0.3) {
    const E = 0.5 * Math.max(0.01, mass) * speed * speed; // J
    const k = Math.sqrt(E);
    return {
        E,
        drops: Math.max(0, Math.min(70, Math.round(2 + k * 2.2))), // (a pebble a few, a boulder / a blast a fountain)
        height: Math.min(14, 0.8 + k * 0.45), // m/s of the drops' climb
        rings: Math.min(5, Math.floor(Math.log10(1 + E) * 1.6)), // (a pebble none, a swan's fall three, a boulder / a blast five)
        ringSpeed: Math.min(7, 1.2 + k * 0.35),
        radius: Math.min(18, size + k * 0.9), // m the wave is felt
        loud: Math.min(1, 0.15 + k * 0.08),
    };
}

/** The push of a wave (energy E at the source) on a floating thing dx, dz away: horizontal speed away + a small lift as the crest passes. */
export function waveImpulse(dx, dz, E, size = 0.3) {
    const d = Math.hypot(dx, dz), R = splashSpec(1, Math.sqrt(2 * E)).radius;
    if (d > R || d < 1e-3) return null;
    const k = Math.min(3.2, Math.sqrt(E) * 0.9 / (1 + d * d * 0.25)) / (1 + size * 2); // (a small thing is carried more)
    return { vx: (dx / d) * k, vz: (dz / d) * k, vy: Math.min(1.4, k * 0.5) };
}
