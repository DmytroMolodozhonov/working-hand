/** A selected solo Creative environment is a fresh attempt, not an ordinary world respawn. */
export const CREATIVE_RESTART_KEY = 'zns-creative-restart';

export function restartsCreative(game) {
    return game?.config?.mode === 'creative' && !game.net?.active &&
        game.hero?.spawn != null && !['start', 'arena'].includes(game.hero.spawn);
}

/** Keep the world's recipe and identity, never its damage, inhabitants or player snapshots. */
export function creativeRestartConfig(game) {
    const { saved: _saved, ...config } = game.config;
    const k = game.keeper;
    return {
        ...config, seed: game.seed, gen: game.gen, hero: { ...game.hero },
        ...(k ? { saved: {
            id: k.id, name: k.name, mode: config.mode, seed: game.seed, gen: game.gen,
            created: k.created, createdVersion: k.createdVersion, fav: k.fav,
            realTrees: config.realTrees, godsOnEarth: config.godsOnEarth,
            hero: { ...game.hero }, players: {},
        } } : {}),
    };
}

/** Consume once: a later menu visit must not start another attempt by itself. */
export function takeCreativeRestart(storage) {
    const raw = storage.getItem(CREATIVE_RESTART_KEY);
    storage.removeItem(CREATIVE_RESTART_KEY);
    if (!raw) return null;
    try {
        const config = JSON.parse(raw);
        return restartsCreative({ config, hero: config?.hero }) ? config : null;
    } catch { return null; }
}