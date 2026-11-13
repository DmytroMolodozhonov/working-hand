/** A breaking wave is a continuous curled surface. Deformation, normals and foam run on the GPU. */
import * as T from 'three';
let geometry=null;
const shape=`
uniform vec4 uWave;uniform vec4 uPlace;uniform float uWidth;uniform float uBases[20];
varying vec3 vWave;
vec3 wavePoint(vec2 uv){
 float a=clamp(uv.x,-1.,1.),u=clamp(uv.y,0.,1.);float tm=uWave.z;
 float taper=sqrt(max(0.,1.-pow(abs(a),4.)));
 float H=max(.015,uWave.x*(.04+.96*taper)*(1.+.055*sin(a*5.+tm*2.)));
 float curl=uWave.y*(.65+.35*taper),B=1.9*H,r=.36*H,i=u*31.;vec2 p;
 if(i<=9.){float k=i/9.;p=vec2(-B*(1.-k),H*pow(sin(k*1.5707963),1.4));}
 else if(i<=23.){float k=(i-9.)/14.,th=k*curl;p=vec2(r*sin(th),H-r+r*cos(th));}
 else {float k=(i-23.)/8.,ls=r*sin(curl),ly=H-r+r*cos(curl),foot=.55*H*(1.-curl/3.14159265)+.15*H;
 p=vec2(mix(ls,foot,k)-sin(k*3.14159265)*.2*H*min(1.,curl/3.14159265),ly*(1.-k));}
 float rib=sin(a*18.+u*13.-tm*6.)*sin(a*9.-u*19.+tm*4.);
 p.y+=.022*H*rib*sin(u*3.14159265);
 float j=(a+1.)*.5*19.;int j0=int(clamp(floor(j),0.,18.));float base=mix(uBases[j0],uBases[j0+1],fract(j));
 float side=a*uWidth*.5,lag=-.11*uWidth*a*a;
 return vec3(uPlace.x-uPlace.w*side+uPlace.z*(p.x+lag),base+p.y,uPlace.y+uPlace.z*side+uPlace.w*(p.x+lag));
}`;
export function waveSurface(){
 if(!geometry){
  geometry=new T.BufferGeometry();const pos=[],idx=[];for(let j=0;j<20;j++)for(let i=0;i<32;i++)pos.push(-1+2*j/19,i/31,0);
  for(let j=0;j<19;j++)for(let i=0;i<31;i++){const a=j*32+i,b=a+1,c=a+32;idx.push(a,c,b,b,c,c+1);}
  geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(new Float32Array(pos.length).fill(0),3));geometry.setIndex(idx);geometry.userData.shared=true;
 }
 const uniforms={uWave:{value:new T.Vector4()},uPlace:{value:new T.Vector4(0,0,0,1)},uWidth:{value:6},uBases:{value:new Float32Array(20)}};
 const material=new T.MeshPhongMaterial({color:0x237f99,emissive:0x031318,specular:0xa9e9ef,shininess:95,transparent:true,opacity:.9,depthWrite:false,side:T.DoubleSide});
 material.onBeforeCompile=s=>{
  Object.assign(s.uniforms,uniforms);
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\n'+shape)
   .replace('#include <beginnormal_vertex>','vec3 px=wavePoint(position.xy+vec2(.003,0.))-wavePoint(position.xy-vec2(.003,0.));vec3 py=wavePoint(position.xy+vec2(0.,.003))-wavePoint(position.xy-vec2(0.,.003));vec3 objectNormal=normalize(cross(px,py)+vec3(0.,.000001,0.));')
   .replace('#include <begin_vertex>','vec3 transformed=wavePoint(position.xy);vWave=vec3(position.xy,uWave.w);');
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWave;uniform vec4 uWave;')
   .replace('#include <color_fragment>',`#include <color_fragment>
    float u=vWave.y,a=vWave.x;float strands=sin(a*31.+u*37.-uWave.z*9.)*sin(a*13.-u*23.+uWave.z*5.);
    float lip=smoothstep(.28,.43,u)*(1.-smoothstep(.8,.98,u));
    float foam=clamp(lip*(.48+.52*smoothstep(-.2,.8,strands))*smoothstep(.25,1.4,uWave.y)+uWave.w*.75,0.,1.);
    vec3 body=mix(vec3(.025,.20,.26),vec3(.18,.58,.67),smoothstep(0.,.55,u));
    diffuseColor.rgb=mix(body,vec3(.91,.98,1.),foam);`);
 };
 material.customProgramCacheKey=()=> 'wave-curl-gpu-1';return {geometry,material,uniforms};
}
