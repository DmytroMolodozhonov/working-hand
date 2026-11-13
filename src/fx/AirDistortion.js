/** Invisible moving air is seen by refracting the actual scene, never by drawing pale particles. One offscreen scene and one pass only while active. */
import * as T from 'three';
const CAP=12,_size=new T.Vector2(),_p=new T.Vector3(),_q=new T.Vector3(),_right=new T.Vector3();
const vertex='varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}';
const fragment=`uniform sampler2D sceneTex;uniform vec4 gust[${CAP}];uniform vec4 shape[${CAP}];varying vec2 uv0;
void main(){vec2 shift=vec2(0.);for(int i=0;i<${CAP};i++){vec2 delta=(uv0-gust[i].xy)/max(gust[i].zw,vec2(.0001));float r=length(delta);float band=(r-.72)*8.;float edge=exp(-band*band);float wake=exp(-r*r*3.);vec2 n=delta/max(r,.001);float wave=sin(r*25.-shape[i].x*22.);shift+=n*gust[i].zw*(wave*edge+.15*sin(r*19.+shape[i].x*12.)*wake)*shape[i].y*.028;}gl_FragColor=texture2D(sceneTex,clamp(uv0+shift,vec2(.001),vec2(.999)));}`;
export class AirDistortion{
 constructor(game){this.game=game;this.gusts=[];this.target=null;this.width=0;this.height=0;
  this.uniforms={sceneTex:{value:null},gust:{value:Array.from({length:CAP},()=>new T.Vector4())},shape:{value:Array.from({length:CAP},()=>new T.Vector4())}};
  this.material=new T.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:fragment,depthTest:false,depthWrite:false,toneMapped:false});
  this.quad=new T.Mesh(new T.PlaneGeometry(2,2),this.material);this.quad.frustumCulled=false;this.scene=new T.Scene();this.scene.add(this.quad);this.camera=new T.Camera();
 }
 gust(o,d,power=1,ring=false){if(this.gusts.length>=CAP)this.gusts.shift();this.gusts.push({o:o.clone(),d:d.clone(),power,ring,t:0,life:ring?.8:1.0});}
 update(dt){for(let i=this.gusts.length-1;i>=0;i--){const a=this.gusts[i];a.t+=dt;if(a.t>=a.life)this.gusts.splice(i,1);}}
 render(draw=null){
  if(!this.gusts.length)return;
  const g=this.game,r=g.renderer,cam=g.camera;r.getDrawingBufferSize(_size);cam.updateMatrixWorld();
  let n=0;
  for(const a of this.gusts){
   const travel=a.ring?0:a.t*(a.power>1?30:22);_p.copy(a.o).addScaledVector(a.d,travel);
   _q.copy(_p).project(cam);if(!Number.isFinite(_q.x+_q.y+_q.z)||_q.z< -1||_q.z>1)continue;
   const centerX=_q.x*.5+.5,centerY=_q.y*.5+.5;
   const rad=a.ring?Math.max(.2,a.t*20):.8+travel*.3;
   _q.copy(_p).addScaledVector(_right.setFromMatrixColumn(cam.matrixWorld,0),rad).project(cam);
   const rx=Math.min(4,Math.max(.002,Math.abs(_q.x*.5+.5-centerX))),ry=rx*_size.x/_size.y;
   if(!Number.isFinite(rx+ry)||centerX+rx<0||centerX-rx>1||centerY+ry<0||centerY-ry>1)continue;
   this.uniforms.gust.value[n].set(centerX,centerY,rx,ry);this.uniforms.shape.value[n].set(a.t,Math.sin(Math.PI*a.t/a.life)*Math.min(2,a.power),0,0);n++;
  }
  if(!n)return;for(let i=n;i<CAP;i++)this.uniforms.gust.value[i].set(0,0,0,0);
  // A default multisampled framebuffer cannot be copied reliably on every GPU. Render the
  // scene directly to a texture instead; never read from the target we are writing to.
  if(!this.target){this.target=new T.WebGLRenderTarget(_size.x,_size.y,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true,stencilBuffer:false});this.uniforms.sceneTex.value=this.target.texture;}
  if(this.width!==_size.x||this.height!==_size.y){this.target.setSize(_size.x,_size.y);this.width=_size.x;this.height=_size.y;}
  const prev=r.getRenderTarget(),clear=r.autoClear;
  try{r.setRenderTarget(this.target);r.autoClear=true;if(draw)draw();else if(!g.ultra?.render())r.render(g.scene,cam);r.setRenderTarget(prev);r.autoClear=false;r.render(this.scene,this.camera);}
  finally{r.setRenderTarget(prev);r.autoClear=clear;}
  return true;
 }
 sampleModel(){const m=new T.Mesh(this.quad.geometry,this.material);m.userData.shared=true;return m;}
 dispose(){this.target?.dispose();this.material.dispose();this.quad.geometry.dispose();this.gusts.length=0;}
}
