export function nativeLaunchUrl(grant,now=Date.now()){
 if(grant?.schema!==2||!['nohesi-110','nohesi-415'].includes(grant.room)
  ||!/^[A-Za-z0-9_-]{43}$/.test(grant.authorization||'')
  ||!Number.isSafeInteger(grant.expiresAt)||grant.expiresAt<=now||grant.expiresAt>now+120000)throw Error('Join link expired. Click Join again.');
 return 'matrixgames://join?authorization='+grant.authorization;
}
// Reopening an unexpired link must not consume another account admission lease.
export class NativeLaunchLinks {
 constructor(request,clock=Date.now){this.request=request;this.clock=clock;this.entries=new Map();}
 async get(room,actor){
  const key=actor+':'+room;
  for(const [k,value] of this.entries)if(value.grant&&value.grant.expiresAt<=this.clock())this.entries.delete(k);
  let entry=this.entries.get(key);
  if(!entry){entry={};this.entries.set(key,entry);entry.pending=this.request(room).then(grant=>{nativeLaunchUrl(grant,this.clock());entry.grant=grant;return grant;}).catch(error=>{this.entries.delete(key);throw error;});}
  return nativeLaunchUrl(await entry.pending,this.clock());
 }
}
