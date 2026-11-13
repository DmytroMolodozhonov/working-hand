export default async function(h){
 const g=h.g,T=h.THREE,{frame}=await import('/tests/e2e/poses.mjs');h.bare();g.paused=true;
 const render=g.renderer.render.bind(g.renderer);g.renderer.render=()=>{g.scene.updateMatrixWorld(true);g.camera.updateMatrixWorld(true);};
 const raw=frame({arms:'forward',wristOffset:[0,.02],rightTilt:1.57,rightCurl:.8});
 const step=n=>{for(let i=0;i<n;i++){g.poseService.injectRaw({...raw,ts:performance.now()});g.lastTime=performance.now()-1000/60;g.frame();}};
 const L=g.castleLife,cs=L._runtime(L.extra.get('creative-fire'));if(!cs.awake)L._wake(cs);const v=L.byId.get('creative-fire:1');
 // Use the actual Creative flat clearing for a reproducible unobstructed duel.
 v.x=0;v.z=0;v.y=g.collision.groundAt(0,0,20);v.group.position.set(v.x,v.y+1.95,v.z);
 g.character.group.position.set(v.x,v.y+1.95,v.z+14);v.foe=g.localId;
 const start=[v.x,v.z];let casts=0;const cast=g.elementalMages.cast.bind(g.elementalMages);
 g.elementalMages.cast=(npc,name,...args)=>{const ok=cast(npc,name,...args);if(ok&&npc===v&&v.elemental.phase==='Vault'){casts++;h.log('foot release',{name,t:v.elemental.t,mana:v.mana,origin:args[1]?.toArray(),pelvis:v.model.pelvis.rotation.z});}return ok;};
 let reached=false;
 for(let i=0;i<1200;i++){step(1);if(v.mode==='fireVault'&&v.elemental.t>.7&&v.elemental.t<.75){reached=true;break;}}
 if(!reached)throw Error('Natural fire battle never reached its acrobatic attack');
 if(Math.hypot(v.x-start[0],v.z-start[1])<.3)throw Error('Fire mage did not change position between attacks');
 g.renderer.render=render;h.cam([v.x+7,v.y+4,v.z+8],[v.x,v.y+2,v.z]);g._updateCamera(0);g.camera.updateMatrixWorld(true);L._lookFar?.(g.character.group.position,0);g.scene.updateMatrixWorld(true);
 await h.shot('fire-handstand-attack',{settle:0});g.renderer.render=()=>{g.scene.updateMatrixWorld(true);g.camera.updateMatrixWorld(true);};
 // Verify the full pose against the ordinary real tracked wand and live target picking.
 g.character.group.position.set(v.x,v.y+1.95,v.z+12);g.smoothBody=0;
 for(const side of ['left','right'])g.items.releaseHand(side);g.items.takeIntoHand({kind:'wand',uid:'vault-hit-wand',plain:true,model:0,power:0},'right');
 step(3); // Let the real tracked hand attach and place the newly equipped wand.
 g._lastDuelCast=0;g._interimCast=null;g.castLocalSpell('Jolt',true);
 const b=[...g.duel.bolts.values()].find(b=>b.by===g.localId&&b.spell==='Jolt');
 h.log('vault targeted',{tid:b?.tid,origin:b?.o.toArray(),dir:b?.dir.toArray(),phase:v.elemental.phase,pose:v.model.pelvis.rotation.z});
 if(b?.tid!==v.id)throw Error('The acrobatic fire body was not targeted: '+b?.tid);
 let result=null;const end=g.duel._end.bind(g.duel);g.duel._end=(bolt,res,...args)=>{if(bolt.id===b.id)result=res;return end(bolt,res,...args);};
 step(60);g.duel._end=end;
 h.log('vault hit',{state:b.state,result,phase:v.elemental.phase,stun:v.stunT,casts,pos:[v.x,v.y,v.z]});
 if(result!=='hit')throw Error('Jolt did not hit the acrobatic mage: '+result);
 g.elementalMages.cast=cast;g.renderer.render=render;
}
