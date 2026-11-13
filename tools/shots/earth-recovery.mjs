// Exercise the real frame, terrain/crowd steering and spell launch after a blast.
export default async function(h){
 const g=h.g,T=h.THREE,{frame}=await import('/tests/e2e/poses.mjs');h.bare();g.paused=true;
 const raw=frame({arms:'forward',wristOffset:[0,.02],rightTilt:1.57,rightCurl:.8});
 const render=g.renderer.render.bind(g.renderer);
 // Accelerated gameplay replay; matrix updates stay real, GPU timing is not measured.
 g.renderer.render=()=>{g.scene.updateMatrixWorld(true);g.camera.updateMatrixWorld(true);};
 const step=n=>{for(let i=0;i<n;i++){g.poseService.injectRaw({...raw,ts:performance.now()});g.lastTime=performance.now()-1000/60;g.frame();}};
 const L=g.castleLife,cs=L._runtime(L.extra.get('creative-earth'));if(!cs.awake)L._wake(cs);const e=L.byId.get('creative-earth:1');
 g.character.group.position.set(e.x,e.y+1.95,e.z+25);step(30);e.foe=g.localId;e.mana=17;
 const start=[e.x,e.z];let moved=0,volley=0;const oldVolley=g.groundVortex._volley.bind(g.groundVortex);
 g.groundVortex._volley=(s,...args)=>{if(s.by===e.id)volley++;return oldVolley(s,...args);};
 for(let i=0;i<20;i++){
  const x=e.x,z=e.z;step(60);moved+=Math.hypot(e.x-x,e.z-z);
  h.log('earth recovery',{sec:i+1,pos:[e.x,e.y,e.z],mode:e.mode,mana:e.mana,foe:e.foe,volleys:volley});
 }
 if(moved<2)throw Error('Earth mage did not move during recovery: '+moved);
 if(!volley)throw Error('Earth mage did not resume paid attacks within twenty seconds');
 // Actual explosion may interrupt the caster; the ordinary frame must resume it.
 g.spells.castBombardo(new T.Vector3(e.x,e.y+2,e.z+3),new T.Vector3(0,0,-1),g.localId);
 // He has spent his first recovered reserve: allow the real 1 mana/s refill.
 const before=volley;step(2100);
 if(e.dead)throw Error('Fixture explosion unexpectedly killed the mage');
 if(volley<=before)throw Error('Earth mage failed to resume after Bombardo');
 h.log('earth final',{start,moved,volleys:volley,mana:e.mana,hp:e.hp,mode:e.mode});
 g.groundVortex._volley=oldVolley;g.renderer.render=render;
 h.cam([e.x+9,e.y+5,e.z+10],[e.x,e.y+2,e.z]);await h.shot('earth-after-recovery',{settle:0});
}
