/**
 * Every sound of the game belongs to one volume group of the settings (Общие настройки → Звук). The author: «звуки не
 * регулируются в настройках — например, разрушение домов». The table is the guard: tests/unit/sound-groups.test.js
 * fails for a SoundManager `play*`/`spell*` method (or any new audio source) that has no group.
 *
 *   effects — «Громкость звуков» (#zombie-vol): the master bus `SoundManager.effectsGain`; EVERYTHING but music and
 *             the residents' speech goes through it (steps, blows, collapse, animals, weather, zombies, the world).
 *   spells  — «Громкость заклинаний» (#spell-vol): × `spellVolume` on top of the effects bus (casts, tunes, held loops,
 *             the magic of houses/wards/ice).
 *   music   — «Громкость музыки» (#music-vol): the ambient/battle tracks, their own bus (`audioListener`, not effectsGain).
 *   talk    — «Громкость голосов жителей» (#talk-vol): `Speech` (master = `talkVolume`).
 */
export const GROUPS = {
    effects: { slider: 'zombie-vol', label: 'Громкость звуков' },
    spells: { slider: 'spell-vol', label: 'Громкость заклинаний' },
    music: { slider: 'music-vol', label: 'Громкость музыки' },
    talk: { slider: 'talk-vol', label: 'Громкость голосов жителей' },
};

const E = 'effects', S = 'spells', M = 'music';

/** SoundManager method → group. (Helpers that only make buffers — `_synth*`, `prepare*` — are not sounds.) */
export const METHOD_GROUP = {
    playAmbientMusic: M,
    playHit: E, playClang: E, playIronGate: E, playCoins: E, playBowDraw: E, playBowRelease: E, playFrozenHit: E, playDeath: E,
    playLand: E, playGiantStep: E, playSnowStep: E, playNoMana: E, playChestOpen: E,
    playCrack: E, playHammer: E, playChore: E, playBoneClack: E, playGrab: E, playThrow: E, playItemHit: E, playOink: E, playOwl: E, playSpencer: E, playGhost: E, playCanary: E, playTaron: E, playGargoyle: E, playDragon: E, playDevil: E, playPlant: E,
    playBuilding: E, // (the settlements' bells and anvils — BuildingFx.js)
    playArena: E, playPhoenixSong: E, playPhoenixCry: E, playTempleChime: E,
    // the fall of buildings (Game._fallStarted/_fallLanded, MonsterTransform): the general «звуки» slider
    playCollapse: E, playGiveWay: E,
    playThunder: S, playWhoosh: S, playInferno: S, playSapira: S, playSand: S, playIce: S, playJolt: S, playBombardoCast: S,
    playExplosion: S, playRumble: S, playLandThud: S, playCircleAttack: S, playSpace: S, playSpellFx: S, playSpellFxAt: S, spellCast: S,
    playInspiriusCast: S, playInspiriusZap: S, playInspiriusBlast: S, playBoomSwell: S, playBoomBlast: S,
    playWaterRise: S, playSplash: S, playSplashAt: E, playBubblePop: S, playMagic: S, playHouseHum: S,
    playHouseTheme: S, playCastleTheme: S, breakHouseTheme: S, wardHum: S, playWardSet: S, playSeal: S,
    playHouseBit: S, playHouseDone: S, playSnowman: S,
    spaceQuiet: E, spaceLoop: E,
};
