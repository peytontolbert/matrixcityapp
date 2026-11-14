import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {check} from './security.mjs';
export const supportedGames=['assetto-corsa'];
export const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value)&&!/[\r\n]/.test(value);
export function publicIPv4(host){if(isIP(host)!==4)return false;const [a,b]=host.split('.').map(Number);return a>0&&a<224&&a!==10&&a!==127&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&b===168)&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19));}
export function relativePath(path){return typeof path==='string'&&path.length>0&&path.length<=220&&!/[\\:< >"|?*\x00-\x1f]/.test(path.replaceAll(' ',''))&&path.split('/').every(p=>p&&p!=='.'&&p!=='..'&&p===p.trimEnd()&&!p.endsWith('.')&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));}
export function validateManifest(raw,game='assetto-corsa'){
 check(raw?.schema===1&&raw.game===game&&supportedGames.includes(game)&&Array.isArray(raw.assets)&&raw.assets.length>0&&raw.assets.length<=64,400,'Invalid asset manifest');
 const identities=new Set();
 const assets=raw.assets.map(a=>{
  check(a&&identifier(a.id)&&['car','track'].includes(a.kind),400,'Invalid game asset');const identity=a.kind+':'+a.id.toLowerCase();check(!identities.has(identity),400,'Duplicate asset');identities.add(identity);
  let u;try{u=new URL(a.url);}catch{check(false,400,'Invalid asset URL');}
  check(u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&!u.hash&&u.hostname.includes('.')&&u.hostname!=='localhost'&&(!isIP(u.hostname)||publicIPv4(u.hostname))&&u.href.length<4096,400,'Assets require a public HTTPS URL');
  check(/^[a-f0-9]{64}$/.test(a.sha256)&&Number.isSafeInteger(a.bytes)&&a.bytes>0&&a.bytes<=20*1024**3&&Number.isSafeInteger(a.expandedBytes)&&a.expandedBytes>0&&a.expandedBytes<=50*1024**3&&relativePath(a.archiveRoot),400,'Invalid archive proof');
  check(Array.isArray(a.checks)&&a.checks.length>0&&a.checks.length<=2048,400,'Missing installed-file checks');const paths=new Set();
  const checks=a.checks.map(c=>{check(c&&relativePath(c.path)&&!paths.has(c.path.toLowerCase()),400,'Invalid installed-file path');paths.add(c.path.toLowerCase());check(c.sha256===undefined||/^[a-f0-9]{64}$/.test(c.sha256),400,'Invalid installed-file hash');check(c.bytes===undefined||Number.isSafeInteger(c.bytes)&&c.bytes>0,400,'Invalid installed-file size');check(c.sha256||c.bytes,400,'File check requires a hash or size');return {path:c.path,...(c.sha256?{sha256:c.sha256}:{}),...(c.bytes?{bytes:c.bytes}:{})};});
  check(checks.some(c=>c.path===(a.kind==='car'?'data.acd':'data/surfaces.ini')&&c.sha256),400,'Assetto physics checksum required');
  return {id:a.id,kind:a.kind,name:String(a.name||a.id).slice(0,120),url:u.href,sha256:a.sha256,bytes:a.bytes,expandedBytes:a.expandedBytes,archiveRoot:a.archiveRoot,checks};
 });
 const manifest={schema:1,game,assets};return {...manifest,revision:createHash('sha256').update(JSON.stringify(manifest)).digest('hex')};
}
