'use strict';
const $=s=>document.querySelector(s);
let viewer=null,config=null,activeView='overview',viewRequest=0,wallController=null,arLauncher=null;
const portrait=()=>matchMedia('(orientation:portrait)').matches;
function message(text){$('#message').textContent=text;$('#message').hidden=!text;}
async function setView(key){
 if(!viewer||!viewer.loaded)return;
 activeView=key;const request=++viewRequest;const overview=key==='overview';const view=overview?config.overview:config.views[key];
 if(!view)return;
 document.body.dataset.activeView=key;message('');
 await new Promise(resolve=>requestAnimationFrame(resolve));
 if(request!==viewRequest)return;
 viewer.interpolationDecay=0;viewer.variantName=!overview&&config.interior_variant?'Innenraum':null;viewer.exposure=Number(view.exposure||config.exposure||.95);
 viewer.setAttribute('environment-image',view.environment||config.environment||'neutral');
 viewer.cameraTarget=view.target.map(v=>`${v}m`).join(' ');
 if(overview){
  const framing=view.web_framing;const radius=portrait()?framing.portrait_radius:(innerHeight<=550?framing.landscape_radius:framing.desktop_radius);
  const [theta,phi]=view.orbit.split(/\s+/);viewer.setAttribute('min-camera-orbit','auto 0deg 0.035m');viewer.setAttribute('max-camera-orbit','auto 88deg 2m');viewer.setAttribute('min-field-of-view','25deg');viewer.setAttribute('max-field-of-view','65deg');viewer.fieldOfView=`${view.fov}deg`;viewer.cameraOrbit=`${portrait()?(view.portrait_theta||theta):theta} ${phi} ${radius}`;
 }else{
  const fov=portrait()?view.portrait_fov:view.fov;
  viewer.setAttribute('min-camera-orbit',`${view.theta_deg-view.azimuth_limit_deg}deg ${view.phi_deg-view.polar_limit_deg}deg ${view.min_radius_m}m`);
  viewer.setAttribute('max-camera-orbit',`${view.theta_deg+view.azimuth_limit_deg}deg ${view.phi_deg+view.polar_limit_deg}deg ${view.max_radius_m}m`);
  viewer.setAttribute('min-field-of-view',`${fov-6}deg`);viewer.setAttribute('max-field-of-view',`${fov+4}deg`);viewer.fieldOfView=`${fov}deg`;viewer.cameraOrbit=`${view.theta_deg}deg ${view.phi_deg}deg ${view.radius_m}m`;
 }
 await viewer.updateComplete;
 if(request!==viewRequest)return;
 viewer.jumpCameraToGoal();
  if(overview)wallController?.setOverviewRadius(viewer.getCameraOrbit().radius);
 wallController?.update();
 document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===key)));
 document.body.dataset.activeView=key;
}
async function start(){
 if(location.protocol==='file:'){$('#loading-text').textContent='Bitte die passende Vorschau im Lieferordner starten.';$('#progress').hidden=true;return;}
 try{
  self.ModelViewerElement={...(self.ModelViewerElement||{}),dracoDecoderLocation:new URL('./vendor/draco/',location.href).href};await import('./vendor/model-viewer.min.js');await customElements.whenDefined('model-viewer');
  const response=await fetch('./model-config.json?v=V23',{cache:'no-store'});if(!response.ok)throw new Error('Modelldaten fehlen.');config=await response.json();
  const {installCutaway}=await import('./cutaway.js?v=V23');
  const {createStaticARLauncher}=await import('./ar-launcher.js');
  arLauncher=createStaticARLauncher({src:new URL(config.ar_model,location.href).href,iosSrc:new URL(config.ar_ios_model||'./models/modell.usdz',location.href).href,alt:config.alt,onStatus:status=>{if(status==='failed')message('Die AR-Ansicht konnte nicht geöffnet werden. Bitte erneut versuchen.');}});
  viewer=document.createElement('model-viewer');const attrs={alt:config.alt,'camera-controls':'','disable-tap':'','disable-pan':'','interaction-prompt':'none','touch-action':'none','environment-image':config.environment||'neutral',exposure:String(config.exposure||.95),'shadow-intensity':'.65','shadow-softness':'1','camera-orbit':config.overview.orbit,'camera-target':config.overview.target.map(v=>`${v}m`).join(' '),'field-of-view':`${config.overview.fov}deg`,ar:'','ar-modes':'webxr scene-viewer quick-look','ar-scale':'auto','ar-placement':'floor','xr-environment':'','ios-src':config.ar_ios_model||'./models/modell.usdz','interpolation-decay':'0'};
  for(const[k,v]of Object.entries(attrs))viewer.setAttribute(k,v);
  if(config.poster)viewer.setAttribute('poster',config.poster);
  const nativeButton=document.createElement('span');nativeButton.slot='ar-button';nativeButton.hidden=true;viewer.append(nativeButton);$('#model-host').replaceChildren(viewer);
  viewer.addEventListener('progress',e=>{$('#progress').value=e.detail.totalProgress;});
  viewer.addEventListener('camera-change',e=>{
   const orbit=viewer.getCameraOrbit();let target=viewer.getCameraTarget();
   const offset={x:orbit.radius*Math.sin(orbit.phi)*Math.sin(orbit.theta),y:orbit.radius*Math.cos(orbit.phi),z:orbit.radius*Math.sin(orbit.phi)*Math.cos(orbit.theta)};
   const view=config.views[activeView];
   if(e.detail.source==='user-interaction'&&view?.fixed_eye){
    const desired={x:view.eye[0]-offset.x,y:view.eye[1]-offset.y,z:view.eye[2]-offset.z};
    if(Math.hypot(target.x-desired.x,target.y-desired.y,target.z-desired.z)>.00001){viewer.cameraTarget=`${desired.x}m ${desired.y}m ${desired.z}m`;viewer.jumpCameraToGoal();target=desired;}
   }
   document.body.dataset.cameraState=JSON.stringify({theta:orbit.theta,phi:orbit.phi,radius:orbit.radius,target:{x:target.x,y:target.y,z:target.z},eye:{x:target.x+offset.x,y:target.y+offset.y,z:target.z+offset.z},fov:viewer.getFieldOfView(),view:activeView,viewport:[innerWidth,innerHeight]});
  });
  viewer.addEventListener('load',async()=>{$('#loading').hidden=true;$('#ar-button').disabled=false;document.querySelectorAll('[data-view]').forEach(b=>b.disabled=false);await setView('overview');try{wallController=installCutaway(viewer,config.cutaway,{isOverview:()=>activeView==='overview',onChange:state=>{document.body.dataset.cutawayState=JSON.stringify(state);}});document.body.dataset.cutawayReady='true';}catch(error){document.body.dataset.cutawayError=error.message;console.error(error);message('Die Modellansicht konnte nicht vollständig vorbereitet werden.');}},{once:true});
  viewer.addEventListener('error',()=>{$('#loading').hidden=false;$('#loading-text').textContent='Das Modell konnte nicht geladen werden.';$('#progress').hidden=true;});
  viewer.addEventListener('ar-status',e=>{if(e.detail.status==='failed')message('Die AR-Ansicht konnte nicht geöffnet werden. Bitte erneut versuchen.');else message('');});
  document.body.dataset.modelSource=config.browser_model;viewer.src=config.browser_model;addEventListener('resize',()=>{if(viewer.loaded)setView(activeView);});
 }catch(error){$('#loading-text').textContent='Das Modell konnte nicht geladen werden.';$('#progress').hidden=true;console.warn(error.message);}
}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
$('#ar-button').addEventListener('click',()=>{
 if(!viewer?.loaded||!arLauncher)return;
 if(!arLauncher.canActivateAR){message('Für AR auf einem unterstützten Smartphone öffnen.');return;}
 message('');
 arLauncher.activate().catch(()=>message('Die AR-Ansicht konnte nicht geöffnet werden.'));
});
start();
