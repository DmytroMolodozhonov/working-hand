/** Original procedural martial choreography: water yields/coils, air turns, fire strikes. */
export const ELEMENTAL_MODES=['waterGather','waterPush','waterGuard','waterRest','airCoil','airLift','airSweep','airFlight','airRest','fireChamber','firePunch','fireKick','fireRest','fireVault'];
const S=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function elementalMagePose(m,T,mode,dt,t){
 m._acroActive=mode==='fireVault';
 const e=m.look.element;if(e==='earth'||!mode.startsWith(e))return 0;
 if(m._elementMode!==mode){m._elementMode=mode;m._elementClock=0;}
 m._elementClock=(m._elementClock||0)+dt;const u=Number.isFinite(m.elementPoseT)?m.elementPoseT:m._elementClock,a=u*2.6;
 T.eL=T.eR=.8;T.aLX=T.aRX=.9;T.aLZ=-.45;T.aRZ=.45;T.lL=.28;T.lR=-.25;T.kL=-.5;T.kR=-.25;T.earthSpread=.2;
 if(e==='water'){
  const wave=Math.sin(a),turn=Math.cos(a);
  T.hy=wave*.42;T.hz=turn*.06;T.hx=.1;T.aLX=1.1+wave*.55;T.aRX=1.1-wave*.55;
  T.aLZ=-.65-turn*.4;T.aRZ=.65-turn*.4;T.eL=.8+turn*.45;T.eR=.8-turn*.45;
  T.lL=.3+wave*.16;T.kL=-.5-wave*.15;T.lR=-.25+wave*.15;T.kR=-.4+wave*.12;
  if(mode==='waterPush'){const p=S((u-.25)/.4);T.aLX=T.aRX=.7+p*.9;T.eL=T.eR=1.4*(1-p)+.08;T.hy=.45*(1-p);T.hx=.2*p;T.aLZ=-.2;T.aRZ=.2;}
  if(mode==='waterGuard'){T.aLX=1.4+wave*.2;T.aRX=1.6-wave*.2;T.aLZ=-.8;T.aRZ=.8;T.kL=-.65;}
 }else if(e==='air'){
  T.hy=Math.sin(a)*.7;T.hz=Math.cos(a)*.12;T.aLX=1.2+Math.sin(a)*.5;T.aRX=1.2+Math.cos(a)*.5;
  T.aLZ=-1.15;T.aRZ=1.1;T.eL=.5+Math.cos(a)*.3;T.eR=.5-Math.cos(a)*.3;T.earthSpread=.12;
  T.lL=.35+Math.sin(a)*.35;T.lR=-.2-Math.sin(a)*.35;
  if(mode==='airSweep'){const p=S((u-.25)/.4);T.hy=.9-1.8*p;T.aLX=.65+p;T.aRX=1.65-p;T.aLZ=-1.2+.9*p;T.aRZ=.3+1.0*p;T.lR=1.0*Math.sin(Math.min(1,u/1.1)*Math.PI);T.kR=-.3;}
  if(mode==='airLift'){T.aLX=T.aRX=1.6+Math.sin(Math.min(1,u/2)*Math.PI/2)*1.1;T.eL=T.eR=.4;T.aLZ=-.65;T.aRZ=.65;T.headX=-.25;T.hy=Math.sin(a)*.16;}
  if(mode==='airFlight'){T.hx=-.18;T.aLX=T.aRX=.55;T.aLZ=-1.2;T.aRZ=1.2;T.eL=T.eR=.2;T.lL=.15;T.lR=-.4;T.kL=-.8;T.kR=-.55;}
 }else{
  const kick=mode==='fireKick',p=S((u-.23)/.19)*(1-S((u-.65)/.3));
  T.earthSpread=.3;T.hy=.55-.95*p;T.hx=.08+.2*p;T.aLX=1.0;T.aRX=.45+1.2*p;T.eL=1.4;T.eR=1.5*(1-p)+.04;T.aLZ=-.3;T.aRZ=.28;T.lL=.5;T.kL=-.75;
  if(kick){T.hx=-.2;T.lR=.2+1.35*p;T.kR=-1.2*(1-S(u/.4));T.aRZ=1.1;T.aLZ=-1.0;T.hy=.5-1.3*p;}
  if(mode==='fireChamber'){T.aLX=T.aRX=.7;T.eL=T.eR=1.5;T.hy=Math.sin(a)*.22;T.kL=-.65;T.kR=-.5;}
  if(mode==='fireVault'){
   // Plant the hands, invert, fire with alternating raised feet, then land.
   const up=S(u/.44),down=S((u-1.05)/.5),hold=up*(1-down),scissor=Math.sin((u-.64)*Math.PI/.24)*.35;
   T.pelvisZ=Math.PI*hold;T.hx=T.hy=T.hz=0;T.headX=-.1;T.earthSpread=.12;
   T.aLX=T.aRX=Math.PI*hold;T.aLZ=-.06;T.aRZ=.06;T.eL=T.eR=.06;
   T.lL=.15+scissor*hold;T.lR=.15-scissor*hold;T.kL=T.kR=-.08;T.bounce=0;
  }
 }
 if(mode.endsWith('Rest')){T.aLX=T.aRX=.2;T.eL=T.eR=.15;T.hx=.15;}
 if(m._earthMoving&&!mode.endsWith('Flight')&&mode!=='fireVault'){const step=Math.sin(t*7);T.lL+=step*.35;T.lR-=step*.35;T.kL-=Math.max(0,-step)*.3;T.kR-=Math.max(0,step)*.3;}
 return 20;
}
