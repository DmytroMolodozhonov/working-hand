/** Additional elemental lenses; a spell retains its original category and knowledge requirement. */
export const ELEMENT_CATEGORIES=[{id:'earth',name:'🪨 Магия земли'},{id:'water',name:'💧 Магия воды'},{id:'fire',name:'🔥 Магия огня'},{id:'air',name:'🌬️ Магия воздуха'}];
export const ELEMENT_SPELLS={
 earth:['GroundVortex','GroundShield','Breakthrough','BreakthroughMaxima','Drawdown','DrawdownMaxima','Earthquake','EarthquakeMaxima','Stitching','Flourish','Gather','Alive','AliveMaxima','Overgrown','OvergrownMaxima','CreateWall','CreateBridge','CreateFloor','CreateCeiling','BuildRoof'],
 water:['Waterball','WaterVortex','WaterVortexSuperMaxima','VortexBubble','WaveAttack','WaterWalk','WaterPart','AirBubble','AirBubbleMaxima','Ice','IceMaxima','IceDuel','Frozen','FrozenMaxima','Snowman','IceCastle','IceBridge','Firefighting','LetItRain','Whirlpool','WaterForming','FirefightingMaxima'],
 fire:['Fireball','Inferno','FireMaxima','Bombardo','BombardoMaxima','Fireworks','Lumos','LumosMaxima','LumosFlashlight','LumosAhead','LumosFollowing','Hellfire','FireSerpent','Fire','Helios','SunRay','ToTheSun'],
 air:['Featherfall','Wind','WindMaxima','WindImpulse','WindImpulseMaxima','Levitation','LevitationMaxima','LevitationSuperMaxima','LevitateDuel','Flight','Thunderwave','LightningStrike','Electrum','Jolt','JoltMaxima','Tornado','FlyingMaxima','AirBubble','AirBubbleMaxima'],
};
export function spellElements(id){return ELEMENT_CATEGORIES.filter(c=>ELEMENT_SPELLS[c.id].includes(id)).map(c=>c.id);}
export const isEarthSpell=id=>ELEMENT_SPELLS.earth.includes(id);
