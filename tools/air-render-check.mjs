// Actual GPU readback: moving air must preserve a coloured scene on every frame, also with Ultra and resize.
import assert from 'node:assert/strict';
import {startServer,launch,openPage} from '../tests/e2e/harness.mjs';
const srv=await startServer(8791),browser=await launch();
try{
 const {page,errors}=await openPage(browser,srv.url,{noCamera:true});
 const result=await page.evaluate(async()=>{
  const T=await import('three'),{AirDistortion}=await import('/src/fx/AirDistortion.js'),{UltraPost}=await import('/src/fx/UltraPost.js');
  const r=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(192,128);const scene=new T.Scene();scene.background=new T.Color(.25,.5,.7);
  const camera=new T.PerspectiveCamera(65,1.5,.1,100);camera.position.z=6;camera.updateMatrixWorld(true);
  scene.add(new T.Mesh(new T.BoxGeometry(2,2,2),new T.MeshBasicMaterial({color:0xcc8944})));
  const g={renderer:r,camera,scene},air=new AirDistortion(g),post=new UltraPost(r);post.look.bloom=0;
  const frames=[];let maxError=0,active=0;
  for(const ultra of [false,true]){
   g.ultra={render:()=>{if(!ultra)return false;post.render(scene,camera);return true;}};
   for(let frame=0;frame<12;frame++){
    if(frame===6){r.setSize(160,112);camera.aspect=160/112;camera.updateProjectionMatrix();}
    air.gusts.length=0;air.gust(new T.Vector3(0,0,5.99-frame*.6),new T.Vector3(0,0,1),3,false);air.update(.05);
    if(air.render())active++;else{if(!g.ultra.render())r.render(scene,camera);}
    const gl=r.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,pix=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pix);maxError=Math.max(maxError,gl.getError());
    let min=765;for(let i=0;i<pix.length;i+=4)min=Math.min(min,pix[i]+pix[i+1]+pix[i+2]);
    frames.push({ultra,frame,min});
   }
  }
  air.dispose();post.dispose();r.dispose();return{frames,maxError,active};
 });
 assert.equal(result.maxError,0);assert.ok(result.active>=12,'real distortion must render');assert.ok(result.frames.every(f=>f.min>80),JSON.stringify(result));assert.deepEqual(errors,[]);console.log(JSON.stringify(result));
}finally{await browser.close();srv.stop();}
