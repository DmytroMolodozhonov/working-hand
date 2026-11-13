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
 case 'earthLift':{const gather=smooth(u/.55),rise=smooth((u-.55)/1.05);T.kL=T.kR=mix(-.15,-.85,gather)*(1-.65*rise);T.hx=.35*gather*(1-rise);T.aLX=T.aRX=mix(.25,2.5,rise);T.aLZ=mix(-.8,-.25,rise);T.aRZ=-T.aLZ;T.eL=T.eR=mix(.1,1.0,rise);T.headX=mix(.25,-.2,rise);break;}
 case 'earthOrbit':{const a=u*1.7;T.aLX=1.05+Math.sin(a)*.28;T.aRX=1.05+Math.sin(a+Math.PI)*.28;T.aLZ=-.55-Math.cos(a)*.22;T.aRZ=.55+Math.cos(a+Math.PI)*.22;T.hy=Math.sin(a)*.14;T.eL=.8+Math.cos(a)*.2;T.eR=.8-Math.cos(a)*.2;break;}
 case 'earthWall':{const push=smooth((u-.25)/.65);T.aLX=T.aRX=mix(.8,1.62,push);T.aLZ=mix(-.7,-.12,push);T.aRZ=-T.aLZ;T.eL=T.eR=mix(1.5,.08,push);T.hx=.2*push;T.lL=.52;T.kL=-.65;T.lR=-.4;break;}
 case 'earthCocoon':{const close=smooth(u/1.25);T.aLX=T.aRX=mix(.4,2.6,close);T.aLZ=mix(-1,-.15,close);T.aRZ=-T.aLZ;T.eL=T.eR=mix(.25,1.0,close);T.kL=T.kR=-.55;T.hx=.05;T.headX=.16;break;}
 case 'earthBlade':{const press=smooth(u/.55),open=smooth((u-.6)/.55);T.aLX=1.3;T.aRX=1.65;T.aLZ=mix(-.6,.12,press)-.8*open;T.aRZ=mix(.6,-.12,press)+.8*open;T.eL=T.eR=1.15-.4*open;T.hy=Math.sin(u*5)*.15*(1-open);T.headX=.15;break;}
 case 'earthThrow':{const push=smooth((u-.32)/.25);T.hy=mix(.5,-.24,push);T.hx=.16*push;T.aRX=mix(.5,1.65,push);T.aRY=mix(-.6,.15,push);T.aRZ=mix(.75,.05,push);T.eR=mix(1.4,.04,push);T.aLX=mix(1.5,.65,push);T.eL=.9;T.lL=mix(.12,.65,push);T.kL=-.65;T.lR=-.4;break;}
 case 'earthRest':T.hx=.3;T.aLX=T.aRX=.2;T.eL=T.eR=.15;T.headX=.2;break;
 }
 return 20;
}
