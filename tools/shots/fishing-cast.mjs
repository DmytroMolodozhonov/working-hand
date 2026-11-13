// Actual held-item release code with open fingers, then deterministic rod motion.
export default async function(h){
 const g=h.g,T=h.THREE,F=g.fishing;
 h.bare();g.paused=true;
 for(const o of g.scene.children)if(!o.isLight)o.visible=false;
 const ch=g.character,oldCurl=ch.getGripCurl,oldTracked=ch.isHandTracked;
 ch.getGripCurl=()=>0;ch.isHandTracked=()=>true;
 try{
  for(const side of ['left','right']){
   g.items.takeIntoHand({kind:'fishingRod',uid:'cast-check-'+side},side,{closed:true});
   for(let i=0;i<40;i++)g.items.update(1/60);
   if(g.items.held[side]?.item.kind!=='fishingRod')throw Error('Rod dropped from open '+side+' hand');
   g.items.releaseHand(side);
  }
 }finally{ch.getGripCurl=oldCurl;ch.isHandTracked=oldTracked;}
 g.items.takeIntoHand({kind:'fishingRod',uid:'cast-demo'},'left',{closed:true});
 const held=g.items.held.left,m=held.model;m.visible=true;m.position.set(0,0,0);m.rotation.set(-.3,0,0);
 const tracked=ch.isHandTracked;ch.isHandTracked=()=>true;
 F.reset();F.update(1/60);
 if(F.line.visible||F.floatM.visible)throw Error('Line visible before cast');
 h.cam([5,3,8],[0,2,-1]);await h.shot('rod-before-cast',{settle:0});
 for(let i=0;i<7;i++){m.position.z-=6/60;F.update(1/60);}
 for(let i=0;i<12;i++)F.update(1/60);
 if(!F.log.includes('cast'))throw Error('Sharp stop did not cast');
 if(!F.line.visible)throw Error('No line after cast');
 await h.shot('rod-after-cast',{settle:0});
 ch.isHandTracked=tracked;
 h.log('fishing checked',{openHands:['left','right'],state:F.state,events:F.log.slice(-5),lineVisible:F.line.visible});
}
