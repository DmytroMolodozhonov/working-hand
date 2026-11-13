/** Whole-body earth casting: rooted feet, bent knees/elbows and distinct preparation/release. */
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);},mix=(a,b,k)=>a+(b-a)*k;
export function earthMagePose(m,T,mode,dt,t){
 if(!mode.startsWith('earth'))return 0;
 if(m._earthMode!==mode){m._earthMode=mode;m._earthClock=0;}
 m._earthClock=(m._earthClock||0)+dt;
 const u=Number.isFinite(m.earthPoseT)?m.earthPoseT:m._earthClock;
 T.hx=.08;T.hy=0;T.hz=0;T.headX=-.06;T.aLX=T.aRX=.95;T.aLZ=-.45;T.aRZ=.45;
 T.eL=T.eR=.65;T.lL=.26;T.lR=-.22;T.kL=-.38;T.kR=-.24;T.earthSpread=.18;
 switch(mode){
 case 'earthLift':{const crouch=smooth(u/.2),rise=smooth((u-.25)/.48);T.kL=T.kR=mix(-.2,-1,crouch)*(1-.55*rise);T.lL=.38;T.lR=.32;T.earthSpread=.32;T.hx=.42*crouch*(1-rise);T.aLX=T.aRX=mix(.1,2.6,rise);T.aLZ=mix(-.95,-.3,rise);T.aRZ=-T.aLZ;T.eL=T.eR=mix(.15,1.1,rise);T.headX=mix(.3,-.18,rise);break;}
 case 'earthOrbit':{const a=u*1.7;T.aLX=1.05+Math.sin(a)*.28;T.aRX=1.05+Math.sin(a+Math.PI)*.28;T.aLZ=-.55-Math.cos(a)*.22;T.aRZ=.55+Math.cos(a+Math.PI)*.22;T.hy=Math.sin(a)*.14;T.eL=.8+Math.cos(a)*.2;T.eR=.8-Math.cos(a)*.2;break;}
 case 'earthWall':{const push=smooth((u-.25)/.65);T.aLX=T.aRX=mix(.8,1.62,push);T.aLZ=mix(-.7,-.12,push);T.aRZ=-T.aLZ;T.eL=T.eR=mix(1.5,.08,push);T.hx=.2*push;T.lL=.52;T.kL=-.65;T.lR=-.4;break;}
 case 'earthCocoon':{const close=smooth(u/1.25);T.aLX=T.aRX=mix(.4,2.6,close);T.aLZ=mix(-1,-.15,close);T.aRZ=-T.aLZ;T.eL=T.eR=mix(.25,1.0,close);T.kL=T.kR=-.55;T.hx=.05;T.headX=.16;break;}
 case 'earthBlade':{const press=smooth(u/.55),open=smooth((u-.6)/.55);T.aLX=1.3;T.aRX=1.65;T.aLZ=mix(-.6,.12,press)-.8*open;T.aRZ=mix(.6,-.12,press)+.8*open;T.eL=T.eR=1.15-.4*open;T.hy=Math.sin(u*5)*.15*(1-open);T.headX=.15;break;}
 case 'earthPunch':{
  // Two distinct chamber/strike/recovery beats: opposite hips lead each fist.
  const left=u>.55,q=left?u-.55:u,hit=smooth((q-.17)/.16),back=smooth((q-.38)/.15),p=hit*(1-back);
  T.earthSpread=.3;T.hy=(left?-1:1)*(.55-.85*p);T.hx=.12+.15*p;T.hz=(left?-1:1)*.08*p;
  T.aLX=left?mix(.45,1.7,p):1.05;T.aRX=left?1.05:mix(.45,1.7,p);
  T.eL=left?mix(1.5,.03,p):1.3;T.eR=left?1.3:mix(1.5,.03,p);
  T.aLZ=-.3;T.aRZ=.3;T.lL=.55;T.kL=-.8;T.lR=-.22;T.kR=-.3;break;
 }
 case 'earthKick':{
  const chamber=smooth(u/.36),kick=smooth((u-.4)/.18),back=smooth((u-.72)/.35),p=kick*(1-back);
  T.hy=-.4+.7*p;T.hx=-.15-.2*p;T.hz=-.12;T.earthSpread=.12;
  T.lR=mix(-.15,1.2,chamber)*(1-back);T.kR=-1.6*chamber*(1-kick)-.12*p;
  T.lL=.18;T.kL=-.3;T.aLX=1.3;T.aLZ=-.9;T.eL=.7;T.aRX=.65;T.aRZ=1.1;T.eR=1;break;
 }
 case 'earthSweep':{
  const first=smooth((u-.18)/.38),second=smooth((u-.63)/.3);
  T.hy=.85-1.65*first+1.35*second;T.hz=.13*Math.sin(u*5);T.hx=.12;T.earthSpread=.36;
  T.aLX=.9+.7*second;T.aRX=1.6-.55*second;T.aLZ=-1.15+1.05*first-.9*second;T.aRZ=.15+1.1*first-1.05*second;
  T.eL=.35+.8*(1-first);T.eR=.2+.7*second;T.lL=.5-.65*second;T.lR=-.2+.7*second;T.kL=-.85+.4*second;T.kR=-.35-.5*second;break;
 }
 case 'earthHammer':{
  const raise=smooth(u/.55),slam=smooth((u-.68)/.27),recover=smooth((u-1.1)/.45);
  T.aLX=T.aRX=mix(.6,2.95,raise)-1.7*slam;T.aLZ=-.32;T.aRZ=.32;T.eL=T.eR=.5+.65*raise-.9*slam;
  T.hx=-.2*raise+.8*slam-.35*recover;T.headX=-.25*raise+.5*slam;
  T.earthSpread=.34;T.lL=.3;T.lR=.3;T.kL=T.kR=-.3-.65*slam+.25*recover;break;
 }
 case 'earthThrow':{const push=smooth((u-.32)/.25);T.hy=mix(.5,-.24,push);T.hx=.16*push;T.aRX=mix(.5,1.65,push);T.aRY=mix(-.6,.15,push);T.aRZ=mix(.75,.05,push);T.eR=mix(1.4,.04,push);T.aLX=mix(1.5,.65,push);T.eL=.9;T.lL=mix(.12,.65,push);T.kL=-.65;T.lR=-.4;break;}
 case 'earthRest':T.hx=.3;T.aLX=T.aRX=.2;T.eL=T.eR=.15;T.headX=.2;break;
 }
 if(mode==='earthOrbit'&&m._earthMoving){const step=Math.sin(t*7);T.lL+=step*.4;T.lR-=step*.4;T.kL-=Math.max(0,-step)*.4;T.kR-=Math.max(0,step)*.4;}
 return 20;
}
