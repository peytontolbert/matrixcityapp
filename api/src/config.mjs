export function configuration(env=process.env){
 const production=env.NODE_ENV==='production';
 const appOrigin=env.APP_ORIGIN||'https://matrixgames.app';
 const apiOrigin=env.API_ORIGIN||'https://api.matrixgames.app';
 for(const value of [appOrigin,apiOrigin]){
  const u=new URL(value);
  if(u.origin!==value||u.username||u.password||!(u.protocol==='https:'||!production&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('Invalid account origin');
 }
 const port=Number(env.PORT||4190);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid account port');
 return {production,port,appOrigin,apiOrigin,googleRedirectUri:apiOrigin+'/api/callback',googleClientId:env.GOOGLE_CLIENT_ID||'',googleClientSecret:env.GOOGLE_CLIENT_SECRET||'',databaseUrl:env.DATABASE_URL,allowedOrigins:new Set([appOrigin,...(production?['https://www.matrixgames.app']:[])]),trustCloudflareProxy:production};
}
