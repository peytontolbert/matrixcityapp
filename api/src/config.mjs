export function configuration(env=process.env){
 const production=env.NODE_ENV==='production';
 const appOrigin=env.APP_ORIGIN||'https://matrixgames.app';
 const apiOrigin=env.API_ORIGIN||'https://api.matrixgames.app';
 for(const value of [appOrigin,apiOrigin]){
  const u=new URL(value);
  if(u.origin!==value||u.username||u.password||!(u.protocol==='https:'||!production&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('Invalid account origin');
 }
 const port=Number(env.PORT||4190);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid account port');
 const googleRedirectUri=env.GOOGLE_REDIRECT_URI||apiOrigin+'/api/callback';
 if(![apiOrigin+'/api/callback',appOrigin+'/api/callback'].includes(googleRedirectUri))throw Error('Invalid Google callback');
 const quake3Origin=env.QUAKE3_SERVICE_ORIGIN||'http://127.0.0.1:4191';
 const gameUrl=new URL(quake3Origin);if(gameUrl.protocol!=='http:'||gameUrl.hostname!=='127.0.0.1'||gameUrl.origin!==quake3Origin)throw Error('Game service must be loopback HTTP');
 const drivingOrigin=env.DRIVING_SERVICE_ORIGIN||'http://127.0.0.1:4192';const drivingUrl=new URL(drivingOrigin);if(drivingUrl.protocol!=='http:'||drivingUrl.hostname!=='127.0.0.1'||drivingUrl.origin!==drivingOrigin)throw Error('Driving service must be loopback HTTP');
 return {nativeManifestsFile:env.DRIVING_NATIVE_MANIFESTS_FILE||'',production,port,appOrigin,apiOrigin,googleRedirectUri,googleClientId:env.GOOGLE_CLIENT_ID||'',googleClientSecret:env.GOOGLE_CLIENT_SECRET||'',databaseUrl:env.DATABASE_URL,allowedOrigins:new Set([appOrigin,...(production?['https://www.matrixgames.app']:[])]),trustCloudflareProxy:production,quake3Origin,quake3Key:env.QUAKE3_SERVICE_KEY||'',drivingOrigin,drivingKey:env.DRIVING_SERVICE_KEY||''};
}
