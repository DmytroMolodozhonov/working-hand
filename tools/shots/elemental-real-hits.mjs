export default async function(h){
 const g=h.g,T=h.THREE,{frame:poseFrame}=await import('/tests/e2e/poses.mjs');h.bare();g.paused=true;
 let offset=0;const render=g.renderer.render.bind(g.renderer);g.renderer.render=()=>{g.scene.updateMatrixWorld(true);g.camera.updateMatrixWorld(true);};
 const step=n=>{for(let i=0;i<n;i++){g.poseService.injectRaw({...poseFrame({arms:'forward',wristOffset:[0,offset],rightTilt:1.57,rightCurl:.8}),ts:performance.now()});g.lastTime=performance.now()-1000/60;g.frame();}};
 const L=g.castleLife,cs=L._runtime(L.extra.get('creative-earth'));if(!cs.awake)L._wake(cs);const e=L.byId.get('creative-earth:1');
 g.character.group.position.set(e.x,e.y+1.95,e.z+15);g.smoothBody=0;
 for(const side of ['left','right'])g.items.releaseHand(side);g.items.takeIntoHand({kind:'wand',uid:'real-hits-wand',plain:true,model:0,power:0},'right');
 for(const dy of [-.04,-.02,0,.02,.04]){offset=dy;step(50);h.log('pose sweep',{offset,ray:g.character.getPointingDirection('right').toArray(),tip:g.castOrigin('right').toArray(),wand:g.wandMagic.tip(new T.Vector3(),new T.Vector3()).toArray()});}
 offset=.02;step(60);e.foe=null;e.fx=0;g.earthMages._stop(e.id);
 const cast=spell=>{g._lastDuelCast=0;g._interimCast=null;const result=g.castLocalSpell(spell,true),b=[...g.duel.bolts.values()].find(b=>b.by===g.localId&&b.spell===spell);h.log('real hit cast',{spell,result,why:g.lastCastWhy,ray:g.character.getPointingDirection('right').toArray(),npc:[e.x,e.y,e.z],b:b&&{o:b.o.toArray(),dir:b.dir.toArray(),target:b.tid,kind:b.tk}});return b;};
 const j=cast('Jolt');if(j?.tid!==e.id)throw Error('The earth NPC was not picked: '+j?.tid);step(120);h.log('earth hit',{state:j?.state,front:j?.front.toArray(),stun:e.stunT,rag:e.rag,foe:e.foe,log:g.spellLog.lines.slice(-4)});
 const aCS=L._runtime(L.extra.get('creative-air'));if(!aCS.awake)L._wake(aCS);const a=L.byId.get('creative-air:1');
 e.foe=null;g.earthMages._stop(e.id);g.character.group.position.set(a.x,a.y+1.95,a.z+10);a.foe=g.localId;
 step(480);h.log('air flew',{fly:a.fly,pos:[a.x,a.y,a.z],mode:a.mode,hp:a.hp,mana:a.mana});
 // Advance the paid flight/landing, then aim at the body in its genuine current position.
 a.elemental.flight=0;step(240);a.foe=null;g.character.group.position.set(a.x,g.collision.groundAt(a.x,a.z+12,a.y+3)+1.95,a.z+12);step(60);
 g._lastDuelCast=0;g._interimCast=null;const result=g.castLocalSpell('AvadaKedavra',true),b=[...g.duel.bolts.values()].find(b=>b.by===g.localId&&b.spell==='AvadaKedavra');
 h.log('air target after flight',{pos:[a.x,a.y,a.z],draw:a.group.position.toArray(),fly:a.fly,rag:a.rag,result,beam:b&&{o:b.o.toArray(),dir:b.dir.toArray(),tk:b.tk,tid:b.tid},body:g.duel._bodies(g.localId).filter(c=>c.id===a.id).map(c=>({a:c.a.toArray(),b:c.b.toArray(),r:c.r}))});
 step(120);if(!a.dead)throw Error('Avada did not hit the air NPC after flight: '+JSON.stringify({target:b?.tid,front:b?.front.toArray()}));h.log('air hit outcome',{dead:a.dead,hp:a.hp,stun:a.stunT,beam:b&&{front:b.front.toArray(),state:b.state},log:g.spellLog.lines.slice(-4)});
 g.renderer.render=render;h.cam([a.x+12,a.y+6,a.z+9],[a.x,a.y+2,a.z]);await h.shot('air-after-real-hit',{settle:0});
}
