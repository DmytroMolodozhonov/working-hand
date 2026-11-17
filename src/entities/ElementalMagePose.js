/** Original procedural martial choreography: water yields/coils, air turns, fire strikes. */
export const ELEMENTAL_MODES=['waterGather','waterPush','waterGuard','waterRest','airCoil','airLift','airSweep','airFlight','airRest','fireChamber','firePunch','fireKick','fireRest','fireVault','airRun','fireSwat','airSwat','waterSwat','airSpin','airLash','waterFreeze','waterHurl','airSlash','airDash','airRise','airDrift','waterNeedle','airThunder','airStorm'];
const S=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function elementalMagePose(m,T,mode,dt,t){
 const e=m.look.element;m._acroActive=mode==='fireVault'&&e==='fire'&&!!m.leftElbow; // (only a fire mage's own body stands on its hands — another's has no such joints)if(e==='earth'||!mode.startsWith(e))return 0;
 if(m._elementMode!==mode){m._elementMode=mode;m._elementClock=0;}
 m._elementClock=(m._elementClock||0)+dt;const u=Number.isFinite(m.elementPoseT)?m.elementPoseT:m._elementClock,a=u*2.6;
 T.eL=T.eR=.8;T.aLX=T.aRX=.9;T.aLZ=-.45;T.aRZ=.45;T.lL=.28;T.lR=-.25;T.kL=-.5;T.kR=-.25;T.earthSpread=.2;
 if(e==='water'){
  const wave=Math.sin(a),turn=Math.cos(a);
  T.hy=wave*.42;T.hz=turn*.06;T.hx=.1;T.aLX=1.1+wave*.55;T.aRX=1.1-wave*.55;
  T.aLZ=-.65-turn*.4;T.aRZ=.65-turn*.4;T.eL=.8+turn*.45;T.eR=.8-turn*.45;
  T.lL=.3+wave*.16;T.kL=-.5-wave*.15;T.lR=-.25+wave*.15;T.kR=-.4+wave*.12;
  if(mode==='waterPush'){const p=S((u-.25)/.4);T.aLX=T.aRX=.7+p*.9;T.eL=T.eR=1.4*(1-p)+.08;T.hy=.45*(1-p);T.hx=.2*p;T.aLZ=-.2;T.aRZ=.2;}
  if(mode==='waterFreeze'){ // both hands rise and draw the water in a ring: it freezes (the shards are drawn by IceShards)
   const p=S(u/.7);T.aLX=T.aRX=.9+1.2*p;T.aLZ=-.9-.4*p;T.aRZ=.9+.4*p;T.eL=T.eR=.5;T.hx=-.06*p;T.hy=Math.sin(u*5)*.25;T.kL=-.6;T.kR=-.5;
  }
  if(mode==='waterHurl'){ // the arms come down and thrust at the foe
   const p=S((u-1.2)/.18)*(1-S((u-1.5)/.3));T.aLX=T.aRX=2.1-1.2*p;T.aLZ=-.3;T.aRZ=.3;T.eL=T.eR=.1;T.hx=.14*p;T.lL=.5;T.kL=-.8;
  }
  if(mode==='waterSwat'){ // both hands thrust at the orb and flick the water out
   const p=S(u/.15)*(1-S((u-.3)/.3));T.aLX=T.aRX=1.0+.9*p;T.eL=T.eR=1.2*(1-p)+.1;T.hy=.0;T.hx=.12*p;T.aLZ=-.25;T.aRZ=.25;T.lL=.45;T.kL=-.7;
  }
  if(mode==='waterNeedle'&&m.elementVariant===1){ // the FAN: the arms cross before the chest (the water drawn in, the knees sinking), then both open wide and forward at once — six needles leave in a fan
   const g1=S(u/.4),p=S((u-.4)/.1)*(1-S((u-.62)/.25));
   T.aLX=T.aRX=.75+.75*p;T.aLZ=.6*g1*(1-p)-1.05*p;T.aRZ=-.6*g1*(1-p)+1.05*p;T.eL=T.eR=1.55*(1-p)+.08;
   T.hx=-.22*g1*(1-p)-.05;T.hy=0;T.headX=.1;T.kL=-.6-.35*g1*(1-p);T.kR=-.5-.3*g1*(1-p);T.lL=.35;T.lR=-.3;T.earthSpread=.3;
  }
  else if(mode==='waterNeedle'){ // «Ледяные иглы»: a low wide stance; the hands snap forward in turn — left, right, left, right — each flick turning the body after it, the other hand drawn back to the hip
   const k=Math.min(3,Math.max(0,Math.floor((u-.22)/.09))),ph=Math.max(0,Math.min(1,((u-.22)-k*.09)/.09)),right=k%2===1,snap=S(ph*2)*(1-S(ph*1.4-.4)),pre=S(u/.22);
   const fwd=(on)=>on?.55+1.05*snap:.55+.35*pre*(1-snap); // (the snapping arm: from the chest straight out; the other: back at the chest)
   T.aRX=fwd(right);T.aLX=fwd(!right);T.eR=right?1.5*(1-snap)+.05:1.4;T.eL=right?1.4:1.5*(1-snap)+.05;T.aRZ=right?.12:.35;T.aLZ=right?-.35:-.12;
   T.hy=(right?-1:1)*.35*snap*(u>.2?1:0);T.hx=-.12-.08*snap;T.headX=.08;T.lL=.45;T.kL=-.75;T.lR=-.35;T.kR=-.45;T.earthSpread=.28;
  }
  if(mode==='waterGuard'){T.aLX=1.4+wave*.2;T.aRX=1.6-wave*.2;T.aLZ=-.8;T.aRZ=.8;T.kL=-.65;}
 }else if(e==='air'){
  // (16.11, the author: «анимации фиговые». Air is soft, round and light: a wide stance on bent knees, the weight rolling from foot to foot, the hands
  //  drawing CIRCLES that open into a strike — every move is a wind-up, a release and a follow-through, the body leaning INTO it (hx < 0 is forward).)
  const w=u*2.2,sw=Math.sin(w),cw=Math.cos(w);
  T.hx=-.1;T.hy=.18*sw;T.hz=.04*cw;T.headX=.06;T.headZ=-.05*sw;
  T.aLX=1.0+.45*sw;T.aLZ=-.55-.3*cw;T.aRX=1.0-.45*sw;T.aRZ=.55-.3*cw;T.eL=.6+.25*cw;T.eR=.6-.25*cw; // (the two hands circle against each other)
  T.lL=.3+.1*sw;T.kL=-.55-.12*sw;T.lR=-.25+.1*sw;T.kR=-.45+.12*sw;T.earthSpread=.24;T.bounce=.04*Math.abs(Math.sin(w*2));
  if(mode==='airSweep'){ // a wind-up to the right (the arms gathered, the body turned back, crouched), the sweep across to the left with a step in, the follow-through
   const g1=S(u/.25),p=S((u-.25)/.2),f=S((u-.5)/.45);
   T.hy=.6*g1*(1-p)-.75*p*(1-.5*f);T.hx=-.08-.22*p*(1-f);T.kL=-.6-.25*g1*(1-p);T.lL=.3+.35*p*(1-.4*f);T.kR=-.5;
   T.aRX=.9+.5*p;T.aRZ=.95*(1-p)-.25*p;T.aLX=1.0+.4*p;T.aLZ=.3*(1-p)-1.35*p;T.eL=T.eR=.9*(1-p)+.15;T.headX=.1;
  }
  if(mode==='airLift'){ // both palms rise slowly, lifting the foe on the air; the stance widens, the back arches a little as he raises him high
   const p=Math.sin(Math.min(1,u/2)*Math.PI/2);T.aLX=T.aRX=1.2+1.6*p;T.eL=T.eR=.55-.3*p;T.aLZ=-.6-.15*Math.sin(u*3);T.aRZ=.6+.15*Math.sin(u*3);
   T.hx=.12*p;T.headX=-.3*p;T.hy=.06*Math.sin(u*2);T.kL=-.6;T.kR=-.55;T.lL=.35;T.lR=-.3;T.earthSpread=.32;T.bounce=0;
  }
  if(mode==='airFlight'){ // gliding: the body inclined forward into the wind, the arms swept back and out like wings, the legs trailing, a slow undulation
   const f=Math.sin(t*1.7);T.hx=-.5+.05*f;T.hy=.08*f;T.hz=.1*Math.sin(t*.9);T.headX=.4;T.headZ=0;
   T.aLX=.25+.12*f;T.aRX=.25+.12*f;T.aLZ=-1.25-.12*f;T.aRZ=1.25+.12*f;T.eL=T.eR=.18;T.lL=-.15;T.lR=-.35;T.kL=-.3;T.kR=-.5;T.earthSpread=.1;T.bounce=0;
  }
  if(mode==='airSpin'){ // up on one foot, the arms flung wide: the whirl (the yaw itself turned by the controller); at the end both palms thrust the ring out
   const p=S((u-.7)/.15),q=1-S((u-1)/.25);
   T.aLX=1.5-.1*p;T.aRX=1.5-.1*p;T.aLZ=-1.45+1.1*p*q;T.aRZ=1.45-1.1*p*q;T.eL=T.eR=.12;T.hx=-.05-.2*p*q;T.hy=0;T.hz=0;
   T.lL=.2;T.kL=-.35;T.lR=.45*(1-p);T.kR=-1.1*(1-p)-.4*p;T.earthSpread=.15;T.headX=0;T.bounce=.12*(1-p);
  }
  if(mode==='airLash'){ // low, the back leg long behind: the arm comes from behind and whips along the ground, the body twisting through, the other arm back for balance
   const g1=S(u/.2),p=S((u-.2)/.14),f=S((u-.5)/.3);
   T.hx=-.38*g1*(1-.4*f);T.hy=.55*g1*(1-p)-.45*p*(1-f);T.lL=.7;T.kL=-1.1;T.lR=-.65;T.kR=-.55;T.earthSpread=.3;T.headX=.25;
   T.aRX=-.35*(1-p)+.55*p;T.aRZ=.7*(1-p)+.15*p;T.eR=.25;T.aLX=-.35-.2*p;T.aLZ=-.65;T.eL=.5;T.bounce=0;
  }
  if(mode==='airSwat'){ // both palms sweep across: a gust turns the orb (variant 1: the other way), the body twisting with them
   const p=S(u/.17)*(1-S((u-.32)/.3)),sd=m.elementVariant?-1:1;
   T.hy=sd*(.7-1.5*p);T.hx=-.12;T.aLX=T.aRX=1.35+.25*p;T.aLZ=-.9+sd*.95*p;T.aRZ=.9+sd*.95*p;T.eL=T.eR=.2+.5*(1-p);T.lL=.4;T.lR=-.35;T.kL=-.7;T.kR=-.5;T.earthSpread=.3;
  }
  if(mode==='airDrift'){ // the idle dance: the hips sway, one foot on its toes, the arms flow like ribbons — each joint a little later than the one before
   const d=u*1.6;T.hy=.32*Math.sin(d);T.hz=.08*Math.cos(d);T.hx=-.06;T.headX=-.05;T.headZ=.14*Math.sin(d-.6);
   T.aLX=1.0+.85*Math.sin(d*1.3);T.eL=.45+.35*Math.sin(d*1.3-.9);T.aLZ=-1.0-.4*Math.sin(d-.4);
   T.aRX=1.0+.85*Math.sin(d*1.3+Math.PI);T.eR=.45+.35*Math.sin(d*1.3+Math.PI-.9);T.aRZ=1.0+.4*Math.sin(d+Math.PI-.4);
   T.lL=.45+.3*Math.sin(d);T.kL=-.75+.2*Math.sin(d);T.lR=-.15;T.kR=-.25;T.earthSpread=.2;T.bounce=.05*(1+Math.sin(d*2));
  }
  if(mode==='airSlash'){ // the arms cross low before the chest — the air gathered — then fling OUT and up as he rises onto his toes: the blades leave on the stroke
   const g1=S(u/.38),p=S((u-.38)/.12)*(1-S((u-.7)/.35));
   T.hx=-.25*g1*(1-p)+.06*p;T.hy=0;T.kL=-.85*g1*(1-p)-.2;T.kR=-.75*g1*(1-p)-.15;T.lL=.3;T.lR=-.25;T.bounce=.16*p;
   T.aLX=.65+1.05*p;T.aRX=.65+1.05*p;T.aLZ=.55*(1-p)-1.6*p;T.aRZ=-.55*(1-p)+1.6*p;T.eL=T.eR=1.5*(1-p)+.1;T.headX=.1+.15*p;T.earthSpread=.3;
  }
  if(mode==='airDash'){ // a lunge along the wind: the body leans hard INTO it, the arms streamed back, a long low stride
   T.hx=-.5;T.hy=.1;T.hz=0;T.aLX=-.6;T.aRX=-.6;T.aLZ=-.55;T.aRZ=.55;T.eL=T.eR=.25;T.lL=.95;T.kL=-.95;T.lR=-.75;T.kR=-.3;T.headX=.35;T.earthSpread=.12;T.bounce=0;
  }
  if(mode==='airRise'){ // crouched low, the hands draw the air up out of the ground like pulling a rope, the knees open, the back arches, up onto the toes
   const p=S(u/.85),c=1-S(u/.3);T.hx=-.3*c+.15*p;T.hy=Math.sin(u*9)*.05;T.aLX=T.aRX=.3+2.4*p;T.aLZ=-.35-.55*p;T.aRZ=.35+.55*p;T.eL=T.eR=1.1*(1-p)+.1;
   T.headX=-.35*p;T.lL=.15;T.lR=-.12;T.kL=-.9*(1-p)-.1;T.kR=-.85*(1-p)-.1;T.earthSpread=.18;T.bounce=.1*p;
  }
  if(mode==='airThunder'){ // «Thunderwave»: the fists drawn in to the chest, crouched, the body coiled back — then both palms THRUST forward with a step, the body behind them
   const g1=S(u/.5),p=S((u-.55)/.1),f=1-S((u-.8)/.4)*.6;
   T.aLX=T.aRX=.7+.85*p*f;T.eL=T.eR=1.7*(1-p)+.05;T.aLZ=.35*(1-p)-.15*p;T.aRZ=-.35*(1-p)+.15*p;
   T.hx=.12*g1*(1-p)-.32*p*f;T.hy=0;T.kL=-.6-.35*g1*(1-p);T.kR=-.5-.3*g1*(1-p);T.lL=.25+.4*p;T.lR=-.3;T.headX=.1;T.earthSpread=.3;T.bounce=0;
  }
  if(mode==='airStorm'){ // «Lightning Strike»: both arms raised to the sky, the back arched, rising onto the toes while the lightning gathers — then the right arm SWEEPS down to point at the foe
   const up=S(u/.6),pt=S((u-2.1)/.15),f=1-S((u-2.45)/.3);
   T.aLX=.4+2.4*up*(1-.6*pt);T.aRX=.4+2.4*up*(1-pt)+1.35*pt*f;T.aLZ=-.45-.25*up;T.aRZ=.45+.25*up*(1-pt);T.eL=T.eR=.15+.2*(1-up);
   T.hx=.18*up*(1-pt)-.18*pt;T.headX=-.4*up*(1-pt)+.15*pt;T.hy=-.25*pt;T.kL=-.35*(1-up)-.1;T.kR=-.3*(1-up)-.1;T.lL=.2+.3*pt;T.lR=-.2;T.bounce=.08*up*(1-pt);T.earthSpread=.22;
  }
  if(mode==='airRun'){ // running with the wind: leaning in, the arms streamed back (not pumping), light long steps
   T.hx=-.35;T.hy=.08*Math.sin(t*10);T.aLX=-.45+.12*Math.sin(t*10);T.aRX=-.45-.12*Math.sin(t*10);T.aLZ=-.35;T.aRZ=.35;T.eL=T.eR=.3;T.headX=.3;T.bounce=0;
  }
 }else{
  const kick=mode==='fireKick',p=S((u-.23)/.19)*(1-S((u-.65)/.3));
  T.earthSpread=.3;T.hy=.55-.95*p;T.hx=.08+.2*p;T.aLX=1.0;T.aRX=.45+1.2*p;T.eL=1.4;T.eR=1.5*(1-p)+.04;T.aLZ=-.3;T.aRZ=.28;T.lL=.5;T.kL=-.75;
  if(kick){T.hx=-.2;T.lR=.2+1.35*p;T.kR=-1.2*(1-S(u/.4));T.aRZ=1.1;T.aLZ=-1.0;T.hy=.5-1.3*p;}
  if(mode==='fireSwat'){ // a backhand: the near arm sweeps across the body and strikes the orb with the back of the hand, the torso follows (variant 1: the other arm)
   const p=S(u/.15)*(1-S((u-.3)/.3)),sd=m.elementVariant?-1:1,A=sd>0?'R':'L',B=sd>0?'L':'R';
   T.hy=sd*(.8-1.7*p);T.hx=.14;T['a'+A+'X']=1.25+.55*p;T['a'+A+'Z']=sd*(1.0-1.9*p);T['e'+A]=.15+.4*(1-p);T['a'+B+'X']=.6;T['e'+B]=1.3;T.earthSpread=.3;
   T.lL=.5;T.kL=-.8;T.lR=-.3;T.kR=-.5;
  }
  if(mode==='fireChamber'){T.aLX=T.aRX=.7;T.eL=T.eR=1.5;T.hy=Math.sin(a)*.22;T.kL=-.65;T.kR=-.5;}
  if(mode==='fireVault'){
   // Plant the hands, invert, fire with alternating raised feet, then land.
   // (the author 14.11: the ball thrown with a foot looked wrong — a small scissors of straight legs. A foot throws like a kick: the leg is drawn back with the knee bent,
   // then it WHIPS forward through the vertical, the knee opening at the end, and comes back; the other leg stands steady, the hips lean to the swing)
   const up=S(u/.44),down=S((u-1.05)/.5),hold=up*(1-down);
   const kick=(R)=>{const wind=S((u-(R-.34))/.26),hit=S((u-(R-.08))/.12),back=S((u-(R+.1))/.3);
    return {hip:.1+(-.55*wind*(1-hit)+.98*hit*(1-back)),knee:-.12+(-1.3*wind*(1-hit))+(-.1*hit*(1-back)),swing:wind*(1-hit)*-1+hit*(1-back)};};
   const kR=kick(.64),kL=kick(.88);
   T.pelvisZ=Math.PI*hold;T.hx=T.hy=T.hz=0;T.headX=-.1;T.earthSpread=.1;
   T.aLX=T.aRX=Math.PI*hold;T.aLZ=-.06;T.aRZ=.06;T.eL=T.eR=.06;
   T.lR=.12+(kR.hip-.1)*hold;T.kR=kR.knee*hold-.08*(1-hold);T.lL=.12+(kL.hip-.1)*hold;T.kL=kL.knee*hold-.08*(1-hold);
   T.hx=-.05*(kR.swing+kL.swing)*hold;T.bounce=0;
  }
 }
 if(mode.endsWith('Rest')){T.aLX=T.aRX=.55;T.aLZ=-.35;T.aRZ=.35;T.eL=T.eR=.9;T.hx=0;T.headX=0;T.kL=-.35;T.kR=-.25;} // (14.11: upright and ready, not a hunch)
 if(m._earthMoving&&!mode.endsWith('Flight')&&mode!=='fireVault'){const step=Math.sin(t*7);T.lL+=step*.35;T.lR-=step*.35;T.kL-=Math.max(0,-step)*.3;T.kR-=Math.max(0,step)*.3;}
 return 20;
}
