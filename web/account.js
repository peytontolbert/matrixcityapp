const API='https://api.matrixgames.app';
const status=document.querySelector('#status'),profile=document.querySelector('#profile'),login=document.querySelector('#login'),logout=document.querySelector('#logout');
async function call(path,options={}){const response=await fetch(API+path,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(15000),...options});if(!response.ok)throw Error('Account service unavailable');return response.json();}
async function refresh(){
 login.hidden=true;profile.hidden=true;
 try{
  const [{user},config]=await Promise.all([call('/v1/me'),call('/v1/config')]);
  if(user){document.querySelector('#name').textContent=user.name;document.querySelector('#email').textContent=user.email;profile.hidden=false;status.textContent='You’re signed in.';}
  else{status.textContent=config.googleEnabled?'Welcome. Continue with Google to sign in.':'Google sign-in will be available soon.';login.hidden=!config.googleEnabled;}
 }catch{status.textContent='We couldn’t reach your account. Please try reloading in a moment.';}
}
logout.addEventListener('click',async()=>{logout.disabled=true;try{await call('/v1/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});await refresh();}catch{status.textContent='Sign-out could not be confirmed. Please try again.';}finally{logout.disabled=false;}});
if(!['matrixgames.app','www.matrixgames.app'].includes(location.hostname)){
 status.textContent='Accounts are available on matrixgames.app.';login.href='https://matrixgames.app/account.html';login.textContent='Open Matrix Games accounts ↗';login.hidden=false;
}else{await refresh();}
