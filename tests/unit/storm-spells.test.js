import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {stormSpellBlock} from '../../src/game/StormSpellRules.js';
import {Storm} from '../../src/fx/Storm.js';
import {Game} from '../../src/game/Game.js';
import {SpellManager} from '../../src/fx/SpellManager.js';
import {Combat} from '../../src/game/Combat.js';
import {DAMAGE} from '../../src/game/Damage.js';
function weather(){const s=Object.create(Storm.prototype);s.until=0;s.rainUntil=0;s.gatherTo=0;s.seaK=0;return s;}
test('both spells require an actual thunderstorm; summoned rain and a natural sea storm qualify, gathering clouds do not',()=>{
 const s=weather(),g={storm:s};for(const name of ['LightningStrike','Thunderwave'])assert.ok(stormSpellBlock(g,name));assert.equal(stormSpellBlock(g,'Wind'),null);
 s.until=performance.now()+10000;s.gatherTo=performance.now()+5000;assert.ok(stormSpellBlock(g,'LightningStrike'));
 s.gatherTo=0;for(const name of ['LightningStrike','Thunderwave'])assert.equal(stormSpellBlock(g,name),null);
 s.until=0;s.startRain(10);assert.equal(stormSpellBlock(g,'Thunderwave'),null);s.rainUntil=0;s.seaK=.8;assert.equal(stormSpellBlock(g,'LightningStrike'),null);
});
test('Lightning Strike refuses before mana/pose work in clear weather; during a storm it gathers a charge without creating or extending weather',()=>{
 let paid=0,poses=0;const g={storm:weather(),hud:{setVoice(){}},_poseHint(){poses++;return null;},combat:{check:()=>null,pay(){paid++;}}};
 assert.equal(Game.prototype._castLightning.call(g,true),null);assert.equal(paid,0);assert.equal(poses,0);
 g.storm.startRain(10);const until=g.storm.rainUntil;assert.equal(Game.prototype._castLightning.call(g,true),'LightningStrike');assert.equal(g.lightning.phase,'gather');assert.equal(paid,1);assert.equal(g.storm.rainUntil,until);
});
test('the real lightning impact pipeline doubles only spell damage; hammer/ambient lightning stay at 20 and recipients retain the distinction',()=>{
 for(const [kind,damage] of [['Lightning',20],['LightningStrike',40]]){
  const events=[],z={group:{position:new T.Vector3(0,0,0)}},s=Object.create(SpellManager.prototype);s.hooks={zombies:()=>[z],damage:(_,d)=>events.push(['z',d]),players:()=>[{local:true,center:()=>new T.Vector3(),hit:k=>events.push(['p',k])}],lightningAt:(p,by,k)=>events.push(['world',k])};s.fx={lightFlash(){},spark(){},shake:0};s._sound=()=>{};s._jagged=()=>{};
  s.castLightningHit(new T.Vector3(),'caster',null,kind);assert.deepEqual(events,[['z',damage],['p',kind],['world',kind]]);
 }
 assert.equal(DAMAGE.LightningStrike,2*DAMAGE.Lightning);
});
test('player lightning spell uses 40 before the ordinary lightning armour path; a shield can still stop it',()=>{
 const events=[],c={enabled:true,dead:false,shieldFactor:()=>0,damage:(n,by,kind)=>events.push(['damage',n,kind]),game:{armor:{guard:k=>{events.push(['armour',k]);return false;}}}};
 Combat.prototype.hitBySpell.call(c,'LightningStrike',new T.Vector3(),'caster');assert.deepEqual(events,[['armour','Lightning'],['damage',40,'Lightning']]);
 events.length=0;c.shieldFactor=()=>1;c._blocked=()=>true;assert.equal(Combat.prototype.hitBySpell.call(c,'LightningStrike',new T.Vector3(),'caster'),false);assert.deepEqual(events,[]);
});
