import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {Featherfall,featherSpeed} from '../../src/game/Featherfall.js';
import {VoxelCharacter,PLAYER_GROUND_OFFSET} from '../../src/entities/Character.js';
import {CollisionWorld} from '../../src/world/Collision.js';
import {knows} from '../../src/game/SpellBook.js';
import {matchSpell} from '../../src/fx/SpellManager.js';
import {SPELLS} from '../../src/ui/Codex.js';
import {SCROLL_WEIGHTS} from '../../src/game/ItemTypes.js';

test('Featherfall is a real scroll spell with precise words and an air/defence card',()=>{
 for(const words of ['Featherfall','feather fall','фезерфол','фезер фол'])assert.equal(matchSpell(words),'Featherfall');
 assert.notEqual(matchSpell('I saw a feather falling from a bird'),'Featherfall');
 assert.equal(knows('Featherfall'),false);assert.ok(SCROLL_WEIGHTS.some(([s])=>s==='Featherfall'));assert.ok(SPELLS.some(s=>s.name==='Featherfall'&&s.cat==='guard'));
});
test('the fall slows gradually and converges to a safe speed independently of frame rate',()=>{
 for(const dt of [1/120,1/60,1/20]){let v=-80;const first=featherSpeed(v,dt);assert.ok(first< -2&&first>v);for(let i=0;i<5/dt;i++)v=featherSpeed(v,dt);assert.ok(Math.abs(v+2)<.01);}
});
test('an actual character lands softly from 100 metres; an unbraked fall retains its real impact',()=>{
 const col=new CollisionWorld();col.setTerrain({surfaceY:()=>-.5,floorBelow:()=>0,solidIn:()=>false,ceilingAbove:()=>Infinity});
 for(const slow of [true,false]){
  const ch=new VoxelCharacter(new T.Scene());ch.group.position.set(0,100+PLAYER_GROUND_OFFSET,0);ch.onGround=false;ch.verticalVelocity=-35;ch.slowFall=slow;
  for(let i=0;i<5000&&!ch.onGround;i++)ch.update(1/60,col,true);
  assert.ok(ch.onGround);assert.equal(!!ch.landing?.soft,slow);if(slow){assert.ok(ch.landing.speed<3.5);assert.equal(ch.landing.drop,0);}else assert.ok(ch.landing.speed>20);
 }
});
test('a downward wand while falling pays once and continues draining mana; an empty reserve ends it',()=>{
 let mana=20,paid=0;const ch={onGround:false,verticalVelocity:-20,group:{position:new T.Vector3()},getHandWorldPosition:(s,o)=>o.set(0,10,0),getHandDirection:(s,o)=>o.set(0,-1,0)},g={character:ch,wandSide:()=> 'right',combat:{dead:false,check:()=>mana>=10?null:'no mana',pay:()=>{mana-=10;paid++;},drain:n=>{mana-=n;return mana>0;}},hud:{setVoice(){}}};
 const f=new Featherfall(g);assert.equal(f.cast(),'Featherfall');assert.equal(paid,1);f.cast();assert.equal(paid,1);f.update(11);assert.equal(f.on,false);assert.equal(ch.slowFall,false);
});
