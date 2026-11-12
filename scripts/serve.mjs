import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
const root=resolve(process.env.MATRIXCITY_BUILD_DIR||'dist');
const port=Number(process.env.PORT||4174),host=process.env.HOST||'127.0.0.1';
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.wasm':'application/wasm','.svg':'image/svg+xml','.json':'application/json'};
http.createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  const url=new URL(req.url,'http://localhost');
  const pathname=decodeURIComponent(url.pathname);
  const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+sep)||pathname.includes('\\')||pathname.split('/').some(p=>p.startsWith('.'))){res.writeHead(404).end();return;}
  if(!(await stat(file)).isFile()){res.writeHead(404).end();return;}
  const data=await readFile(file);
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
  res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404).end('Not found');}
}).listen(port,host,()=>console.log(`Matrix City preview: http://${host}:${port}`));
