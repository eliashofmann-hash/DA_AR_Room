// Separate static model-viewer: native AR receives its own open model URL.
// Web camera/material changes cannot leak into the AR source or USDZ.
export function createStaticARLauncher({src,iosSrc,alt,onStatus=()=>{}}){
  const launcher=document.createElement('model-viewer');
  for(const [key,value] of Object.entries({
    src,'ios-src':iosSrc,alt,ar:'','ar-modes':'webxr scene-viewer quick-look',
    'ar-scale':'auto','ar-placement':'floor','xr-environment':'',
    loading:'lazy',reveal:'manual','interaction-prompt':'none'
  }))if(value!=null)launcher.setAttribute(key,value);
  launcher.setAttribute('aria-hidden','true');
  launcher.style.cssText='position:fixed;left:-100px;top:0;width:1px;height:1px;pointer-events:none;opacity:0;';
  const button=document.createElement('span');button.slot='ar-button';button.hidden=true;launcher.append(button);
  const status=event=>onStatus(event.detail.status);
  launcher.addEventListener('ar-status',status);
  document.body.append(launcher);
  return {
    get canActivateAR(){return launcher.canActivateAR;},
    // Call synchronously from the click handler to preserve user activation.
    activate(){return launcher.activateAR();},
    dispose(){launcher.removeEventListener('ar-status',status);launcher.remove();}
  };
}
