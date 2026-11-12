// OAuth credentials and code exchange stay on the VPS. A top-level redirect
// carries its host-only HttpOnly transaction cookie with the Google response.
export function callbackTarget(search){
 const input=new URLSearchParams(search),state=input.get('state'),code=input.get('code'),error=input.get('error');
 if(input.getAll('state').length!==1||!/^[A-Za-z0-9_-]{43}$/.test(state||'')||(!code&&!error)||(code&&code.length>4096)||(error&&error.length>128)||input.getAll('code').length>1||input.getAll('error').length>1)throw Error('Incomplete sign-in link');
 const target=new URL('https://api.matrixgames.app/api/callback');target.searchParams.set('state',state);
 if(code)target.searchParams.set('code',code);if(error)target.searchParams.set('error',error);
 return target.href;
}
if(typeof window!=='undefined'){
 const input=location.search;history.replaceState(null,'',location.pathname);
 try{location.replace(callbackTarget(input));}catch{document.querySelector('#status').textContent='This sign-in link is incomplete. Return to your account and try again.';}
}
