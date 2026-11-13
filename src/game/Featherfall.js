/** Featherfall: a downward wand brakes an existing fall, never teleports or lifts its caster. */
import {castingHand} from './WandAim.js';
export const FEATHER={COST:10,DRAIN:1,SPEED:2,DRAG:4,SAFE:3.5};
export const featherSpeed=(v,dt)=>v<0?-FEATHER.SPEED+(v+FEATHER.SPEED)*Math.exp(-FEATHER.DRAG*dt):v;
export const FEATHER_TARGETS={me:{does:'brake',why:'only the falling caster, on their own computer; position and pose replicate normally'},players:{does:'none',why:'self cast, cannot slow somebody else'},zombies:{does:'none',why:'self cast'},castlePeople:{does:'self',why:'air mages know it and pay from their own mana'},animals:{does:'none',why:'self cast'},sailors:{does:'none',why:'self cast'},spider:{does:'none',why:'self cast'},livingTrees:{does:'none',why:'self cast'},bookBirds:{does:'none',why:'self cast'},dragon:{does:'none',why:'already flies'},iceCastle:{does:'none',why:'self cast'},ships:{does:'none',why:'no effect on a ship'},items:{does:'none',why:'no effect on objects'},blocks:{does:'none',why:'no terrain edits'},water:{does:'end',why:'swimming replaces the fall'},space:{does:'brake',why:'works under the local gravity, cannot lift a body'},gifts:{does:'none',why:'no effect on gifts of the gods'}};
export class Featherfall{
 constructor(game){this.game=game;this.on=false;}
 cast(final=true){
  const g=this.game,ch=g.character,h=castingHand(g),say=t=>{if(final)g.hud?.setVoice?.(t,true);return null;};
  if(this.on)return say('🪶 Featherfall уже замедляет падение');
  if(!g.wandSide?.()||!h||h.dir.y>-.55)return say('🪶 Направьте палочку вниз, в сторону падения');
  if(ch.onGround||ch.verticalVelocity>=-.2||g.flight?.active||ch.swimY!=null||g.levitation?.lifted||g.isDeadLocal)return say('🪶 Featherfall применяется во время падения');
  const tired=g.combat.check('Featherfall');if(tired)return say(tired);
  g.combat.pay('Featherfall');this.on=true;ch.slowFall=true;
  g.airFx?.gust(ch.group.position,h.dir,1,true);g.sound?.spellCast?.('Featherfall',ch.group.position);g.hud?.setVoice?.('🪶 Падение плавно замедляется',true);
  return 'Featherfall';
 }
 update(dt){
  const g=this.game,ch=g.character;if(!this.on)return;
  if(ch.onGround&&ch.landing?.soft)g.mana?.success?.('Featherfall');
  if(g.isDeadLocal||g.combat.dead||ch.onGround||ch.swimY!=null||g.flight?.active||g.animals?.riding){this.stop();return;}
  if(g.combat.drain(FEATHER.DRAIN*dt,dt)===false){this.stop();return;}
  ch.slowFall=true;
 }
 stop(){const had=this.on;this.on=false;this.game.character.slowFall=false;return had;}
 dispose(){this.stop();}
}
