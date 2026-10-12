import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleAssistant} from './server/assistant.mjs';
import {handleLibrary} from './server/library.mjs';
import {handleGenerations} from './server/generations.mjs';
import {handleReleases} from './server/releases.mjs';
import {handleCovers} from './server/covers.mjs';
import {localStorageEnvironment} from './server/local-storage.mjs';
import {Readable} from 'node:stream';
const storageEnv=await localStorageEnvironment();
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist',process.argv.includes('--built')?'client':'');
try {
  const config=fs.readFileSync(new URL('./.env.local',import.meta.url),'utf8');
  for(const line of config.split(/\r?\n/)) {
    const match=/^(DEEPSEEK_API_KEY|DEEPSEEK_MODEL|RUNNINGHUB_CN_API_KEY|RUNNINGHUB_AI_API_KEY)=(.*)$/.exec(line);
    if(match&&!process.env[match[1]])process.env[match[1]]=match[2].trim();
  }
} catch {}
storageEnv.ASSETS={fetch:async request=>{const pathname=new URL(request.url).pathname;if(!/^\/voices\/(warm|clear|narrator)\.mp3$/.test(pathname))return new Response(null,{status:404});try{return new Response(fs.readFileSync(path.join(root,pathname)),{headers:{'Content-Type':'audio/mpeg'}});}catch{return new Response(null,{status:404});}}};
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4','.mp3':'audio/mpeg'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://'+(req.headers.host||'127.0.0.1:4173'));
  if(/^\/api\/(account|state\/|assets|generations|releases|covers)/.test(url.pathname)){
    const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','local-development');headers.set('oai-authenticated-user-email','developer@sanzo.local');
    try{const request=new Request(url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'})});const result=await (url.pathname.startsWith('/api/generations')?handleGenerations(request,{...storageEnv,...process.env}):url.pathname.startsWith('/api/releases')?handleReleases(request,storageEnv):url.pathname.startsWith('/api/covers')?handleCovers(request,{...storageEnv,...process.env}):handleLibrary(request,storageEnv));res.writeHead(result.status,Object.fromEntries(result.headers));if(result.body)Readable.fromWeb(result.body).pipe(res);else res.end();}
    catch{res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({error:{message:'本地存储暂不可用。'}}));}return;
  }
  if(url.pathname==='/api/assistant') {
    try {
      let body='';
      if(req.method!=='GET'&&req.method!=='HEAD') {
        const chunks=[];let bytes=0;
        for await(const chunk of req) {
          bytes+=chunk.length;
          if(bytes>42000){res.writeHead(413,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({error:{code:'TOO_LARGE',message:'内容过长，请精简后重试。'}}));return;}
          chunks.push(chunk);
        }
        body=Buffer.concat(chunks).toString('utf8');
      }
      const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'||req.method==='HEAD'?{}:{body})});
      const result=await handleAssistant(request,process.env);
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());
    } catch {res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({error:{code:'INPUT',message:'请求格式不正确。'}}));}
    return;
  }
  if(url.pathname.startsWith('/api/')||/^\/(server|client|\.openai)(\/|$)/.test(url.pathname)){res.writeHead(404).end('Not found');return;}
  let file;
  try{file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}
  catch{res.writeHead(400).end();return;}
  if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
  fs.stat(file,(error,stat)=>{
    if(error){res.writeHead(404).end('Not found');return;}
    if(stat.isDirectory()){
      file=path.join(file,'index.html');
      try{stat=fs.statSync(file);}catch{res.writeHead(404).end('Not found');return;}
    }
    if(!stat.isFile()){res.writeHead(404).end('Not found');return;}
    const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Accept-Ranges':'bytes'};
    let start=0,end=stat.size-1;
    if(req.headers.range){
      const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(match){
        start=match[1]?Number(match[1]):Math.max(0,stat.size-Number(match[2]));
        end=match[1]&&match[2]?Math.min(Number(match[2]),stat.size-1):stat.size-1;
      }
      if(!match||start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`}).end();return;}
      headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length']=end-start+1;
    res.writeHead(req.headers.range?206:200,headers);
    if(req.method==='HEAD')res.end();
    else fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
  });
});
server.listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
