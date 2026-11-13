import {sha256} from '../vendor/sha256.js';
self.onmessage=async({data:{id,buffer}})=>{
 try{const hash=globalThis.crypto?.subtle?[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(n=>n.toString(16).padStart(2,'0')).join(''):sha256(buffer);self.postMessage({id,hash});}
 catch(error){self.postMessage({id,error:String(error)});}
};
