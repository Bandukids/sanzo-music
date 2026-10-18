import http from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,sep,extname} from 'node:path';
import {Readable} from 'node:stream';
import {handleAssistant} from './assistant.mjs';
import {handleLibrary} from './library.mjs';
import {handleGenerations} from './generations.mjs';
import {handleReleases} from './releases.mjs';
import {handleCovers} from './covers.mjs';
import {handleAuth,sessionUser} from './auth.mjs';
import {DataStore} from './data-store.mjs';
import {createOperations,handleOperations} from './operations.mjs';
import {randomUUID} from 'node:crypto';
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.mp4':'video/mp4','.mp3':'audio/mpeg','.json':'application/json'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export function createApp(env,{origin='http://127.0.0.1:4173',root=resolve('dist/client'),fetchImpl=fetch}={}){
 const publicURL=new URL(origin);if(publicURL.pathname!=='/'||publicURL.search||publicURL.hash||publicURL.username)throw Error('PUBLIC_ORIGIN must be an origin');
 root=resolve(root);
 env.OPS||=createOperations(env);
 env.ASSETS={fetch:async request=>{const pathname=new URL(request.url).pathname;if(!/^\/voices\/(warm|clear|narrator)\.mp3$/.test(pathname))return new Response(null,{status:404});try{return new Response(await readFile(resolve(root,'.'+pathname)),{headers:{'Content-Type':'audio/mpeg'}});}catch{return new Response(null,{status:404});}}};
 return http.createServer({requestTimeout:120000,headersTimeout:15000},async(req,res)=>{
  const context={requestId:randomUUID(),method:req.method,path:'',actorId:null,started:performance.now()};
  const security={'X-Request-ID':context.requestId,'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin',...(publicURL.protocol==='https:'?{'Strict-Transport-Security':'max-age=31536000'}:{})};
  const streamError=error=>{if(!['ECONNRESET','ABORT_ERR'].includes(error.code))void env.OPS?.record({level:'error',category:'system',action:'stream_error',requestId:context.requestId,actorId:context.actorId,code:error.code||'STREAM',message:'文件传输中断，请检查存储与连接。',coalesce:true});res.destroy();};
  const send=async result=>{await env.OPS?.recordHttp(context,result);res.writeHead(result.status,{...security,...Object.fromEntries(result.headers)});if(result.body&&req.method!=='HEAD'){const stream=Readable.fromWeb(result.body);stream.on('error',streamError);res.on('close',()=>stream.destroy());stream.pipe(res);}else res.end();};
  try{
   if(req.headers.host!==publicURL.host&&req.url!=='/healthz')return await send(json({error:{message:'无效的站点域名。'}},421));
   const url=new URL(req.url,publicURL);context.path=url.pathname;if(url.origin!==publicURL.origin)return await send(json({error:{message:'无效地址。'}},400));
   if(url.pathname==='/healthz'){
    try{await env.BUCKET.check();await env.DB.prepare('SELECT 1').first();return await send(json({ok:true}));}
    catch{return await send(json({ok:false,error:{message:'媒体存储不可用。'}},503));}
   }
   const headers=new Headers(req.headers);for(const name of [...headers.keys()])if(name.startsWith('oai-')||name==='cf-connecting-ip'||name.startsWith('x-forwarded-'))headers.delete(name);
   const cookieRequest=new Request(url,{headers}),user=await sessionUser(cookieRequest,env.DB);
   context.actorId=user?.id||null;
   if(url.pathname.startsWith('/api/')){
    const limit=url.pathname.startsWith('/api/auth/')||url.pathname.startsWith('/api/admin/')?8192:url.pathname==='/api/assistant'?42000:url.pathname.startsWith('/api/state/')?1500000:url.pathname.startsWith('/api/generations')?210000:104857600;
    if(Number(req.headers['content-length'])>limit)return await send(json({error:{message:'请求内容过大。'}},413));
    const request=new Request(url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Readable.toWeb(req),duplex:'half'})});
    if(url.pathname==='/api/admin/operations'||url.pathname.startsWith('/api/admin/operations/'))return await send(await handleOperations(request,env,user));
    if(url.pathname.startsWith('/api/auth/')||url.pathname.startsWith('/api/admin/'))return await send(await handleAuth(request,env,user,{client:req.socket.remoteAddress||'local'}));
    const publishedRead=(req.method==='GET'&&url.pathname==='/api/releases')||(['GET','HEAD'].includes(req.method)&&/^\/api\/releases\/[a-f0-9-]{36}\/(audio|cover)$/.test(url.pathname));
    if(!user&&!publishedRead)return await send(json({error:{code:'SIGN_IN',message:'请先登录。'}},401));
    if(!['GET','HEAD'].includes(req.method)){
     if(headers.get('origin')&&headers.get('origin')!==publicURL.origin||headers.get('sec-fetch-site')==='cross-site')return await send(json({error:{message:'请从本站发起操作。'}},403));
     if(/^\/api\/(generations|covers|assets)(\/|$)/.test(url.pathname))await env.BUCKET.check();
     if(url.pathname==='/api/generations'&&req.method==='POST'){
      const profile=await new DataStore(env.DB).profile(user);
      if(profile.quota-profile.bytes<8388608)return await send(json({error:{message:'剩余空间不足 8 MB，请清理素材后再生成。'}},413));
     }
    }
    const internalHeaders=new Headers(headers);if(user){internalHeaders.set('oai-authenticated-user-id',user.id);internalHeaders.set('oai-authenticated-user-email',user.email);internalHeaders.set('cf-connecting-ip',user.id);}
    const internal=new Request(request,{headers:internalHeaders});
    const handler=url.pathname==='/api/assistant'?handleAssistant:url.pathname.startsWith('/api/generations')?handleGenerations:url.pathname.startsWith('/api/releases')?handleReleases:url.pathname.startsWith('/api/covers')?handleCovers:handleLibrary;
    const watched=env.OPS&&['POST','PUT','DELETE'].includes(req.method)&&/^\/api\/(generations|covers)(?:\/|$)/.test(url.pathname),before=watched?await env.OPS.taskSnapshot(user.id).catch(()=>[]):null;
    const fetcher=env.OPS?.instrumentFetch(context,fetchImpl)||fetchImpl;
    const response=handler===handleAssistant?await handler(internal,env,{fetchImpl:fetcher}):await handler(internal,env,fetcher);
    if(watched)await env.OPS.observeTasks(before,user.id,context).catch(()=>{});
    return await send(response);
   }
   if(!['GET','HEAD'].includes(req.method))return await send(new Response(null,{status:405}));
   if(url.pathname==='/signout-with-chatgpt')return await send(new Response(null,{status:302,headers:{Location:'/'}}));
   if(url.pathname==='/signin-with-chatgpt')return await send(new Response(null,{status:302,headers:{Location:'/login/'}}));
   let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return await send(new Response(null,{status:400}));}
   if(!user&&/^\/(account|admin)(?:\/|$)/.test(pathname))return await send(new Response(null,{status:302,headers:{Location:'/login/?next='+encodeURIComponent(pathname+url.search)}}));
   if(/^\/admin(?:\/|$)/.test(pathname)&&user?.role!=='admin')return await send(new Response('需要管理员权限。',{status:403,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}}));
   if(pathname.split('/').some(part=>part.startsWith('.')&&part))return await send(new Response(null,{status:404}));
   let file=resolve(root,'.'+pathname);if(file!==root&&!file.startsWith(root+sep))return await send(new Response(null,{status:403}));
   let info;try{info=await stat(file);if(info.isDirectory()){file=resolve(file,'index.html');info=await stat(file);}const actual=await realpath(file);if(!actual.startsWith(await realpath(root)+sep))return await send(new Response(null,{status:403}));}catch{return await send(new Response(null,{status:404}));}
   if(!info.isFile())return await send(new Response(null,{status:404}));
   let start=0,end=info.size-1,status=200;
   if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!match||!match[1]&&!match[2])return await send(new Response(null,{status:416}));start=match[1]?Number(match[1]):Math.max(0,info.size-Number(match[2]));end=match[1]&&match[2]?Math.min(Number(match[2]),info.size-1):info.size-1;if(start>end||start>=info.size)return await send(new Response(null,{status:416}));status=206;}
   res.writeHead(status,{...security,'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Accept-Ranges':'bytes','Content-Length':Math.max(0,end-start+1),...(status===206?{'Content-Range':`bytes ${start}-${end}/${info.size}`}:{})});
   if(req.method==='HEAD'||!info.size)return res.end();const stream=createReadStream(file,{start,end});stream.on('error',streamError);res.on('close',()=>stream.destroy());stream.pipe(res);
  }catch(error){void env.OPS?.record({level:'error',category:'system',action:'request_exception',actorId:context.actorId,requestId:context.requestId,code:error.cause?.code||error.code||error.name,message:error.code==='STORAGE_OFFLINE'?'NAS 不可用，请求已停止。':'请求发生内部异常。',coalesce:true});if(res.headersSent)return res.destroy();await send(json({error:{message:error.code==='STORAGE_OFFLINE'?error.message:'服务暂不可用，请稍后重试。'}},error.status||503));}
 });
}
