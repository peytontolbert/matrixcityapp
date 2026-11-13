// Always use the installed fetch owner (including DLC consent and verified chunks).
// Keep the renderer's upload callbacks and release temporary encoded image bytes.
export async function loadTrackAssetImage(image,input,{isCurrent=()=>true}={}){
 const url=new URL(input,globalThis.document?.baseURI||location.href);
 const response=await fetch(url,{cache:globalThis.__matrixAssetStorage?'default':'no-store'});
 if(!response.ok)throw Error('Track image HTTP '+response.status);
 const body=await response.blob();if(!isCurrent())return false;
 const source=URL.createObjectURL(body),onload=image.onload,onerror=image.onerror;
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{URL.revokeObjectURL(source);if(image.onload===loaded)image.onload=null;if(image.onerror===failed)image.onerror=null;};
  const loaded=event=>{try{if(isCurrent())onload?.call(image,event);resolve(isCurrent());}catch(error){reject(error);}finally{cleanup();}};
  const failed=event=>{try{if(isCurrent())onerror?.call(image,event);}finally{cleanup();reject(Error('Track image decode failed'));}};
  image.onload=loaded;image.onerror=failed;
  try{image.src=source;}catch(error){cleanup();reject(error);}
 });
}
