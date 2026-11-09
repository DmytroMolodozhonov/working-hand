/** Ordinary respawn stays near the start, but cannot put the player back at the place they just died. */
export function startRespawn(death, rng = Math.random) {
    const a = rng() * Math.PI * 2, d = 6 + rng() * 14;
    let x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (death && Math.hypot(x - death.x, z - death.z) < 12) {
        const away = Math.hypot(death.x, death.z) > 0.01 ? Math.atan2(-death.z, -death.x) : a;
        x = Math.cos(away) * 20; z = Math.sin(away) * 20;
    }
    return { x, z };
}
